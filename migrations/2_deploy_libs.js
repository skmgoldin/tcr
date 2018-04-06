/* global artifacts */

const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer) => {
  deployer.deploy(DLL);
  deployer.deploy(AttributeStore);
};
