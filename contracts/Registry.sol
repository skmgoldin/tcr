pragma solidity 0.4.11;
import "./StandardToken.sol";

// need to think abotu events
// save address
// update domain name functionality?

contract Registry {

	address public wallet;

	// this will later be the parameters from the parametrizer
	uint public expDuration;
	uint public applyCost;
	uint public challengeDuration;
	StandardToken public token;

	struct Publisher {
		address owner;
		uint expTime;
	}

	struct Application {
		address owner;
		uint challengeTime;
		bool challenged;
	}
	
	mapping(bytes32 => Publisher) public whitelist;
	mapping(bytes32 => Application) public applicant;

	function Registry(address _token) {
		// set parameters somehow
		token = StandardToken(_token);
		expDuration = 200;
		applyCost = 50;
		challengeDuration = 200;
	}

	// make ownerOnly
	function add(bytes32 _domainHash) {
		whitelist[_domainHash].expTime = now + expDuration;
	}

	function isVerified(string _domain) returns (bool) {
		bytes32 domainHash = sha3(_domain);
		if (whitelist[domainHash].expTime < now) {
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
		applicant[domainHash].challengeTime = now + challengeDuration;	
		// trigger an event
	}

	// save challenger somewhere
	function challenge(string _domain) {
		require(token.allowance(msg.sender, this) >= applyCost);
		token.transferFrom(msg.sender, wallet, applyCost);
		bytes32 domainHash = sha3(_domain);
		require(applicant[domainHash].challenged == false); // works for both unexpired whitelisted and new applicants
		require(applicant[domainHash].challengeTime < now);
		applicant[domainHash].challenged = true;
		// if (callVote(domainHash, domainMap[domainHash].time) == true) {
		// 	add(domainHash);
		// }
		// else {
		// 	token.transferFrom(wallet, msg.sender, applyCost);
		// 	// trigger event to notify applicant?
		// }
	}

	function moveToRegistry(string _domain) {
		bytes32 domainHash = sha3(_domain);
		require(applicant[domainHash].challengeTime > now);
		require(applicant[domainHash].challenged == false);
		add(domainHash);
	}

	// claim tokens function

	// function callVote(bytes32 _domainHash, uint _time) private returns (bool) {
	// 	// event that vote has started
	// 	// ??
	// }

	

}