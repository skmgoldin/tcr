pragma solidity ^0.4.20;

import "./Parameterizer.sol";
import "./ProxyFactory.sol";

contract ParameterizerFactory {

    event NewParameterizer(address creator, address token, address plcr, address parameterizer);

    ProxyFactory proxyFactory;
    Parameterizer canonizedParameterizer;

    /// @dev constructor deploys a new canonical Parameterizer contract and a proxyFactory.
    constructor() public {
        canonizedParameterizer = new Parameterizer();
        proxyFactory = new ProxyFactory();
    }

  /*
  @dev deploys and initializes a new Parameterizer contract that consumes a token at an address
  supplied by the user.
  @param _token             an EIP20 token to be consumed by the new Parameterizer contract
  @param _plcr              a PLCR voting contract to be consumed by the new Parameterizer contract
  @param _parameters        array of canonical parameters
  */
    function newParameterizerBYOTokenAndPLCR(
        address _token,
        address _plcr,
        uint[] _parameters
    ) public returns (Parameterizer) {
        Parameterizer parameterizer = Parameterizer(proxyFactory.createProxy(canonizedParameterizer, ""));

        parameterizer.init(
          _token,
          _plcr,
          _parameters
        );
        emit NewParameterizer(msg.sender, _token, _plcr, parameterizer);
        return parameterizer;
    }
}

