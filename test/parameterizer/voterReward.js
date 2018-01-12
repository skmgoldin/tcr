/* eslint-env mocha */
/* global artifacts assert contract */
const Parameterizer = artifacts.require('./Parameterizer.sol');

const fs = require('fs');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: voterReward', () => {
    const [proposer, challenger, voterAlice] = accounts;

    it('should return the correct number of tokens to voter on the winning side.', async () => {
      const parameterizer = await Parameterizer.deployed();
      const voting = await utils.getVoting();

      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer);
      const challengeID = await utils.challengeReparamAndGetChallengeID(propID, challenger);

      // Alice commits a vote: FOR, 10 tokens, 420 salt
      await utils.commitVote(challengeID, '1', '10', '420', voterAlice);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      // Alice reveals her vote: FOR, 420 salt
      await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      await parameterizer.processProposal(propID);

      // Grab the challenge struct after the proposal has been processed
      const challenge = await parameterizer.challenges.call(challengeID);
      const voterTokens = await voting.getNumPassingTokens(voterAlice, challengeID, '420'); // 10
      const rewardPool = challenge[0]; // 250,000
      const totalTokens = challenge[4]; // 10

      const expectedVoterReward = (voterTokens.mul(rewardPool)).div(totalTokens); // 250,000
      const voterReward = await parameterizer.voterReward(voterAlice, challengeID, '420');

      assert.strictEqual(
        expectedVoterReward.toString(10), voterReward.toString(10),
        'voterReward should have equaled tokens * pool / total',
      );
    });
    it('should return zero tokens to a voter who cannot reveal a vote on the winning side.');
  });
});

