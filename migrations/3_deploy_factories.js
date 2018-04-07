const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

const TokenFactory = artifacts.require('./Factories/TokenFactory.sol');
const PLCRFactory = artifacts.require('./Factories/PLCRFactory.sol');
const ParameterizerFactory = artifacts.require('./Factories/ParameterizerFactory.sol');
const RegistryFactory = artifacts.require('./Factories/RegistryFactory.sol');

const Factory = artifacts.require('./Factories/Factory.sol')

module.exports = async (deployer) => {
  deployer.link(DLL, PLCRFactory);
  deployer.link(AttributeStore, PLCRFactory);

  deployer.deploy(TokenFactory);
  deployer.deploy(PLCRFactory);
  deployer.deploy(ParameterizerFactory);
  deployer.deploy(RegistryFactory);

  deployer.deploy(
    Factory,
    TokenFactory.address,
    PLCRFactory.address,
    ParameterizerFactory.address,
    RegistryFactory.address,
  );
};

