var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol");

module.exports = function(deployer) {
  deployer.deploy(Token,10000,'adtoken', "3", "ATK").then(function(){
  	return Token.deployed();
  }).then(function(token){
  	return deployer.deploy(Registry,token.address)
  });
};
// module.exports = function(deployer) {
//   deployer.deploy(Token);
//   deployer.deploy(Registry)
// };