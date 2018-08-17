/* global artifacts */

const ParameterizerFactory = artifacts.require('./ParameterizerFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRFactory = artifacts.require('plcr-revival/PLCRFactory.sol');

module.exports = (deployer, network) => {
  // link libraries
  deployer.link(DLL, ParameterizerFactory);
  deployer.link(AttributeStore, ParameterizerFactory);

  if (network === 'mainnet') {
    return deployer.deploy(ParameterizerFactory, '0xdf9c10e2e9bb8968b908261d38860b1a038cc2ef');
  }

  return deployer.deploy(ParameterizerFactory, PLCRFactory.address);
};
