/* global artifacts */

const ParameterizerFactory = artifacts.require('./ParameterizerFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer) => {
  // link libraries
  deployer.link(DLL, ParameterizerFactory);
  deployer.link(AttributeStore, ParameterizerFactory);

  deployer.deploy(ParameterizerFactory);
};
