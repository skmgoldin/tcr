pragma solidity ^0.4.20;

import "tokens/eip20/EIP20.sol";
import "./PLCRVoting.sol";
import "./ProxyFactory.sol";

contract PLCRFactory {

    event NewPLCR(address creator, EIP20 token, address plcr);

    ProxyFactory proxyFactory;
    PLCRVoting canonizedPLCR;

    /// @dev constructor deploys a new canonical PLCRVoting contract and a proxyFactory.
    constructor() public {
        canonizedPLCR = new PLCRVoting();
        proxyFactory = new ProxyFactory();
    }

    /*
    @dev deploys and initializes a new PLCRVoting contract that consumes a token at an address
    supplied by the user.
    @param _token an EIP20 token to be consumed by the new PLCR contract
    */
    function newPLCRBYOToken(EIP20 _token) public returns (PLCRVoting) {
        EIP20 token = _token;
        PLCRVoting plcr = PLCRVoting(proxyFactory.createProxy(canonizedPLCR, ""));

        plcr.init(token);
        emit NewPLCR(msg.sender, token, plcr);
        return plcr;
    }
    
    /*
    @dev deploys and initializes a new PLCRVoting contract and an EIP20 to be consumed by the PLCR's
    initializer.
    @param _supply the total number of tokens to mint in the EIP20 contract
    @param _name the name of the new EIP20 token
    @param _decimals the decimal precision to be used in rendering balances in the EIP20 token
    @param _symbol the symbol of the new EIP20 token
    */
    function newPLCRWithToken(
        uint _supply,
        string _name,
        uint8 _decimals,
        string _symbol
    ) public returns (PLCRVoting) {
        EIP20 token = new EIP20(_supply, _name, _decimals, _symbol);
        PLCRVoting plcr = PLCRVoting(proxyFactory.createProxy(canonizedPLCR, ""));

        plcr.init(token);
        // Give all the tokens to the PLCR creator
        token.transfer(msg.sender, _supply);
        emit NewPLCR(msg.sender, token, plcr);
        return plcr;
    }
}

