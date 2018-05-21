/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const BN = require('bn.js');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: challengeReparameterization', () => {
    const [proposer, challenger, voter] = accounts;

    let token;
    let voting;
    let parameterizer;

    before(async () => {
      const { votingProxy, paramProxy, tokenInstance } = await utils.getProxies(token);
      voting = votingProxy;
      parameterizer = paramProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, voting, parameterizer, false);
    });

    it('should leave parameters unchanged if a proposal loses a challenge', async () => {
      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const challengerStartingBalance = await token.balanceOf.call(challenger);

      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');

      const { propID } = receipt.logs[0].args;

      await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      await utils.increaseTime(paramConfig.pCommitStageLength + paramConfig.pRevealStageLength + 1);

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get('voteQuorum');
      assert.strictEqual(voteQuorum.toString(10), '50', 'The proposal succeeded which ' +
        'should have been successfully challenged');

      const proposerFinalBalance = await token.balanceOf.call(proposer);
      const proposerExpected = proposerStartingBalance.sub(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(
        proposerFinalBalance.toString(10), proposerExpected.toString(10),
        'The challenge loser\'s token balance is not as expected',
      );

      // Edge case, challenger gets both deposits back because there were no voters
      const challengerFinalBalance = await token.balanceOf.call(challenger);
      const challengerExpected = challengerStartingBalance.add(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(
        challengerFinalBalance.toString(10), challengerExpected.toString(10),
        'The challenge winner\'s token balance is not as expected',
      );
    });

    it('should set new parameters if a proposal wins a challenge', async () => {
      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const challengerStartingBalance = await token.balanceOf.call(challenger);

      const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');

      const { propID } = proposalReceipt.logs[0].args;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const { challengeID } = challengeReceipt.logs[0].args;

      await utils.commitVote(challengeID, '1', '10', '420', voter, voting);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voter, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get('voteQuorum');
      assert.strictEqual(voteQuorum.toString(10), '51', 'The proposal failed which ' +
        'should have succeeded');

      const proposerFinalBalance = await token.balanceOf.call(proposer);
      const winnings =
        utils.multiplyByPercentage(paramConfig.pMinDeposit, paramConfig.pDispensationPct);
      const proposerExpected = proposerStartingBalance.add(winnings);
      assert.strictEqual(
        proposerFinalBalance.toString(10), proposerExpected.toString(10),
        'The challenge winner\'s token balance is not as expected',
      );

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      const challengerExpected = challengerStartingBalance.sub(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(
        challengerFinalBalance.toString(10), challengerExpected.toString(10),
        'The challenge loser\'s token balance is not as expected',
      );
    });

    it(
      'should have deposits of equal size if a challenge is opened & the pMinDeposit has changed since the proposal was initiated',
      async () => {
        // make proposal to change pMinDeposit
        // this is to induce an error where:
        // a challenge could have a different stake than the proposal being challenged
        const proposalReceiptOne = await utils.as(proposer, parameterizer.proposeReparameterization, 'pMinDeposit', paramConfig.pMinDeposit + 1);
        const propIDOne = proposalReceiptOne.logs[0].args.propID;

        // increase time
        // we want the second proposal to get the deposit
        // from the original pMinDeposit and NOT the pMinDeposit from the first proposal
        await utils.increaseTime(paramConfig.pCommitStageLength + 1);

        // open a proposal to change commitDuration
        // this is the proposal that we will test against
        const proposalReceiptTwo = await utils.as(proposer, parameterizer.proposeReparameterization, 'commitStageLen', paramConfig.commitStageLength + 1);
        const propIDTwo = proposalReceiptTwo.logs[0].args.propID;

        // increase time & update pMinDeposit
        // process the first proposal
        await utils.increaseTime(paramConfig.pRevealStageLength + 1);
        await parameterizer.processProposal(propIDOne);

        // challenge the second proposal
        const challengeReceipt =
          await utils.as(challenger, parameterizer.challengeReparameterization, propIDTwo);
        const { challengeID } = challengeReceipt.logs[0].args;

        // assert that the prop.deposit and the challenge.stake are equal
        const challenge = await parameterizer.challenges.call(challengeID.toString());
        const challengeStake = challenge[3];
        const proposal = await parameterizer.proposals.call(propIDTwo.toString());
        const proposalDeposit = proposal[2];
        assert.strictEqual(challengeStake.toString(), proposalDeposit.toString(), 'parties to the challenge have different deposits');
      },
    );

    it('should not allow a challenges for non-existent proposals', async () => {
      try {
        await utils.as(challenger, parameterizer.challengeReparameterization, new BN(0).toString());
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'challenge was made on non-existent poll');
    });

    it('should revert if token transfer from user fails', async () => {
      const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '55');

      const { propID } = proposalReceipt.logs[0].args;

      // Approve the contract to transfer 0 tokens from account so the transfer will fail
      await token.approve(parameterizer.address, '0', { from: challenger });

      try {
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'allowed challenge with not enough tokens');
    });
  });
});

