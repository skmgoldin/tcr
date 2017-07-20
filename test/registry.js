 const HttpProvider = require('ethjs-provider-http');
 const EthRPC = require('ethjs-rpc');
 const ethRPC = new EthRPC(new HttpProvider ('http://localhost:8545'));
var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol")



contract('Registry', function(accounts) {
  
  
  it("should verify a domain is not in the whitelist", function() {
    const domain = 'eth.eth';
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
    })
    .then(function(){
      return registry.isVerified.call(domain);
    })
    .then(function(result) {
      assert.equal(result, false , "Domain is actually added.");
    });
  });


  it("check for appropriate amount of allowance and starting balance", function() {
    let registry;
    let token;
    let allowance = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000-
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       token.approve(registry.address, allowance, {from: accounts[1]})
    })
    .then(function(){
      return token.allowance.call(accounts[1],registry.address);
    })
    .then(function(allow){
      assert.equal(allow, allowance, "allowance amount is not right");
    })
    .then(function(allow){
      return token.balanceOf.call(accounts[1]);
    })
    .then(function(balance){
      assert.equal(balance, 0, "initial balance not 0");
    })
    .then(function(){
      return token.allowance.call(accounts[5],registry.address);
    })
    .then(function(allow){
      assert.equal(allow, 0, "should not have any allowance");
     })
 });

  it("should check that the wallet starts with zero money", function(){
    let token;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
    .then(function(_token){
      token = _token
      return token.balanceOf.call(registry.address);
    })
    .then(function(balance){
      assert.equal(balance, 0, "why is there money in my wallet");
     })
 });


  it("should allow a domain to apply", function() {
    const domain = 'consensys.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       //transfer 5000 to accounts[1], return true if transfer success
       return token.transfer(accounts[1], depositAmount, {from: accounts[0]});
     })
    .then(function(boo){
       return  token.approve(registry.address, depositAmount, {from: accounts[1]})
     })
    .then(function(boo){
      //apply with accounts[1]
      return registry.apply(domain, {from: accounts[1]});
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toHash.call(domain);
    })
    .then(function(hash){
      //get the struct in the mapping
      return registry.appPool.call(hash);
    })
    .then(function(result) {
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      assert.equal(result[1], false , "challenged != false");
      assert.equal(result[2]*1000> Date.now(), true , "challenge time < now");
      assert.equal(result[3]==0x0000000000000000000000000000000000000000, true , "challenger = zero address");
      assert.equal(result[4]=='consensys.net', true , "domain is not right");
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toHash.call(domain);
    })
    .then(function(hash){
      //get the struct in the mapping
      return registry.paramSnapshots.call(hash);
    })
    .then(function(result) {
      assert.equal(result[0], depositAmount ,"deposit amount not right");
      assert.equal(result[1], 100 , "challenge lenth wrong");
    })
    .then(function(){
      return token.balanceOf.call(accounts[1]);

    })
    .then(function(balance){
      assert.equal(balance, 0, "shouldnt be tokens here");
    })
    .then(function(allow){
      return token.balanceOf.call(accounts[1]);
    })
    .then(function(balance){
      assert.equal(balance, 0, "balance not zero");
    });

  });

  it("should check that we can't move to registry because challenge time not up", function(){
    //check that owner is again 0
      let registry;
      console.log("shoud have failed");
      const domain = 'consensys.net'
      return Registry.deployed()
      .then(function(_registry) {
      registry = _registry;  
    })
      .then(function(){
        return registry.moveToRegistry(domain);
      })
       .catch(function(error) {
      console.log('failed');
    });
  })//add error handle

  it("should check that the wallet now has minimal deposit", function(){
    let token;
    let minimalDeposit = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
    .then(function(_token){
      token = _token
      return token.balanceOf.call(registry.address);
    })
    .then(function(balance){
      assert.equal(balance, minimalDeposit, "why is there money in my wallet");
     })
 });

  it("should not let address to apply with domains that are already in appPool", function(){
    const domain = 'consensys.net'
    console.log("shoud have failed");
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       //transfer 5000 to accounts[1], return true if transfer success
       return token.transfer(accounts[2], depositAmount, {from: accounts[0]});
     })
     .then(function(boo){
        return token.approve(registry.address, depositAmount, {from: accounts[2]})
     })
    .then(function(){
      //apply with accounts[1]
      return registry.apply(domain, {from: accounts[2]});
    }) 
    .catch(function(error) {
      console.log('failed');
    });
  });//should fail


  it("should check that the wallet balance did not increase due to failed application", function(){
    let token;
    let minimalDeposit = 50;
    ;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
    .then(function(_token){
      token = _token
      return token.balanceOf.call(registry.address);
    })
    .then(function(balance){
      assert.equal(balance, minimalDeposit, "why is there money in my wallet");
     });
  });
  


  it("should allow a address to challenge", function() {
    const domain = 'consensys.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
     })
    .then(function(boo){
       return token.transfer(accounts[2], depositAmount, {from: accounts[0]});
     })
     .then(function(boo){
       return token.approve(registry.address, depositAmount, {from: accounts[2]})
     })
    .then(function(){
      //challenge
      return registry.challengeApplication(domain, {from: accounts[2]});
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toHash.call(domain);
    })
    .then(function(hash){
      //get the struct in the mapping
      return registry.appPool.call(hash);
    })
    .then(function(result) {
      //right now just check if owner = applier
      // check if owner = applier
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      //assert.equal(result[2]> Date.now(), true , "challenge time < now");
      assert.equal(result[1], true , "challenged != true");
      assert.equal(result[3]==accounts[2], true , "challenger != challenger");

    })
    .then(function(allow){
      return token.balanceOf.call(accounts[2]);
    })
    .then(function(balance){
      assert.equal(balance, 50, "balance not equal to the 50 from before");
    });

  });




  it("should check that the wallet now has 2x minimal deposit", function(){
    let token;
    let minimalDeposit = 50*2;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
    .then(function(_token){
      token = _token
      return token.balanceOf.call(registry.address);
    })
    .then(function(balance){
      assert.equal(balance, minimalDeposit, "why is there money in my wallet");
     })
  });


  it("challenge an already challenged domain", function() {
    const domain = 'consensys.net'
    console.log("shoud have failed");
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000-
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       return token.approve(registry.address, depositAmount, {from: accounts[3]})
    })
    .then(function(){
       return registry.challengeApplication(domain, {from: accounts[3]}); //should fail! error handle
    })
    .catch(function(error) {
      console.log('failed');
    });
  });//should fail



  it("should check that the wallet balance did not increase due to failed challenge", function(){
    let token;
    let minimalDeposit = 50*2;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
    .then(function(_token){
      token = _token
      return token.balanceOf.call(registry.address);
    })
    .then(function(balance){
      assert.equal(balance, minimalDeposit, "why is there money in my wallet");
     })
  }) 


  it("should check that we can't challenge domain not in appPool", function(){
    const domain = 'empty.net'
    console.log("shoud have failed");
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000-
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       return token.approve(registry.address, depositAmount, {from: accounts[3]})
    })
    .then(function(){
       return registry.challengeApplication(domain, {from: accounts[3]}); //should fail! error handle
    })
    .catch(function(error) {
      console.log('failed');
      });
  })//should fail

  it("should processResult then see that it's on the whitelist", function(){
    let registry;
    const domain = "consensys.net"
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
     })
     .then(function(){
      return registry.processResult(1); 
    })
    .then(function() {
      return registry.isVerified.call(domain);
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not added.");
    })
    .then(function(allow){
      return token.balanceOf.call(accounts[1]);
    })
    .then(function(balance){
      assert.equal(balance, 25, "balance not zero");
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toHash.call(domain);
    })
    .then(function(_hash){
      //get the struct in the mapping
      hash = _hash;
      return registry.whitelist.call(hash);
    })
    .then(function(publisher){
      assert.equal(publisher[2],50, "deposit not right");
    })
    .then(function(hash){
      //get the struct in the mapping
      return registry.appPool.call(hash);
    })
    .then(function(result) {
      //right now just check if owner = applier
      // check if owner = applier
      assert.equal(result[0], 0x0000000000000000000000000000000000000000 , "owner of application != address that applied");
    });
  });

  it("should apply with another domain",function(){
    const domain = 'nochallenge.net'
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       //transfer 5000 to accounts[1], return true if transfer success
       return token.transfer(accounts[1], depositAmount, {from: accounts[0]});
     })
    .then(function(boo){
      //apply with accounts[1]
      token.approve(registry.address, depositAmount, {from: accounts[1]})
      return registry.apply(domain, {from: accounts[1]});
    })
  });

