var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol");
var Voting = artifacts.require("./PLCRVoting.sol");
module.exports = function(deployer) {
  deployer.deploy(Token,100000,'adtoken', "3", "ATK").then(function(){
  	return Token.deployed();
  }).then(function(_token){
  	token = _token;
  })
  .then(function(){
  	return deployer.deploy(Voting,0);
  })
  .then(function(){
  	return Voting.deployed();
  })
  .then(function(voting){
   return deployer.deploy(Registry, token.address,voting.address, 50,50,100,100,100,100,50,50)
  });
};
// module.exports = function(deployer) {
//   deployer.deploy(Token);
//   deployer.deploy(Registry)
// };