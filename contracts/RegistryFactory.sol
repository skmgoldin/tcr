pragma solidity ^0.4.20;

import "tokens/eip20/EIP20.sol";
import "./ParameterizerFactory.sol";
import "./Registry.sol";
import "plcr-revival/PLCRVoting.sol";
import "./Parameterizer.sol";

contract RegistryFactory {

    event NewRegistry(address creator, EIP20 token, PLCRVoting plcr, Parameterizer parameterizer, Registry registry);

    ParameterizerFactory public parameterizerFactory;
    ProxyFactory public proxyFactory;
    Registry public canonizedRegistry;

    /// @dev constructor deploys a new proxyFactory.
    constructor(ParameterizerFactory _parameterizerFactory) public {
        parameterizerFactory = _parameterizerFactory;
        proxyFactory = parameterizerFactory.proxyFactory();
        canonizedRegistry = new Registry();
    }

    /*
    @dev deploys and initializes a new Registry contract that consumes a token at an address
        supplied by the user.
    @param _token           an EIP20 token to be consumed by the new Registry contract
    */
    function newRegistryBYOToken(
        EIP20 _token,
        uint[] _parameters,
        string _name
    ) public returns (Registry) {
        Parameterizer parameterizer = parameterizerFactory.newParameterizerBYOToken(_token, _parameters);
        PLCRVoting plcr = parameterizer.voting();

        Registry registry = Registry(proxyFactory.createProxy(canonizedRegistry, ""));
        registry.init(_token, plcr, parameterizer, _name);

        emit NewRegistry(msg.sender, _token, plcr, parameterizer, registry);
        return registry;
    }

    /*
    @dev deploys and initializes a new Registry contract, an EIP20, a PLCRVoting, and Parameterizer
        to be consumed by the Registry's initializer.
    @param _supply          the total number of tokens to mint in the EIP20 contract
    @param _name            the name of the new EIP20 token
    @param _decimals        the decimal precision to be used in rendering balances in the EIP20 token
    @param _symbol          the symbol of the new EIP20 token
    */
    function newRegistryWithToken(
        uint _supply,
        string _tokenName,
        uint8 _decimals,
        string _symbol,
        uint[] _parameters,
        string _registryName
    ) public returns (Registry) {
        // Creates a new EIP20 token & transfers the supply to creator (msg.sender)
        // Deploys & initializes (1) PLCRVoting contract & (2) Parameterizer contract
        Parameterizer parameterizer = parameterizerFactory.newParameterizerWithToken(_supply, _tokenName, _decimals, _symbol, _parameters);
        EIP20 token = EIP20(parameterizer.token());
        token.transfer(msg.sender, _supply);
        PLCRVoting plcr = parameterizer.voting();

        // Create & initialize a new Registry contract
        Registry registry = Registry(proxyFactory.createProxy(canonizedRegistry, ""));
        registry.init(token, plcr, parameterizer, _registryName);

        emit NewRegistry(msg.sender, token, plcr, parameterizer, registry);
        return registry;
    }
}

