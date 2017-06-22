//import static org.junit.Assert.assertTrue;

var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol")



contract('Registry', function(accounts) {
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



  it("should allow a domain to apply", function() {
    const domain = 'consensys.net'
    let registry;
    let token;
    let depositAmount = 5000;
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
       return token.transfer.call(accounts[1], depositAmount);
     })
    .then(function(boo){
      //should log true
      console.log(boo);
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
      //right now just check if owner = applier
      console.log( result[2]);
      // check if owner = applier
      assert.equal(result[0], accounts[1] , "owner of application != address that applied");
      assert.equal(result[1], depositAmount/100 , "deposit in the applicaiton = amount deposited");
      assert.equal(result[2]*1000> Date.now(), true , "challenge time < now");
      assert.equal(result[3], false , "challenged != false");
      assert.equal(result[4]==0x0000000000000000000000000000000000000000, true , "challenger = zero address");

    });
  });


  it("should allow a address to challenge", function() {
    const domain = 'consensys.net'
    let registry;
    let token;
    let depositAmount = 5000;
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
       return token.transfer.call(accounts[1], depositAmount);
     })
    .then(function(boo){
       console.log(boo);
       return token.transfer.call(accounts[0], depositAmount);
     })
    .then(function(boo){
      //should log true
      console.log(boo);
      //apply with accounts[1]
      return registry.apply(domain, {from: accounts[1]});
    })
    .then(function(){
      //challenge
      return registry.challenge(domain, {from: accounts[0]});
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
      assert.equal(result[1], depositAmount/100 , "deposit in the applicaiton = amount deposited");
      //assert.equal(result[2]> Date.now(), true , "challenge time < now");
      assert.equal(result[3], true , "challenged != true");
      assert.equal(result[4]==accounts[0], true , "challenger != challenger");

    });
  });

/*
  Test that challengeTime is updated  ie. > now
  *in application, owner = applier
  *before challenge, challenger is empty
  *before challenge, challeged is false
  *check deposit in the application struct = minimal deposit
  make sure we can succefully get new parameters
  test for the challenge frame work. 
  get another account to challenge, (consider the case if someone is challenging themself)
  check that the challenger is changed
  check that challenge changed to true
  try to challenge an already challenged applicant
  challenge an empty domain? a domain that is not an applicant
  check in wallet to see that the deposit is placed
  test the move to registry function- the owner = 0 logic

  Try to make break each require statement
  !!check the whole allowence framework!!
  call vote
  and distribute payout

  * = resolved
  ! = difficult
*/


  // it("should allow an unchallenged app to move to registry", function() {
  //   const domain = 'consensys.net'
  //   let registry;
  //   return Registry.deployed()
  //   .then(function(_registry) {
  //     registry = _registry;
  //     return registry.apply(domain);
  //   })
  //   .then(function(){
  //     return moveToRegistry(domain);
  //   })
  //   .then(function(result) {
  //     assert.equal(result, true , "Domain is not an applicant.");
  //   });
  // });

  // it("should allow an added domain to be challenged", function() {
  //   const domain = 'consensys.net'
  //   let registry;
  //   return Registry.deployed()
  //   .then(function(_registry) {
  //     registry = _registry;
  //     return registry.add.call(domainHash);
  //   })
  //   .then(function(){
  //     return registry.domainMap[domainHash].status == 1;
  //   })
  //   .then(function(result) {
  //     assert.equal(result, true , "Domain is not an applicant.");
  //   });
  // });


 
  
});
