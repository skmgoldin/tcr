pragma solidity^0.4.21;

import "./TokenFactory.sol";
import "./PLCRFactory.sol";
import "./ParameterizerFactory.sol";
import "./RegistryFactory.sol";

contract Factory {

    TokenFactory tokenFactory;
    PLCRFactory plcrFactory;
    ParameterizerFactory parameterizerFactory;
    RegistryFactory registryFactory;

    function Factory(
        TokenFactory _tokenFactory,
        PLCRFactory _plcrFactory,
        ParameterizerFactory _parameterizerFactory,
        RegistryFactory _registryFactory
    ) public {
        tokenFactory = _tokenFactory;
        plcrFactory = _plcrFactory;
        parameterizerFactory = _parameterizerFactory;
        registryFactory = _registryFactory;
    }

    function create(string _tokenName, string _tokenSymbol) public returns (Parameterizer, Registry) {
        var token = tokenFactory.create(_tokenName, _tokenSymbol, msg.sender);
        var plcr = plcrFactory.create(token);
        var parameterizer = parameterizerFactory.create(token, plcr);
        var registry = registryFactory.create(token, plcr, parameterizer, _tokenName);
        return (parameterizer, registry);
    }
}
