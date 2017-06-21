var Registry = artifacts.require("./Registry.sol");

contract('Registry', function(accounts) {
  it("should add a domain to the mapping", function() {
    const domain = "a";
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

  it("should allow a domain to apply", function() {
    const domain = 'consensys.net'
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.apply(domain, {from: accounts[0]});
    })
    .then(function(){
      return !(registry.domainMap[domainHash].status == 1);
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not an applicant.");
    });
  });

  it("should allow an unchallenged app to move to registry", function() {
    const domain = 'consensys.net'
    let registry;
    return Registry.deployed()
    .then(function(_registry) {
      registry = _registry;
      return registry.apply(domain);
    })
    .then(function(){
      return moveToRegistry(domain);
    })
    .then(function(result) {
      assert.equal(result, true , "Domain is not an applicant.");
    });
  });

  it("should allow an added domain to be challenged", function() {
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
