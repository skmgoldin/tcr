/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

contract('Registry', (accounts) => {
  describe('Function: determineReward', () => {
    const [applicant, challenger] = accounts;

    let token;
    let registry;

    before(async () => {
      const { registryProxy, tokenInstance } = await utils.getProxies();
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, false, registry);
    });

    it('should revert if the challenge has already been resolved', async () => {
      const listing = utils.getListingHash('failure.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');
      // Challenge
      const challengeID = await utils.challengeAndGetPollID(listing, challenger, registry);
      // Resolve challenge
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);

      // Verify that the challenge has been resolved
      const challenge = await registry.challenges.call(challengeID);
      const resolved = challenge[2];
      assert.strictEqual(resolved, true, 'Challenge has not been resolved');

      // Try to determine reward
      try {
        await utils.as(challenger, registry.determineReward, challengeID);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'determined reward after challenge already resolved');
    });

    it('should revert if the poll has not ended yet', async () => {
      const listing = utils.getListingHash('failure.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');
      // Challenge
      const challengeID = await utils.challengeAndGetPollID(listing, challenger, registry);

      try {
        await utils.as(challenger, registry.determineReward, challengeID);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'determined reward before poll has ended');
    });
  });
});

