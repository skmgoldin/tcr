/* global artifacts */

const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer) => {
  return deployer.then(async () => {
    await deployer.deploy(DLL);
    await deployer.deploy(AttributeStore);
  }).catch((err) => { throw err })
};
