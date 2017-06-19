var Registry = artifacts.require("./Registry.sol");

module.exports = function(deployer) {
  deployer.deploy(Registry);
};
