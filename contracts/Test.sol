pragma solidity ^0.4.11;

// This contract contains functions used for testing the Registry contract 
contract Test {

    /* 
     * Constructor
     */
    function Test() {}

    /* 
     * Testing functions
     */
    function toHash(string _domain) returns (bytes32){
        return sha3(_domain);
    }
    function toParameterHash(string _parameter, uint _value) returns (bytes32){
        return sha3(_parameter, _value);
    }
    function getCurrentTime() returns (uint){
        return now;
    }

}
