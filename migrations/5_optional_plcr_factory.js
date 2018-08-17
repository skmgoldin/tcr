/* global artifacts */

const PLCRFactory = artifacts.require('plcr-revival/PLCRFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer, network) => {
  // link libraries
  deployer.link(DLL, PLCRFactory);
  deployer.link(AttributeStore, PLCRFactory);

  if (network === 'mainnet') {
    return deployer;
  }

  return deployer.deploy(PLCRFactory);
};
