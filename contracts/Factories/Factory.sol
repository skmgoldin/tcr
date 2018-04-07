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

    function createTokenAndPLCR(string _tokenName, string _tokenSymbol) public returns (EIP20, PLCRVoting) {
        EIP20 token = tokenFactory.create(_tokenName, _tokenSymbol, msg.sender);
        emit DeployedToken(token);

        PLCRVoting plcr = plcrFactory.create(token);
        emit DeployedPLCR(token);

        return (token, plcr);
    }

    function createParameterizerAndRegistry(address _token, address _plcr, string _tokenName) public returns (Parameterizer, Registry) {
        Parameterizer parameterizer = parameterizerFactory.create(_token, _plcr);
        emit DeployedParameterizer(parameterizer);

        Registry registry = registryFactory.create(_token, _plcr, parameterizer, _tokenName);
        emit DeployedRegistry(registry);

        return (parameterizer, registry);
    }

    event DeployedToken(address);
    event DeployedPLCR(address);
    event DeployedParameterizer(address);
    event DeployedRegistry(address);
}
