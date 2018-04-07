pragma solidity^0.4.21;

import "../Registry.sol";

contract RegistryFactory {
    function create(address _token, address _plcr, address _parameterizer, string _tokenName) public returns (Registry) {
        Registry registry = new Registry(_token, _plcr, _parameterizer, _tokenName);
        return registry;
    }
}
