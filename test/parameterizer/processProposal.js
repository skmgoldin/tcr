/* eslint-env mocha */
/* global artifacts assert contract */
const Parameterizer = artifacts.require('./Parameterizer.sol');
const Token = artifacts.require('EIP20.sol');

const fs = require('fs');
const BN = require('bn.js');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: processProposal', () => {
    const [proposer, challenger, voter] = accounts;

    it('should set new parameters if a proposal went unchallenged', async () => {
      const parameterizer = await Parameterizer.deployed();

      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');

      await utils.increaseTime(paramConfig.pApplyStageLength + 1);

      const { propID } = receipt.logs[0].args;
      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get.call('voteQuorum');
      assert.strictEqual(
        voteQuorum.toString(10), '51',
        'A proposal which went unchallenged failed to update its parameter',
      );
    });

    it('should not set new parameters if a proposal\'s processBy date has passed', async () => {
      const parameterizer = await Parameterizer.deployed();

      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '69');

      const { propID } = receipt.logs[0].args;
      const paramProp = await parameterizer.proposals.call(propID);
      const processBy = paramProp[5];
      await utils.increaseTime(processBy.toNumber() + 1);

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get.call('voteQuorum');
      assert.strictEqual(
        voteQuorum.toString(10), '51',
        'A proposal whose processBy date passed was able to update the parameterizer',
      );
    });

    it('should not set new parameters if a proposal\'s processBy date has passed, ' +
    'but should resolve any challenges against the domain', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());
      const voting = await utils.getVoting();

      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const challengerStartingBalance = await token.balanceOf.call(challenger);

      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '69');

      const { propID } = receipt.logs[0].args;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const { pollID } = challengeReceipt.logs[0].args;
      await utils.commitVote(pollID, '0', '10', '420', voter);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voter, voting.revealVote, pollID, '0', '420');

      const paramProp = await parameterizer.proposals.call(propID);
      const processBy = paramProp[5];
      await utils.increaseTime(processBy.toNumber() + 1);

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get.call('voteQuorum');
      assert.strictEqual(
        voteQuorum.toString(10), '51',
        'A proposal whose processBy date passed was able to update the parameterizer',
      );

      const proposerFinalBalance = await token.balanceOf.call(proposer);
      const proposerExpected = proposerStartingBalance.sub(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(
        proposerFinalBalance.toString(10), proposerExpected.toString(10),
        'The challenge loser\'s token balance is not as expected',
      );

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      const winnings =
        utils.multiplyByPercentage(paramConfig.pMinDeposit, paramConfig.pDispensationPct);
      const challengerExpected = challengerStartingBalance.add(winnings);
      assert.strictEqual(
        challengerFinalBalance.toString(10), challengerExpected.toString(10),
        'The challenge winner\'s token balance is not as expected',
      );
    });
  });
});

