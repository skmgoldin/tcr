/* global artifacts */

const PLCRVotingRegistryFactory = artifacts.require('./PLCRVotingRegistryFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const ParameterizerFactory = artifacts.require('./ParameterizerFactory.sol');

module.exports = (deployer) => {
  // link libraries
  deployer.link(DLL, PLCRVotingRegistryFactory);
  deployer.link(AttributeStore, PLCRVotingRegistryFactory);

  return deployer.deploy(PLCRVotingRegistryFactory, ParameterizerFactory.address);
};
