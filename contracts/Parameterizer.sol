pragma solidity^0.4.11;

import "./PLCRVoting.sol";
import "./historical/StandardToken.sol";

contract Parameterizer {
	mapping(bytes32 => uint) public params;
	
	struct ParamProposal {
		string name;
		uint value;
		address owner;
		uint deposit;
	}

	// maps pollIDs to intended data change if poll passes
	mapping(uint => ParamProposal) public proposalMap; 

	// Global Variables
    StandardToken public token;
    PLCRVoting public voting;

	/// @param _minDeposit      minimum deposit for listing to be whitelisted  
  /// @param _pMinDeposit minimum deposit to propose a parameter change 
  /// @param _applyStageLen   length of period in which applicants wait to be whitelisted
  /// @param _dispensationPct percentage of losing party's deposit distributed to winning party
  /// @param _commitPeriodLen length of commit period for voting
  /// @param _revealPeriodLen length of reveal period for voting
  /// @param _voteQuorum      type of majority out of 100 necessary for vote success
	function Parameterizer( 
		address _tokenAddr,
    address _plcrAddr,
		uint _minDeposit,
    uint _pMinDeposit,
    uint _applyStageLen,
    uint _pApplyStageLen,
    uint _commitPeriodLen,
    uint _pCommitPeriodLen,
    uint _revealPeriodLen,
    uint _pRevealPeriodLen,
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
      set("commitPeriodLen", _commitPeriodLen);
      set("pCommitPeriodLen", _pCommitPeriodLen);
      set("revealPeriodLen", _revealPeriodLen);
      set("pRevealPeriodLen", _pRevealPeriodLen);
      set("dispensationPct", _dispensationPct);
      set("pDispensationPct", _pDispensationPct);
      set("voteQuorum", _voteQuorum);
      set("pVoteQuorum", _pVoteQuorum);
	}

	// changes parameter within canonical mapping
	function set(string _name, uint _value) internal {
		params[sha3(_name)] = _value;
	}

	// gets parameter by string _name from hashMap
	function get(string _name) public constant returns (uint value) {
		return params[sha3(_name)];
	}

	// starts poll and takes tokens from msg.sender
	function changeParameter(string _name, uint _value) returns (uint) {
		uint deposit = get("minParamDeposit");
		require(token.transferFrom(msg.sender, this, deposit)); // escrow tokens (deposit amt)
		
		uint pollID = voting.startPoll(
			get("voteQuorum"),
			get("commitPeriodLen"),
			get("revealPeriodLen")
		);

		// attach name and value to pollID		
		proposalMap[pollID] = ParamProposal({
			name: _name,
			value: _value,
			owner: msg.sender,
			deposit: deposit
		});

		return pollID;
	}

	// updates canonical mapping with evaluation of poll result
	function processProposal(uint _pollID) {
		ParamProposal storage prop = proposalMap[_pollID];
		// check isPassed ==> update params mapping using set
		if (voting.isPassed(_pollID)) {
			set(prop.name, prop.value);
		}
		// release escrowed tokens
		require(token.transfer(prop.owner, prop.deposit));
		prop.deposit = 0; // prevent double-withdrawal
	}
}