it("should add time to evm then not allow to challenge because challenge time passed", function() {
    const domain = "nochallenge.net";
    console.log("shoud have failed");
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
    .then(() => {
      return Registry.deployed()
    })
    .then(function(_registry) {
      registry = _registry;
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000-
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       token.transfer(accounts[3], depositAmount, {from: accounts[0]});
    })
    .then(function(){
       token.approve(registry.address, depositAmount, {from: accounts[3]})
       return registry.challengeApplication(domain, {from: accounts[3]}); //should fail! error handle
    })
    .catch(function(error) {
      console.log('failed');
      });
  });

 it("should add time to evm then move to registry after challenge time is over", function() {
    const domain = "nochallenge.net";
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
    })
    .then(function(){
      return registry.moveToRegistry(domain);
    })
    .then(function(result) {
      return registry.isVerified.call(domain)
    })
    .then(function(result) {
      assert.equal(result, true , "it's not in the registry.");
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toHash.call(domain);
    })
    .then(function(hash){
      //get the struct in the mapping
      return registry.appPool.call(hash);
    })
    .then(function(result) {
      assert.equal(result[0], 0x0000000000000000000000000000000000000000 , "owner of application != address that applied"); 
    })
  });


it("should propose a parameter change", function() {
    const parameter = "registryLen" 
    const value = 50
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       //transfer 5000 to accounts[1], return true if transfer success
       return token.transfer(accounts[1], depositAmount, {from: accounts[0]});
     })
    .then(function(){
      return token.approve(registry.address, depositAmount, {from: accounts[1]});
    })
    .then(function(){
      //apply with accounts[1]
      return registry.proposeUpdate(parameter, value, {from: accounts[1]});
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toParameterHash.call(parameter, value);
    })
    .then(function(ParameterHash){
      //get the struct in the mapping
      return registry.appPool.call(ParameterHash);
    })
    .then(function(result) {
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      assert.equal(result[1], false , "challenged != false");
      assert.equal(result[2]*1000> Date.now(), true , "challenge time < now");
      assert.equal(result[3]==0x0000000000000000000000000000000000000000, true , "challenger = zero address");
      assert.equal(result[5]=='registryLen', true , "parameter is not right");
      assert.equal(result[6], 50 , "value is not right");
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toParameterHash.call(parameter, value);
    })
    .then(function(ParameterHash){
      //get the struct in the mapping
      return registry.paramSnapshots.call(ParameterHash);
    })
    .then(function(result) {
      assert.equal(result[0], depositAmount ,"deposit amount not right");
      assert.equal(result[1], 100 , "challenge lenth wrong");
    })
    .then(function(){
      return token.balanceOf.call(accounts[1]);

    })
    .then(function(balance){
      assert.equal(balance, 25, "shouldnt be tokens here other than the 25 won from before");
    });
  });

