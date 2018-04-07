const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

const TokenFactory = artifacts.require('./Factories/TokenFactory.sol');
const PLCRFactory = artifacts.require('./Factories/PLCRFactory.sol');
const ParameterizerFactory = artifacts.require('./Factories/ParameterizerFactory.sol');
const RegistryFactory = artifacts.require('./Factories/RegistryFactory.sol');

module.exports = (deployer) => {
  deployer.link(DLL, PLCRFactory);
  deployer.link(AttributeStore, PLCRFactory);

  deployer.deploy(TokenFactory);
  deployer.deploy(PLCRFactory);
  deployer.deploy(ParameterizerFactory);
  deployer.deploy(RegistryFactory);
};

