/* global artifacts */

const PLCRFactory = artifacts.require('plcr-revival/PLCRFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer) => {
  // deploy libraries
  deployer.deploy(DLL);
  deployer.deploy(AttributeStore);

  // link libraries
  deployer.link(DLL, PLCRFactory);
  deployer.link(AttributeStore, PLCRFactory);

  deployer.deploy(PLCRFactory);
};
