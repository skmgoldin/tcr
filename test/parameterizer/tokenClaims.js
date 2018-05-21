/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: tokenClaims', () => {
    const [proposer, challenger, alice] = accounts;

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

    it('should return false if voter tokens have not been claimed yet.', async () => {
      // Make a proposal to change the voteQuorum param to 51, and grab the proposal ID
      const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');
      const { propID } = proposalReceipt.logs[0].args;

      // Challenge the proposal, and grab the challenge ID
      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      const { challengeID } = challengeReceipt.logs[0].args;

      // Commit 10 tokens in support of the proposal, and finish the commit stage
      await utils.commitVote(challengeID, '1', '10', '420', alice, voting);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      // Reveal the supporting vote, and finish the reveal stage
      await utils.as(alice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      // Process the proposal
      await parameterizer.processProposal(propID);

      const result = await parameterizer.tokenClaims.call(challengeID, alice);
      assert.strictEqual(
        result, false,
        'tokenClaims returned true for a voter who has not claimed tokens yet',
      );
    });

    it('should return true if voter tokens have been claimed.', async () => {
      // Make a proposal to change the voteQuorum param to 52, and grab the proposal ID
      const proposalReceipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '52');
      const { propID } = proposalReceipt.logs[0].args;

      // Challenge the proposal, and grab the challenge ID
      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      const { challengeID } = challengeReceipt.logs[0].args;

      // Commit 10 tokens in support of the proposal, and finish the commit stage
      await utils.commitVote(challengeID, '1', '10', '420', alice, voting);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      // Reveal the suypporting vote, and finish the reveal stage
      await utils.as(alice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      // Process the proposal and claim a reward
      await parameterizer.processProposal(propID);
      await utils.as(alice, parameterizer.claimReward, challengeID, '420');

      const result = await parameterizer.tokenClaims.call(challengeID, alice);
      assert.strictEqual(
        result, true,
        'tokenClaims returned false for a voter who has claimed tokens already',
      );
    });
  });
});

