pragma solidity ^0.4.11;

import "./historical/StandardToken.sol";
import "./Parameterizer.sol";
import "./Challenge.sol";
import "./PLCRVoting.sol";

contract Registry {

  // ------
  // EVENTS
  // ------

  event _Application(string domain, uint deposit);
  event _Challenge(string domain, uint deposit, uint pollID);
  event _Deposit(string domain, uint added, uint newTotal);
  event _Withdrawal(string domain, uint withdrew, uint newTotal);
  event _NewDomainWhitelisted(string domain);
  event _ApplicationRemoved(string domain);
  event _ListingRemoved(string domain);
  event _ChallengeFailed(uint challengeID);
  event _ChallengeSucceeded(uint challengeID);
  event _RewardClaimed(address voter, uint challengeID, uint reward);

  // ------
  // DATA STRUCTURES
  // ------

  using Challenge for Challenge.Data;

  struct Listing {
    uint applicationExpiry; // Expiration date of apply stage
    bool whitelisted;       // Indicates registry status
    address owner;          // Owner of Listing
    uint unstakedDeposit;   // Number of unlocked tokens with potential risk if challenged
    uint challengeID;       // Identifier of canonical challenge
  }

  // ------
  // STATE
  // ------

  // Maps challengeIDs to associated challenge data
  mapping(uint => Challenge.Data) public challenges;

  // Maps domainHashes to associated listing data
  mapping(bytes32 => Listing) public listings;

  // Global Variables
  StandardToken public token;
  PLCRVoting public voting;
  Parameterizer public parameterizer;

  // ------------
  // CONSTRUCTOR
  // ------------

  /**
  @dev Contructor
  @notice                 Sets the addresses for token, voting, and parameterizer
  @param _tokenAddr       Address of the native ERC20 token (ADT)
  @param _plcrAddr        Address of a PLCR voting contract for the provided token
  @param _paramsAddr      Address of a Parameterizer contract for the provided PLCR voting contract
  */
  function Registry(
    address _tokenAddr,
    address _plcrAddr,
    address _paramsAddr
  ) {
    token = StandardToken(_tokenAddr);
    voting = PLCRVoting(_plcrAddr);
    parameterizer = Parameterizer(_paramsAddr);
  }

  // --------------------
  // PUBLISHER INTERFACE
  // --------------------

  /**
  @notice             Allows a user to start an application.
  @notice             Takes tokens from user and sets apply stage end time.
  @param _domain      The domain of a potential listing a user is applying to add to the registry
  @param _amount      The number of ERC20 tokens a user is willing to potentially stake
  */
  function apply(string _domain, uint _amount) external {
    require(!isWhitelisted(_domain));
    require(!appWasMade(_domain));
    require(_amount >= parameterizer.get("minDeposit"));

    // Sets owner
    Listing storage listing = listings[keccak256(_domain)];
    listing.owner = msg.sender;

    // Transfers tokens from user to Registry contract
    require(token.transferFrom(listing.owner, this, _amount));

    // Sets apply stage end time
    listing.applicationExpiry = block.timestamp + parameterizer.get("applyStageLen");
    listing.unstakedDeposit = _amount;

    _Application(_domain, _amount);
  }

  /**
  @notice             Allows the owner of a domain to increase their unstaked deposit.
  @param _domain      The domain of a user's application/listing
  @param _amount      The number of ERC20 tokens to increase a user's unstaked deposit
  */
  function deposit(string _domain, uint _amount) external {
    Listing storage listing = listings[keccak256(_domain)];

    require(listing.owner == msg.sender);
    require(token.transferFrom(msg.sender, this, _amount));

    listing.unstakedDeposit += _amount;

    _Deposit(_domain, _amount, listing.unstakedDeposit);
  }

  /**
  @notice             Allows the owner of a domain to decrease their unstaked deposit.
  @notice             The listing keeps its previous status.
  @param _domain      The domain of a user's application/listing
  @param _amount      The number of ERC20 tokens to decrease a user's unstaked deposit
  */
  function withdraw(string _domain, uint _amount) external {
    Listing storage listing = listings[keccak256(_domain)];

    require(listing.owner == msg.sender);
    require(_amount <= listing.unstakedDeposit);
    require(listing.unstakedDeposit - _amount >= parameterizer.get("minDeposit"));

    require(token.transfer(msg.sender, _amount));

    listing.unstakedDeposit -= _amount;

    _Withdrawal(_domain, _amount, listing.unstakedDeposit);
  }

  /**
  @notice             Allows the owner of a listing to remove the listing from the whitelist
  @notice             Returns all tokens to the owner of the listing
  @param _domain      The domain of a user's listing
  */
  function exit(string _domain) external {
    Listing storage listing = listings[keccak256(_domain)];

    require(msg.sender == listing.owner);
    require(isWhitelisted(_domain));

    // Cannot exit during ongoing challenge
    require(!challenges[listing.challengeID].isInitialized() ||
            challenges[listing.challengeID].isResolved());

    // Remove domain & return tokens
    resetListing(_domain);
  }

  // -----------------------
  // TOKEN HOLDER INTERFACE
  // -----------------------

  /**
  @notice             Starts a poll for a domain which is either
  @notice             in the apply stage or already in the whitelist.
  @dev                Tokens are taken from the challenger and the applicant's deposit is locked.
  @param _domain      The domain of an applicant's potential listing
  */
  function challenge(string _domain) external returns (uint challengeID) {
    bytes32 domainHash = keccak256(_domain);
    Listing storage listing = listings[domainHash];
    uint deposit = parameterizer.get("minDeposit");

    // Domain must be in apply stage or already on the whitelist
    require(appWasMade(_domain) || listing.whitelisted);
    // Prevent multiple challenges
    require(!challenges[listing.challengeID].isInitialized() ||
            challenges[listing.challengeID].isResolved());

    if (listing.unstakedDeposit < deposit) {
      // Not enough tokens, domain auto-delisted
      resetListing(_domain);
      return 0;
    }

    // Takes tokens from challenger
    require(token.transferFrom(msg.sender, this, deposit));

    // Starts poll
    uint pollID = voting.startPoll(
      parameterizer.get("voteQuorum"),
      parameterizer.get("commitStageLen"),
      parameterizer.get("revealStageLen")
    );

    challenges[pollID] = Challenge.Data({
      challenger: msg.sender,
      voting: voting,
      token: token,
      challengeID: pollID,
      rewardPool: ((100 - parameterizer.get("dispensationPct")) * deposit) / 100,
      stake: deposit,
      resolved: false,
      winningTokens: 0
    });

    // Updates listing to store most recent challenge
    listings[domainHash].challengeID = pollID;

    // Locks tokens for listing during challenge
    listings[domainHash].unstakedDeposit -= deposit;

    _Challenge(_domain, deposit, pollID);
    return pollID;
  }

  /**
  @notice             Called by a voter to claim his/her reward for each completed vote.
  @dev                Someone must call updateStatus() before this can be called.
  @param _challengeID The pollID of the challenge a reward is being claimed for
  @param _salt        The salt of a voter's commit hash in the given poll
  */
  function claimReward(uint _challengeID, uint _salt) public {
    uint reward = challenges[_challengeID].claimReward(msg.sender, _salt);

    _RewardClaimed(msg.sender, _challengeID, reward);
  }

  /**
  @notice             Updates a domain's status from 'application' to 'listing'
  @notice             or resolves a challenge if one exists.
  @param _domain      The domain whose status is being updated
  */
  function updateStatus(string _domain) public {
    if (canBeWhitelisted(_domain)) {
      whitelistApplication(_domain);
      _NewDomainWhitelisted(_domain);
    } else if (challengeCanBeResolved(_domain)) {
      resolveChallenge(_domain);
    } else {
      revert();
    }
  }

  // --------
  // GETTERS
  // --------

  /**
  @dev                Determines whether the domain of an application can be whitelisted.
  @param _domain      The domain whose status should be examined
  */
  function canBeWhitelisted(string _domain) constant public returns (bool) {
    bytes32 domainHash = keccak256(_domain);
    uint challengeID = listings[domainHash].challengeID;

    // Ensures that the application was made,
    // the application period has ended,
    // the domain can be whitelisted,
    // and either: the challengeID == 0, or the challenge has been resolved.
    if (
        appWasMade(_domain) &&
        isExpired(listings[domainHash].applicationExpiry) &&
        !isWhitelisted(_domain) &&
        (!challenges[challengeID].isInitialized() || challenges[challengeID].isResolved())
    ) { return true; }

    return false;
  }

  /// @dev returns true if domain is whitelisted
  function isWhitelisted(string _domain) constant public returns (bool whitelisted) {
    return listings[keccak256(_domain)].whitelisted;
  }

  // @dev returns true if apply was called for this domain
  function appWasMade(string _domain) constant public returns (bool exists) {
    return listings[keccak256(_domain)].applicationExpiry > 0;
  }

  // @dev returns true if the application/listing has an unresolved challenge
  function challengeExists(string _domain) constant public returns (bool) {
    Challenge.Data storage challenge = challenges[listings[keccak256(_domain)].challengeID];
      return challenge.isInitialized() && !challenge.isResolved();
  }

  /**
  @notice             Determines whether voting has concluded in a challenge for a given domain.
  @dev                Throws if no challenge exists.
  @param _domain      A domain with an unresolved challenge
  */
  function challengeCanBeResolved(string _domain) constant public returns (bool) {
    Challenge.Data storage challenge = challenges[listings[keccak256(_domain)].challengeID];
    return challenge.isInitialized() && challenge.canBeResolved();
  }

  /**
  @notice             Determines the number of tokens awarded to the winning party in a challenge.
  @param _challengeID The challengeID to determine a reward for
  */
  function challengeWinnerReward(uint _challengeID) public constant returns (uint) {
    return challenges[_challengeID].challengeWinnerReward(); 
  }

  /// @dev returns true if the provided termDate has passed
  function isExpired(uint _termDate) constant public returns (bool expired) {
    return _termDate < block.timestamp;
  }

  /**
  @dev                Calculates the provided voter's token reward for the given poll.
  @param _voter       The address of the voter whose reward balance is to be returned
  @param _challengeID The ID of the challenge the voter's reward is being calculated for
  @param _salt        The salt of the voter's commit hash in the given poll
  @return             The uint indicating the voter's reward (in nano-ADT)
  */
  function voterReward(address _voter, uint _challengeID, uint _salt)
  public constant returns (uint) {
    return challenges[_challengeID].voterReward(_voter, _salt);
  }

  /**
  @dev                Determines whether the provided voter has claimed tokens in a challenge
  @param _challengeID The ID of the challenge to determine whether a voter has claimed tokens for
  @param _voter       The address of the voter whose claim status is to be determined for the
                      provided challenge.
  @return             Bool indicating whether the voter has claimed tokens in the provided
                      challenge
  */
  function tokenClaims(uint _challengeID, address _voter)
  public constant returns (bool) {
    return challenges[_challengeID].tokenClaims[_voter];
  }

  // ----------------
  // PRIVATE FUNCTIONS
  // ----------------

  /**
  @dev Determines the winner in a challenge. Rewards the winner tokens and either whitelists or
  de-whitelists the domain.
  @param _domain A domain with a challenge that is to be resolved.
  */
  function resolveChallenge(string _domain) private {
    bytes32 domainHash = keccak256(_domain);
    Listing storage listing = listings[domainHash];
    Challenge.Data storage challenge = challenges[listing.challengeID];

    // Calculates the winner's reward,
    // which is: (winner's full stake) + (dispensationPct * loser's stake)
    uint winnerReward = challenge.challengeWinnerReward();

    // Records whether the domain is a listing or an application
    bool wasWhitelisted = isWhitelisted(_domain);

    // Case: challenge failed
    if (voting.isPassed(challenge.challengeID)) {
      whitelistApplication(_domain);
      // Unlock stake so that it can be retrieved by the applicant
      listing.unstakedDeposit += winnerReward;

      _ChallengeFailed(challenge.challengeID);
      if (!wasWhitelisted) { _NewDomainWhitelisted(_domain); }
    }
    // Case: challenge succeeded
    else {
      resetListing(_domain);
      // Transfer the reward to the challenger
      require(token.transfer(challenge.challenger, winnerReward));

      _ChallengeSucceeded(challenge.challengeID);
      if (wasWhitelisted) { _ListingRemoved(_domain); }
      else { _ApplicationRemoved(_domain); }
    }

    challenge.winningTokens =
      challenge.voting.getTotalNumberOfTokensForWinningOption(challenge.challengeID);
    challenge.resolved = true;
  }

  /**
  @dev Called by updateStatus() if the applicationExpiry date passed without a
  challenge being made
  @dev Called by resolveChallenge() if an application/listing beat a challenge.
  @param _domain The domain of an application/listing to be whitelisted
  */
  function whitelistApplication(string _domain) private {
    bytes32 domainHash = keccak256(_domain);

    listings[domainHash].whitelisted = true;
  }

  /**
  @dev deletes a listing from the whitelist and transfers tokens back to owner
  @param _domain the domain to be removed
  */
  function resetListing(string _domain) private {
    bytes32 domainHash = keccak256(_domain);
    Listing storage listing = listings[domainHash];

    // Transfers any remaining balance back to the owner
    if (listing.unstakedDeposit > 0)
        require(token.transfer(listing.owner, listing.unstakedDeposit));

    delete listings[domainHash];
  }


}
