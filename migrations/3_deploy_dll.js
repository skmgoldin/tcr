/* global artifacts */

const DLL = artifacts.require('dll/DLL.sol');

module.exports = (deployer) => {
  deployer.deploy(DLL);
};
