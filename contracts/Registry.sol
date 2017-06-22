pragma solidity 0.4.11;
import "./StandardToken.sol";

// to do:
// implement events
// update domain name functionality (?)
// save challenger based on output from voting system
// distribute tokens based on output from voting system
// add to whitelist based on output from voting system
// what happens if you fail and wanna go again
// check on delete in solidity
// keep deposit if never challenged
// move losers out of appPool


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
		uint deposit;
		uint challengeTime;
		bool challenged;
		address challenger;
	}

	mapping(bytes32 => Publisher) public whitelist;
	mapping(bytes32 => Application) public appPool;
	mapping(uint => bool) public voteProcessed;
	mapping(address => mapping(uint => bool)) public voterInfo;

	function Registry(address _token, address _wallet) {
		token = StandardToken(_token);
		wallet = _wallet;
		// wallet =
		// placeholder values
		expDuration = 2000;
		applyCost = 50;
		challengeDuration = 200;
		distributionScale = 0;
	}

	function add(string _domain)  {
		bytes32 domainHash = sha3(_domain);
		whitelist[domainHash].expTime = now + expDuration;
		whitelist[domainHash].owner = appPool[domainHash].owner;
	}

	function toHash(string _domain) returns (bytes32){
		return sha3(_domain);
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
		appPool[domainHash].challengeTime = now + challengeDuration;
		appPool[domainHash].owner = msg.sender;	
		appPool[domainHash].deposit = applyCost;	
		// trigger an event
	}

	function challenge(string _domain) {
		require(token.allowance(msg.sender, this) >= applyCost);
		token.transferFrom(msg.sender, wallet, applyCost);
		bytes32 domainHash = sha3(_domain);
		require(appPool[domainHash].owner != 0);
		require(appPool[domainHash].challenged == false);
		require(appPool[domainHash].challengeTime > now);
		appPool[domainHash].challenged = true;
		appPool[domainHash].challenger = msg.sender;
		//callVote()
	}

	function moveToRegistry(string _domain) {
		bytes32 domainHash = sha3(_domain);
		require(appPool[domainHash].challengeTime < now);
		require(appPool[domainHash].challenged == false);
		// prevents moving a domain to the registry without ever applying
		require(appPool[domainHash].owner != 0);
		// prevent applicant from moving to registry multiple times
		appPool[domainHash].owner = 0;
		add(_domain);
	}

	//didProposalPass(id);
	//need to access domain
	// function claimReward(uint _pollID) {
	// 	require(voterInfo[msg.sender][_pollID] == false);
	// 	if (voteProcessed[_pollID] == false) {
	// 		// if applicant won move to registry
	// 		// distribute to challenger here (?) if lost
	// 		voteProcessed[_pollID] == true;
	// 	}
	// 		// if winning vote transfer tokens based on distribution scale, else do nothing
	// 		voterInfo[msg.sender][_pollID] == true;
	// }

	// function callVote(bytes32 _domainHash) private returns (bool) {
	// 	// event that vote has started
	// 	// ??
	// }

	

}