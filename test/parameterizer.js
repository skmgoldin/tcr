/* eslint-env mocha */
/* global artifacts assert contract */

// const HttpProvider = require('ethjs-provider-http');
// const EthRPC = require('ethjs-rpc');

// const ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'));
// const abi = require('ethereumjs-abi');

// const PLCRVoting = artifacts.require('./PLCRVoting.sol');
const Parameterizer = artifacts.require('./Parameterizer.sol');

const fs = require('fs');

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.RegistryDefaults;

contract('Parameterizer', () => {
  /*
  async function increaseTime(seconds) {
    return new Promise((resolve, reject) => ethRPC.sendAsync({
      method: 'evm_increaseTime',
      params: [seconds],
    }, (err) => {
      if (err) reject(err);
      resolve();
    }))
      .then(() => new Promise((resolve, reject) => ethRPC.sendAsync({
        method: 'evm_mine',
        params: [],
      }, (err) => {
        if (err) reject(err);
        resolve();
      })));
  }

  async function getParamVoting() {
    const param = await Parameterizer.deployed();
    const votingAddr = await param.voting.call();
    const voting = await PLCRVoting.at(votingAddr);
    return voting;
  }

  function getSecretHash(vote, salt) {
    return `0x${abi.soliditySHA3(['uint', 'uint'],
      [vote, salt]).toString('hex')}`;
  }
  */

  it('should get a parameter', async () => {
    const param = await Parameterizer.deployed();
    const result = await param.get.call('minDeposit');
    assert.equal(result, paramConfig.minDeposit, 'minDeposit param has wrong value');
  });

  /*
  it('should fail to change parameter', async () => {
    const param = await Parameterizer.deployed();
    const voting = await getParamVoting();
    const salt = 1;
    const voteOption = 0;

    // changeParameter()
    let result = await param.changeParameter('minDeposit', 20, { from: accounts[1] });
    const pollID = result.receipt.logs[1].data;
    const hash = getSecretHash(voteOption, salt);

    // vote against with accounts[1:3]

    // commit
    const tokensArg = 10;
    const cpa = await voting.commitPeriodActive.call(pollID);
    assert.equal(cpa, true, 'commit period should be active');

    await voting.commitVote(pollID, hash, tokensArg, pollID - 1, { from: accounts[1] });
    let numTokens = await voting.getNumTokens(pollID, { from: accounts[1] });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    await voting.commitVote(pollID, hash, tokensArg, pollID - 1, { from: accounts[2] });
    numTokens = await voting.getNumTokens(pollID, { from: accounts[2] });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    // inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    let rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, true, 'reveal period should be active');

    // reveal
    await voting.revealVote(pollID, salt, voteOption, { from: accounts[1] });
    await voting.revealVote(pollID, salt, voteOption, { from: accounts[2] });

    // inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, false, 'reveal period should not be active');

    // processProposal
    const pollResult = await voting.isPassed.call(pollID);
    assert.equal(pollResult, false, 'poll should not have passed');
    await param.processProposal(pollID);
    // should be no change to params
    result = await param.get.call('minDeposit');
    assert.equal(result.toString(10), paramConfig.minDeposit, 'minDeposit should not change');
  });

  it('should change parameter', async () => {
    const param = await Parameterizer.deployed();
    const voting = await getParamVoting();
    const salt = 1;
    const voteOption = 1;

    // changeParameter()
    const newMinDeposit = 20;
    let result = await param.changeParameter('minDeposit', newMinDeposit, { from: accounts[1] });
    const pollID = result.receipt.logs[1].data;
    const hash = getSecretHash(voteOption, salt);

    // vote for with accounts[1:3]

    // commit
    const tokensArg = 10;
    const cpa = await voting.commitPeriodActive.call(pollID);
    assert.equal(cpa, true, 'commit period should be active');

    await voting.commitVote(pollID, hash, tokensArg, pollID - 1, { from: accounts[1] });
    let numTokens = await voting.getNumTokens(pollID, { from: accounts[1] });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    await voting.commitVote(pollID, hash, tokensArg, pollID - 1, { from: accounts[2] });
    numTokens = await voting.getNumTokens(pollID, { from: accounts[2] });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    // inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    let rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, true, 'reveal period should be active');

    // reveal
    await voting.revealVote(pollID, salt, voteOption, { from: accounts[1] });
    await voting.revealVote(pollID, salt, voteOption, { from: accounts[2] });

    // inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, false, 'reveal period should not be active');

    // processProposal
    const pollResult = await voting.isPassed.call(pollID);
    assert.equal(pollResult, true, 'poll should not have passed');
    await param.processProposal(pollID);
    // should be no change to params
    result = await param.get.call('minDeposit');
    assert.equal(result.toString(10), newMinDeposit, 'minDeposit should not change');
  });
  */
});
