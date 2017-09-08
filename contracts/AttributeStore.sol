pragma solidity^0.4.11;

library AttributeStore {
    struct Data {
        mapping(bytes32 => uint) store;
    }

    function getAttribute(Data storage self, bytes32 UUID, string attrName) returns (uint) {
        bytes32 key = sha3(UUID, attrName);
        return self.store[key];
    }

    function attachAttribute(Data storage self, bytes32 UUID, string attrName, uint attrVal) {
        bytes32 key = sha3(UUID, attrName);
        self.store[key] = attrVal;
    }
}
