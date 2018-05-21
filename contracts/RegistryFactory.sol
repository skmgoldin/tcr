pragma solidity ^0.4.20;

import "tokens/eip20/EIP20.sol";
import "./ProxyFactory.sol";
import "./Registry.sol";

contract RegistryFactory {

    event NewRegistry(address creator, EIP20 token, address plcr, address parameterizer, address registry);

    ProxyFactory proxyFactory;
    Registry canonizedRegistry;

    /// @dev constructor deploys a new canonical Registry contract and a proxyFactory.
    constructor() public {
        canonizedRegistry = new Registry();
        proxyFactory = new ProxyFactory();
    }

    /*
    @dev deploys and initializes a new Registry contract that consumes a token at an address
    supplied by the user.
    @param _token an EIP20 token to be consumed by the new Registry contract
    */
    function newRegistryBYOTokenAndFriends(
        EIP20 _token,
        address _plcr,
        address _parameterizer,
        string _name
    ) public returns (Registry) {
        Registry registry = Registry(proxyFactory.createProxy(canonizedRegistry, ""));

        registry.init(_token, _plcr, _parameterizer, _name);
        emit NewRegistry(msg.sender, _token, _plcr, _parameterizer, registry);
        return registry;
    }
    
    /*
    @dev deploys and initializes a new Registry contract, an EIP20, a PLCRVoting, and Parameterizer
      to be consumed by the Registry's initializer.
    @param _supply the total number of tokens to mint in the EIP20 contract
    @param _name the name of the new EIP20 token
    @param _decimals the decimal precision to be used in rendering balances in the EIP20 token
    @param _symbol the symbol of the new EIP20 token
    */
    function newRegistryWithToken(
        uint _supply,
        string _tokenName,
        uint8 _decimals,
        string _symbol,
        address _plcr,
        address _parameterizer,
        string _registryName
    ) public returns (Registry) {
        EIP20 token = new EIP20(_supply, _tokenName, _decimals, _symbol);
        Registry registry = Registry(proxyFactory.createProxy(canonizedRegistry, ""));

        registry.init(token, _plcr, _parameterizer, _registryName);
        // Give all the tokens to the Registry creator
        token.transfer(msg.sender, _supply);
        emit NewRegistry(msg.sender, token, _plcr, _parameterizer, registry);
        return registry;
    }
}

