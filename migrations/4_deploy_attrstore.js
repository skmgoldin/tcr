/* global artifacts */

const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

module.exports = (deployer) => {
  deployer.deploy(AttributeStore);
};
