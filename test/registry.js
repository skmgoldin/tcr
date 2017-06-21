var Registry = artifacts.require("./Registry.sol");

contract('Registry', function(accounts) {
  it("should add a domain to the mapping", function() {
    const domainHash = 'd12b8fe8d34e88110b378dd90f522fe23b7b2b0afae9a7c6139a9347da5ce6808';
    const domain = 'consensys.net'
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.add(domainHash);
    })
    .then(function(){
      return registry.isVerified.call(domain);
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not added.");
    });
  });

  it("should verify a domain is not in the whitelist", function() {
    const domain = 'eth.net';
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

  it("should return 0 for status of a whitelisted address", function() {
    const domainHash = 'd12b8fe8d34e88110b378dd90f522fe23b7b2b0afae9a7c6139a9347da5ce6808';
    const domain = 'consensys.net'
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.add(domainHash);
    })
    .then(function(){
      //return (registry.domainMap[domainHash].status == 0);
      return registry.domainMap.call(domainHash)
    })
    .then(function(result) {
      console.log(result[2].toString())
    })
    .then(function(result) {
      assert.equal(result, true , "Domain has the wrong status.");
    });
  });

  it("should allow a domain to apply", function() {
    const domainHash = 'd12b8fe8d34e88110b378dd90f522fe23b7b2b0afae9a7c6139a9347da5ce6808';
    const domain = 'consensys.net'
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.apply.call(domain);
    })
    .then(function(){
      return !(registry.domainMap[domainHash].status == 1);
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not an applicant.");
    });
  });

  it("should allow an added domain to be challenged", function() {
    const domainHash = 'd12b8fe8d34e88110b378dd90f522fe23b7b2b0afae9a7c6139a9347da5ce6808';
    const domain = 'consensys.net'
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.add.call(domainHash);
    })
    .then(function(){
      return registry.domainMap[domainHash].status == 1;
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not an applicant.");
    });
  });


 
  
});
