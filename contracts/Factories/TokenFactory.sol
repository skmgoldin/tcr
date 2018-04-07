pragma solidity^0.4.21;

import "tokens/eip20/EIP20.sol";

contract TokenFactory {
    function create(string _name, string _symbol, address _recipient) public returns (EIP20) {
        uint supply = 1000;
        uint8 decimals = 18;

        EIP20 token = new EIP20(supply, _name, decimals, _symbol);
        token.transfer(_recipient, supply);

        return token;
    }
}
