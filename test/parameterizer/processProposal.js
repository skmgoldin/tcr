/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const BN = require('bignumber.js');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: processProposal', () => {
    const [proposer, challenger, voter] = accounts;

    let token;
    let voting;
    let parameterizer;
    let registry;

    before(async () => {
      const {
        votingProxy, paramProxy, registryProxy, tokenInstance,
      } = await utils.getProxies(token);
      voting = votingProxy;
      parameterizer = paramProxy;
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, voting, parameterizer, registry);
    });

    it('should revert if block timestamp + pApplyStageLen is greater than 2^256 - 1', async () => {
      // calculate an applyStageLen which when added to the current block time will be greater
      // than 2^256 - 1
      const blockTimestamp = await utils.getBlockTimestamp();
      const maxEVMuint = new BN('2').pow('256').minus('1');
      const applyStageLen = maxEVMuint.minus(blockTimestamp).plus('1');

      // propose the malicious applyStageLen
      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'pApplyStageLen', applyStageLen.toString(10));
      const { propID } = receipt.logs[0].args;

      // wait until the apply stage has elapsed
      await utils.increaseTime(paramConfig.pApplyStageLength + 1);

      // process the bad proposal, expecting an invalid opcode
      try {
        await parameterizer.processProposal(propID);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }

      assert(false, 'An overflow occurred');
    });

    it('should set new parameters if a proposal went unchallenged', async () => {
      const proposerInitialBalance = await token.balanceOf.call(proposer);
      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');

      await utils.increaseTime(paramConfig.pApplyStageLength + 1);

      const { propID } = receipt.logs[0].args;
      await parameterizer.processProposal(propID);

      const proposerFinalBalance = await token.balanceOf.call(proposer);

      const voteQuorum = await parameterizer.get.call('voteQuorum');
      assert.strictEqual(
        voteQuorum.toString(10), '51',
        'A proposal which went unchallenged failed to update its parameter',
      );

      assert.strictEqual(
        proposerFinalBalance.toString(10), proposerInitialBalance.toString(10),
        'The proposer\'s tokens were not returned after setting their parameter',
      );
    });

    it('should not set new parameters if a proposal\'s processBy date has passed', async () => {
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
      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const challengerStartingBalance = await token.balanceOf.call(challenger);

      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '79');

      const { propID } = receipt.logs[0].args;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const { challengeID } = challengeReceipt.logs[0].args;
      await utils.commitVote(challengeID, '0', '10', '420', voter, voting);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voter, voting.revealVote, challengeID, '0', '420');

      const paramProp = await parameterizer.proposals.call(propID);
      const processBy = paramProp[5];
      await utils.increaseTime(processBy.toNumber() + 1);

      await parameterizer.processProposal(propID);

      // verify that the challenge has been resolved
      const challenge = await parameterizer.challenges.call(challengeID);
      const resolved = challenge[2];
      assert.strictEqual(resolved, true, 'Challenge has not been resolved');

      // check parameters
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

    it('should not set new parameters if a proposal\'s processBy date has passed, ' +
    'but challenge failed', async () => {
      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '78');

      const { propID } = receipt.logs[0].args;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const { challengeID } = challengeReceipt.logs[0].args;
      await utils.commitVote(challengeID, '1', '10', '420', voter, voting);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voter, voting.revealVote, challengeID, '1', '420');

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

    it('should revert if processProposal is called before appExpiry', async () => {
      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '70');

      const { propID } = receipt.logs[0].args;

      try {
        await parameterizer.processProposal(propID);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'proposal was processed without a challenge and before appExpiry and processBy date');
    });
  });
});

