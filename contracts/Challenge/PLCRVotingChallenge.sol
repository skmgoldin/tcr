pragma solidity ^0.4.8;
import "../Parameterizer.sol";
import "../Registry.sol";
import "dll/DLL.sol";
import "attrstore/AttributeStore.sol";
import "zeppelin/math/SafeMath.sol";
import "plcr-revival/PLCRVoting.sol";
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
    address public listingOwner;   /// the address of the listingOwner
    Registry public registry;
    PLCRVoting public voting;      /// address of PLCRVoting Contract
    uint public pollID;            /// pollID of PLCRVoting
    bool challengeResolved;        /// true is challenge has officially been resolved to passed or failed
    uint public commitEndDate;     /// expiration date of commit period for poll
    uint public revealEndDate;     /// expiration date of reveal period for poll
    uint public voteQuorum;	    /// number of votes required for a proposal to pass
    uint public rewardPool;        /// pool of tokens to be distributed to winning voters
    uint public challengerStake;   /// number of tokens at stake for either party during challenge
    uint public votesFor;		    /// tally of votes supporting proposal
    uint public votesAgainst;      /// tally of votes countering proposal

    uint public voterTokensClaimed;
    uint public voterRewardsClaimed;

    uint public commitStageLen;
    uint public revealStageLen;

    mapping(address => bool) public didCommit;     /// indicates whether an address committed a vote for this poll
    mapping(address => bool) public didReveal;     /// indicates whether an address revealed a vote for this poll

    mapping(address => uint) public voteTokenBalance; // maps user's address to voteToken balance
    mapping(address => bool) public tokenClaims;   // Indicates whether a voter has claimed a reward yet

    AttributeStore.Data store;

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
    */
    function PLCRVotingChallenge(address _challenger, address _listingOwner, Registry _registry, Parameterizer _parameterizer) public {
        challenger = _challenger;
        listingOwner = _listingOwner;
        registry = _registry;
        voting = _parameterizer.voting();

        commitStageLen  = _parameterizer.get("commitStageLen");
        revealStageLen  = _parameterizer.get("revealStageLen");
        voteQuorum      = _parameterizer.get("voteQuorum");
        challengerStake = _parameterizer.get("minDeposit");
        pollID          = voting.startPoll( voteQuorum, commitStageLen, revealStageLen);

        uint oneHundred = 100; // Kludge that we need to use SafeMath
        rewardPool      = ((oneHundred.sub(_parameterizer.get("dispensationPct"))).mul(challengerStake)).div(100);
    }

    // =================
    // VOTING INTERFACE:
    // =================

    /**
    @dev                Called by a voter to claim their reward for each completed vote
    @param _salt        The salt of a voter's commit hash
    */
    function claimVoterReward(uint _salt) public {
        // Ensures the voter has not already claimed tokens
        require(tokenClaims[msg.sender] == false);
        require(ended());

        uint voterTokens = voting.getNumPassingTokens(msg.sender, pollID, _salt);
        uint reward = voterReward(msg.sender, _salt);

        voterTokensClaimed += voterTokens;
        voterRewardsClaimed += reward;

        // Ensures a voter cannot claim tokens again
        tokenClaims[msg.sender] = true;

        require(registry.token().transferFrom(registry, this, reward));
        require(registry.token().transfer(msg.sender, reward));

        _RewardClaimed(reward, msg.sender);
    }

    /**
    @dev                Calculates the provided voter's token reward.
    @param _voter       The address of the voter whose reward balance is to be returned
    @param _salt        The salt of the voter's commit hash in the given poll
    @return             The uint indicating the voter's reward
    */
    function voterReward(address _voter, uint _salt)
    public view returns (uint) {
        uint voterTokens = voting.getNumPassingTokens(_voter, pollID, _salt);
        uint remainingRewardPool = rewardPool - voterRewardsClaimed;
        uint remainingTotalTokens = voting.getTotalNumberOfTokensForWinningOption(pollID) - voterTokensClaimed;
        return (voterTokens * remainingRewardPool) / remainingTotalTokens;
    }

    /**
    @dev Determines the number of tokens awarded to the winning party
    */
    function tokenRewardAmount() public view returns (uint) {
        require(ended());

        // Edge case, nobody voted, give all tokens to the challenger.
        if (voting.getTotalNumberOfTokensForWinningOption(pollID) == 0) {
            return challengerStake * 2;
        }

        return challengerStake * 2 - rewardPool;
    }

    // ====================
    // CHALLENGE INTERFACE:
    // ====================

    /**
    @notice Returns amount of tokens staked by challenger
    @dev Returns amount of tokens staked by challenger
    @return integer representing stake
    */
    function stake() view public returns (uint) {
      return challengerStake;
    }

    /**
    @notice Returns tokens required by challenge contract
    @dev Returns tokens required by challenge contract
    @return Returns tokens required by challenge contract
    */
    function requiredTokenDeposit() public view returns(uint) {
      return challengerStake;
    }

    /**
    @notice Checks if a challenge is ended
    @dev Checks pollEnded for the pollID
    @return Boolean indication if challenge is ended
    */
    function ended() view public returns (bool) {
      return voting.pollEnded(pollID);
    }

    /**
    @notice Determines if the challenge has passed
    @dev Check if votesAgainst out of totalVotes exceeds votesQuorum (requires ended)
    */
    function passed() public view returns (bool) {
        require(ended());

        // if votes do not vote in favor of listing, challenge passes
        return !voting.isPassed(pollID);
    }

    /**
    @notice Checks if a challenge is resolved
    @dev Checks whether challenge outome has been resolved to either passed or failed
    @return Boolean indication if challenge is resolved
    */
    function resolved() view public returns (bool) {
      return challengeResolved;
    }
}