it("challenge a proposal", function() {
    const parameter = "registryLen" 
    const value = 50
    let registry;
    let token;
    let depositAmount = 50;
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      //get the deployed instance, deployed in 2_deploy_contracts.js
      //initialized with 10000-
      return Token.deployed(); 
    })
     .then(function(_token){
       token = _token;
       token.transfer(accounts[3], depositAmount, {from: accounts[0]});
    })
    .then(function(){
      return token.approve(registry.address, depositAmount, {from: accounts[3]});

    })
    .then(function(){
       return registry.challengeProposal(parameter, value, {from: accounts[3]}); //should fail! error handle
    })
    .then(function(){
      //has the domain so we can identify in appPool
      return registry.toParameterHash.call(parameter, value);
    })
    .then(function(hash){
      //get the struct in the mapping
      return registry.appPool.call(hash);
    })
    .then(function(result) {
      //right now just check if owner = applier
      // check if owner = applier
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      //assert.equal(result[2]> Date.now(), true , "challenge time < now");
      assert.equal(result[1], true , "challenged != true");
      assert.equal(result[3]==accounts[3], true , "challenger != challenger");

    });
  });

 it("should processResult then see that the value has not changed because the proposal lost", function(){
    let registry;
    let token;
    const parameter = "registryLen"
    return Registry.deployed() //get the deployed instance of registry
    .then(function(_registry) {
      registry = _registry;  
    })
    .then(function(){
      return Token.deployed(); 
    })
     .then(function(_token){
      token = _token;
      return registry.processProposal(2); 
    })
    .then(function() {
      return registry.get.call(parameter);
    })
    .then(function(result) {
      assert.equal(result, 100 , "value is changed.");
    })
    .then(function(allow){
      return token.balanceOf.call(accounts[3]);
    })
    .then(function(balance){
      console.log(balance);
      assert.equal(balance, 75, "balance not right");
    });
  });

//propose another proposal, let time pass, try setParameter
//propose another proposal, challenge, win, and process proposal

//claim reward
//renew
//try get function?
//claim extra reward
});



