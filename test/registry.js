 const HttpProvider = require('ethjs-provider-http');
 const EthRPC = require('ethjs-rpc');
 const ethRPC = new EthRPC(new HttpProvider ('http://localhost:8545'));
var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol")



contract('Registry', function(accounts) {
  
  it("should add a domain to the mapping", function() {
    const domain = "consensys1.net";
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.add(domain);
    })
    .then(function(){
      return registry.toHash.call(domain);
    })
    .then(function(domainHash) {
      return registry.whitelist.call(domainHash);
    })
    .then(function(result) {
      return registry.isVerified.call(domain);
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not added.");
    })
  });
  it("should add time to evm then make expiration period over", function() {
    const domain = "consensys1.net";
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
      return registry.toHash.call(domain);
    })
    .then(function(domainHash) {
      return registry.whitelist.call(domainHash)
    })
    .then(function(result) {
      return registry.isVerified.call(domain)
    })
    .then(function(result) {
      assert.equal(result, false , "It's not expired.");
    })
  });

  it("should add a domain to the mapping", function() {
    const domain = "consensys.net";
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.add(domain);
    })
    .then(function(){
      return registry.isVerified.call(domain);
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not added.");
    });
  });



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
      return token.balanceOf.call(0x123);
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
      //apply with accounts[1]
      token.approve(registry.address, depositAmount, {from: accounts[1]})
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
      assert.equal(result[1], depositAmount , "deposit in the applicaiton = amount deposited");
      assert.equal(result[2]*1000> Date.now(), true , "challenge time < now");
      assert.equal(result[3], false , "challenged != false");
      assert.equal(result[4]==0x0000000000000000000000000000000000000000, true , "challenger = zero address");
    });
  });

  it("should check that we can't move to registry because challenge time not up", function(){
    //check that owner is again 0
      let registry;
      console.log("should print hi");
      const domain = 'consensys.net'
      return Registry.deployed()
      .then(function(_registry) {
      registry = _registry;  
    })
      .then(function(){
        return registry.moveToRegistry(domain);
      })
       .catch(function(error) {
      console.log('hi');
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
      return token.balanceOf.call(0x123);
    })
    .then(function(balance){
      assert.equal(balance, minimalDeposit, "why is there money in my wallet");
     })
 });

  it("should not let address to apply with domains that are already in appPool", function(){
    const domain = 'consensys.net'
    console.log("should print hi");
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
      console.log('hi');
    });
  });//should fail






  it("should check that the wallet balance did not increase due to failed application", function(){
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
      return token.balanceOf.call(0x123);
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
    .then(function(){
      //challenge
      token.approve(registry.address, depositAmount, {from: accounts[2]})
      return registry.challenge(domain, {from: accounts[2]});
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
      assert.equal(result[1], depositAmount , "deposit in the applicaiton = amount deposited");
      //assert.equal(result[2]> Date.now(), true , "challenge time < now");
      assert.equal(result[3], true , "challenged != true");
      assert.equal(result[4]==accounts[2], true , "challenger != challenger");

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
      return token.balanceOf.call(0x123);
    })
    .then(function(balance){
      assert.equal(balance, minimalDeposit, "why is there money in my wallet");
     })
  });


  it("challenge an already challenged domain", function() {
    const domain = 'consensys.net'
    console.log("should print hi");
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
       token.approve(registry.address, depositAmount, {from: accounts[3]})
       return registry.challenge(domain, {from: accounts[3]}); //should fail! error handle
    })
    .catch(function(error) {
      console.log('hi');
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
      return token.balanceOf.call(0x123);
    })
    .then(function(balance){
      assert.equal(balance, minimalDeposit, "why is there money in my wallet");
     })
  }) 


  it("should check that we can't challenge domain not in appPool", function(){
    const domain = 'empty.net'
    console.log("should print hi");
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
       token.approve(registry.address, depositAmount, {from: accounts[3]})
       return registry.challenge(domain, {from: accounts[3]}); //should fail! error handle
    })
    .catch(function(error) {
      console.log('hi');
      });
  })//should fail
/*
  Test that challengeTime is updated  ie. > now
  *in application, owner = applier
  *before challenge, challenger is empty
  *before challenge, challeged is false
  *check deposit in the application struct = minimal deposit
  make sure we can succefully get new parameters
  test for the challenge frame work. 
  *get another account to challenge, (consider the case if someone is challenging themself)
  *check that the challenger is changed
  *check that challenge changed to true
  *try to challenge an already challenged applicant
  *challenge an empty domain? a domain that is not an applicant
  *check in wallet to see that the deposit is placed
  test the move to registry function- the owner = 0 logic

  Try to make break each require statement
  !!check the whole allowence framework!!
  call vote
  and distribute payout

  * = resolved
  ! = difficult
*/


});



