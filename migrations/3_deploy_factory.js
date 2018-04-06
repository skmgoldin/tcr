/* global artifacts */

const Factory = artifacts.require('./Factory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = deployer => {
    deployer.link(DLL, Factory);
    deployer.link(AttributeStore, Factory);
    deployer.deploy(Factory);
}

