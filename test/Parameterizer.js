const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const ethRPC = new EthRPC(new HttpProvider ('http://localhost:8545'));
const abi = require("ethereumjs-abi");

var Parameterizer = artifacts.require("./Parameterizer.sol");
var Token = artifacts.require("./HumanStandardToken.sol")

var minDeposit = 50;
var minParamDeposit = 50;
var applyStageLength = 50;
var commitPeriodLength = 50;
var revealPeriodLength = 50;
var dispensationPct = 50;
var voteQuorum = 50;

contract('Parameterizer', (accounts) => {

    it("should get a parameter", async() => {
    param = await Parameterizer.deployed()
    result = await param.get.call("minDeposit")
    assert.equal(result, minDeposit, "minDeposit param has wrong value")
  });

});
