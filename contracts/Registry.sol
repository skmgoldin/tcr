pragma solidity ^0.4.11;

import "tokens/eip20/EIP20.sol";
import "./Parameterizer.sol";
import "./Challenge.sol";
import "./PLCRVoting.sol";

contract Registry {

  // ------
  // EVENTS
  // ------

  event _Application(bytes32 listing, uint deposit);
  event _Challenge(bytes32 listing, uint deposit, uint pollID);
  event _Deposit(bytes32 listing, uint added, uint newTotal);
  event _Withdrawal(bytes32 listing, uint withdrew, uint newTotal);
  event _NewListingWhitelisted(bytes32 listing);
  event _ApplicationRemoved(bytes32 listing);
  event _ListingRemoved(bytes32 listing);
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

  // Maps listingHashes to associated listing data
  mapping(bytes32 => Listing) public listings;

  // Global Variables
  EIP20 public token;
  PLCRVoting public voting;
  Parameterizer public parameterizer;

  // ------------
  // CONSTRUCTOR
  // ------------

  /**
  @dev Contructor
  @notice                 Sets the addresses for token, voting, and parameterizer
  @param _tokenAddr       Address of the native ERC20 token
  @param _plcrAddr        Address of a PLCR voting contract for the provided token
  @param _paramsAddr      Address of a Parameterizer contract for the provided PLCR voting contract
  */
  function Registry(
    address _tokenAddr,
    address _plcrAddr,
    address _paramsAddr
  ) public {
    token = EIP20(_tokenAddr);
    voting = PLCRVoting(_plcrAddr);
    parameterizer = Parameterizer(_paramsAddr);
  }

  // --------------------
  // PUBLISHER INTERFACE
  // --------------------

  /**
  @notice             Allows a user to start an application.
  @notice             Takes tokens from user and sets apply stage end time.
  @param _listing     The listing hash of a potential listing a user is applying to add 
  @param _amount      The number of ERC20 tokens a user is willing to potentially stake
  */
  function apply(bytes32 _listing, uint _amount) external {
    require(!isWhitelisted(_listing));
    require(!appWasMade(_listing));
    require(_amount >= parameterizer.get("minDeposit"));

    // Sets owner
    Listing storage listing = listings[_listing];
    listing.owner = msg.sender;

    // Transfers tokens from user to Registry contract
    require(token.transferFrom(listing.owner, this, _amount));

    // Sets apply stage end time
    listing.applicationExpiry = block.timestamp + parameterizer.get("applyStageLen");
    listing.unstakedDeposit = _amount;

    _Application(_listing, _amount);
  }

  /**
  @notice             Allows the owner of a listing to increase their unstaked deposit.
  @param _listing     The listing hash of a user's application/listing
  @param _amount      The number of ERC20 tokens to increase a user's unstaked deposit
  */
  function deposit(bytes32 _listing, uint _amount) external {
    Listing storage listing = listings[_listing];

    require(listing.owner == msg.sender);
    require(token.transferFrom(msg.sender, this, _amount));

    listing.unstakedDeposit += _amount;

    _Deposit(_listing, _amount, listing.unstakedDeposit);
  }

  /**
  @notice             Allows the owner of a listing to decrease their unstaked deposit.
  @notice             The listing keeps its previous status.
  @param _listing     The listing hash of a user's application/listing
  @param _amount      The number of ERC20 tokens to decrease a user's unstaked deposit
  */
  function withdraw(bytes32 _listing, uint _amount) external {
    Listing storage listing = listings[_listing];

    require(listing.owner == msg.sender);
    require(_amount <= listing.unstakedDeposit);
    require(listing.unstakedDeposit - _amount >= parameterizer.get("minDeposit"));

    require(token.transfer(msg.sender, _amount));

    listing.unstakedDeposit -= _amount;

    _Withdrawal(_listing, _amount, listing.unstakedDeposit);
  }

  /**
  @notice             Allows the owner of a listing to remove the listing from the whitelist
  @notice             Returns all tokens to the owner of the listing
  @param _listing     The listing hash of a user's listing
  */
  function exit(bytes32 _listing) external {
    Listing storage listing = listings[_listing];

    require(msg.sender == listing.owner);
    require(isWhitelisted(_listing));

    // Cannot exit during ongoing challenge
    require(!challenges[listing.challengeID].isInitialized() ||
            challenges[listing.challengeID].isResolved());

    // Remove listing & return tokens
    resetListing(_listing);
  }

  // -----------------------
  // TOKEN HOLDER INTERFACE
  // -----------------------

  /**
  @notice             Starts a poll for a listing which is either
  @notice             in the apply stage or already in the whitelist.
  @dev                Tokens are taken from the challenger and the applicant's deposit is locked.
  @param _listing     The listing hash to be considered
  */
  function challenge(bytes32 _listing) external returns (uint challengeID) {
    Listing storage listing = listings[_listing];
    uint deposit = parameterizer.get("minDeposit");

    // Listing must be in apply stage or already on the whitelist
    require(appWasMade(_listing) || listing.whitelisted);
    // Prevent multiple challenges
    require(!challenges[listing.challengeID].isInitialized() ||
            challenges[listing.challengeID].isResolved());

    if (listing.unstakedDeposit < deposit) {
      // Not enough tokens, listing auto-delisted
      resetListing(_listing);
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
    listings[_listing].challengeID = pollID;

    // Locks tokens for listing during challenge
    listings[_listing].unstakedDeposit -= deposit;

    _Challenge(_listing, deposit, pollID);
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
  @notice             Updates a listing's status from 'application' to 'listing'
  @notice             or resolves a challenge if one exists.
  @param _listing      The listing whose status is being updated
  */
  function updateStatus(bytes32 _listing) public {
    if (canBeWhitelisted(_listing)) {
      whitelistApplication(_listing);
      _NewListingWhitelisted(_listing);
    } else if (challengeCanBeResolved(_listing)) {
      resolveChallenge(_listing);
    } else {
      revert();
    }
  }

  // --------
  // GETTERS
  // --------

  /**
  @dev                Determines whether the listing hash of an application can be whitelisted.
  @param _listing     The listing whose status should be examined
  */
  function canBeWhitelisted(bytes32 _listing) constant public returns (bool) {
    uint challengeID = listings[_listing].challengeID;

    // Ensures that the application was made,
    // the application period has ended,
    // the listing can be whitelisted,
    // and either: the challengeID == 0, or the challenge has been resolved.
    if (
        appWasMade(_listing) &&
        isExpired(listings[_listing].applicationExpiry) &&
        !isWhitelisted(_listing) &&
        (!challenges[challengeID].isInitialized() || challenges[challengeID].isResolved())
    ) { return true; }

    return false;
  }

  /// @dev returns true if listing is whitelisted
  function isWhitelisted(bytes32 _listing) constant public returns (bool whitelisted) {
    return listings[_listing].whitelisted;
  }

  // @dev returns true if apply was called for this listing
  function appWasMade(bytes32 _listing) constant public returns (bool exists) {
    return listings[_listing].applicationExpiry > 0;
  }

  // @dev returns true if the application/listing has an unresolved challenge
  function challengeExists(bytes32 _listing) constant public returns (bool) {
    Challenge.Data storage challenge = challenges[listings[_listing].challengeID];
      return challenge.isInitialized() && !challenge.isResolved();
  }

  /**
  @notice             Determines whether voting has concluded in a challenge for a given listing.
  @dev                Throws if no challenge exists.
  @param _listing      A listing with an unresolved challenge
  */
  function challengeCanBeResolved(bytes32 _listing) constant public returns (bool) {
    Challenge.Data storage challenge = challenges[listings[_listing].challengeID];
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
  @return             The uint indicating the voter's reward
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
  de-whitelists the listing.
  @param _listing A listing with a challenge that is to be resolved.
  */
  function resolveChallenge(bytes32 _listing) private {
    Listing storage listing = listings[_listing];
    Challenge.Data storage challenge = challenges[listing.challengeID];

    // Calculates the winner's reward,
    // which is: (winner's full stake) + (dispensationPct * loser's stake)
    uint winnerReward = challenge.challengeWinnerReward();

    // Records whether the listing is a listing or an application
    bool wasWhitelisted = isWhitelisted(_listing);

    // Case: challenge failed
    if (voting.isPassed(challenge.challengeID)) {
      whitelistApplication(_listing);
      // Unlock stake so that it can be retrieved by the applicant
      listing.unstakedDeposit += winnerReward;

      _ChallengeFailed(challenge.challengeID);
      if (!wasWhitelisted) { _NewListingWhitelisted(_listing); }
    }
    // Case: challenge succeeded
    else {
      resetListing(_listing);
      // Transfer the reward to the challenger
      require(token.transfer(challenge.challenger, winnerReward));

      _ChallengeSucceeded(challenge.challengeID);
      if (wasWhitelisted) { _ListingRemoved(_listing); }
      else { _ApplicationRemoved(_listing); }
    }

    challenge.winningTokens =
      challenge.voting.getTotalNumberOfTokensForWinningOption(challenge.challengeID);
    challenge.resolved = true;
  }

  /**
  @dev Called by updateStatus() if the applicationExpiry date passed without a
  challenge being made
  @dev Called by resolveChallenge() if an application/listing beat a challenge.
  @param _listing The listing hash of an application/listing to be whitelisted
  */
  function whitelistApplication(bytes32 _listing) private {
    listings[_listing].whitelisted = true;
  }

  /**
  @dev deletes a listing from the whitelist and transfers tokens back to owner
  @param _listing the listing to be removed
  */
  function resetListing(bytes32 _listing) private {
    Listing storage listing = listings[_listing];

    // Transfers any remaining balance back to the owner
    if (listing.unstakedDeposit > 0)
        require(token.transfer(listing.owner, listing.unstakedDeposit));

    delete listings[_listing];
  }


}
