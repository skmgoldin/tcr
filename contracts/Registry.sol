pragma solidity 0.4.11;
import "./StandardToken.sol";

// to do:
// implement events
// update domain name functionality (?)
// save challenger based on output from voting system
// distribute tokens based on output from voting system
// add to whitelist based on output from voting system

contract Registry {

	address public wallet;

	// this will later be the parameters from the parametrizer
	uint public expDuration;
	uint public applyCost;
	uint public challengeDuration;
	uint public distributionScale;
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
		token = StandardToken(_token);
		// wallet =
		// placeholder values
		expDuration = 2000;
		applyCost = 50;
		challengeDuration = 200;
		distributionScale = 0;
	}

	// make ownerOnly or bytes32 later
	function add(string _domain) {
		bytes32 domainHash = sha3(_domain);
		whitelist[domainHash].expTime = now + expDuration;
		whitelist[domainHash].owner = applicant[domainHash].owner;
	}

	function isVerified(string _domain) returns (bool) {
		bytes32 domainHash = sha3(_domain);
		if (whitelist[domainHash].expTime > now) {
			return true;
		}
		else {
			return false;
		}
	}

	function apply(string _domain) {
		require(token.allowance(msg.sender, this) >= applyCost);
		token.transferFrom(msg.sender, wallet, applyCost);
		bytes32 domainHash = sha3(_domain);
		applicant[domainHash].challengeTime = now + challengeDuration;
		applicant[domainHash].owner = msg.sender;	
		// trigger an event
	}

	function challenge(string _domain) {
		require(token.allowance(msg.sender, this) >= applyCost);
		token.transferFrom(msg.sender, wallet, applyCost);
		bytes32 domainHash = sha3(_domain);
		require(applicant[domainHash].challenged == false);
		require(applicant[domainHash].challengeTime > now);
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
		require(applicant[domainHash].challengeTime < now);
		require(applicant[domainHash].challenged == false);
		// prevents moving a domain to the registry without ever applying
		require(applicant[domainHash].owner != 0);
		add(_domain);
	}


	// function callVote(bytes32 _domainHash, uint _time) private returns (bool) {
	// 	// event that vote has started
	// 	// ??
	// }

	

}