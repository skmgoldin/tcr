contract Registry {
	
	struct Applicant {
		address owner;
		uint expirationBlock;
	}
	
	mapping(bytes32 => Applicant) public domainMap;

	//REPARAMETRIZABLE STATE VARIABLES
	uint public depositParam;
	uint public blockDuration;

	address private owner;

	modifier ownerOnly {
		require(msg.sender == owner);
		_;
	}

	function Registry(address _applicantPoolAddr, uint _depositParam, uint _blockDuration) {
		owner = _applicantPoolAddr; 
		depositParam = _depositParam;
		blockDuration = _blockDuration;
	}

	function isVerified(bytes32 _domain) returns (bool) {
		return !isExpired(domainMap[_domain].expirationBlock);
	}

	function isExpired(uint _blockNumber) private returns (bool) {
		return _blockNumber < block.number;
	}

	function verifyDomain(bytes32 _domain, address _applicantAddr) ownerOnly {
		domainMap[_domain] = Applicant(_applicantAddr, block.number + blockDuration);
	}
}