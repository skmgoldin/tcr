pragma solidity ^0.4.8;
import "tokens/eip20/EIP20Interface.sol";
import "dll/DLL.sol";
import "attrstore/AttributeStore.sol";
import "zeppelin/math/SafeMath.sol";
import "./ChallengeInterface.sol";

/**
@title Partial-Lock-Commit-Reveal Voting scheme with ERC20 tokens
@author Team: Aspyn Palatnick, Cem Ozer, Yorke Rhodes
*/
contract PLCRVotingChallenge is ChallengeInterface {

    // ============
    // EVENTS:
    // ============

    event _VoteCommitted(bytes32 UUID, address voterAddress, uint numTokens);
    event _VoteRevealed(address voterAddress, uint numTokens, uint votesFor, uint votesAgainst);
    event _PollCreated(uint voteQuorum, uint commitEndDate, uint revealEndDate, uint pollID);
    event _VotingRightsGranted(uint numTokens);
    event _VotingRightsWithdrawn(uint numTokens);
    event _RewardClaimed(uint reward, address indexed voter);

    // ============
    // DATA STRUCTURES:
    // ============

    using AttributeStore for AttributeStore.Data;
    using DLL for DLL.Data;
    using SafeMath for uint;

    // ============
    // GLOBAL VARIABLES:
    // ============

    address public challenger;     /// the address of the challenger
    address public listingOwner;      /// the address of the listingOwner
    bool public isStarted;         /// true if challenger has executed start()

    uint public commitEndDate;     /// expiration date of commit period for poll
    uint public revealEndDate;     /// expiration date of reveal period for poll
    uint public voteQuorum;	    /// number of votes required for a proposal to pass
    uint public rewardPool;        /// pool of tokens to be distributed to winning voters
    uint public stake;             /// number of tokens at stake for either party during challenge
    uint public votesFor;		    /// tally of votes supporting proposal
    uint public votesAgainst;      /// tally of votes countering proposal

    bool public winnerRewardTransferred;
    uint public voterTokensClaimed;
    uint public voterRewardsClaimed;

    uint public commitStageLen;
    uint public revealStageLen;

    mapping(address => bool) public didCommit;     /// indicates whether an address committed a vote for this poll
    mapping(address => bool) public didReveal;     /// indicates whether an address revealed a vote for this poll

    mapping(address => uint) public voteTokenBalance; // maps user's address to voteToken balance
    mapping(address => bool) public tokenClaims;   // Indicates whether a voter has claimed a reward yet

    AttributeStore.Data store;

    EIP20Interface public token;

    // ============
    // MODIFIERS:
    // ============

    modifier onlyChallenger() {
        require(msg.sender == challenger);
        _;
    }

    // ============
    // CONSTRUCTOR:
    // ============

    /**
    @dev Initializes voteQuorum, commitDuration, revealDuration, and pollNonce in addition to token contract and trusted mapping
    @param _tokenAddr The address where the ERC20 token contract is deployed
    @param _commitStageLen Length of the commit stage
    @param _revealStageLen Length of the reveal stage
    @param _voteQuorum Percentage of votes needed to win (0 - 100)
    @param _rewardPool Pool of tokens to be distributed to winning voters
    @param _stake Number of tokens at stake for either party during challenge
    */
    function PLCRVotingChallenge(address _challenger, address _listingOwner, address _tokenAddr, uint _commitStageLen, uint _revealStageLen, uint _voteQuorum, uint _rewardPool, uint _stake) public {
        challenger = _challenger;
        listingOwner = _listingOwner;

        token = EIP20Interface(_tokenAddr);

        commitStageLen = _commitStageLen;
        revealStageLen = _revealStageLen;

        voteQuorum = _voteQuorum;
        rewardPool = _rewardPool;
        stake = _stake;
    }

    // ================
    // TOKEN INTERFACE:
    // ================

    /**
    @notice Loads _numTokens ERC20 tokens into the voting contract for one-to-one voting rights
    @dev Assumes that msg.sender has approved voting contract to spend on their behalf
    @param _numTokens The number of votingTokens desired in exchange for ERC20 tokens
    */
    function requestVotingRights(uint _numTokens) external {
        require(started() && !ended());
        require(token.balanceOf(msg.sender) >= _numTokens);
        voteTokenBalance[msg.sender] += _numTokens;
        require(token.transferFrom(msg.sender, this, _numTokens));
        _VotingRightsGranted(_numTokens);
    }

    function start() public onlyChallenger {
        require(token.transferFrom(challenger, this, stake));

        commitEndDate = block.timestamp.add(commitStageLen);
        revealEndDate = commitEndDate.add(revealStageLen);

        isStarted = true;
    }

    /**
    @notice Withdraw _numTokens ERC20 tokens from the voting contract, revoking these voting rights
    */
    function withdrawVotingRights() external {
        require(ended());
        require(voteTokenBalance[msg.sender] > 0);
        require(token.transfer(msg.sender, voteTokenBalance[msg.sender]));
        voteTokenBalance[msg.sender] = 0;
        _VotingRightsWithdrawn(voteTokenBalance[msg.sender]);
    }

    // =================
    // VOTING INTERFACE:
    // =================

    /**
    @notice Commits vote using hash of choice and secret salt to conceal vote until reveal
    @param _secretHash Commit keccak256 hash of voter's choice and salt (tightly packed in this order)
    @param _numTokens The number of tokens to be committed towards the target poll
    */
    function commitVote(bytes32 _secretHash, uint _numTokens) external {
        require(started());
        require(commitPeriodActive());
        require(voteTokenBalance[msg.sender] >= _numTokens); // prevent user from overspending

        bytes32 UUID = attrUUID(msg.sender);

        store.setAttribute(UUID, "numTokens", _numTokens);
        store.setAttribute(UUID, "commitHash", uint(_secretHash));

        didCommit[msg.sender] = true;
        _VoteCommitted(UUID, msg.sender, _numTokens);
    }

    /**
    @notice Reveals vote with choice and secret salt used in generating commitHash to attribute committed tokens
    @param _voteOption Vote choice used to generate commitHash
    @param _salt Secret number used to generate commitHash
    */
    function revealVote(uint _voteOption, uint _salt) external {
        require(started());
        require(revealPeriodActive());
        require(didCommit[msg.sender]);    // make sure user has committed a vote
        require(!didReveal[msg.sender]);   // prevent user from revealing multiple times
        require(keccak256(_voteOption, _salt) == getCommitHash(msg.sender)); // compare resultant hash from inputs to original commitHash

        uint numTokens = getNumTokens(msg.sender);

        if (_voteOption == 1) { // apply numTokens to appropriate poll choice
            votesFor += numTokens;
        } else {
            votesAgainst += numTokens;
        }

        didReveal[msg.sender] = true;

        _VoteRevealed(msg.sender, numTokens, votesFor, votesAgainst);
    }

    /**
    @dev                Called by a voter to claim their reward for each completed vote
    @param _salt        The salt of a voter's commit hash
    */
    function claimVoterReward(uint _salt) public {
        // Ensures the voter has not already claimed tokens
        require(tokenClaims[msg.sender] == false);

        uint voterTokens = getNumWinningTokens(msg.sender, _salt);
        uint reward = voterReward(msg.sender, _salt);

        voterTokensClaimed += voterTokens;
        voterRewardsClaimed += reward;

        // Ensures a voter cannot claim tokens again
        tokenClaims[msg.sender] = true;

        require(token.transfer(msg.sender, reward));

        _RewardClaimed(reward, msg.sender);
    }

    function transferWinnerReward() public {
        require(ended() && !winnerRewardTransferred);

        address winner = passed() ? challenger : listingOwner;
        uint voterRewards = getTotalNumberOfTokensForWinningOption() == 0 ? 0 : rewardPool;

        require(token.transfer(winner, stake - rewardPool));

        winnerRewardTransferred = true;


        // TODO event
    }

    /**
    @param _voter The address of the voter
    @param _salt Arbitrarily chosen integer used to generate secretHash
    @return correctVotes Number of tokens voted for winning option
    */
    function getNumWinningTokens(address _voter, uint _salt) public constant returns (uint correctVotes) {
        require(ended());
        require(didReveal[_voter]);

        uint winningChoice = passed() ? 0 : 1;
        bytes32 winnerHash = keccak256(winningChoice, _salt);
        bytes32 commitHash = getCommitHash(_voter);

        require(winnerHash == commitHash);

        return getNumTokens(_voter);
    }

    // ==================
    // CHALLENGE INTERFACE:
    // ==================

    /**
    @notice Determines if the challenge has passed
    @dev Check if votesAgainst out of totalVotes exceeds votesQuorum (requires ended)
    */
    function passed() public view returns (bool) {
        require(ended());

        return (100 * votesAgainst) > (voteQuorum * (votesFor + votesAgainst));
    }

    /**
    @dev                Calculates the provided voter's token reward.
    @param _voter       The address of the voter whose reward balance is to be returned
    @param _salt        The salt of the voter's commit hash in the given poll
    @return             The uint indicating the voter's reward
    */
    function voterReward(address _voter, uint _salt)
    public view returns (uint) {
        uint voterTokens = getNumWinningTokens(_voter, _salt);
        uint remainingRewardPool = rewardPool - voterRewardsClaimed;
        uint remainingTotalTokens = getTotalNumberOfTokensForWinningOption() - voterTokensClaimed;
        return (voterTokens * remainingRewardPool) / remainingTotalTokens;
    }

    /**
    @dev Determines the number of tokens awarded to the winning party
    */
    function tokenRewardAmount() public view returns (uint) {
        require(ended());

        // Edge case, nobody voted, give all tokens to the challenger.
        if (getTotalNumberOfTokensForWinningOption() == 0) {
            return 2 * stake;
        }

        return (2 * stake) - rewardPool;
    }

    function tokenLockAmount() public view returns (uint) {
        return stake;
    }

    function started() public view returns (bool) {
        return isStarted;
    }

    // ----------------
    // CHALLENGE HELPERS:
    // ----------------

    /**
    @dev Gets the total winning votes for reward distribution purposes
    @return Total number of votes committed to the winning option
    */
    function getTotalNumberOfTokensForWinningOption() constant public returns (uint numTokens) {
        require(ended());

        if (!passed()) {
            return votesFor;
        } else {
            return votesAgainst;
        }
    }

    /**
    @notice Checks if a challenge is ended
    @dev Checks isExpired for the revealEndDate
    @return Boolean indication if challenge is ended
    */
    function ended() view public returns (bool) {
      return isExpired(revealEndDate);
    }

    /**
    @notice Checks if the commit period is still active
    @dev Checks isExpired for the commitEndDate
    @return Boolean indication if commit period is active
    */
    function commitPeriodActive() constant public returns (bool active) {
        return !isExpired(commitEndDate);
    }

    /**
    @notice Checks if the reveal period is still active
    @dev Checks isExpired for the revealEndDate
    */
    function revealPeriodActive() constant public returns (bool active) {
        return !isExpired(revealEndDate) && !commitPeriodActive();
    }

    // ---------------------------
    // DOUBLE-LINKED-LIST HELPERS:
    // ---------------------------

    /**
    @dev Gets the bytes32 commitHash property
    @param _voter Address of user to check against
    @return Bytes32 hash property
    */
    function getCommitHash(address _voter) constant public returns (bytes32 commitHash) {
        return bytes32(store.getAttribute(attrUUID(_voter), "commitHash"));
    }

    /**
    @dev Wrapper for getAttribute with attrName="numTokens"
    @param _voter Address of user to check against
    @return Number of tokens committed
    */
    function getNumTokens(address _voter) constant public returns (uint numTokens) {
        return store.getAttribute(attrUUID(_voter), "numTokens");
    }

    /**
    @dev Gets the numTokens property of getLastNode
    @param _voter Address of user to check against
    @return Maximum number of tokens committed in poll specified
    */
    function getLockedTokens(address _voter) constant public returns (uint numTokens) {
        return getNumTokens(_voter);
    }

    // ----------------
    // GENERAL HELPERS:
    // ----------------

    /**
    @dev Checks if an expiration date has been reached
    @param _terminationDate Integer timestamp of date to compare current timestamp with
    @return expired Boolean indication of whether the terminationDate has passed
    */
    function isExpired(uint _terminationDate) constant public returns (bool expired) {
        return (block.timestamp > _terminationDate);
    }

    /**
    @dev Generates an identifier which associates a user and a poll together
    @return UUID Hash which is deterministic from _user
    */
    function attrUUID(address _user) public pure returns (bytes32 UUID) {
        return keccak256(_user);
    }
}
