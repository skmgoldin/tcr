/* eslint-env mocha */
/* global artifacts assert contract */
const Parameterizer = artifacts.require('./Parameterizer.sol');
const Token = artifacts.require('EIP20.sol');

const fs = require('fs');
const BN = require('bn.js');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const bigTen = number => new BN(number.toString(10), 10);

contract('Parameterizer', (accounts) => {
  describe('Function: claimReward', () => {
    const [proposer, challenger, voterAlice, voterBob] = accounts;

    it('should give the correct number of tokens to a voter on the winning side.', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());
      const voting = await utils.getVoting();

      const voterAliceStartingBalance = await token.balanceOf.call(voterAlice);

      const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');

      const { propID } = proposalReceipt.logs[0].args;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const challengeID = challengeReceipt.logs[0].args.pollID;

      await utils.commitVote(challengeID, '1', '10', '420', voterAlice);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      await parameterizer.processProposal(propID);

      await utils.as(voterAlice, parameterizer.claimReward, challengeID, '420');
      await utils.as(voterAlice, voting.withdrawVotingRights, '10');

      const voterAliceFinalBalance = await token.balanceOf.call(voterAlice);
      const voterAliceExpected = voterAliceStartingBalance.add(utils.multiplyByPercentage(
        paramConfig.pMinDeposit,
        bigTen(100).sub(bigTen(paramConfig.pDispensationPct)),
      ));
      assert.strictEqual(
        voterAliceFinalBalance.toString(10), voterAliceExpected.toString(10),
        'A voterAlice\'s token balance is not as expected after claiming a reward',
      );
    });

    it(
      'should give the correct number of tokens to multiple voters on the winning side.',
      async () => {
        const parameterizer = await Parameterizer.deployed();
        // const token = Token.at(await parameterizer.token.call());
        const voting = await utils.getVoting();

        // const voterAliceStartingBalance = await token.balanceOf.call(voterAlice);
        // const voterBobStartingBalance = await token.balanceOf.call(voterBob);

        const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '52');

        const { propID } = proposalReceipt.logs[0].args;

        const challengeReceipt =
          await utils.as(challenger, parameterizer.challengeReparameterization, propID);

        const challengeID = challengeReceipt.logs[0].args.pollID;

        await utils.commitVote(challengeID, '1', '10', '420', voterAlice);
        await utils.commitVote(challengeID, '1', '20', '420', voterBob);
        await utils.increaseTime(paramConfig.pCommitStageLength + 1);

        await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
        await utils.as(voterBob, voting.revealVote, challengeID, '1', '420');
        await utils.increaseTime(paramConfig.pRevealStageLength + 1);

        await parameterizer.processProposal(propID);

        const voterAliceReward = await parameterizer.voterReward.call(
          voterAlice,
          challengeID, '420',
        );
        await utils.as(voterAlice, parameterizer.claimReward, challengeID, '420');
        await utils.as(voterAlice, voting.withdrawVotingRights, '10');

        const voterBobReward = await parameterizer.voterReward.call(
          voterBob,
          challengeID, '420',
        );
        await utils.as(voterBob, parameterizer.claimReward, challengeID, '420');
        await utils.as(voterBob, voting.withdrawVotingRights, '20');

        // TODO: do better than approximately.
        assert.approximately(
          voterBobReward.toNumber(10),
          voterAliceReward.mul(new BN('2', 10)).toNumber(10),
          2,
          'Rewards were not properly distributed between voters',
        );
        // TODO: add asserts for final balances
      },
    );

    it('should not transfer tokens for an unresolved challenge', async () => {
      const parameterizer = await Parameterizer.deployed();
      const voting = await utils.getVoting();
      const token = Token.at(await parameterizer.token.call());

      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'pMinDeposit', '5000');

      const { propID } = proposalReceipt.logs[0].args;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const challengeID = challengeReceipt.logs[0].args.pollID;

      await utils.commitVote(challengeID, '1', '10', '420', voterAlice);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      try {
        await utils.as(voterAlice, parameterizer.claimReward, challengeID, '420');
        assert(false, 'should not have been able to claimReward for unresolved challenge');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const proposerEndingBalance = await token.balanceOf.call(proposer);
      const proposerExpected = proposerStartingBalance.sub(bigTen(paramConfig.pMinDeposit));
      const aliceEndingBalance = await token.balanceOf.call(voterAlice);
      const aliceExpected = aliceStartingBalance.sub(bigTen(10));

      assert.strictEqual(
        proposerEndingBalance.toString(10), proposerExpected.toString(10),
        'proposers ending balance is incorrect',
      );
      assert.strictEqual(
        aliceEndingBalance.toString(10), aliceExpected.toString(10),
        'alices ending balance is incorrect',
      );
    });

    it('should give zero tokens to a voter who cannot reveal a vote on the winning side.');
  });
});

