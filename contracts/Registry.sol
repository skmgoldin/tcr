pragma solidity 0.4.11;
import "./StandardToken.sol";

contract Registry {

	public address wallet;

	// this will later be the parameters from the parametrizer
	public uint expTime;
	public uint applyCost;
	public uint challengeTime;

	struct Publisher {
		address owner;
		uint time;
		uint2 status;  // is this publisher in the whitelist or applying or already challenged etc
	}

	// status description:
	// 0 = whitelisted, either expired or not based on time variable
	// 1 = new applicant waiting to be challenged
	// 2 = already been challenged
	// this can possibly just be a bool later
	
	mapping(bytes32 => Publisher) public domainMap;

	function Registry(address _token) {
		// set parameters somehow
		StandardToken token = StandardToken(_token);
	}

	function add(bytes32 _domainHash) private {
		domainMap[domainHash].time = now + expTime;
		domainMap[domainHash].status = 0;
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
		// if success
		domainMap[domainHash].status = 2;
		// if (callVote(domainHash, domainMap[domainHash].time) == true) {

		// }
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

	// 

}