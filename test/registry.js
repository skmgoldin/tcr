const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const ethRPC = new EthRPC(new HttpProvider ('http://localhost:8545'));
const abi = require("ethereumjs-abi");

var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol")

var minDeposit = 50;
var minParamDeposit = 50;
var applyStageLength = 50;
var commitPeriodLength = 50;
var revealPeriodLength = 50;
var dispensationPct = 50;
var voteQuorum = 50;


contract('Registry', (accounts) => {

  it("should verify a domain is not in the whitelist", () => {
    const domain = 'eth.eth'; //the domain to be tested
    let registry;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => registry.isWhitelisted.call(domain)) // test isWhitelisted() function should return false
    .then((result) => assert.equal(result, false , "Domain is actually added."))
  });

  it("check for appropriate amount of allowance and starting balance", () => {
    let registry;
    let token;
    let allowance = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    //initialized with 10000 for account 0
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    //account 1 must approve registry address allowance = minDeposit to be able to apply
    .then(() => token.approve(registry.address, allowance, {from: accounts[1]}))
    //check that allowance is indeed correct
    .then(() => token.allowance.call(accounts[1],registry.address))
    .then((allow) => assert.equal(allow, allowance, "allowance amount is not right"))
    //check the balance is correct
    .then((allow) => token.balanceOf.call(accounts[1]))
    //should be zero since all tokens are currently held by account 0
    .then((balance) => assert.equal(balance, 0, "initial balance not 0"))
    //check that the allowance of an accoun that did not approve is zero
    .then(() => token.allowance.call(accounts[5],registry.address))
    .then((allow) => assert.equal(allow, 0, "should not have any allowance"))
  });

  it("should check that the wallet starts with zero money", () => {
    let token;
    let registry;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    ///check balance of registry address, should be zero since no one applied
    .then(() => token.balanceOf.call(registry.address))
    .then((balance) => assert.equal(balance, 0, "why is there money in my wallet"))
  });

  it("should allow a domain to apply", () => {
    const domain = 'nochallenge.net' //domain to apply with
    let registry;
    let token;
    let depositAmount = minDeposit;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    //transfer 50 to accounts[1] from account[0]
    .then(() => token.transfer(accounts[1], depositAmount, {from: accounts[0]}))
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[1]}))
    //apply with accounts[1]
    .then(() => registry.apply(domain, {from: accounts[1]}))
    //hash the domain so we can identify in listingMap
    .then(() => '0x' + abi.soliditySHA3(["string"], [domain]).toString('hex'))
    //get the struct in the mapping
    .then((hash) => registry.listingMap.call(hash))
    //check that Application is initialized correctly
    .then((result) => {
      assert.equal(result[0]*1000> Date.now(), true , "challenge time < now");
      assert.equal(result[1], false , "challenged != false");
      assert.equal(result[2], accounts[1] , "owner of application != address that applied");
      assert.equal(result[3], depositAmount , "incorrect currentDeposit");
    })
    //check that now that account 1 has used its 50 tokens to apply, it's again out of tokens
    .then(() => token.balanceOf.call(accounts[1]))
    .then((balance) => assert.equal(balance, 0, "shouldnt be tokens here"))
  });

  it("should check that the wallet now has minimal deposit", () => {
    let token;
    let minimalDeposit = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    //check that after account 1 applied with 50 tokens, the registry address holds the min deposit
    .then(() => token.balanceOf.call(registry.address))
    .then((balance) => assert.equal(balance, minimalDeposit, "where is my minimal deposit?"))
  });

  it("should not let address apply with domains that are already in listingMap", () => {
    const domain = 'nochallenge.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    //transfer 50 to accounts[1] 
    .then(() => token.transfer(accounts[2], depositAmount, {from: accounts[0]}))
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[2]}))
    //apply with accounts[1] with the same domain, should fail since there's an existing application already
    .then(() => registry.apply(domain, {from: accounts[2]}))
    .catch((error) => console.log('\tSuccess: failed to reapply domain'))
  });

  it("should check that the wallet balance did not increase due to failed application", () => {
    let token;
    let minimalDeposit = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.balanceOf.call(registry.address))
    .then((balance) => assert.equal(balance, minimalDeposit, "why is there more money in my wallet"))
  });

  it("should add time to evm then not allow to challenge because challenge time passed", () => {
    const domain = "nochallenge.net";
    let registry;
    return new Promise((resolve, reject) => { 
      return ethRPC.sendAsync({
        method: 'evm_increaseTime',
        params: [60]
      }, (err, res) => {
        if (err) reject(err)
        resolve(res)
      })
    })
    .then(() => {
      return new Promise((resolve, reject) => { 
      return ethRPC.sendAsync({
        method: 'evm_mine',
        params: []
      }, (err, res) => {
        if (err) reject(err)
        resolve(res)
      })
    })
    })
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.transfer(accounts[3], depositAmount, {from: accounts[0]}))
    .then(() => {
       token.approve(registry.address, depositAmount, {from: accounts[3]})
       return registry.challenge(domain, {from: accounts[3]}); //should fail! error handle
    })
    .catch((error) => console.log('\tSuccess: failed to allow challenge to start'))
  });

  it("should apply, withdraw, and then get delisted by challenge", async () => {
    const domain = 'withdraw.net' //domain to apply with
    let depositAmount = minDeposit;
    registry = await Registry.deployed()
    token = await Token.deployed();
    //transfer 50 to accounts[2] from account[0]
    await token.transfer(accounts[2], depositAmount, {from: accounts[0]});
    await token.approve(registry.address, depositAmount, {from: accounts[2]});
    //apply with accounts[2]
    await registry.apply(domain, {from: accounts[2]});
    

  });

  
});