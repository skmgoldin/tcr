pragma solidity 0.4.11;
import "./StandardToken.sol";

contract Registry {

	address public wallet;

	// this will later be the parameters from the parametrizer
	uint public expTime;
	uint public applyCost;
	uint public challengeTime;
	StandardToken public token;

	struct Publisher {
		address owner;
		uint time;
		uint status;  // is this publisher in the whitelist or applying or already challenged etc
	}

	// status description:
	// 0 = whitelisted, either expired or not based on time variable
	// 1 = new applicant waiting to be challenged
	// 2 = already been challenged
	// this can possibly just be a bool later
	
	mapping(bytes32 => Publisher) public domainMap;

	function Registry(address _token) {
		// set parameters somehow
		token = StandardToken(_token);
	}

	function add(bytes32 _domainHash) private {
		domainMap[_domainHash].time = now + expTime;
		domainMap[_domainHash].status = 0;
	}

	function isVerified(string _domain) returns (bool) {
		bytes32 domainHash = sha3(_domain);
		if (domainMap[domainHash].time < now && domainMap[domainHash].status != 0) {
			return false;
		}
		else {
			return true;
		}
	}

	function apply(string _domain) {
		require(token.allowance(msg.sender, this) >= applyCost);
		token.transferFrom(msg.sender, wallet, applyCost);
		bytes32 domainHash = sha3(_domain);
		// if success
		domainMap[domainHash].status = 1;
		domainMap[domainHash].time = now + challengeTime;	
		// trigger an event
	}

	// save challenger somewhere
	function challenge(string _domain) {
		require(token.allowance(msg.sender, this) >= applyCost);
		token.transferFrom(msg.sender, wallet, applyCost);
		bytes32 domainHash = sha3(_domain);
		require(domainMap[domainHash].status != 2); // works for both unexpired whitelisted and new applicants
		require(domainMap[domainHash].time < now);
		domainMap[domainHash].status = 2;
		if (callVote(domainHash, domainMap[domainHash].time) == true) {
			add(_domain);
		}
		else {
			token.transferFrom(wallet, msg.sender, applyCost);
			// trigger event to notify applicant?
		}
	}

	function moveToRegistry(string _domain) {
		bytes32 domainHash = sha3(_domain);
		require(domainMap[domainHash].time > now);
		require(domainMap[domainHash].status == 1);
		add(domainHash);
	}

	// claim tokens function

	function callVote(bytes32 _domainHash, uint _time) private returns (bool) {
		// event that vote has started
		// ??
	}

	

}