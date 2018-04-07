pragma solidity^0.4.21;

import "plcrvoting/PLCRVoting.sol";

contract PLCRFactory {
    function create(address _token) public returns (PLCRVoting) {
        return new PLCRVoting(_token);
    }
}
