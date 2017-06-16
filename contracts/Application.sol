pragma solidity 0.4.11
import "Parametrizer.sol";

contract Application {
	address owner;
	bytes32 domain;
	uint endBlock;
	bool challenged;

	//Parametrizer govt = Parametrizer(parameters_addr);

	modifier isChallenged {
		require(challenged);
		_;
	}

	modifier onlyOwner {
		require (owner == msg.sender);
		_;
	}

	function Application(bytes32 _domain) {
		owner = msg.sender;
		domain = _domain;
		challenged = false;
	}

	// function deposit() onlyOwner {
	// 	require(owner has deposited govt.depositParam tokens)
	// 	endBlock = block.number + govt.challengePeriod;
	// }

	function challenge() {
		//require(challenger has deposited govt.depositParam tokens)

		challenged = true;
	}

	function voteFor() isChallenged {
		//retrieve token balance of msg.sender for tally
		lockVoter();
	}

	function voteAgainst() isChallenged {
		//retrieve token balance of msg.sender for tally
		lockVoter();
	}

	function lockVoter() {
		//lock msg.sender's tokens according to colony's partial-lock voting procedure
	}
}