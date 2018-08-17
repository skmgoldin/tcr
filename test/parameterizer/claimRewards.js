/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: claimRewards', () => {
    const [proposer, challenger, voterAlice] = accounts;

    let token;
    let voting;
    let parameterizer;

    before(async () => {
      const {
        votingProxy, paramProxy, tokenInstance,
      } = await utils.getProxies(token);
      voting = votingProxy;
      parameterizer = paramProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, voting, parameterizer, false);
    });

    it('should give the correct number of tokens to a voter on the winning side.', async () => {
      const voterAliceStartingBalance = await token.balanceOf.call(voterAlice);

      // propose reparam
      const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');
      const { propID } = proposalReceipt.logs[0].args;

      // challenge reparam
      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      const { challengeID } = challengeReceipt.logs[0].args;

      // commit vote
      await utils.commitVote(challengeID, '1', '10', '420', voterAlice, voting);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      // reveal vote
      await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      // process reparam
      await parameterizer.processProposal(propID);

      // array args
      const challengeIDs = [challengeID];
      const salts = ['420'];

      const aliceVoterReward = await parameterizer.voterReward.call(voterAlice, challengeID, '420');

      // multi claimRewards, arrays as inputs
      await utils.as(voterAlice, parameterizer.claimRewards, challengeIDs, salts);
      await utils.as(voterAlice, voting.withdrawVotingRights, '10');

      // state assertion
      const voterAliceFinalBalance = await token.balanceOf.call(voterAlice);
      // expected = starting balance + voterReward
      const voterAliceExpected = voterAliceStartingBalance.add(aliceVoterReward);
      assert.strictEqual(
        voterAliceFinalBalance.toString(10), voterAliceExpected.toString(10),
        'A voterAlice\'s token balance is not as expected after claiming a reward',
      );
    });

    it('should transfer an array of 3 rewards once a challenge has been resolved', async () => {
      const voterAliceStartingBalance = await token.balanceOf.call(voterAlice);

      // propose reparams
      const proposalReceipt1 = await utils.as(proposer, parameterizer.proposeReparameterization, 'pVoteQuorum', '51');
      const proposalReceipt2 = await utils.as(proposer, parameterizer.proposeReparameterization, 'commitStageLen', '601');
      const proposalReceipt3 = await utils.as(proposer, parameterizer.proposeReparameterization, 'applyStageLen', '601');

      const propID1 = proposalReceipt1.logs[0].args.propID;
      const propID2 = proposalReceipt2.logs[0].args.propID;
      const propID3 = proposalReceipt3.logs[0].args.propID;

      // challenge reparams
      const challengeReceipt1 =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID1);
      const challengeReceipt2 =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID2);
      const challengeReceipt3 =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID3);

      const challengeID1 = challengeReceipt1.logs[0].args.challengeID;
      const challengeID2 = challengeReceipt2.logs[0].args.challengeID;
      const challengeID3 = challengeReceipt3.logs[0].args.challengeID;

      // commit votes
      await utils.commitVote(challengeID1, '1', '10', '420', voterAlice, voting);
      await utils.commitVote(challengeID2, '1', '10', '420', voterAlice, voting);
      await utils.commitVote(challengeID3, '1', '10', '420', voterAlice, voting);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      // reveal votes
      await utils.as(voterAlice, voting.revealVote, challengeID1, '1', '420');
      await utils.as(voterAlice, voting.revealVote, challengeID2, '1', '420');
      await utils.as(voterAlice, voting.revealVote, challengeID3, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      // process reparams
      await parameterizer.processProposal(propID1);
      await parameterizer.processProposal(propID2);
      await parameterizer.processProposal(propID3);

      // array args
      const challengeIDs = [challengeID1, challengeID2, challengeID3];
      const salts = ['420', '420', '420'];

      const aliceVoterReward1 = await parameterizer.voterReward.call(voterAlice, challengeID1, '420');
      const aliceVoterReward2 = await parameterizer.voterReward.call(voterAlice, challengeID2, '420');
      const aliceVoterReward3 = await parameterizer.voterReward.call(voterAlice, challengeID3, '420');

      // multi claimRewards, arrays as inputs
      await utils.as(voterAlice, parameterizer.claimRewards, challengeIDs, salts);
      await utils.as(voterAlice, voting.withdrawVotingRights, '30');

      // state assertion
      const voterAliceFinalBalance = await token.balanceOf.call(voterAlice);
      // expected = starting balance + voterReward x3
      const voterAliceExpected = voterAliceStartingBalance
        .add(aliceVoterReward1).add(aliceVoterReward2).add(aliceVoterReward3);
      assert.strictEqual(
        voterAliceFinalBalance.toString(10), voterAliceExpected.toString(10),
        'A voterAlice\'s token balance is not as expected after claiming a reward',
      );
    });
  });
});

