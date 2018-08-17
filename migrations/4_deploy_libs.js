/* global artifacts */

const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer) => {
  // deploy libraries
  deployer.deploy(DLL);
  return deployer.deploy(AttributeStore);
};
