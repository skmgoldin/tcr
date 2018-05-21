/* global artifacts */

const RegistryFactory = artifacts.require('./RegistryFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer) => {
  // link libraries
  deployer.link(DLL, RegistryFactory);
  deployer.link(AttributeStore, RegistryFactory);

  deployer.deploy(RegistryFactory);
};
