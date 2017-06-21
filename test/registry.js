var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol")



contract('Registry', function(accounts) {
  it("should add a domain to the mapping", function() {
    const domain = "consensys.net";
    let registry;
    return Registry.deployed(0x123)
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
    return Registry.deployed(0xabc)
    .then(function(_registry) {
      registry = _registry;
      return true
    })
    .then(function(boo){
      return Token.deployed(10000, "adToken",1000,"whhat");
    })
     .then(function(_token){
       token = _token;
       return token.transfer.call(accounts[0], 5000);
     })
    .then(function(boo){
      console.log(boo);
      console.log(accounts[0])
      return registry.apply(domain, {from: accounts[0]});
    })
    .then(function(){
      return registry.toHash.call(domain);
    })
    .then(function(hash){
      return registry.appPool.call(hash);
    })
    .then(function(result) {
      console.log(result);
      assert.equal(result[0], accounts[0] , "Domain is not an applicant.");
    });
  });






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
