pragma solidity^0.4.11;

import "./PLCRVoting.sol";
import "./StandardToken.sol";

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
    /// @param _minParamDeposit minimum deposit to propose a parameter change 
    /// @param _applyStageLen   length of period in which applicants wait to be whitelisted
    /// @param _dispensationPct percentage of losing party's deposit distributed to winning party
    /// @param _commitPeriodLen length of commit period for voting
    /// @param _revealPeriodLen length of reveal period for voting
    /// @param _voteQuorum      type of majority out of 100 necessary for vote success

	function Parameterizer( 
		address tokenAddr,
		uint _minDeposit,
        uint _minParamDeposit,
        uint _applyStageLen,
        uint _commitPeriodLen,
        uint _revealPeriodLen,
        uint _dispensationPct,
        uint _voteQuorum
    ) {
		token = StandardToken(tokenAddr);
		voting = new PLCRVoting(tokenAddr);

		set("minDeposit", _minDeposit);
        set("minParamDeposit", _minParamDeposit);
        set("applyStageLen", _applyStageLen);
        set("commitPeriodLen", _commitPeriodLen);
        set("revealPeriodLen", _revealPeriodLen);
        set("dispensationPct", _dispensationPct);
        set("voteQuorum", _voteQuorum);
	}

	// changes parameter within canonical mapping
	function set(string name, uint value) internal {
		params[sha3(name)] = value;
	}

	// gets parameter by string name from hashMap
	function get(string name) public constant returns (uint value) {
		return params[sha3(name)];
	}

	// starts poll and takes tokens from msg.sender
	function changeParameter(string name, uint value) returns (uint) {
		uint deposit = get("minParamDeposit");
		require(token.transferFrom(msg.sender, this, deposit)); // escrow tokens (deposit amt)
		
		uint pollID = voting.startPoll("blah",
			get("voteQuorum"),
			get("commitPeriodLen"),
			get("revealPeriodLen")
		);

		// attach name and value to pollID		
		proposalMap[pollID] = ParamProposal({
			name: name,
			value: value,
			owner: msg.sender,
			deposit: deposit
		});

		return pollID;
	}

	// updates canonical mapping with evaluation of poll result
	function processProposal(uint pollID) {
		ParamProposal storage prop = proposalMap[pollID];
		// check isPassed ==> update params mapping using set
		if (voting.isPassed(pollID)) {
			set(prop.name, prop.value);
		}
		// release escrowed tokens
		require(token.transfer(prop.owner, prop.deposit));
		prop.deposit = 0; // prevent double-withdrawal
	}
}
