const HttpProvider = require('ethjs-provider-http')
const EthRPC = require('ethjs-rpc')
const ethRPC = new EthRPC(new HttpProvider ('http://localhost:8545'))
const abi = require("ethereumjs-abi")

var Token = artifacts.require("./HumanStandardToken.sol")

const PLCRVoting = artifacts.require("./PLCRVoting.sol")
const Registry = artifacts.require("./Registry.sol")
const Parameterizer = artifacts.require("./Parameterizer.sol")

const fs = require("fs")

let adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'))
let paramConfig = adchainConfig.RegistryDefaults

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

    function getSecretHash(vote, salt) {
        return "0x" + abi.soliditySHA3([ "uint", "uint" ],
            [ vote, salt ]).toString('hex'); 
    }

    it("should get a parameter", async() => {
        let param = await Parameterizer.deployed()
        result = await param.get.call("minDeposit")
        assert.equal(result, paramConfig.minDeposit, "minDeposit param has wrong value")
    });

    it("should fail to change parameter", async() => {
        let param = await Parameterizer.deployed()
        let votingAddr = await param.voting.call()
        let voting = await getParamVoting()
        let salt = 1
        let voteOption = 0

        //changeParameter()
        let result = await param.changeParameter("minDeposit", 20, {from: accounts[1]})
        let pollID = result.receipt.logs[1].data
        let hash = getSecretHash(voteOption, salt)

        //vote against with accounts[1:3]
        
        // commit
        let tokensArg = 10;
        let cpa = await voting.commitPeriodActive.call(pollID)
        assert.equal(cpa, true, "commit period should be active")

        await voting.commitVote(pollID, hash, tokensArg, pollID-1, {from: accounts[1]})
        let numTokens = await voting.getNumTokens(pollID, {from: accounts[1]})
        assert.equal(numTokens, tokensArg, "wrong num tok committed")

        await voting.commitVote(pollID, hash, tokensArg, pollID-1, {from: accounts[2]})
        numTokens = await voting.getNumTokens(pollID, {from: accounts[2]})
        assert.equal(numTokens, tokensArg, "wrong num tok committed")
        
        //inc time
        await increaseTime(paramConfig.commitPeriodLength+1)
        let rpa = await voting.revealPeriodActive.call(pollID)
        assert.equal(rpa, true, "reveal period should be active")

        // reveal
        await voting.revealVote(pollID, salt, voteOption, {from: accounts[1]});
        await voting.revealVote(pollID, salt, voteOption, {from: accounts[2]});

        //inc time
        await increaseTime(paramConfig.commitPeriodLength+1)
        rpa = await voting.revealPeriodActive.call(pollID)
        assert.equal(rpa, false, "reveal period should not be active")

        //processProposal
        let pollResult = await voting.isPassed.call(pollID)
        assert.equal(pollResult, false, "poll should not have passed")
        await param.processProposal(pollID)
        //should be no change to params
        result = await param.get.call("minDeposit")
        assert.equal(parseInt(result.toString()), paramConfig.minDeposit, "minDeposit should not change")
    });

    it("should fail to change parameter", async() => {
        let param = await Parameterizer.deployed()
        let votingAddr = await param.voting.call()
        let voting = await getParamVoting()
        let salt = 1
        let voteOption = 1

        //changeParameter()
        let newMinDeposit = 20
        let result = await param.changeParameter("minDeposit", newMinDeposit, {from: accounts[1]})
        let pollID = result.receipt.logs[1].data
        let hash = getSecretHash(voteOption, salt)

        //vote for with accounts[1:3]
        
        // commit
        let tokensArg = 10;
        let cpa = await voting.commitPeriodActive.call(pollID)
        assert.equal(cpa, true, "commit period should be active")

        await voting.commitVote(pollID, hash, tokensArg, pollID-1, {from: accounts[1]})
        let numTokens = await voting.getNumTokens(pollID, {from: accounts[1]})
        assert.equal(numTokens, tokensArg, "wrong num tok committed")
        
        await voting.commitVote(pollID, hash, tokensArg, pollID-1, {from: accounts[2]})
        numTokens = await voting.getNumTokens(pollID, {from: accounts[2]})
        assert.equal(numTokens, tokensArg, "wrong num tok committed")
        
        //inc time
        await increaseTime(paramConfig.commitPeriodLength+1)
        let rpa = await voting.revealPeriodActive.call(pollID)
        assert.equal(rpa, true, "reveal period should be active")

        // reveal
        await voting.revealVote(pollID, salt, voteOption, {from: accounts[1]});
        await voting.revealVote(pollID, salt, voteOption, {from: accounts[2]});

        //inc time
        await increaseTime(paramConfig.commitPeriodLength+1)
        rpa = await voting.revealPeriodActive.call(pollID)
        assert.equal(rpa, false, "reveal period should not be active")

        //processProposal
        let pollResult = await voting.isPassed.call(pollID)
        assert.equal(pollResult, true, "poll should not have passed")
        await param.processProposal(pollID)
        //should be no change to params
        result = await param.get.call("minDeposit")
        assert.equal(parseInt(result.toString()), newMinDeposit, "minDeposit should not change")
    });

});