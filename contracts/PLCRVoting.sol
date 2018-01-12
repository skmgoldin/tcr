pragma solidity ^0.4.8;
import "tokens/eip20/EIP20.sol";
import "dll/DLL.sol";
import "attrstore/AttributeStore.sol";

/**
@title Partial-Lock-Commit-Reveal Voting scheme with ERC20 tokens 
@author Team: Aspyn Palatnick, Cem Ozer, Yorke Rhodes
*/
contract PLCRVoting {

    // ============
    // EVENTS:
    // ============

    event VoteCommitted(address voter, uint pollID, uint numTokens);
    event VoteRevealed(address voter, uint pollID, uint numTokens, uint choice);
    event PollCreated(uint voteQuorum, uint commitDuration, uint revealDuration, uint pollID);
    event VotingRightsGranted(address voter, uint numTokens);
    event VotingRightsWithdrawn(address voter, uint numTokens);

    // ============
    // DATA STRUCTURES:
    // ============

    using AttributeStore for AttributeStore.Data;
    using DLL for DLL.Data;

    struct Poll {
        uint commitEndDate;     /// expiration date of commit period for poll
        uint revealEndDate;     /// expiration date of reveal period for poll
        uint voteQuorum;	    /// number of votes required for a proposal to pass
        uint votesFor;		    /// tally of votes supporting proposal
        uint votesAgainst;      /// tally of votes countering proposal
    }
    
    // ============
    // STATE VARIABLES:
    // ============

    uint constant public INITIAL_POLL_NONCE = 0;
    uint public pollNonce;

    mapping(uint => Poll) public pollMap; // maps pollID to Poll struct
    mapping(address => uint) public voteTokenBalance; // maps user's address to voteToken balance

    mapping(address => DLL.Data) dllMap;
    AttributeStore.Data store;

    EIP20 public token;

    // ============
    // CONSTRUCTOR:
    // ============

    /**
    @dev Initializes voteQuorum, commitDuration, revealDuration, and pollNonce in addition to token contract and trusted mapping
    @param _tokenAddr The address where the ERC20 token contract is deployed
    */
    function PLCRVoting(address _tokenAddr) public {
        token = EIP20(_tokenAddr);
        pollNonce = INITIAL_POLL_NONCE;
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
        require(token.balanceOf(msg.sender) >= _numTokens);
        require(token.transferFrom(msg.sender, this, _numTokens));
        voteTokenBalance[msg.sender] += _numTokens;
        VotingRightsGranted(msg.sender, _numTokens);
    }

    /**
    @notice Withdraw _numTokens ERC20 tokens from the voting contract, revoking these voting rights
    @param _numTokens The number of ERC20 tokens desired in exchange for voting rights
    */
    function withdrawVotingRights(uint _numTokens) external {
        uint availableTokens = voteTokenBalance[msg.sender] - getLockedTokens(msg.sender);
        require(availableTokens >= _numTokens);
        require(token.transfer(msg.sender, _numTokens));
        voteTokenBalance[msg.sender] -= _numTokens;
        VotingRightsWithdrawn(msg.sender, _numTokens);
    }

    /**
    @dev Unlocks tokens locked in unrevealed vote where poll has ended
    @param _pollID Integer identifier associated with the target poll
    */
    function rescueTokens(uint _pollID) external {
        require(pollEnded(_pollID));
        require(!hasBeenRevealed(msg.sender, _pollID));

        dllMap[msg.sender].remove(_pollID);
    }

    // =================
    // VOTING INTERFACE:
    // =================

    /**
    @notice Commits vote using hash of choice and secret salt to conceal vote until reveal
    @param _pollID Integer identifier associated with target poll
    @param _secretHash Commit keccak256 hash of voter's choice and salt (tightly packed in this order)
    @param _numTokens The number of tokens to be committed towards the target poll
    @param _prevPollID The ID of the poll that the user has voted the maximum number of tokens in which is still less than or equal to numTokens 
    */
    function commitVote(uint _pollID, bytes32 _secretHash, uint _numTokens, uint _prevPollID) external {
        require(commitPeriodActive(_pollID));
        require(voteTokenBalance[msg.sender] >= _numTokens); // prevent user from overspending
        require(_pollID != 0);                // prevent user from committing to zero node placeholder

        // TODO: Move all insert validation into the DLL lib
        // Check if _prevPollID exists
        require(_prevPollID == 0 || getCommitHash(msg.sender, _prevPollID) != 0);

        uint nextPollID = dllMap[msg.sender].getNext(_prevPollID);

        // if nextPollID is equal to _pollID, _pollID is being updated,
        nextPollID = (nextPollID == _pollID) ? dllMap[msg.sender].getNext(_pollID) : nextPollID;

        require(validPosition(_prevPollID, nextPollID, msg.sender, _numTokens));
        dllMap[msg.sender].insert(_prevPollID, _pollID, nextPollID);

        bytes32 UUID = attrUUID(msg.sender, _pollID);

        store.setAttribute(UUID, "numTokens", _numTokens);
        store.setAttribute(UUID, "commitHash", uint(_secretHash));

        VoteCommitted(msg.sender, _pollID, _numTokens);
    }

    /**
    @dev Compares previous and next poll's committed tokens for sorting purposes
    @param _prevID Integer identifier associated with previous poll in sorted order
    @param _nextID Integer identifier associated with next poll in sorted order
    @param _voter Address of user to check DLL position for
    @param _numTokens The number of tokens to be committed towards the poll (used for sorting)
    @return valid Boolean indication of if the specified position maintains the sort
    */
    function validPosition(uint _prevID, uint _nextID, address _voter, uint _numTokens) public constant returns (bool valid) {
        bool prevValid = (_numTokens >= getNumTokens(_voter, _prevID));
        // if next is zero node, _numTokens does not need to be greater
        bool nextValid = (_numTokens <= getNumTokens(_voter, _nextID) || _nextID == 0); 
        return prevValid && nextValid;
    }

    /**
    @notice Reveals vote with choice and secret salt used in generating commitHash to attribute committed tokens
    @param _pollID Integer identifier associated with target poll
    @param _voteOption Vote choice used to generate commitHash for associated poll
    @param _salt Secret number used to generate commitHash for associated poll
    */
    function revealVote(uint _pollID, uint _voteOption, uint _salt) external {
        // Make sure the reveal period is active
        require(revealPeriodActive(_pollID));
        require(!hasBeenRevealed(msg.sender, _pollID));                        // prevent user from revealing multiple times
        require(keccak256(_voteOption, _salt) == getCommitHash(msg.sender, _pollID)); // compare resultant hash from inputs to original commitHash

        uint numTokens = getNumTokens(msg.sender, _pollID); 

        if (_voteOption == 1) // apply numTokens to appropriate poll choice
            pollMap[_pollID].votesFor += numTokens;
        else
            pollMap[_pollID].votesAgainst += numTokens;
        
        dllMap[msg.sender].remove(_pollID); // remove the node referring to this vote upon reveal

        VoteRevealed(msg.sender, _pollID, numTokens, _voteOption);
    }

    /**
    @param _pollID Integer identifier associated with target poll
    @param _salt Arbitrarily chosen integer used to generate secretHash
    @return correctVotes Number of tokens voted for winning option
    */
    function getNumPassingTokens(address _voter, uint _pollID, uint _salt) public constant returns (uint correctVotes) {
        require(pollEnded(_pollID));
        require(hasBeenRevealed(_voter, _pollID));

        uint winningChoice = isPassed(_pollID) ? 1 : 0;
        bytes32 winnerHash = keccak256(winningChoice, _salt);
        bytes32 commitHash = getCommitHash(_voter, _pollID);

        require(winnerHash == commitHash);

        return getNumTokens(_voter, _pollID);
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
    @param _pollID Integer identifier associated with target poll
    */
    function isPassed(uint _pollID) constant public returns (bool passed) {
        require(pollEnded(_pollID));

        Poll memory poll = pollMap[_pollID];
        return (100 * poll.votesFor) > (poll.voteQuorum * (poll.votesFor + poll.votesAgainst));
    }

    // ----------------
    // POLLING HELPERS:
    // ----------------

    /**
    @dev Gets the total winning votes for reward distribution purposes
    @param _pollID Integer identifier associated with target poll
    @return Total number of votes committed to the winning option for specified poll
    */
    function getTotalNumberOfTokensForWinningOption(uint _pollID) constant public returns (uint numTokens) {
        require(pollEnded(_pollID));

        if (isPassed(_pollID))
            return pollMap[_pollID].votesFor;
        else
            return pollMap[_pollID].votesAgainst;
    }

    /**
    @notice Determines if poll is over
    @dev Checks isExpired for specified poll's revealEndDate
    @return Boolean indication of whether polling period is over
    */
    function pollEnded(uint _pollID) constant public returns (bool ended) {
        require(pollExists(_pollID));

        return isExpired(pollMap[_pollID].revealEndDate);
    }

    /**
    @notice Checks if the commit period is still active for the specified poll
    @dev Checks isExpired for the specified poll's commitEndDate
    @param _pollID Integer identifier associated with target poll
    @return Boolean indication of isCommitPeriodActive for target poll
    */
    function commitPeriodActive(uint _pollID) constant public returns (bool active) {
        require(pollExists(_pollID));

        return !isExpired(pollMap[_pollID].commitEndDate);
    }

    /**
    @notice Checks if the reveal period is still active for the specified poll
    @dev Checks isExpired for the specified poll's revealEndDate
    @param _pollID Integer identifier associated with target poll
    */
    function revealPeriodActive(uint _pollID) constant public returns (bool active) {
        require(pollExists(_pollID));

        return !isExpired(pollMap[_pollID].revealEndDate) && !commitPeriodActive(_pollID);
    }

    /**
    @dev Checks if user has already revealed for specified poll
    @param _voter Address of user to check against
    @param _pollID Integer identifier associated with target poll
    @return Boolean indication of whether user has already revealed
    */
    function hasBeenRevealed(address _voter, uint _pollID) constant public returns (bool revealed) {
        require(pollExists(_pollID));

        return !dllMap[_voter].contains(_pollID);
    }

    /**
    @dev Checks if a poll exists, throws if the provided poll is in an impossible state
    @param _pollID The pollID whose existance is to be evaluated.
    @return Boolean Indicates whether a poll exists for the provided pollID
    */
    function pollExists(uint _pollID) constant public returns (bool exists) {
        uint commitEndDate = pollMap[_pollID].commitEndDate;
        uint revealEndDate = pollMap[_pollID].revealEndDate;

        assert(!(commitEndDate == 0 && revealEndDate != 0));
        assert(!(commitEndDate != 0 && revealEndDate == 0));

        if(commitEndDate == 0 || revealEndDate == 0) { return false; }
        return true;
    }

    // ---------------------------
    // DOUBLE-LINKED-LIST HELPERS:
    // ---------------------------

    /**
    @dev Gets the bytes32 commitHash property of target poll
    @param _voter Address of user to check against
    @param _pollID Integer identifier associated with target poll
    @return Bytes32 hash property attached to target poll 
    */
    function getCommitHash(address _voter, uint _pollID) constant public returns (bytes32 commitHash) { 
        return bytes32(store.getAttribute(attrUUID(_voter, _pollID), "commitHash"));    
    } 

    /**
    @dev Wrapper for getAttribute with attrName="numTokens"
    @param _voter Address of user to check against
    @param _pollID Integer identifier associated with target poll
    @return Number of tokens committed to poll in sorted poll-linked-list
    */
    function getNumTokens(address _voter, uint _pollID) constant public returns (uint numTokens) {
        return store.getAttribute(attrUUID(_voter, _pollID), "numTokens");
    }

    /**
    @dev Gets top element of sorted poll-linked-list
    @param _voter Address of user to check against
    @return Integer identifier to poll with maximum number of tokens committed to it
    */
    function getLastNode(address _voter) constant public returns (uint pollID) {
        return dllMap[_voter].getPrev(0);
    }

    /**
    @dev Gets the numTokens property of getLastNode
    @param _voter Address of user to check against
    @return Maximum number of tokens committed in poll specified 
    */
    function getLockedTokens(address _voter) constant public returns (uint numTokens) {
        return getNumTokens(_voter, getLastNode(_voter));
    }

    /**
    @dev Gets the prevNode a new node should be inserted after given the sort factor
    @param _voter The voter whose DLL will be searched
    @param _numTokens The value for the numTokens attribute in the node to be inserted
    @return the node which the propoded node should be inserted after
    */
    function getInsertPointForNumTokens(address _voter, uint _numTokens)
    constant public returns (uint prevNode) {
      uint nodeID = getLastNode(_voter);
      uint tokensInNode = getNumTokens(_voter, nodeID);

      while(tokensInNode != 0) {
        tokensInNode = getNumTokens(_voter, nodeID);
        if(tokensInNode < _numTokens) {
          return nodeID;
        }
        nodeID = dllMap[_voter].getPrev(nodeID);
      }

      return nodeID;
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
    @param _pollID Integer identifier associated with target poll
    @return UUID Hash which is deterministic from _user and _pollID
    */
    function attrUUID(address _user, uint _pollID) public pure returns (bytes32 UUID) {
        return keccak256(_user, _pollID);
    }
}
