var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol");

module.exports = function(deployer) {
  deployer.deploy(Token,100000,'adtoken', "3", "ATK").then(function(){
  	return Token.deployed();
  }).then(function(token){
  	return deployer.deploy(Registry, token.address, 50,100,100,100,100,0.5,0.5)
  });
};
// module.exports = function(deployer) {
//   deployer.deploy(Token);
//   deployer.deploy(Registry)
// };