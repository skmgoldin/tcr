var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol");

module.exports = function(deployer) {
  deployer.deploy(Registry);
  deployer.deploy(Token);
};
