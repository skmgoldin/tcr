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

     // increases time
    async function increaseTime(seconds) {
        return new Promise((resolve, reject) => { 
            return ethRPC.sendAsync({
                method: 'evm_increaseTime',
                params: [seconds]
            }, (err) => {
                if (err) reject(err)
                resolve()
            })
        })
            .then(() => {
                return new Promise((resolve, reject) => { 
                    return ethRPC.sendAsync({
                        method: 'evm_mine',
                        params: []
                    }, (err) => {
                        if (err) reject(err)
                        resolve()
                    })
                })
            })
    }

    async function getParamVoting() {
        let param = await Parameterizer.deployed()
        let votingAddr = await param.voting.call()
        let voting = await PLCRVoting.at(votingAddr)
        return voting
    }

    async function getSecretHash(salt, voteOption) {
        return "0x" + abi.soliditySHA3([ "uint", "uint" ],
            [ voteOption, salt ]).toString('hex'); 
    }

    it("should get a parameter", async() => {
        let param = await Parameterizer.deployed()
        result = await param.get.call("minDeposit")
        assert.equal(result, minDeposit, "minDeposit param has wrong value")
    });

    it("should fail to change parameter", async() => {
        let param = await Parameterizer.deployed()
        let voting = await getParamVoting()
        let salt = 1
        let voteOption = 0
        let token = Token.deployed()

        //changeParameter()
        await param.changeParameter("minDeposit", 20, {from: accounts[1]})
        //vote against with accounts[1:4]
        
        // commit
        // await voting.commitVote(pollID, secretHash, numTokens, prevID);
        let pollID = 1
        let hash = await getSecretHash(salt, voteOption)
        res = await voting.voteTokenBalance.call(accounts[1])
        await voting.commitVote(pollID, hash, 1, 0, {from: accounts[1]})
        await increaseTime(commitPeriodLength+10)

        // reveal
        // await voting.revealVote(pollID, salt, voteOption, {from: accounts[1]});
        // await increaseTime(revealPeriodLength+1)
        //processProposal
        //should be no change to params

    });

    it("should change parameter", async() => {
        let param = await Parameterizer.deployed()
        //changeParameter()
        //vote for
        //processProposal
        //should change params
    });    

});
