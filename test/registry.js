const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const ethRPC = new EthRPC(new HttpProvider ('http://localhost:8545'));
var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol")

var minDeposit = 50;
var minParamDeposit = 50;
var challengeLen = 100;
var registryLen = 100;
var commitVoteLen = 100;
var revealVoteLen = 100;
var dispensationPct = 50;
var majority = 50;


contract('Registry', (accounts) => {
  
  it ("should get a current parameter value", () => {
    let registry;
    return Registry.deployed()// get the instance of the deployed registry ,deployed in 2_deploy_contracts.js
    .then((_registry) => registry = _registry) //store it as variable
    .then(() => registry.get.call("dispensationPct")) //test get parameter function should return 50
    .then((value) => assert.equal(value,50, "value not right") ) //see if the returned value is right
  });

  it("should verify a domain is not in the whitelist", () => {
    const domain = 'eth.eth'; //the domain to be tested
    let registry;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => registry.isInRegistry.call(domain)) // test isInRegistry function should return false
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
    const domain = 'consensys.net' //domain to apply with
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    //transfer 50 to accounts[1] form account 0
    .then(() => token.transfer(accounts[1], depositAmount, {from: accounts[0]}))
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[1]}))
    //apply with accounts[1]
    .then(() => registry.apply(domain, {from: accounts[1]}))
    //hash the domain so we can identify in appPool
    .then(() => registry.toHash.call(domain))
    //get the struct in the mapping
    .then((hash) => registry.appPool.call(hash))
    //check that Application is initialized correctly
    .then((result) => {
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      assert.equal(result[1], false , "challenged != false");
      assert.equal(result[2]*1000> Date.now(), true , "challenge time < now");
      assert.equal(result[3]==0x0000000000000000000000000000000000000000, true , "challenger = zero address");
      assert.equal(result[4]=='consensys.net', true , "domain is not right");
    })
    .then(() => registry.toHash.call(domain))
    .then((hash) => registry.paramSnapshots.call(hash))
    //check that paramSnapshots is initialized correctly
    .then((result) => {
      assert.equal(result[0], depositAmount ,"deposit amount not right");
      assert.equal(result[2], 100 , "challenge length wrong");
    })
    //check that now that account 1 has used its 50 tokens to apply, it's again out of tokens
    .then(() => token.balanceOf.call(accounts[1]))
    .then((balance) => assert.equal(balance, 0, "shouldnt be tokens here"))
  });

  it("should check that we can't move to registry because challenge time not up", () => {
    let registry;
    const domain = 'consensys.net'
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => registry.moveToRegistry(domain))
    .catch((error) => console.log('\tSuccess: failed to move to registry'))
  })

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

  it("should not let address to apply with domains that are already in appPool", () => {
    const domain = 'consensys.net'
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
    .catch((error) => console.log('Success: failed to reapply domin'))
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
  
  it("should allow a address to challenge", () => {
    const domain = 'consensys.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.transfer(accounts[2], depositAmount, {from: accounts[0]}))
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[2]}))
    //challenge the current application of "consensys.net" with account 2
    .then(() => registry.challengeApplication(domain, {from: accounts[2]}))
    .then(() => registry.toHash.call(domain))
    .then((hash) => registry.appPool.call(hash))
    .then((result) =>
    {
      //check the applicaiton struct is updated accordingly now that account 2 has challenged
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      assert.equal(result[1], true , "challenged != true");
      assert.equal(result[3]==accounts[2], true , "challenger != challenger");
    })
    //check that account 2 has spent the tokens
    .then((allow) => token.balanceOf.call(accounts[2]))
    .then((balance) => assert.equal(balance, 50, "balance not equal to the 50 from before"))
  });

  it("should check that the wallet now has 2x minimal deposit", () => {
    let token;
    let minimalDeposit = 50*2;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.balanceOf.call(registry.address))
    .then((balance) => assert.equal(balance, minimalDeposit, "why is there money in my wallet"))
  });

  it("should not let people challenge an already challenged domain", () => {
    const domain = 'consensys.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[3]}))
    .then(() => registry.challengeApplication(domain, {from: accounts[3]})) //should fail! error handle
    .catch((error) => console.log('\tSuccess: failed to rechallenge'))
  });

  it("should check that the wallet balance did not increase due to failed challenge", () => {
    let token;
    let minimalDeposit = 50*2;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.balanceOf.call(registry.address))
    .then((balance) => assert.equal(balance, minimalDeposit, "why is there more money in my wallet"))
  });

  it("should check that we can't challenge domain not in appPool", function(){
    const domain = 'empty.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[3]}))
    .then(() => registry.challengeApplication(domain, {from: accounts[3]}))
    .catch((error) => console.log('failed'))
  });

  it("should processResult then see that it's on the whitelist", () => {
    let registry;
    const domain = "consensys.net"
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    //process the result of the vote. 1 equals the pollID since it's the first poll
    //should return true 
    .then(() => registry.processResult(1))
    //check that it's been automatically moved to the registry
    .then(() => registry.isInRegistry.call(domain))
    .then((result) => assert.equal(result, true , "Domain is not added."))
    //check that account 1 has recieved a % of account 2's deposit
    .then((allow) => token.balanceOf.call(accounts[1]))
    .then((balance) => assert.equal(balance, 25, "balance not zero"))
    .then(() => registry.toHash.call(domain))
    .then((hash) => registry.whitelist.call(hash))
    //check that in the publisher struct, the deposit amount is correct
    .then((publisher) => assert.equal(publisher[2],50, "deposit not right"))
    .then((hash)=> registry.appPool.call(hash)) 
    .then((result) => assert.equal(result[0], 0x0000000000000000000000000000000000000000 , "owner of application != address that applied"))
  });

  it("should apply with another domain", () => {
    const domain = 'nochallenge.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.transfer(accounts[1], depositAmount, {from: accounts[0]}))
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[1]}))
    .then(() => registry.apply(domain, {from: accounts[1]}))
  });

  it("should add time to evm then not allow to challenge because challenge time passed", () => {
    const domain = "nochallenge.net";
    let registry;
    return new Promise((resolve, reject) => { 
      return ethRPC.sendAsync({
        method: 'evm_increaseTime',
        params: [40000]
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
       return registry.challengeApplication(domain, {from: accounts[3]}); //should fail! error handle
    })
    .catch((error) => console.log('Success: failed to allow challenge to start'))
  });

  it("should move to registry now challenge time is over", () => {
    const domain = "nochallenge.net";
    let registry;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => registry.moveToRegistry(domain))
    .then((result) => registry.isInRegistry.call(domain))
    .then((result) => assert.equal(result, true , "it's not in the registry."))
    //has the domain so we can identify in appPool
    .then(() => registry.toHash.call(domain))
    .then((hash) => registry.appPool.call(hash))
    .then((result) => assert.equal(result[0], 0x0000000000000000000000000000000000000000 , 
      "owner of application != address that applied"))
  });

// it ("should add more time to evm until expire off the whitelist")

  it("should propose a parameter change", () => {
    const parameter = "registryLen" 
    const value = 50
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.transfer(accounts[1], depositAmount, {from: accounts[0]}))
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[1]}))
    .then(() => registry.proposeUpdate(parameter, value, {from: accounts[1]}))
    .then(() => registry.toParameterHash.call(parameter, value))
    .then((ParameterHash) => registry.appPool.call(ParameterHash))
    .then((result) => {
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      assert.equal(result[1], false , "challenged != false");
      assert.equal(result[2]*1000> Date.now(), true , "challenge time < now");
      assert.equal(result[3]==0x0000000000000000000000000000000000000000, true , "challenger = zero address");
      assert.equal(result[5]=='registryLen', true , "parameter is not right");
      assert.equal(result[6], 50 , "value is not right");
    })
    .then(() => registry.toParameterHash.call(parameter, value))
    .then((ParameterHash) => registry.paramSnapshots.call(ParameterHash))
    .then((result)  => {
      assert.equal(result[0], depositAmount ,"deposit amount not right");
      assert.equal(result[2], 100 , "challenge length wrong")
    })
    .then(() => token.balanceOf.call(accounts[1]))
    .then((balance) => assert.equal(balance, 25, "shouldnt be tokens here other than the 25 won from before"))
  });

  it("challenge a proposal", () => {
    const parameter = "registryLen" 
    const value = 50
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
    .then(() => token.transfer(accounts[3], depositAmount, {from: accounts[0]}))
    .then(() => token.approve(registry.address, depositAmount, {from: accounts[3]}))
    .then(() => registry.challengeProposal(parameter, value, {from: accounts[3]}))
    .then(() => registry.toParameterHash.call(parameter, value))
    .then((hash) => registry.appPool.call(hash))
    .then((result)  => {
      //right now just check if owner = applier
      // check if owner = applier
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      //assert.equal(result[2]> Date.now(), true , "challenge time < now");
      assert.equal(result[1], true , "challenged != true");
      assert.equal(result[3]==accounts[3], true , "challenger != challenger");
    });
  });

  it("should processResult then see that the value has not changed because the proposal lost", () => {
    let registry;
    let token;
    const parameter = "registryLen"
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => Token.deployed())
    .then((_token) => token = _token)
     .then(() => registry.processProposal(2))
    .then(() => registry.get.call(parameter))
    .then((result) => assert.equal(result, 100 , "value is changed."))
    .then((allow) => token.balanceOf.call(accounts[3]))
    .then((balance) => assert.equal(balance, 75, "balance not right"))
  });

//propose another proposal, let time pass, try setParameter
//propose another proposal, challenge, win, and process proposal

//claim extra reward,claim reward
  it("should let account 9 claim reward", () => {
    let originalBalance;
    let registry;
    return Registry.deployed()
    .then((_registry) => registry = _registry)
    .then(() => registry.claimReward(1,0, {from: accounts[9]}))
    .then(() => token.balanceOf.call(accounts[9]))
    .then((balance) => assert.equal(balance, 1, "balance not right 1"))
    .then(() => token.balanceOf.call(accounts[1]))
    .then((balance) => originalBalance = balance)
    .then(() => registry.claimExtraReward(1, {from: accounts[8]}))
    .then(() => token.balanceOf.call(accounts[1]))
    .then((balance) => assert.equal(balance, 25, "balance not right 2"))
    .then(() => registry.claimReward(1,0, {from: accounts[7]}))
    .then(() => registry.claimReward(1,0, {from: accounts[6]}))
    .then(() => registry.claimReward(1,0, {from: accounts[5]}))
    .then(() => registry.claimExtraReward(1, {from: accounts[8]}))
    .then(() => token.balanceOf.call(accounts[1]))
    .then((balance) => assert.equal(balance, 26, "balance not right 4"))
  });

});
