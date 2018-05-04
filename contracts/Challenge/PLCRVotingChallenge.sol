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

    // struct Poll {
    //     uint commitEndDate;     /// expiration date of commit period for poll
    //     uint revealEndDate;     /// expiration date of reveal period for poll
    //     uint voteQuorum;	    /// number of votes required for a proposal to pass
    //     uint votesFor;		    /// tally of votes supporting proposal
    //     uint votesAgainst;      /// tally of votes countering proposal
    //     mapping(address => bool) didCommit;  /// indicates whether an address committed a vote for this poll
    //     mapping(address => bool) didReveal;   /// indicates whether an address revealed a vote for this poll
    // }

    // ============
    // STATE VARIABLES:
    // ============

    // mapping(uint => Poll) public pollMap; // maps pollID to Poll struct

    address challenger;     /// the address of the challenger
    address listingOwner;      /// the address of the listingOwner
    bool isStarted;         /// true if challenger has executed start()

    uint commitEndDate;     /// expiration date of commit period for poll
    uint revealEndDate;     /// expiration date of reveal period for poll
    uint voteQuorum;	    /// number of votes required for a proposal to pass
    uint rewardPool;        /// pool of tokens to be distributed to winning voters
    uint stake;             /// number of tokens at stake for either party during challenge
    uint votesFor;		    /// tally of votes supporting proposal
    uint votesAgainst;      /// tally of votes countering proposal

    bool winnerRewardTransferred;
    uint voterTokensClaimed;
    uint voterRewardsClaimed;

    uint commitStageLen;
    uint revealStageLen;

    mapping(address => bool) didCommit;     /// indicates whether an address committed a vote for this poll
    mapping(address => bool) didReveal;     /// indicates whether an address revealed a vote for this poll

    mapping(address => uint) public voteTokenBalance; // maps user's address to voteToken balance
    mapping(address => bool) tokenClaims;   // Indicates whether a voter has claimed a reward yet

    mapping(address => DLL.Data) dllMap;
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

    /**
    @dev Unlocks tokens locked in unrevealed vote where poll has ended
    @param _pollID Integer identifier associated with the target poll
    */
    // function rescueTokens(uint _pollID) external {
    //     require(isExpired(pollMap[_pollID].revealEndDate));
    //     require(dllMap[msg.sender].contains(_pollID));

    //     dllMap[msg.sender].remove(_pollID);
    // }

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
    @dev Compares previous and next poll's committed tokens for sorting purposes
    @param _prevID Integer identifier associated with previous poll in sorted order
    @param _nextID Integer identifier associated with next poll in sorted order
    @param _voter Address of user to check DLL position for
    @param _numTokens The number of tokens to be committed towards the poll (used for sorting)
    @return valid Boolean indication of if the specified position maintains the sort
    */
    // function validPosition(uint _prevID, uint _nextID, address _voter, uint _numTokens) public constant returns (bool valid) {
    //     bool prevValid = (_numTokens >= getNumTokens(_voter, _prevID));
    //     // if next is zero node, _numTokens does not need to be greater
    //     bool nextValid = (_numTokens <= getNumTokens(_voter, _nextID) || _nextID == 0);
    //     return prevValid && nextValid;
    // }

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
    // POLLING INTERFACE:
    // ==================

    /**
    @dev Initiates a poll with canonical configured parameters at pollID emitted by PollCreated event
    @param _voteQuorum Type of majority (out of 100) that is necessary for poll to be successful
    @param _commitDuration Length of desired commit period in seconds
    @param _revealDuration Length of desired reveal period in seconds
    */
    /* function startPoll(uint _voteQuorum, uint _commitDuration, uint _revealDuration) public returns (uint pollID) {
        pollNonce = pollNonce + 1;

        uint commitEndDate = block.timestamp.add(_commitDuration);
        uint revealEndDate = commitEndDate.add(_revealDuration);

        pollMap[pollNonce] = Poll({
            voteQuorum: _voteQuorum,
            commitEndDate: commitEndDate,
            revealEndDate: revealEndDate,
            votesFor: 0,
            votesAgainst: 0
        });

        _PollCreated(_voteQuorum, commitEndDate, revealEndDate, pollNonce);
        return pollNonce;
    } */

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
    // POLLING HELPERS:
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
    @dev Gets top element of sorted poll-linked-list
    @param _voter Address of user to check against
    @return Integer identifier to poll with maximum number of tokens committed to it
    */
    // function getLastNode(address _voter) constant public returns (uint pollID) {
    //     return dllMap[_voter].getPrev(0);
    // }

    /**
    @dev Gets the numTokens property of getLastNode
    @param _voter Address of user to check against
    @return Maximum number of tokens committed in poll specified
    */
    function getLockedTokens(address _voter) constant public returns (uint numTokens) {
        return getNumTokens(_voter);
    }

    /*
    @dev Takes the last node in the user's DLL and iterates backwards through the list searching
    for a node with a value less than or equal to the provided _numTokens value. When such a node
    is found, if the provided _pollID matches the found nodeID, this operation is an in-place
    update. In that case, return the previous node of the node being updated. Otherwise return the
    first node that was found with a value less than or equal to the provided _numTokens.
    @param _voter The voter whose DLL will be searched
    @param _numTokens The value for the numTokens attribute in the node to be inserted
    @return the node which the propoded node should be inserted after
    */
    // function getInsertPointForNumTokens(address _voter, uint _numTokens, uint _pollID)
    // constant public returns (uint prevNode) {
    //   // Get the last node in the list and the number of tokens in that node
    //   uint nodeID = getLastNode(_voter);
    //   uint tokensInNode = getNumTokens(_voter, nodeID);

    //   // Iterate backwards through the list until reaching the root node
    //   while(nodeID != 0) {
    //     // Get the number of tokens in the current node
    //     tokensInNode = getNumTokens(_voter, nodeID);
    //     if(tokensInNode <= _numTokens) { // We found the insert point!
    //       if(nodeID == _pollID) {
    //         // This is an in-place update. Return the prev node of the node being updated
    //         nodeID = dllMap[_voter].getPrev(nodeID);
    //       }
    //       // Return the insert point
    //       return nodeID; 
    //     }
    //     // We did not find the insert point. Continue iterating backwards through the list
    //     nodeID = dllMap[_voter].getPrev(nodeID);
    //   }

    //   // The list is empty, or a smaller value than anything else in the list is being inserted
    //   return nodeID;
    // }

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
