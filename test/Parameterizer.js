const HttpProvider = require('ethjs-provider-http')
const EthRPC = require('ethjs-rpc')
const ethRPC = new EthRPC(new HttpProvider ('http://localhost:8545'))
const abi = require("ethereumjs-abi")

var Token = artifacts.require("./HumanStandardToken.sol")

const PLCRVoting = artifacts.require("./PLCRVoting.sol")
const Registry = artifacts.require("./Registry.sol")
const Parameterizer = artifacts.require("./Parameterizer.sol")

var minDeposit = 50;
var minParamDeposit = 50;
var applyStageLength = 50;
var commitPeriodLength = 50;
var revealPeriodLength = 50;
var dispensationPct = 50;
var voteQuorum = 50;

contract('Parameterizer', (accounts) => {

    async function getParameterizer () {
        let registry = await Registry.deployed()
        let paramAddr = await registry.parameterizer.call()
        let param = await Parameterizer.at(paramAddr)
        return param
    }

    async function getVoting() {
        let registry = await Registry.deployed()
        let votingAddr = await registry.voting.call()
        let voting = await PLCRVoting.at(votingAddr)
        return voting
    }

    it("should get a parameter", async() => {
        let param = await getParameterizer()
        result = await param.get.call("minDeposit")
        assert.equal(result, minDeposit, "minDeposit param has wrong value")
    });

    it("should fail to change parameter", async() => {
        let param = await getParameterizer()
        //changeParameter()
        //vote against
        //processProposal
        //should be no change to params

    });

    it("should change parameter", async() => {
        let param = await getParameterizer()
        //changeParameter()
        //vote for
        //processProposal
        //should change params
    });    

});
