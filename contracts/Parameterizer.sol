pragma solidity^0.4.11;

import "./PLCRVoting.sol";
import "./historical/StandardToken.sol";

contract Parameterizer {

  // ------
  // EVENTS
  // ------

  event _ReparameterizationProposal(address proposer, string name, uint value, bytes32 propID);
  event _NewChallenge(address challenger, bytes32 propID, uint pollID);

  mapping(bytes32 => uint) public params;

  struct ParamProposal {
    uint appExpiry;
    uint challengeID;
    uint deposit;
    string name;
    address owner;
    uint processBy;
    uint value;
  }

  struct Challenge {
    uint rewardPool;        // (remaining) pool of tokens distributed amongst winning voters
    address challenger;     // owner of Challenge
    bool resolved;          // indication of if challenge is resolved
    uint stake;             // number of tokens at risk for either party during challenge
    uint totalTokens;       // (remaining) amount of tokens used for voting by the winning side
  }

  // maps pollIDs to intended data change if poll passes
  mapping(bytes32 => ParamProposal) public proposalMap; 

  // maps challengeIDs to associated challenge data
  mapping(uint => Challenge) public challengeMap;

  // maps challengeIDs and address to token claim data
  mapping(uint => mapping(address => bool)) public tokenClaims;


  // Global Variables
  StandardToken public token;
  PLCRVoting public voting;
  uint public PROCESSBY = 604800; // 7 days

  /**
  @dev constructor
  @param _tokenAddr        address of the token which parameterizes this system
  @param _plcrAddr         address of a PLCR voting contract for the provided token
  @param _minDeposit       minimum deposit for listing to be whitelisted  
  @param _pMinDeposit      minimum deposit to propose a reparameterization
  @param _applyStageLen    period over which applicants wait to be whitelisted
  @param _pApplyStageLen   period over which reparmeterization proposals wait to be processed 
  @param _dispensationPct  percentage of losing party's deposit distributed to winning party
  @param _pDispensationPct percentage of losing party's deposit distributed to winning party in parameterizer
  @param _commitStageLen  length of commit period for voting
  @param _pCommitStageLen length of commit period for voting in parameterizer
  @param _revealStageLen  length of reveal period for voting
  @param _pRevealStageLen length of reveal period for voting in parameterizer
  @param _voteQuorum       type of majority out of 100 necessary for vote success
  @param _pVoteQuorum      type of majority out of 100 necessary for vote success in parameterizer
  */
  function Parameterizer( 
    address _tokenAddr,
    address _plcrAddr,
    uint _minDeposit,
    uint _pMinDeposit,
    uint _applyStageLen,
    uint _pApplyStageLen,
    uint _commitStageLen,
    uint _pCommitStageLen,
    uint _revealStageLen,
    uint _pRevealStageLen,
    uint _dispensationPct,
    uint _pDispensationPct,
    uint _voteQuorum,
    uint _pVoteQuorum
    ) {
      token = StandardToken(_tokenAddr);
      voting = PLCRVoting(_plcrAddr);

      set("minDeposit", _minDeposit);
      set("pMinDeposit", _pMinDeposit);
      set("applyStageLen", _applyStageLen);
      set("pApplyStageLen", _pApplyStageLen);
      set("commitStageLen", _commitStageLen);
      set("pCommitStageLen", _pCommitStageLen);
      set("revealStageLen", _revealStageLen);
      set("pRevealStageLen", _pRevealStageLen);
      set("dispensationPct", _dispensationPct);
      set("pDispensationPct", _pDispensationPct);
      set("voteQuorum", _voteQuorum);
      set("pVoteQuorum", _pVoteQuorum);
  }

  // -----------------------
  // TOKEN HOLDER INTERFACE:
  // -----------------------

  /**
  @notice propose a reparamaterization of the key _name's value to _value.
  @param _name the name of the proposed param to be set
  @param _value the proposed value to set the param to be set
  */
  function proposeReparameterization(string _name, uint _value) public returns (bytes32) {
    uint deposit = get("pMinDeposit");
    bytes32 propID = keccak256(_name, _value);

    require(!propExists(propID)); // Forbid duplicate proposals
    require(get(_name) != _value); // Forbid NOOP reparameterizations
    require(token.transferFrom(msg.sender, this, deposit)); // escrow tokens (deposit amt)

    // attach name and value to pollID		
    proposalMap[propID] = ParamProposal({
      appExpiry: now + get("pApplyStageLen"),
      challengeID: 0,
      deposit: deposit,
      name: _name,
      owner: msg.sender,
      processBy: now + get("pApplyStageLen") + get("pCommitStageLen") +
        get("pRevealStageLen") + PROCESSBY,
      value: _value
    });

    _ReparameterizationProposal(msg.sender, _name, _value, propID);
    return propID;
  }

  /**
  @notice challenge the provided proposal ID, and put tokens at stake to do so.
  @param _propID the proposal ID to challenge
  */
  function challengeReparameterization(bytes32 _propID) public returns (uint challengeID) {
    ParamProposal memory prop = proposalMap[_propID];
    uint deposit = get("pMinDeposit");

    require(propExists(_propID) && prop.challengeID == 0); 

    //take tokens from challenger
    require(token.transferFrom(msg.sender, this, deposit));
    //start poll
    uint pollID = voting.startPoll(
      get("pVoteQuorum"),
      get("pCommitStageLen"),
      get("pRevealStageLen")
    );

    challengeMap[pollID] = Challenge({
      challenger: msg.sender,
      rewardPool: ((100 - get("pDispensationPct")) * deposit) / 100, 
      stake: deposit,
      resolved: false,
      totalTokens: 0
    });

    proposalMap[_propID].challengeID = pollID;       // update listing to store most recent challenge

    _NewChallenge(msg.sender, _propID, pollID);
    return pollID;
  }

  /**
  @notice for the provided proposal ID, set it, resolve its challenge, or delete it depending on whether it can be set, has a challenge which can be resolved, or if its "process by" date has passed
  @param _propID the proposal ID to make a determination and state transition for
  */
  function processProposal(bytes32 _propID) public {
    ParamProposal storage prop = proposalMap[_propID];

    if (canBeSet(_propID)) {
      set(prop.name, prop.value);
    } else if (challengeCanBeResolved(_propID)) {
      resolveChallenge(_propID);
    } else if (now > prop.processBy) {
      require(token.transfer(prop.owner, prop.deposit));
    } else {
      revert();
    }

    delete proposalMap[_propID];
  }

  /**
  @notice claim the tokens owed for the msg.sender in the provided challenge
  @param _challengeID the challenge ID to claim tokens for
  @param _salt the salt used to vote in the challenge being withdrawn for
  */
  function claimReward(uint _challengeID, uint _salt) public {
    // ensure voter has not already claimed tokens and challenge results have been processed
    require(tokenClaims[_challengeID][msg.sender] == false);
    require(challengeMap[_challengeID].resolved == true);

    uint voterTokens = voting.getNumPassingTokens(msg.sender, _challengeID, _salt);
    uint reward = calculateVoterReward(msg.sender, _challengeID, _salt);

    // subtract voter's information to preserve the participation ratios of other voters
    // compared to the remaining pool of rewards
    challengeMap[_challengeID].totalTokens -= voterTokens;
    challengeMap[_challengeID].rewardPool -= reward;

    require(token.transfer(msg.sender, reward));
    
    // ensures a voter cannot claim tokens again
    tokenClaims[_challengeID][msg.sender] = true;
  }

  // --------
  // GETTERS:
  // --------

  /**
  @dev Calculate the provided voter's token reward for the given poll
  @param _voter Address of the voter whose reward balance is to be returned
  @param _challengeID pollID of the challenge a reward balance is being queried for
  @param _salt the salt for the voter's commit hash in the given poll
  @return a uint indicating the voter's reward in nano-adToken
  */
  function calculateVoterReward(address _voter, uint _challengeID, uint _salt)
  public constant returns (uint) {
    uint totalTokens = challengeMap[_challengeID].totalTokens;
    uint rewardPool = challengeMap[_challengeID].rewardPool;
    uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);
    return (voterTokens * rewardPool) / totalTokens;
  }

  /**
  @notice Determines whether a proposal passed its application stage without a challenge
  @param _propID The proposal ID for which to determine whether its application stage passed without a challenge
  */
  function canBeSet(bytes32 _propID) constant public returns (bool) {
    ParamProposal memory prop = proposalMap[_propID];

    return (now > prop.appExpiry && now < prop.processBy && prop.challengeID == 0);
  }

  /**
  @notice Determines whether a proposal exists for the provided proposal ID
  @param _propID The proposal ID whose existance is to be determined
  */
  function propExists(bytes32 _propID) constant public returns (bool) {
    return proposalMap[_propID].processBy > 0;
  }

  /**
  @notice Determines whether the provided proposal ID has a challenge which can be resolved
  @param _propID The proposal ID whose challenge to inspect
  */
  function challengeCanBeResolved(bytes32 _propID) constant public returns (bool) {
    ParamProposal memory prop = proposalMap[_propID];
    Challenge memory challenge = challengeMap[prop.challengeID];

    return (prop.challengeID > 0 && challenge.resolved == false &&
            voting.pollEnded(prop.challengeID));
  }

  /**
  @notice Determines the number of tokens to awarded to the winning party in a challenge
  @param _challengeID The challengeID to determine a reward for
  */
  function determineReward(uint _challengeID) public constant returns (uint) {
    if(voting.getTotalNumberOfTokensForWinningOption(_challengeID) == 0) {
      // Edge case, nobody voted, give all tokens to the winner.
      return 2 * challengeMap[_challengeID].stake;
    }
    
    return (2 * challengeMap[_challengeID].stake) - challengeMap[_challengeID].rewardPool;
  }

  /**
  @notice gets the parameter keyed by the provided name value from the params mapping
  @param _name the key whose value is to be determined
  */
  function get(string _name) public constant returns (uint value) {
    return params[keccak256(_name)];
  }

  // ----------------
  // PRIVATE FUNCTIONS:
  // ----------------

  /**
  @dev sets the param keted by the provided name to the provided value
  @param _name the name of the param to be set
  @param _value the value to set the param to be set
  */
  function set(string _name, uint _value) private {
    params[keccak256(_name)] = _value;
  }

  /**
  @dev resolves a challenge for the provided _propID. It must be checked in advance whether the _propID has a challenge on it
  @param _propID the proposal ID whose challenge is to be resolved.
  */
  function resolveChallenge(bytes32 _propID) private {
    ParamProposal memory prop = proposalMap[_propID];

    // set flag on challenge being processed
    challengeMap[prop.challengeID].resolved = true;

    // winner gets back their full staked deposit, and dispensationPct*loser's stake
    uint reward = determineReward(prop.challengeID);

    if (voting.isPassed(prop.challengeID)) { // The challenge failed
      if(prop.processBy > now) {
        set(prop.name, prop.value);
      }
      require(token.transfer(prop.owner, reward));
    } 
    else { // The challenge succeeded
      require(token.transfer(challengeMap[prop.challengeID].challenger, reward));
    }

    // store the total tokens used for voting by the winning side for reward purposes
    challengeMap[prop.challengeID].totalTokens =
      voting.getTotalNumberOfTokensForWinningOption(prop.challengeID);
  }
}

