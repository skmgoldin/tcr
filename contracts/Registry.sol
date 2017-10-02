pragma solidity ^0.4.11;

import "./historical/StandardToken.sol";
import "./PLCRVoting.sol";
import "./Parameterizer.sol";

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

    struct Listing {
        uint applicationExpiry; // Expiration date of apply stage
        bool whitelisted;       // Indicates registry status
        address owner;          // Owner of Listing
        uint unstakedDeposit;   // Number of unlocked tokens with potential risk if challenged
        uint challengeID;       // Identifier of canonical challenge
    }

    struct Challenge {
        uint rewardPool;        // (remaining) Pool of tokens distributed amongst winning voters
        address challenger;     // Owner of Challenge
        bool resolved;          // Indication of if challenge is resolved
        uint stake;             // Number of tokens at risk for either party during challenge
        uint totalTokens;       // (remaining) Amount of tokens used for voting by the winning side
    }

    // Maps challengeIDs to associated challenge data
    mapping(uint => Challenge) public challengeMap;

    // Maps domainHashes to associated listing data
    mapping(bytes32 => Listing) public listingMap;

    // Maps challengeIDs and address to token claim data
    mapping(uint => mapping(address => bool)) public tokenClaims;


    // Global Variables
    StandardToken public token;
    PLCRVoting public voting;
    Parameterizer public parameterizer;

    // ------------
    // CONSTRUCTOR:
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
    // PUBLISHER INTERFACE:
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
        Listing storage listing = listingMap[keccak256(_domain)];
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
        Listing storage listing = listingMap[keccak256(_domain)];

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
        Listing storage listing = listingMap[keccak256(_domain)];

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
        Listing storage listing = listingMap[keccak256(_domain)];

        require(msg.sender == listing.owner);
        require(isWhitelisted(_domain));

        // Cannot exit during ongoing challenge
        require(listing.challengeID == 0 || challengeMap[listing.challengeID].resolved);

        // Remove domain & return tokens
        resetListing(_domain);
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    /**
    @notice             Starts a poll for a domain which is either
    @notice             in the apply stage or already in the whitelist.
    @dev                Tokens are taken from the challenger and the applicant's deposit is locked.
    @param _domain      The domain of an applicant's potential listing
    */
    function challenge(string _domain) external returns (uint challengeID) {
        bytes32 domainHash = keccak256(_domain);
        Listing storage listing = listingMap[domainHash];
        uint deposit = parameterizer.get("minDeposit");

        // Domain must be in apply stage or already on the whitelist
        require(appWasMade(_domain) || listing.whitelisted);
        // Prevent multiple challenges
        require(listing.challengeID == 0 || challengeMap[listing.challengeID].resolved);

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

        challengeMap[pollID] = Challenge({
            challenger: msg.sender,
            rewardPool: ((100 - parameterizer.get("dispensationPct")) * deposit) / 100,
            stake: deposit,
            resolved: false,
            totalTokens: 0
        });

        // Updates listing to store most recent challenge
        listingMap[domainHash].challengeID = pollID;

        // Locks tokens for listing during challenge
        listingMap[domainHash].unstakedDeposit -= deposit;

        _Challenge(_domain, deposit, pollID);
        return pollID;
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

    // ----------------
    // TOKEN FUNCTIONS:
    // ----------------

    /**
    @notice             Called by a voter to claim his/her reward for each completed vote.
    @dev                Someone must call updateStatus() before this can be called.
    @param _challengeID The pollID of the challenge a reward is being claimed for
    @param _salt        The salt of a voter's commit hash in the given poll
    */
    function claimReward(uint _challengeID, uint _salt) public {
        // Ensures the voter has not already claimed tokens and challenge results have been processed
        require(tokenClaims[_challengeID][msg.sender] == false);
        require(challengeMap[_challengeID].resolved = true);

        uint voterTokens = voting.getNumPassingTokens(msg.sender, _challengeID, _salt);
        uint reward = calculateVoterReward(msg.sender, _challengeID, _salt);

        // Subtracts the voter's information to preserve the participation ratios
        // of other voters compared to the remaining pool of rewards
        challengeMap[_challengeID].totalTokens -= voterTokens;
        challengeMap[_challengeID].rewardPool -= reward;

        require(token.transfer(msg.sender, reward));

        // Ensures a voter cannot claim tokens again
        tokenClaims[_challengeID][msg.sender] = true;

        _RewardClaimed(msg.sender, _challengeID, reward);
    }

    /**
    @dev                Calculates the provided voter's token reward for the given poll.
    @param _voter       The address of the voter whose reward balance is to be returned
    @param _challengeID The pollID of the challenge a reward balance is being queried for
    @param _salt        The salt of the voter's commit hash in the given poll
    @return             The uint indicating the voter's reward (in nano-ADT)
    */
    function calculateVoterReward(address _voter, uint _challengeID, uint _salt)
    public constant returns (uint) {
        uint totalTokens = challengeMap[_challengeID].totalTokens;
        uint rewardPool = challengeMap[_challengeID].rewardPool;
        uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);
        return (voterTokens * rewardPool) / totalTokens;
    }

    // --------
    // GETTERS:
    // --------

    /**
    @dev                Determines whether the domain of an application can be whitelisted.
    @param _domain      The domain whose status should be examined
    */
    function canBeWhitelisted(string _domain) constant public returns (bool) {
        bytes32 domainHash = keccak256(_domain);
        uint challengeID = listingMap[domainHash].challengeID;

        // Ensures that the application was made,
        // the application period has ended,
        // the domain can be whitelisted,
        // and either: the challengeID == 0, or the challenge has been resolved.
        if (
            appWasMade(_domain) &&
            isExpired(listingMap[domainHash].applicationExpiry) &&
            !isWhitelisted(_domain) &&
            (challengeID == 0 || challengeMap[challengeID].resolved == true)
        ) { return true; }

        return false;
    }

    // Returns true if domain is whitelisted
    function isWhitelisted(string _domain) constant public returns (bool whitelisted) {
        return listingMap[keccak256(_domain)].whitelisted;
    }

    // Returns true if apply(domain) was called for this domain
    function appWasMade(string _domain) constant public returns (bool exists) {
        return listingMap[keccak256(_domain)].applicationExpiry > 0;
    }

    // Returns true if the application/listing has an unresolved challenge
    function challengeExists(string _domain) constant public returns (bool) {
        bytes32 domainHash = keccak256(_domain);
        uint challengeID = listingMap[domainHash].challengeID;

        return (listingMap[domainHash].challengeID > 0 && !challengeMap[challengeID].resolved);
    }

    /**
    @notice             Determines whether voting has concluded in a challenge for a given domain.
    @dev                Throws if no challenge exists.
    @param _domain      A domain with an unresolved challenge
    */
    function challengeCanBeResolved(string _domain) constant public returns (bool) {
        bytes32 domainHash = keccak256(_domain);
        uint challengeID = listingMap[domainHash].challengeID;

        require(challengeExists(_domain));

        return voting.pollEnded(challengeID);
    }

    /**
    @notice             Determines the number of tokens awarded to the winning party in a challenge.
    @param _challengeID The challengeID to determine a reward for
    */
    function determineReward(uint _challengeID) public constant returns (uint) {
        require(!challengeMap[_challengeID].resolved && voting.pollEnded(_challengeID));

        // Edge case, nobody voted, give all tokens to the challenger.
        if (voting.getTotalNumberOfTokensForWinningOption(_challengeID) == 0) {
            return 2 * challengeMap[_challengeID].stake;
        }

        return (2 * challengeMap[_challengeID].stake) - challengeMap[_challengeID].rewardPool;
    }

    // Returns true if the provided termDate has passed
    function isExpired(uint _termDate) constant public returns (bool expired) {
        return _termDate < block.timestamp;
    }

    // Deletes a listing from the whitelist and transfers tokens back to owner
    function resetListing(string _domain) internal {
        bytes32 domainHash = keccak256(_domain);
        Listing storage listing = listingMap[domainHash];

        // Transfers any remaining balance back to the owner
        if (listing.unstakedDeposit > 0)
            require(token.transfer(listing.owner, listing.unstakedDeposit));

        delete listingMap[domainHash];
    }

    // ----------------
    // PRIVATE FUNCTIONS:
    // ----------------

    /**
    @notice             Determines the winner in a challenge.
    @notice             Rewards the winner tokens and either whitelists or de-whitelists the domain.
    @param _domain      A domain with a challenge that is to be resolved
    */
    function resolveChallenge(string _domain) private {
        bytes32 domainHash = keccak256(_domain);
        uint challengeID = listingMap[domainHash].challengeID;

        // Calculates the winner's reward,
        // which is: (winner's full stake) + (dispensationPct * loser's stake)
        uint reward = determineReward(challengeID);

        // Records whether the domain is a listing or an application
        bool wasWhitelisted = isWhitelisted(_domain);

        // Case: challenge failed
        if (voting.isPassed(challengeID)) {
            whitelistApplication(_domain);
            // Unlock stake so that it can be retrieved by the applicant
            listingMap[domainHash].unstakedDeposit += reward;

            _ChallengeFailed(challengeID);
            if (!wasWhitelisted) { _NewDomainWhitelisted(_domain); }
        }
        // Case: challenge succeeded
        else {
            resetListing(_domain);
            // Transfer the reward to the challenger
            require(token.transfer(challengeMap[challengeID].challenger, reward));

            _ChallengeSucceeded(challengeID);
            if (wasWhitelisted) { _ListingRemoved(_domain); }
            else { _ApplicationRemoved(_domain); }
        }

        // Sets flag on challenge being processed
        challengeMap[challengeID].resolved = true;

        // Stores the total tokens used for voting by the winning side for reward purposes
        challengeMap[challengeID].totalTokens =
            voting.getTotalNumberOfTokensForWinningOption(challengeID);
    }

    /**
    @dev                Called by updateStatus() if the applicationExpiry date passed without a challenge being made.
    @dev                Called by resolveChallenge() if an application/listing beat a challenge.
    @param _domain      The domain of an application/listing to be whitelisted
    */
    function whitelistApplication(string _domain) private {
        bytes32 domainHash = keccak256(_domain);

        listingMap[domainHash].whitelisted = true;
    }
}
