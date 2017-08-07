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
        let voting = await getParamVoting()
        // console.log("voting contract instance", voting)
        let salt = 1
        let voteOption = 1

        //changeParameter()
        let result = await param.changeParameter("minDeposit", 20, {from: accounts[1]})
        let pollID = result.receipt.logs[1].data
        console.log("pollID", pollID)

        let hash = getSecretHash(voteOption, salt)
        console.log("hash", hash)
        // //vote against with accounts[1:4]
        
        // commit
        let tokensArg = 10;
        await voting.commitVote(pollID, hash, tokensArg, 0, {from: accounts[2]})
        let numTokens = await voting.getNumTokens(pollID, {from: accounts[2]})
        console.log("numTokens", numTokens)
        let cpa = await voting.commitPeriodActive.call(pollID)
        console.log("commitPeriodActive", cpa)
        await increaseTime(paramConfig.commitPeriodLength+1)
        console.log("increaseTime", paramConfig.commitPeriodLength+1)
        cpa = await voting.commitPeriodActive.call(pollID)
        console.log("commitPeriodActive", cpa)

        let rpa = await voting.revealPeriodActive.call(pollID)
        console.log("revealPeriodActive", rpa)

        // reveal
        await voting.revealVote(pollID, salt, voteOption, {from: accounts[2]});
        let pollArr = await voting.pollMap.call(pollID)
        console.log("pollArr", pollArr)

        await increaseTime(paramConfig.commitPeriodLength+1)
        console.log("increaseTime", paramConfig.revealPeriodLength+1)

        rpa = await voting.revealPeriodActive.call(pollID)
        console.log("revealPeriodActive", rpa)

        let pollResult = await voting.isPassed.call(pollID)
        console.log("pollResult", pollResult)
        //processProposal
        //should be no change to params

    });
});