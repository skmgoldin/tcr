pragma solidity ^0.4.11;

import "tokens/eip20/EIP20.sol";
import "./Parameterizer.sol";
import "./PLCRVoting.sol";

contract Registry {

    // ------
    // EVENTS
    // ------

    event _Application(address member, uint deposit, string data);
    event _Challenge(address member, uint deposit, uint pollID, string data);
    event _Deposit(address member, uint added, uint newTotal);
    event _Withdrawal(address member, uint withdrew, uint newTotal);
    event _NewMemberWhitelisted(address member);
    event _ApplicationRemoved(address member);
    event _MemberRemoved(address member);
    event _ChallengeFailed(uint challengeID);
    event _ChallengeSucceeded(uint challengeID);
    event _RewardClaimed(address voter, uint challengeID, uint reward);

    // ------
    // DATA STRUCTURES
    // ------

    struct Member {
        uint applicationExpiry; // Expiration date of apply stage
        bool whitelisted;       // Indicates registry status
        uint unstakedDeposit;   // Number of tokens in the member not locked in a challenge
        uint challengeID;       // Corresponds to a PollID in PLCRVoting
    }

    struct Node {
      string category;          // Node category
      bytes32 parentHash;       // Node parent hash
      Member[] members;
      Node[] children;
    }

    struct Challenge {
        uint rewardPool;        // (remaining) Pool of tokens to be distributed to winning voters
        address challenger;     // Owner of Challenge
        bool resolved;          // Indication of if challenge is resolved
        uint stake;             // Number of tokens at stake for either party during challenge
        uint totalTokens;       // (remaining) Number of tokens used in voting by the winning side
        mapping(address => bool) voterCanClaimReward; // Indicates whether a voter has claimed a reward yet
    }

    // ------
    // STATE
    // ------

    Registry masterCopy; // THIS MUST ALWAYS BE THE FIRST STATE VARIABLE DECLARED!!!!!!

    // Maps challengeIDs to associated challenge data
    mapping(uint => Challenge) public challenges;

    // Maps memberHashes to associated memberHash data
    mapping(address => Member) public members;

    // Global Variables
    EIP20 public token;
    PLCRVoting public voting;
    Parameterizer public parameterizer;

    string public version = '1';
    string public name;

    // ------------
    // CONSTRUCTOR:
    // ------------

    /**
    @dev Contructor         Sets the addresses for token, voting, and parameterizer
    @param _tokenAddr       Address of the TCR's intrinsic ERC20 token
    @param _plcrAddr        Address of a PLCR voting contract for the provided token
    @param _paramsAddr      Address of a Parameterizer contract
    */
    function Registry(
        address _tokenAddr,
        address _plcrAddr,
        address _paramsAddr,
        string _name
    ) public {
      setup(_tokenAddr, _plcrAddr, _paramsAddr, _name);
    }

    function setup(
        address _tokenAddr,
        address _plcrAddr,
        address _paramsAddr,
        string _name
    ) public {
        require(address(token) == 0);

        token = EIP20(_tokenAddr);
        voting = PLCRVoting(_plcrAddr);
        parameterizer = Parameterizer(_paramsAddr);
        name = _name;
    }

    // --------------------
    // PUBLISHER INTERFACE:
    // --------------------

    /**
    @dev                Allows a user to start an application. Takes tokens from user and sets
                        apply stage end time.
    @param _amount      The number of ERC20 tokens a user is willing to potentially stake
    @param _data        Extra data relevant to the application. Think IPFS hashes.
    */
    function apply(uint _amount, string _data) external {
        require(!isWhitelisted(msg.sender));
        require(!appWasMade(msg.sender));
        require(_amount >= parameterizer.get("minDeposit"));

        // Sets owner
        Member storage member = members[msg.sender];

        // Transfers tokens from user to Registry contract
        require(token.transferFrom(msg.sender, this, _amount));

        // Sets apply stage end time
        member.applicationExpiry = block.timestamp + parameterizer.get("applyStageLen");
        member.unstakedDeposit = _amount;

        _Application(msg.sender, _amount, _data);
    }

    /**
    @dev                Allows the owner of a memberHash to increase their unstaked deposit.
    @param _amount      The number of ERC20 tokens to increase a user's unstaked deposit
    */
    function deposit(uint _amount) external {
        Member storage member = members[msg.sender];

        require(token.transferFrom(msg.sender, this, _amount));

        member.unstakedDeposit += _amount;

        _Deposit(msg.sender, _amount, member.unstakedDeposit);
    }

    /**
    @dev                Allows the owner of a memberHash to decrease their unstaked deposit.
    @param _amount      The number of ERC20 tokens to withdraw from the unstaked deposit.
    */
    function withdraw(uint _amount) external {
        Member storage member = members[msg.sender];

        require(_amount <= member.unstakedDeposit);
        require(member.unstakedDeposit - _amount >= parameterizer.get("minDeposit"));

        require(token.transfer(msg.sender, _amount));

        member.unstakedDeposit -= _amount;

        _Withdrawal(msg.sender, _amount, member.unstakedDeposit);
    }

    /**
    @dev                Allows the owner of a memberHash to remove the memberHash from the whitelist
                        Returns all tokens to the owner of the memberHash
    */
    function exit() external {
        Member storage member = members[msg.sender];

        require(isWhitelisted(msg.sender));

        // Cannot exit during ongoing challenge
        require(member.challengeID == 0 || challenges[member.challengeID].resolved);

        // Remove member & return tokens
        resetMember();

        _MemberRemoved(msg.sender);
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    /**
    @dev                Starts a poll for a memberHash which is either in the apply stage or
                        already in the whitelist. Tokens are taken from the challenger and the
                        applicant's deposits are locked.
    @param _data        Extra data relevant to the challenge. Think IPFS hashes.
    */
    function challenge(string _data) external returns (uint challengeID) {
        Member storage member = members[msg.sender];
        uint deposit = parameterizer.get("minDeposit");

        // Member must be in apply stage or already on the whitelist
        require(appWasMade(msg.sender) || member.whitelisted);
        // Prevent multiple challenges
        require(member.challengeID == 0 || challenges[member.challengeID].resolved);

        if (member.unstakedDeposit < deposit) {
            // Not enough tokens, member auto-delisted
            resetMember();
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

        // Updates memberHash to store most recent challenge
        member.challengeID = pollID;

        // Locks tokens for memberHash during challenge
        member.unstakedDeposit -= deposit;

        _Challenge(msg.sender, deposit, pollID, _data);
        return pollID;
    }

    /**
    @dev                Updates a memberHash's status from 'application' to 'member' or resolves
                        a challenge if one exists.
    */
    function updateStatus() public {
        if (canBeWhitelisted(msg.sender)) {
          whitelistApplication(msg.sender);
          _NewMemberWhitelisted(msg.sender);
        } else if (challengeCanBeResolved(msg.sender)) {
          resolveChallenge(msg.sender);
        } else {
          revert();
        }
    }

    // ----------------
    // TOKEN FUNCTIONS:
    // ----------------

    /**
    @dev                Called by a voter to claim their reward for each completed vote. Someone
                        must call updateStatus() before this can be called.
    @param _challengeID The PLCR pollID of the challenge a reward is being claimed for
    @param _salt        The salt of a voter's commit hash in the given poll
    */
    function claimVoterReward(uint _challengeID, uint _salt) public {
        // Ensures the voter has not already claimed tokens and challenge results have been processed
        require(challenges[_challengeID].voterCanClaimReward[msg.sender] == false);
        require(challenges[_challengeID].resolved == true);

        uint voterTokens = voting.getNumPassingTokens(msg.sender, _challengeID, _salt);
        uint reward = voterReward(msg.sender, _challengeID, _salt);

        // Subtracts the voter's information to preserve the participation ratios
        // of other voters compared to the remaining pool of rewards
        challenges[_challengeID].totalTokens -= voterTokens;
        challenges[_challengeID].rewardPool -= reward;

        require(token.transfer(msg.sender, reward));

        // Ensures a voter cannot claim tokens again
        challenges[_challengeID].voterCanClaimReward[msg.sender] = true;

        _RewardClaimed(msg.sender, _challengeID, reward);
    }

    // --------
    // GETTERS:
    // --------

    /**
    @dev                Calculates the provided voter's token reward for the given poll.
    @param _voter       The address of the voter whose reward balance is to be returned
    @param _challengeID The pollID of the challenge a reward balance is being queried for
    @param _salt        The salt of the voter's commit hash in the given poll
    @return             The uint indicating the voter's reward
    */
    function voterReward(address _voter, uint _challengeID, uint _salt)
    public view returns (uint) {
        uint totalTokens = challenges[_challengeID].totalTokens;
        uint rewardPool = challenges[_challengeID].rewardPool;
        uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);
        return (voterTokens * rewardPool) / totalTokens;
    }

    /**
    @dev                Determines whether the given user be whitelisted.
    */
    function canBeWhitelisted(address _user) view public returns (bool) {
        uint challengeID = members[_user].challengeID;

        // Ensures that the application was made,
        // the application period has ended,
        // the memberHash can be whitelisted,
        // and either: the challengeID == 0, or the challenge has been resolved.
        if (
            appWasMade(_user) &&
            members[_user].applicationExpiry < now &&
            !isWhitelisted(_user) &&
            (challengeID == 0 || challenges[challengeID].resolved == true)
        ) { return true; }

        return false;
    }

    /**
    @dev                Returns true if the provided user is whitelisted
    @param _user The users address
    */
    function isWhitelisted(address _user) view public returns (bool whitelisted) {
        return members[_user].whitelisted;
    }

    /**
    @dev                Returns true if apply was called for this memberHash
    @param _user The users address
    */
    function appWasMade(address _user) view public returns (bool exists) {
        return members[_user].applicationExpiry > 0;
    }

    /**
    @dev                Returns true if the application/member has an unresolved challenge
    @param _user The users address
    */
    function challengeExists(address _user) view public returns (bool) {
        uint challengeID = members[_user].challengeID;

        return (members[_user].challengeID > 0 && !challenges[challengeID].resolved);
    }

    /**
    @dev                Determines whether voting has concluded in a challenge for a given
                        member. Throws if no challenge exists.
    @param _user The users address
    */
    function challengeCanBeResolved(address _user) view public returns (bool) {
        uint challengeID = members[_user].challengeID;

        require(challengeExists(_user));

        return voting.pollEnded(challengeID);
    }

    /**
    @dev                Determines the number of tokens awarded to the winning party in a challenge.
    @param _challengeID The challengeID to determine a reward for
    */
    function challengeWinnerReward(uint _challengeID) public view returns (uint) {
        require(!challenges[_challengeID].resolved && voting.pollEnded(_challengeID));

        // Edge case, nobody voted, give all tokens to the challenger.
        if (voting.getTotalNumberOfTokensForWinningOption(_challengeID) == 0) {
            return 2 * challenges[_challengeID].stake;
        }

        return (2 * challenges[_challengeID].stake) - challenges[_challengeID].rewardPool;
    }

    /**
    @dev                Getter for Challenge voterCanClaimReward mappings
    @param _challengeID The challengeID to query
    @param _voter       The voter whose claim status to query for the provided challengeID
    */
    function voterCanClaimReward(uint _challengeID, address _voter) public view returns (bool) {
      return challenges[_challengeID].voterCanClaimReward[_voter];
    }

    // ----------------
    // PRIVATE FUNCTIONS:
    // ----------------

    /**
    @dev                Determines the winner in a challenge. Rewards the winner tokens and
                        either whitelists or de-whitelists the memberHash.
    @param _user The users address
    */
    function resolveChallenge(address _user) private {
        uint challengeID = members[_user].challengeID;

        // Calculates the winner's reward,
        // which is: (winner's full stake) + (dispensationPct * loser's stake)
        uint reward = challengeWinnerReward(challengeID);

        // Records whether the memberHash is a memberHash or an application
        bool wasWhitelisted = isWhitelisted(_user);

        // Case: challenge failed
        if (voting.isPassed(challengeID)) {
            whitelistApplication(_user);
            // Unlock stake so that it can be retrieved by the applicant
            members[_user].unstakedDeposit += reward;

            _ChallengeFailed(challengeID);
            if (!wasWhitelisted) { _NewMemberWhitelisted(_user); }
        }
        // Case: challenge succeeded
        else {
            resetMember();
            // Transfer the reward to the challenger
            require(token.transfer(challenges[challengeID].challenger, reward));

            _ChallengeSucceeded(challengeID);
            if (wasWhitelisted) { _MemberRemoved(_user); }
            else { _ApplicationRemoved(_user); }
        }

        // Sets flag on challenge being processed
        challenges[challengeID].resolved = true;

        // Stores the total tokens used for voting by the winning side for reward purposes
        challenges[challengeID].totalTokens =
            voting.getTotalNumberOfTokensForWinningOption(challengeID);
    }

    /**
    @dev                Called by updateStatus() if the applicationExpiry date passed without a
                        challenge being made. Called by resolveChallenge() if an
                        application/member beat a challenge.
    @param _user The users address
    */
    function whitelistApplication(address _user) private {
        members[_user].whitelisted = true;
    }

    /**
    @dev                Deletes a memberHash from the whitelist and transfers tokens back to owner
    */
    function resetMember() private {
        Member storage member = members[msg.sender];

        // Transfers any remaining balance back to the owner
        if (member.unstakedDeposit > 0)
            require(token.transfer(msg.sender, member.unstakedDeposit));

        delete members[msg.sender];
    }
}
