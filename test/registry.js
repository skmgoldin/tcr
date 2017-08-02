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

  it("should allow a domain to apply", () => {
    const domain = 'nochallenge.net' //domain to apply with
    let registry;
    let token;
    let depositAmount = minDeposit;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
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
    
  });

  it("should not let address apply with domains that are already in listingMap", () => {
    const domain = 'nochallenge.net'
    let registry;
    let token;
    let initalAmt;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.balanceOf.call(registry.address))
    .then((result) => initalAmt = result)
    //apply with accounts[1] with the same domain, should fail since there's an existing application already
    .then(() => registry.apply(domain, {from: accounts[2]}))
    .catch((error) => console.log('\tSuccess: failed to reapply domain'))
    .then(() => token.balanceOf.call(registry.address))
    .then((balance) => assert.equal(balance.toString(), initalAmt.toString(), "why did my wallet balance change"))
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

  it("should update domain status to whitelisted because domain was not challenged", async () => {
    const domain = "nochallenge.net"
    registry = await Registry.deployed()
    token = await Token.deployed()
    await registry.updateStatus(domain)
    result = await registry.isWhitelisted(domain)
    assert.equal(result, true, "domain didn't get whitelisted")
  });

  it("should withdraw, and then get delisted by challenge", async () => {
    const domain = "nochallenge.net"
    const owner = accounts[1] //owner of nochallenge.net
    let depositAmount = minDeposit
    registry = await Registry.deployed();
    whitelisted = await registry.isWhitelisted.call(domain)
    assert.equal(result, true, "domain didn't get whitelisted")
    await registry.withdraw(domain, 20, {from:owner});
    //challenge with accounts[3]
    await registry.challenge(domain, {from: accounts[3]})
    whitelisted = await registry.isWhitelisted.call(domain)
    assert.equal(whitelisted, false, "domain is still whitelisted")
  });

  // it("should apply and get challenged", async () => {
  //   const domain = 'passChallenge.net' //domain to apply with
  //   let depositAmount = minDeposit;
  //   registry = await Registry.deployed();
  //   token = await Token.deployed();
  //   //apply with accounts[2]
  //   await registry.apply(domain, {from: accounts[2]});
  //   console.log(1)
  //   //challenge with accounts[3]
  //   await registry.challenge(domain, {from: accounts[3]})
  //   console.log(2)
  // });



  
});