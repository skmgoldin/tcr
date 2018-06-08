/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: claimRewards', () => {
    const [applicant, challenger, voterAlice] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);

    let token;
    let voting;
    let registry;

    before(async () => {
      const { votingProxy, registryProxy, tokenInstance } = await utils.getProxies();
      voting = votingProxy;
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, voting, false, registry);
    });

    it('should transfer the correct number of tokens once a challenge has been resolved', async () => {
      const listing = utils.getListingHash('claimthis.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, minDeposit, '');
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      // Challenge
      const pollID = await utils.challengeAndGetPollID(listing, challenger, registry);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice, voting);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      // Update status
      await utils.as(applicant, registry.updateStatus, listing);

      const aliceVoterReward = await registry.voterReward.call(voterAlice, pollID, '420');

      // Alice claims reward
      const pollIDs = [pollID];
      const salts = ['420'];
      await utils.as(voterAlice, registry.claimRewards, pollIDs, salts);

      // Alice withdraws her voting rights
      await utils.as(voterAlice, voting.withdrawVotingRights, '500');

      const aliceExpected = aliceStartingBalance.add(aliceVoterReward);
      const aliceFinalBalance = await token.balanceOf.call(voterAlice);

      assert.strictEqual(
        aliceFinalBalance.toString(10), aliceExpected.toString(10),
        'alice should have more tokens than what she started with',
      );
    });

    it('should transfer an array of 3 rewards once a challenge has been resolved', async () => {
      const listing1 = utils.getListingHash('claimthis1.net');
      const listing2 = utils.getListingHash('claimthis2.net');
      const listing3 = utils.getListingHash('claimthis3.net');

      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      // Apply
      await utils.as(applicant, registry.apply, listing1, minDeposit, '');
      await utils.as(applicant, registry.apply, listing2, minDeposit, '');
      await utils.as(applicant, registry.apply, listing3, minDeposit, '');

      // Challenge
      const pollID1 = await utils.challengeAndGetPollID(listing1, challenger, registry);
      const pollID2 = await utils.challengeAndGetPollID(listing2, challenger, registry);
      const pollID3 = await utils.challengeAndGetPollID(listing3, challenger, registry);

      // Alice is so committed
      await utils.commitVote(pollID1, '0', 500, '420', voterAlice, voting);
      await utils.commitVote(pollID2, '0', 500, '420', voterAlice, voting);
      await utils.commitVote(pollID3, '0', 500, '420', voterAlice, voting);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID1, '0', '420');
      await utils.as(voterAlice, voting.revealVote, pollID2, '0', '420');
      await utils.as(voterAlice, voting.revealVote, pollID3, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      // Update status
      await utils.as(applicant, registry.updateStatus, listing1);
      await utils.as(applicant, registry.updateStatus, listing2);
      await utils.as(applicant, registry.updateStatus, listing3);

      const aliceVoterReward1 = await registry.voterReward(voterAlice, pollID1, '420');
      const aliceVoterReward2 = await registry.voterReward(voterAlice, pollID2, '420');
      const aliceVoterReward3 = await registry.voterReward(voterAlice, pollID3, '420');

      // Alice claims reward
      const pollIDs = [pollID1, pollID2, pollID3];
      const salts = ['420', '420', '420'];
      await utils.as(voterAlice, registry.claimRewards, pollIDs, salts);

      // Alice withdraws her voting rights
      await utils.as(voterAlice, voting.withdrawVotingRights, '1500');

      const aliceExpected = aliceStartingBalance
        .add(aliceVoterReward1).add(aliceVoterReward2).add(aliceVoterReward3);
      const aliceFinalBalance = await token.balanceOf.call(voterAlice);

      assert.strictEqual(
        aliceFinalBalance.toString(10), aliceExpected.toString(10),
        'alice should have more tokens than what she started with',
      );
    });
  });
});

