pragma solidity ^0.4.11;

import "tokens/eip20/EIP20.sol";
import "./Parameterizer.sol";
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
    mapping(uint => Challenge) public challenges;

    // Maps listingHashes to associated listing data
    mapping(bytes32 => Listing) public listings;

    // Maps challengeIDs and address to token claim data
    mapping(uint => mapping(address => bool)) public tokenClaims;


    // Global Variables
    EIP20 public token;
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
    ) public {
        token = EIP20(_tokenAddr);
        voting = PLCRVoting(_plcrAddr);
        parameterizer = Parameterizer(_paramsAddr);
    }

    // --------------------
    // PUBLISHER INTERFACE:
    // --------------------

    /**
    @notice             Allows a user to start an application.
    @notice             Takes tokens from user and sets apply stage end time.
    @param _listing      The listing of a potential listing a user is applying to add to the registry
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
    @param _listing      The listing of a user's application/listing
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
    @param _listing      The listing of a user's application/listing
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
    @param _listing      The listing of a user's listing
    */
    function exit(bytes32 _listing) external {
        Listing storage listing = listings[_listing];

        require(msg.sender == listing.owner);
        require(isWhitelisted(_listing));

        // Cannot exit during ongoing challenge
        require(listing.challengeID == 0 || challenges[listing.challengeID].resolved);

        // Remove listing & return tokens
        resetListing(_listing);
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    /**
    @notice             Starts a poll for a listing which is either
    @notice             in the apply stage or already in the whitelist.
    @dev                Tokens are taken from the challenger and the applicant's deposit is locked.
    @param _listing      The listing of an applicant's potential listing
    */
    function challenge(bytes32 _listing) external returns (uint challengeID) {
        bytes32 listingHash = _listing;
        Listing storage listing = listings[listingHash];
        uint deposit = parameterizer.get("minDeposit");

        // Listing must be in apply stage or already on the whitelist
        require(appWasMade(_listing) || listing.whitelisted);
        // Prevent multiple challenges
        require(listing.challengeID == 0 || challenges[listing.challengeID].resolved);

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

        challenges[pollID] = Challenge({
            challenger: msg.sender,
            rewardPool: ((100 - parameterizer.get("dispensationPct")) * deposit) / 100,
            stake: deposit,
            resolved: false,
            totalTokens: 0
        });

        // Updates listing to store most recent challenge
        listings[listingHash].challengeID = pollID;

        // Locks tokens for listing during challenge
        listings[listingHash].unstakedDeposit -= deposit;

        _Challenge(_listing, deposit, pollID);
        return pollID;
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
        require(challenges[_challengeID].resolved == true);

        uint voterTokens = voting.getNumPassingTokens(msg.sender, _challengeID, _salt);
        uint reward = voterReward(msg.sender, _challengeID, _salt);

        // Subtracts the voter's information to preserve the participation ratios
        // of other voters compared to the remaining pool of rewards
        challenges[_challengeID].totalTokens -= voterTokens;
        challenges[_challengeID].rewardPool -= reward;

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
    function voterReward(address _voter, uint _challengeID, uint _salt)
    public constant returns (uint) {
        uint totalTokens = challenges[_challengeID].totalTokens;
        uint rewardPool = challenges[_challengeID].rewardPool;
        uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);
        return (voterTokens * rewardPool) / totalTokens;
    }

    // --------
    // GETTERS:
    // --------

    /**
    @dev                Determines whether the listing of an application can be whitelisted.
    @param _listing      The listing whose status should be examined
    */
    function canBeWhitelisted(bytes32 _listing) constant public returns (bool) {
        bytes32 listingHash = _listing;
        uint challengeID = listings[listingHash].challengeID;

        // Ensures that the application was made,
        // the application period has ended,
        // the listing can be whitelisted,
        // and either: the challengeID == 0, or the challenge has been resolved.
        if (
            appWasMade(_listing) &&
            isExpired(listings[listingHash].applicationExpiry) &&
            !isWhitelisted(_listing) &&
            (challengeID == 0 || challenges[challengeID].resolved == true)
        ) { return true; }

        return false;
    }

    // Returns true if listing is whitelisted
    function isWhitelisted(bytes32 _listing) constant public returns (bool whitelisted) {
        return listings[_listing].whitelisted;
    }

    // Returns true if apply(listing) was called for this listing
    function appWasMade(bytes32 _listing) constant public returns (bool exists) {
        return listings[_listing].applicationExpiry > 0;
    }

    // Returns true if the application/listing has an unresolved challenge
    function challengeExists(bytes32 _listing) constant public returns (bool) {
        bytes32 listingHash = _listing;
        uint challengeID = listings[listingHash].challengeID;

        return (listings[listingHash].challengeID > 0 && !challenges[challengeID].resolved);
    }

    /**
    @notice             Determines whether voting has concluded in a challenge for a given listing.
    @dev                Throws if no challenge exists.
    @param _listing      A listing with an unresolved challenge
    */
    function challengeCanBeResolved(bytes32 _listing) constant public returns (bool) {
        bytes32 listingHash = _listing;
        uint challengeID = listings[listingHash].challengeID;

        require(challengeExists(_listing));

        return voting.pollEnded(challengeID);
    }

    /**
    @notice             Determines the number of tokens awarded to the winning party in a challenge.
    @param _challengeID The challengeID to determine a reward for
    */
    function determineReward(uint _challengeID) public constant returns (uint) {
        require(!challenges[_challengeID].resolved && voting.pollEnded(_challengeID));

        // Edge case, nobody voted, give all tokens to the challenger.
        if (voting.getTotalNumberOfTokensForWinningOption(_challengeID) == 0) {
            return 2 * challenges[_challengeID].stake;
        }

        return (2 * challenges[_challengeID].stake) - challenges[_challengeID].rewardPool;
    }

    // Returns true if the provided termDate has passed
    function isExpired(uint _termDate) constant public returns (bool expired) {
        return _termDate < block.timestamp;
    }

    // Deletes a listing from the whitelist and transfers tokens back to owner
    function resetListing(bytes32 _listing) internal {
        bytes32 listingHash = _listing;
        Listing storage listing = listings[listingHash];

        // Transfers any remaining balance back to the owner
        if (listing.unstakedDeposit > 0)
            require(token.transfer(listing.owner, listing.unstakedDeposit));

        delete listings[listingHash];
    }

    // ----------------
    // PRIVATE FUNCTIONS:
    // ----------------

    /**
    @notice             Determines the winner in a challenge.
    @notice             Rewards the winner tokens and either whitelists or de-whitelists the listing.
    @param _listing      A listing with a challenge that is to be resolved
    */
    function resolveChallenge(bytes32 _listing) private {
        bytes32 listingHash = _listing;
        uint challengeID = listings[listingHash].challengeID;

        // Calculates the winner's reward,
        // which is: (winner's full stake) + (dispensationPct * loser's stake)
        uint reward = determineReward(challengeID);

        // Records whether the listing is a listing or an application
        bool wasWhitelisted = isWhitelisted(_listing);

        // Case: challenge failed
        if (voting.isPassed(challengeID)) {
            whitelistApplication(_listing);
            // Unlock stake so that it can be retrieved by the applicant
            listings[listingHash].unstakedDeposit += reward;

            _ChallengeFailed(challengeID);
            if (!wasWhitelisted) { _NewListingWhitelisted(_listing); }
        }
        // Case: challenge succeeded
        else {
            resetListing(_listing);
            // Transfer the reward to the challenger
            require(token.transfer(challenges[challengeID].challenger, reward));

            _ChallengeSucceeded(challengeID);
            if (wasWhitelisted) { _ListingRemoved(_listing); }
            else { _ApplicationRemoved(_listing); }
        }

        // Sets flag on challenge being processed
        challenges[challengeID].resolved = true;

        // Stores the total tokens used for voting by the winning side for reward purposes
        challenges[challengeID].totalTokens =
            voting.getTotalNumberOfTokensForWinningOption(challengeID);
    }

    /**
    @dev                Called by updateStatus() if the applicationExpiry date passed without a challenge being made.
    @dev                Called by resolveChallenge() if an application/listing beat a challenge.
    @param _listing      The listing of an application/listing to be whitelisted
    */
    function whitelistApplication(bytes32 _listing) private {
        bytes32 listingHash = _listing;

        listings[listingHash].whitelisted = true;
    }
}
