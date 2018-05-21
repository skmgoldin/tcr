/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: tokenClaims', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const [applicant, challenger, voter] = accounts;

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

    it('should report properly whether a voter has claimed tokens', async () => {
      const listing = utils.getListingHash('claims.com');

      await utils.addToWhitelist(listing, minDeposit, applicant, registry);

      const pollID = await utils.challengeAndGetPollID(listing, challenger, registry);

      await utils.commitVote(pollID, '0', '10', '420', voter, voting);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      await utils.as(voter, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      await utils.as(challenger, registry.updateStatus, listing);

      const initialHasClaimed = await registry.tokenClaims.call(pollID, voter);
      assert.strictEqual(initialHasClaimed, false, 'The voter is purported to have claimed ' +
        'their reward, when in fact they have not');

      await utils.as(voter, registry.claimReward, pollID, '420');

      const finalHasClaimed = await registry.tokenClaims.call(pollID, voter);
      assert.strictEqual(finalHasClaimed, true, 'The voter is purported to not have claimed ' +
        'their reward, when in fact they have');
    });
  });
});

