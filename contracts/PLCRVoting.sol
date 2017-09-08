pragma solidity ^0.4.8;
import "./historical/HumanStandardToken.sol";
import "./DLL.sol";
import "./AttributeStore.sol";

/**
@title Partial-Lock-Commit-Reveal Voting scheme with ERC20 tokens 
@author Team: Aspyn Palatnick, Cem Ozer, Yorke Rhodes
*/
contract PLCRVoting {


    event VoteCommitted(address voter, uint pollID, uint numTokens);
    event VoteRevealed(address voter, uint pollID, uint numTokens, uint choice);
    event PollCreated(uint voteQuorum, uint commitDuration, uint revealDuration, uint pollID);
    event VotingRightsGranted(address voter, uint numTokens);
    event VotingRightsWithdrawn(address voter, uint numTokens);

    /// maps user's address to voteToken balance
    mapping(address => uint) public voteTokenBalance;

    struct Poll {
        uint commitEndDate;     /// expiration date of commit period for poll
        uint revealEndDate;     /// expiration date of reveal period for poll
        uint voteQuorum;	    /// number of votes required for a proposal to pass
        uint votesFor;		    /// tally of votes supporting proposal
        uint votesAgainst;      /// tally of votes countering proposal
    }
    
    /// maps pollID to Poll struct
    mapping(uint => Poll) public pollMap;
    uint pollNonce;

    using DLL for DLL.Data;
    mapping(address => DLL.Data) dllMap;

    using AttributeStore for AttributeStore.Data;
    AttributeStore.Data store;

    // ============
    // CONSTRUCTOR:
    // ============

    uint constant INITIAL_POLL_NONCE = 0;
    HumanStandardToken public token;

    /**
    @dev Initializes voteQuorum, commitDuration, revealDuration, and pollNonce in addition to token contract and trusted mapping
    @param tokenAddr The address where the ERC20 token contract is deployed
    */
    function PLCRVoting(address tokenAddr) {
        token = HumanStandardToken(tokenAddr);
        pollNonce = INITIAL_POLL_NONCE;
    }

    // ================
    // TOKEN INTERFACE:
    // ================

    /**    
    @notice Loads numTokens ERC20 tokens into the voting contract for one-to-one voting rights
    @dev Assumes that msg.sender has approved voting contract to spend on their behalf
    @param numTokens The number of votingTokens desired in exchange for ERC20 tokens
    */
    function requestVotingRights(uint numTokens) external {
        require(token.balanceOf(msg.sender) >= numTokens);
        require(token.transferFrom(msg.sender, this, numTokens));
        voteTokenBalance[msg.sender] += numTokens;
        VotingRightsGranted(msg.sender, numTokens);
    }

    /**
    @notice Withdraw numTokens ERC20 tokens from the voting contract, revoking these voting rights
    @param numTokens The number of ERC20 tokens desired in exchange for voting rights
    */
    function withdrawVotingRights(uint numTokens) external {
        uint availableTokens = voteTokenBalance[msg.sender] - getLockedTokens(msg.sender);
        require(availableTokens >= numTokens);
        require(token.transfer(msg.sender, numTokens));
        voteTokenBalance[msg.sender] -= numTokens;
        VotingRightsGranted(msg.sender, numTokens);
    }

    /**
    @dev Unlocks tokens locked in unrevealed vote where poll has ended
    @param pollID Integer identifier associated with the target poll
    */
    function rescueTokens(uint pollID) external {
        require(pollEnded(pollID));
        require(!hasBeenRevealed(msg.sender, pollID));

        dllMap[msg.sender].remove(pollID);
    }

    // =================
    // VOTING INTERFACE:
    // =================

    /**
    @notice Commits vote using hash of choice and secret salt to conceal vote until reveal
    @param pollID Integer identifier associated with target poll
    @param secretHash Commit keccak256 hash of voter's choice and salt (tightly packed in this order)
    @param numTokens The number of tokens to be committed towards the target poll
    @param prevPollID The ID of the poll that the user has voted the maximum number of tokens in which is still less than or equal to numTokens 
    */
    function commitVote(uint pollID, bytes32 secretHash, uint numTokens, uint prevPollID) external {
        require(commitPeriodActive(pollID));
        require(voteTokenBalance[msg.sender] >= numTokens); // prevent user from overspending
        require(pollID != 0);                // prevent user from committing to zero node placerholder

        uint nextPollID = dllMap[msg.sender].getNext(prevPollID);

        require(validPosition(prevPollID, nextPollID, msg.sender, numTokens));
        dllMap[msg.sender].insert(prevPollID, pollID, nextPollID);

        bytes32 UUID = attrUUID(msg.sender, pollID);

        store.attachAttribute(UUID, "numTokens", numTokens);
        store.attachAttribute(UUID, "commitHash", uint(secretHash));

        VoteCommitted(msg.sender, pollID, numTokens);
    }

    /**
    @dev Compares previous and next poll's committed tokens for sorting purposes
    @param prevID Integer identifier associated with previous poll in sorted order
    @param nextID Integer identifier associated with next poll in sorted order
    @param voter Address of user to check DLL position for
    @param numTokens The number of tokens to be committed towards the poll (used for sorting)
    @return valid Boolean indication of if the specified position maintains the sort
    */
    function validPosition(uint prevID, uint nextID, address voter, uint numTokens) public constant returns (bool valid) {
        bool prevValid = (numTokens >= getNumTokens(voter, prevID));
        // if next is zero node, numTokens does not need to be greater
        bool nextValid = (numTokens <= getNumTokens(voter, nextID) || nextID == 0); 
        return prevValid && nextValid;
    }

    /**
    @notice Reveals vote with choice and secret salt used in generating commitHash to attribute committed tokens
    @param pollID Integer identifier associated with target poll
    @param voteOption Vote choice used to generate commitHash for associated poll
    @param salt Secret number used to generate commitHash for associated poll
    */
    function revealVote(uint pollID, uint voteOption, uint salt) external {
        // Make sure the reveal period is active
        require(revealPeriodActive(pollID));
        require(!hasBeenRevealed(msg.sender, pollID));                        // prevent user from revealing multiple times
        require(sha3(voteOption, salt) == getCommitHash(msg.sender, pollID)); // compare resultant hash from inputs to original commitHash

        uint numTokens = getNumTokens(msg.sender, pollID); 

        if (voteOption == 1) // apply numTokens to appropriate poll choice
            pollMap[pollID].votesFor += numTokens;
        else
            pollMap[pollID].votesAgainst += numTokens;
        
        dllMap[msg.sender].remove(pollID); // remove the node referring to this vote upon reveal

        VoteRevealed(msg.sender, pollID, numTokens, voteOption);
    }

    /**
    @param pollID Integer identifier associated with target poll
    @param salt Arbitrarily chosen integer used to generate secretHash
    @return correctVotes Number of tokens voted for winning option
    */
    function getNumPassingTokens(address voter, uint pollID, uint salt) public constant returns (uint correctVotes) {
        require(pollEnded(pollID));
        require(hasBeenRevealed(voter, pollID));

        uint winningChoice = isPassed(pollID) ? 1 : 0;
        bytes32 winnerHash = sha3(winningChoice, salt);
        bytes32 commitHash = getCommitHash(voter, pollID);

        return (winnerHash == commitHash) ? getNumTokens(voter, pollID) : 0;
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
    function startPoll(uint _voteQuorum, uint _commitDuration, uint _revealDuration) public returns (uint pollID) {
        pollNonce = pollNonce + 1;

        pollMap[pollNonce] = Poll({
            voteQuorum: _voteQuorum,
            commitEndDate: block.timestamp + _commitDuration,
            revealEndDate: block.timestamp + _commitDuration + _revealDuration,
            votesFor: 0,
            votesAgainst: 0
        });

        PollCreated(_voteQuorum, _commitDuration, _revealDuration, pollNonce);
        return pollNonce;
    }
 
    /**
    @notice Determines if proposal has passed
    @dev Check if votesFor out of totalVotes exceeds votesQuorum (requires pollEnded)
    @param pollID Integer identifier associated with target poll
    */
    function isPassed(uint pollID) constant public returns (bool passed) {
        require(pollEnded(pollID));

        Poll poll = pollMap[pollID];
        return (100 * poll.votesFor) > (poll.voteQuorum * (poll.votesFor + poll.votesAgainst));
    }

    // ----------------
    // POLLING HELPERS:
    // ----------------

    /**
    @dev Gets the total winning votes for reward distribution purposes
    @param pollID Integer identifier associated with target poll
    @return Total number of votes committed to the winning option for specified poll
    */
    function getTotalNumberOfTokensForWinningOption(uint pollID) constant public returns (uint numTokens) {
        require(pollEnded(pollID));

        if (isPassed(pollID))
            return pollMap[pollID].votesFor;
        else
            return pollMap[pollID].votesAgainst;
    }

    /**
    @notice Determines if poll is over
    @dev Checks isExpired for specified poll's revealEndDate
    @return Boolean indication of whether polling period is over
    */
    function pollEnded(uint pollID) constant public returns (bool ended) {
        return isExpired(pollMap[pollID].revealEndDate);
    }

    /**
    @notice Checks if the commit period is still active for the specified poll
    @dev Checks isExpired for the specified poll's commitEndDate
    @param pollID Integer identifier associated with target poll
    @return Boolean indication of isCommitPeriodActive for target poll
    */
    function commitPeriodActive(uint pollID) constant public returns (bool active) {
        return !isExpired(pollMap[pollID].commitEndDate);
    }

    /**
    @notice Checks if the reveal period is still active for the specified poll
    @dev Checks isExpired for the specified poll's revealEndDate
    @param pollID Integer identifier associated with target poll
    */
    function revealPeriodActive(uint pollID) constant public returns (bool active) {
         return !isExpired(pollMap[pollID].revealEndDate) && !commitPeriodActive(pollID);
    }

    /**
    @dev Checks if user has already revealed for specified poll
    @param voter Address of user to check against
    @param pollID Integer identifier associated with target poll
    @return Boolean indication of whether user has already revealed
    */
    function hasBeenRevealed(address voter, uint pollID) constant public returns (bool revealed) {
        uint prevID = dllMap[voter].getPrev(pollID);
        uint nextID = dllMap[voter].getNext(pollID);
        return (prevID == pollID) && (nextID == pollID);
    }

    // ---------------------------
    // DOUBLE-LINKED-LIST HELPERS:
    // ---------------------------

    /**
    @dev Gets the bytes32 commitHash property of target poll
    @param voter Address of user to check against
    @param pollID Integer identifier associated with target poll
    @return Bytes32 hash property attached to target poll 
    */
    function getCommitHash(address voter, uint pollID) constant public returns (bytes32 commitHash) { 
        return bytes32(store.getAttribute(attrUUID(voter, pollID), "commitHash"));    
    } 

    /**
    @dev Wrapper for getAttribute with attrName="numTokens"
    @param voter Address of user to check against
    @param pollID Integer identifier associated with target poll
    @return Number of tokens committed to poll in sorted poll-linked-list
    */
    function getNumTokens(address voter, uint pollID) constant public returns (uint numTokens) {
        return store.getAttribute(attrUUID(voter, pollID), "numTokens");
    }

    /**
    @dev Gets top element of sorted poll-linked-list
    @param voter Address of user to check against
    @return Integer identifier to poll with maximum number of tokens committed to it
    */
    function getLastNode(address voter) constant public returns (uint pollID) {
        return dllMap[voter].getPrev(0);
    }

    /**
    @dev Gets the numTokens property of getLastNode
    @param voter Address of user to check against
    @return Maximum number of tokens committed in poll specified 
    */
    function getLockedTokens(address voter) constant public returns (uint numTokens) {
        return getNumTokens(voter, getLastNode(voter));
    }
 
    // ----------------
    // GENERAL HELPERS:
    // ----------------

    /**
    @dev Checks if an expiration date has been reached
    @param terminationDate Integer timestamp of date to compare current timestamp with
    @return expired Boolean indication of whether the terminationDate has passed
    */
    function isExpired(uint terminationDate) constant public returns (bool expired) {
        return (block.timestamp > terminationDate);
    }

    /**
    @dev Generates an identifier which associates a user and a poll together
    @param pollID Integer identifier associated with target poll
    @return UUID Hash which is deterministic from user and pollID
    */
    function attrUUID(address user, uint pollID) public constant returns (bytes32 UUID) {
        return sha3(user, pollID);
    }
}
