pragma solidity ^0.4.11;

import "tokens/eip20/EIP20.sol";
import "./Parameterizer.sol";
import "./PLCRVoting.sol";

contract Registry {

    // ------
    // EVENTS
    // ------

    event _Application(bytes32 listingHash, uint deposit, string data);
    event _Challenge(bytes32 listingHash, uint deposit, uint pollID, string data);
    event _Deposit(bytes32 listingHash, uint added, uint newTotal);
    event _Withdrawal(bytes32 listingHash, uint withdrew, uint newTotal);
    event _NewListingWhitelisted(bytes32 listingHash);
    event _ApplicationRemoved(bytes32 listingHash);
    event _ListingRemoved(bytes32 listingHash);
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
        mapping(address => bool) tokenClaims;
    }

    // Maps challengeIDs to associated challenge data
    mapping(uint => Challenge) public challenges;

    // Maps listingHashHashes to associated listingHash data
    mapping(bytes32 => Listing) public listings;

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
    @param _listingHash      The listingHash of a potential listingHash a user is applying to add to the registry
    @param _amount      The number of ERC20 tokens a user is willing to potentially stake
    */
    function apply(bytes32 _listingHash, uint _amount, string _data) external {
        require(!isWhitelisted(_listingHash));
        require(!appWasMade(_listingHash));
        require(_amount >= parameterizer.get("minDeposit"));

        // Sets owner
        Listing storage listingHash = listings[_listingHash];
        listingHash.owner = msg.sender;

        // Transfers tokens from user to Registry contract
        require(token.transferFrom(listingHash.owner, this, _amount));

        // Sets apply stage end time
        listingHash.applicationExpiry = block.timestamp + parameterizer.get("applyStageLen");
        listingHash.unstakedDeposit = _amount;

        _Application(_listingHash, _amount, _data);
    }

    /**
    @notice             Allows the owner of a listingHash to increase their unstaked deposit.
    @param _listingHash      The listingHash of a user's application/listingHash
    @param _amount      The number of ERC20 tokens to increase a user's unstaked deposit
    */
    function deposit(bytes32 _listingHash, uint _amount) external {
        Listing storage listingHash = listings[_listingHash];

        require(listingHash.owner == msg.sender);
        require(token.transferFrom(msg.sender, this, _amount));

        listingHash.unstakedDeposit += _amount;

        _Deposit(_listingHash, _amount, listingHash.unstakedDeposit);
    }

    /**
    @notice             Allows the owner of a listingHash to decrease their unstaked deposit.
    @notice             The listingHash keeps its previous status.
    @param _listingHash      The listingHash of a user's application/listingHash
    @param _amount      The number of ERC20 tokens to decrease a user's unstaked deposit
    */
    function withdraw(bytes32 _listingHash, uint _amount) external {
        Listing storage listingHash = listings[_listingHash];

        require(listingHash.owner == msg.sender);
        require(_amount <= listingHash.unstakedDeposit);
        require(listingHash.unstakedDeposit - _amount >= parameterizer.get("minDeposit"));

        require(token.transfer(msg.sender, _amount));

        listingHash.unstakedDeposit -= _amount;

        _Withdrawal(_listingHash, _amount, listingHash.unstakedDeposit);
    }

    /**
    @notice             Allows the owner of a listingHash to remove the listingHash from the whitelist
    @notice             Returns all tokens to the owner of the listingHash
    @param _listingHash      The listingHash of a user's listingHash
    */
    function exit(bytes32 _listingHash) external {
        Listing storage listingHash = listings[_listingHash];

        require(msg.sender == listingHash.owner);
        require(isWhitelisted(_listingHash));

        // Cannot exit during ongoing challenge
        require(listingHash.challengeID == 0 || challenges[listingHash.challengeID].resolved);

        // Remove listingHash & return tokens
        resetListing(_listingHash);
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    /**
    @notice             Starts a poll for a listingHash which is either
    @notice             in the apply stage or already in the whitelist.
    @dev                Tokens are taken from the challenger and the applicant's deposit is locked.
    @param _listingHash      The listingHash of an applicant's potential listingHash
    */
    function challenge(bytes32 _listingHash, string _data) external returns (uint challengeID) {
        bytes32 listingHashHash = _listingHash;
        Listing storage listingHash = listings[listingHashHash];
        uint deposit = parameterizer.get("minDeposit");

        // Listing must be in apply stage or already on the whitelist
        require(appWasMade(_listingHash) || listingHash.whitelisted);
        // Prevent multiple challenges
        require(listingHash.challengeID == 0 || challenges[listingHash.challengeID].resolved);

        if (listingHash.unstakedDeposit < deposit) {
            // Not enough tokens, listingHash auto-delisted
            resetListing(_listingHash);
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

        // Updates listingHash to store most recent challenge
        listings[listingHashHash].challengeID = pollID;

        // Locks tokens for listingHash during challenge
        listings[listingHashHash].unstakedDeposit -= deposit;

        _Challenge(_listingHash, deposit, pollID, _data);
        return pollID;
    }

    /**
    @notice             Updates a listingHash's status from 'application' to 'listingHash'
    @notice             or resolves a challenge if one exists.
    @param _listingHash      The listingHash whose status is being updated
    */
    function updateStatus(bytes32 _listingHash) public {
        if (canBeWhitelisted(_listingHash)) {
          whitelistApplication(_listingHash);
          _NewListingWhitelisted(_listingHash);
        } else if (challengeCanBeResolved(_listingHash)) {
          resolveChallenge(_listingHash);
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
        require(challenges[_challengeID].tokenClaims[msg.sender] == false);
        require(challenges[_challengeID].resolved == true);

        uint voterTokens = voting.getNumPassingTokens(msg.sender, _challengeID, _salt);
        uint reward = voterReward(msg.sender, _challengeID, _salt);

        // Subtracts the voter's information to preserve the participation ratios
        // of other voters compared to the remaining pool of rewards
        challenges[_challengeID].totalTokens -= voterTokens;
        challenges[_challengeID].rewardPool -= reward;

        require(token.transfer(msg.sender, reward));

        // Ensures a voter cannot claim tokens again
        challenges[_challengeID].tokenClaims[msg.sender] = true;

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
    public view returns (uint) {
        uint totalTokens = challenges[_challengeID].totalTokens;
        uint rewardPool = challenges[_challengeID].rewardPool;
        uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);
        return (voterTokens * rewardPool) / totalTokens;
    }

    // --------
    // GETTERS:
    // --------

    /**
    @dev                Determines whether the listingHash of an application can be whitelisted.
    @param _listingHash      The listingHash whose status should be examined
    */
    function canBeWhitelisted(bytes32 _listingHash) view public returns (bool) {
        bytes32 listingHashHash = _listingHash;
        uint challengeID = listings[listingHashHash].challengeID;

        // Ensures that the application was made,
        // the application period has ended,
        // the listingHash can be whitelisted,
        // and either: the challengeID == 0, or the challenge has been resolved.
        if (
            appWasMade(_listingHash) &&
            isExpired(listings[listingHashHash].applicationExpiry) &&
            !isWhitelisted(_listingHash) &&
            (challengeID == 0 || challenges[challengeID].resolved == true)
        ) { return true; }

        return false;
    }

    // Returns true if listingHash is whitelisted
    function isWhitelisted(bytes32 _listingHash) view public returns (bool whitelisted) {
        return listings[_listingHash].whitelisted;
    }

    // Returns true if apply(listingHash) was called for this listingHash
    function appWasMade(bytes32 _listingHash) view public returns (bool exists) {
        return listings[_listingHash].applicationExpiry > 0;
    }

    // Returns true if the application/listingHash has an unresolved challenge
    function challengeExists(bytes32 _listingHash) view public returns (bool) {
        bytes32 listingHashHash = _listingHash;
        uint challengeID = listings[listingHashHash].challengeID;

        return (listings[listingHashHash].challengeID > 0 && !challenges[challengeID].resolved);
    }

    /**
    @notice             Determines whether voting has concluded in a challenge for a given listingHash.
    @dev                Throws if no challenge exists.
    @param _listingHash      A listingHash with an unresolved challenge
    */
    function challengeCanBeResolved(bytes32 _listingHash) view public returns (bool) {
        bytes32 listingHashHash = _listingHash;
        uint challengeID = listings[listingHashHash].challengeID;

        require(challengeExists(_listingHash));

        return voting.pollEnded(challengeID);
    }

    /**
    @notice             Determines the number of tokens awarded to the winning party in a challenge.
    @param _challengeID The challengeID to determine a reward for
    */
    function determineReward(uint _challengeID) public view returns (uint) {
        require(!challenges[_challengeID].resolved && voting.pollEnded(_challengeID));

        // Edge case, nobody voted, give all tokens to the challenger.
        if (voting.getTotalNumberOfTokensForWinningOption(_challengeID) == 0) {
            return 2 * challenges[_challengeID].stake;
        }

        return (2 * challenges[_challengeID].stake) - challenges[_challengeID].rewardPool;
    }

    function tokenClaims(uint _challengeID, address _voter) public view returns (bool) {
      return challenges[_challengeID].tokenClaims[_voter];
    }

    // Returns true if the provided termDate has passed
    function isExpired(uint _termDate) view public returns (bool expired) {
        return _termDate < block.timestamp;
    }

    // Deletes a listingHash from the whitelist and transfers tokens back to owner
    function resetListing(bytes32 _listingHash) internal {
        bytes32 listingHashHash = _listingHash;
        Listing storage listingHash = listings[listingHashHash];

        // Transfers any remaining balance back to the owner
        if (listingHash.unstakedDeposit > 0)
            require(token.transfer(listingHash.owner, listingHash.unstakedDeposit));

        delete listings[listingHashHash];
    }

    // ----------------
    // PRIVATE FUNCTIONS:
    // ----------------

    /**
    @notice             Determines the winner in a challenge.
    @notice             Rewards the winner tokens and either whitelists or de-whitelists the listingHash.
    @param _listingHash      A listingHash with a challenge that is to be resolved
    */
    function resolveChallenge(bytes32 _listingHash) private {
        bytes32 listingHashHash = _listingHash;
        uint challengeID = listings[listingHashHash].challengeID;

        // Calculates the winner's reward,
        // which is: (winner's full stake) + (dispensationPct * loser's stake)
        uint reward = determineReward(challengeID);

        // Records whether the listingHash is a listingHash or an application
        bool wasWhitelisted = isWhitelisted(_listingHash);

        // Case: challenge failed
        if (voting.isPassed(challengeID)) {
            whitelistApplication(_listingHash);
            // Unlock stake so that it can be retrieved by the applicant
            listings[listingHashHash].unstakedDeposit += reward;

            _ChallengeFailed(challengeID);
            if (!wasWhitelisted) { _NewListingWhitelisted(_listingHash); }
        }
        // Case: challenge succeeded
        else {
            resetListing(_listingHash);
            // Transfer the reward to the challenger
            require(token.transfer(challenges[challengeID].challenger, reward));

            _ChallengeSucceeded(challengeID);
            if (wasWhitelisted) { _ListingRemoved(_listingHash); }
            else { _ApplicationRemoved(_listingHash); }
        }

        // Sets flag on challenge being processed
        challenges[challengeID].resolved = true;

        // Stores the total tokens used for voting by the winning side for reward purposes
        challenges[challengeID].totalTokens =
            voting.getTotalNumberOfTokensForWinningOption(challengeID);
    }

    /**
    @dev                Called by updateStatus() if the applicationExpiry date passed without a challenge being made.
    @dev                Called by resolveChallenge() if an application/listingHash beat a challenge.
    @param _listingHash      The listingHash of an application/listingHash to be whitelisted
    */
    function whitelistApplication(bytes32 _listingHash) private {
        listings[_listingHash].whitelisted = true;
    }
}
