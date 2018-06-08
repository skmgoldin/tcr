/* global artifacts */

const RegistryFactory = artifacts.require('./RegistryFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const ParameterizerFactory = artifacts.require('./ParameterizerFactory.sol');

module.exports = (deployer) => {
  // link libraries
  deployer.link(DLL, RegistryFactory);
  deployer.link(AttributeStore, RegistryFactory);

  return deployer.deploy(RegistryFactory, ParameterizerFactory.address);
};
