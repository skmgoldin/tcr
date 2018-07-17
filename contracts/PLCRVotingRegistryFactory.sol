pragma solidity ^0.4.20;

import "./RegistryFactory.sol";
import "./ParameterizerFactory.sol";
import "./PLCRVotingRegistry.sol";

contract PLCRVotingRegistryFactory is RegistryFactory {

    /// @dev constructor deploys a new proxyFactory.
    constructor(ParameterizerFactory _parameterizerFactory) RegistryFactory(_parameterizerFactory) public {
        canonizedRegistry = new PLCRVotingRegistry();
    }

}
