pragma solidity ^0.4.8;
import "./HumanStandardToken.sol";

contract PLCRVoting {
    /// maps user's address to voteToken balance
    mapping(address => uint) public voteTokenBalance;

    HumanStandardToken public token;
    struct Poll {
        string proposal;        /// proposal to be voted for/against
        uint commitEndDate;     /// expiration date of commit period for poll
        uint revealEndDate;     /// expiration date of reveal period for poll
        uint voteQuotaSnap;	/// snapshot of canonical voteQuota
        uint votesFor;		/// tally of votes supporting proposal
        uint votesAgainst;      /// tally of votes countering proposal
    }
    
    /// maps pollID to Poll struct
    mapping(uint => Poll) public pollMap;
    uint pollNonce;
    event PollCreated(uint pollID);

    // represent a double linked list through mapping
    // sha3(userAddress, pollID, "prevID") => byte32 prevID
    // sha3(userAddress, pollID, "nextID") => byte32 nextID
    // sha3(userAddress, pollID, "numTokens") => byte32 numTokens
    // sha3(userAddress, pollID, "commitHash") => byte32 commitHash
    mapping(bytes32 => uint) public voteMap;    

    uint constant INITIAL_POLL_NONCE = 0;
       
    uint constant VOTE_OPTION_FOR = 1; /// vote option indicating a vote for the proposal
    bytes32 constant ZERO_NODE_COMMIT_HASH = 0xabc;

    mapping(address => bool) trustedMap; //maps addresses to trusted value

    function PLCRVoting(address tokenAddr, address[] trusted) {
        token = HumanStandardToken(tokenAddr);
        for (uint idx = 0; idx < trusted.length; idx++) {
            trustedMap[trusted[idx]] = true;
        }

        pollNonce = INITIAL_POLL_NONCE;
    }

    function commitVote(uint pollID, bytes32 hashOfVoteAndSalt, uint numTokens, uint prevPollID) returns (bool) {
        // Make sure the user has enough tokens to commit
        require(hasEnoughTokens(numTokens));

        // Make sure the commit period is active
        require(commitPeriodActive(pollID));

        // Make sure user is not trying to manually commit
        // a vote corresponding the zero node
        require(pollID != 0);

        // Check to see if we are making an update
        // as opposed to an insert
        bool isUpdatingExistingNode = false;
        if (pollID == prevPollID) {
            // Making an update --> the previous node
            // has already been set, and so that
            // node can be used for validation
            prevPollID = getPreviousID(pollID);

            // Check to see if the commit hash was not previously set,
            // which would imply that no commit to this 
            // poll was previously made
            if (getCommitHash(pollID) == 0) {
            return false;
            }

            isUpdatingExistingNode = true;
        } else if (getCommitHash(pollID) != 0) {
            isUpdatingExistingNode = true;
        } 

        // Determine if the new node can be inserted/updated
        // at the given spot (i.e. the node right after prevPollID)
        bool isValid = validateNode(prevPollID,pollID, numTokens);

        // Node is valid
        if (isValid) {
            // Update a previous commit
            if (isUpdatingExistingNode) {
                // Delete the current node as we will be re-inserting
                // that node with new attributes 
                deleteNode(pollID);
            }
                // Insert the <node at poll ID> after
                // the node at <prevPollID>:
                insertToDll(pollID, prevPollID, numTokens, hashOfVoteAndSalt);
        }
        // Invalid prevPollID
        return false;
    }

    function validateNode(uint prevPollID, uint pollID, uint numTokens) returns (bool) {
        if (prevPollID == 0 && getNextID(prevPollID) == 0) {
            // Only the zero node exists
            return true;
        }

        uint prevNodeTokens = getNumTokens(prevPollID);
        // Check if the potential previous node has
        // less tokens than the current node
        if (prevNodeTokens <= numTokens) {
            uint nextNodeID = getNextID(prevPollID);

            // If the next is the current node, then we need to look at
            // the node after the current node (since next == current node
            // indicates an update validation is occurring)
            if (nextNodeID == pollID) {
                nextNodeID = getNextID(pollID);
            }
            uint nextNodeTokens = getNumTokens(nextNodeID);
            if (nextNodeID == 0 || numTokens <= nextNodeTokens) {
                return true;
            }
        }

        return false;
    }

    function revealVote(uint pollID, uint salt, uint voteOption) returns (bool) {
        
        // Make sure the reveal period is active
        require(revealPeriodActive(pollID));

        // Make sure the vote has not yet been revealed
        require(!hasBeenRevealed(pollID));

        bytes32 currHash = sha3(voteOption, salt);

        // Check if the hash from the input is the 
        // same as the commit hash
        if (currHash == getCommitHash(pollID)) {
            // Record the vote
            uint numTokens = getNumTokens(pollID);
            if (voteOption == VOTE_OPTION_FOR) {
                pollMap[pollID].votesFor += numTokens;
            } else {
                pollMap[pollID].votesAgainst += numTokens;
            }
            
            // Remove the node referring to this vote as we no longer need it
            deleteNode(pollID);
            return true;
        }
        return false;
    }

    function hasBeenRevealed(uint pollID) returns (bool) {
        uint prevID = getPreviousID(pollID);
        return prevID == getNextID(pollID) && prevID == pollID;
    }

    function getPreviousID(uint pollID) returns (uint) {
        return getAttribute(pollID, "prevID");
    }

    function getNextID(uint pollID) returns (uint) {
        return getAttribute(pollID, "nextID");
    }

    function getNumTokens(uint pollID) returns (uint) {
        return getAttribute(pollID, "numTokens");
    }

    /// interface for users to purchase votingTokens by exchanging ERC20 token
    function loadTokens(uint numTokens) {
        require(token.balanceOf(msg.sender) >= numTokens);
        require(token.transferFrom(msg.sender, this, numTokens));
        voteTokenBalance[msg.sender] += numTokens;
    }

    /// interface for users to withdraw votingTokens and exchange for ERC20 token
    function withdrawTokens(uint numTokens) {
        uint availableTokens = voteTokenBalance[msg.sender] - getMaxTokens();
        require(availableTokens >= numTokens);
        require(token.transfer(msg.sender, numTokens));
        voteTokenBalance[msg.sender] -= numTokens;
    }
    
    // insert to double-linked-list given that the prevID is valid
    function insertToDll(uint pollID, uint prevID, uint numTokens, bytes32 commitHash) {
        uint nextID = getAttribute(prevID, "nextID");

        // make nextNode.prev point to newNode
        setAttribute(nextID, "prevID", pollID);

        // make prevNode.next point to newNode
        setAttribute(prevID, "nextID", pollID);

        // make newNode point to next and prev 
        setAttribute(pollID, "prevID", prevID); 
        setAttribute(pollID, "nextID", nextID); 

        // set properties of newNode
        setAttribute(pollID, "numTokens", numTokens);
        setAttribute(pollID, "commitHash", uint(commitHash));
    }

    // delete node from double-linked-list by removing pointers to the node, and 
    // setting its prev and next to its own pollID
    function deleteNode(uint pollID){
        // get next and prev node pollIDs
        uint prevID = getAttribute(pollID, "prevID");
        uint nextID = getAttribute(pollID, "nextID");

        // remove node from list
        setAttribute(prevID, "nextID", nextID);
        setAttribute(nextID, "prevID", prevID);

        // set nodes prev and next to its own pollID
        setAttribute(pollID, "nextID", pollID); 
        setAttribute(pollID, "prevID", pollID); 
    }

    // return the pollID of the last node in a dll
    function getLastNode() returns (uint) {
        return getAttribute(0, "prevID");
    }

    /*
     *    Helper Functions
     */

    // return max number of tokens locked for user
    function getMaxTokens() returns (uint) {
        return getAttribute(getLastNode(), "numTokens");
    }
    // return any attribute that is not commitHash
    function hasEnoughTokens(uint numTokens) returns (bool) {
        return voteTokenBalance[msg.sender] >= numTokens;
    }
    /*
     *    Helper Functions
     */
 

    /// MODIFIERS:
    /// true if the commit period is active (i.e. commit period expiration date not yet reached)
    function commitPeriodActive(uint pollID) returns (bool) {
        return !isExpired(pollMap[pollID].commitEndDate);
    }

    /// true if the reveal period is active (i.e. reveal period expiration date not yet reached)
    function revealPeriodActive(uint pollID) returns (bool) {
         return !isExpired(pollMap[pollID].revealEndDate) && !commitPeriodActive(pollID);
    }

    /*
    /// true if the msg.sender (or tx.origin) is in the trusted list
    modifier isTrusted(address user) {
        bool flag = false;
        for (uint idx = 0; idx < trusted.length; idx++) {
            if (user == trusted[idx]) {
                flag = true;
                break;
            }
        }
        require(flag);
        _;
    }
    */

    /// true if the msg.sender (or tx.origin) is in the trusted list
    function isTrusted(address user) returns (bool) {
        return trustedMap[user];
    }

    ///CORE FUNCTIONS:
    function startPoll(string proposalStr, uint voteQuota, uint commitDuration, uint revealDuration) returns (uint) {
        pollNonce = pollNonce + 1;

        pollMap[pollNonce] = Poll({
            proposal: proposalStr,
            commitEndDate: block.timestamp + commitDuration,
            revealEndDate: block.timestamp + commitDuration + revealDuration,
            voteQuotaSnap: voteQuota,
            votesFor: 0,
            votesAgainst: 0
        });

        PollCreated(pollNonce);
        return pollNonce;
    }

    /*
     * Helper Functions
     */
 
    /// check if votesFor / (totalVotes) >= (voteQuota / 100) 
    function isPassed(uint pollID) returns (bool) {
        Poll poll = pollMap[pollID];
        require(isExpired(poll.revealEndDate));
        return ((100 - poll.voteQuotaSnap) * poll.votesFor) >= (poll.voteQuotaSnap * poll.votesAgainst);
    }

    /// determines if current timestamp is past termination timestamp 
    function isExpired(uint terminationDate) returns (bool) {
        return (block.timestamp > terminationDate);
    }

    /// true if the poll ID corresponds to a valid poll; false otherwise
    /// a valid poll can be defined as any poll that has been started (whether
    /// it has finished does not matter)
    function validPollID(uint pollID) returns (bool) {
        return pollMap[pollID].commitEndDate > 0;
    }

    function pollEnded(uint pollID) returns (bool) {
        return isExpired(pollMap[pollID].revealEndDate);
    }

    function getTotalNumberOfTokensForWinningOption(uint pollID) returns (uint) {
        require(pollEnded(pollID));
        if (isPassed(pollID)) {
            return pollMap[pollID].votesFor;
        } else {
            return pollMap[pollID].votesAgainst;
        }
    }

    function getNumCorrectVote(uint pollID, uint salt) returns (uint) {
        require(pollEnded(pollID));
        uint winnerVote = isPassed(pollID) ? 1 : 0; 
        bytes32 winnerHash = sha3(winnerVote, salt);
        bytes32 commitHash = getCommitHash(pollID);

        if (commitHash == winnerHash) {
            uint numTokens = getAttribute(pollID, "numTokens");
            return numTokens;
        } else {
            return 0;
        }
    }
    
    // get any attribute that is not commitHash 
    function getAttribute(uint pollID, string attrName) returns (uint) {    
        return voteMap[sha3(tx.origin, pollID, attrName)]; 
    }
    
    function getCommitHash(uint pollID) returns (bytes32) { 
        return bytes32(voteMap[sha3(tx.origin, pollID, 'commitHash')]);    
    }
    
    function setAttribute(uint pollID, string attrName, uint attrVal) { 
        voteMap[sha3(tx.origin, pollID, attrName)] = attrVal;  
    }

    function getProposalString(uint pollID) returns (string) {
         return pollMap[pollID].proposal;
    }
}
