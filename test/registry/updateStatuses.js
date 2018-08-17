/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: updateStatuses', () => {
    const [applicant, challenger] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);

    let token;
    let registry;

    before(async () => {
      const { registryProxy, tokenInstance } = await utils.getProxies();
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, false, registry);
    });

    it('should whitelist an array of 1 listing', async () => {
      const listing = utils.getListingHash('whitelistmepls.io');
      await utils.as(applicant, registry.apply, listing, minDeposit, '');

      await utils.increaseTime(paramConfig.applyStageLength + 1);

      const listings = [listing];
      await utils.as(applicant, registry.updateStatuses, listings);
      const wl = await registry.listings.call(listing);
      assert.strictEqual(wl[1], true, 'should have been whitelisted');
    });

    it('should whitelist an array of 2 listings', async () => {
      const listing1 = utils.getListingHash('whitelistus1.io');
      const listing2 = utils.getListingHash('whitelistus2.io');
      await utils.as(applicant, registry.apply, listing1, minDeposit, '');
      await utils.as(applicant, registry.apply, listing2, minDeposit, '');

      await utils.increaseTime(paramConfig.applyStageLength + 1);

      const listings = [listing1, listing2];
      await utils.as(applicant, registry.updateStatuses, listings);
      const wl1 = await registry.listings.call(listing1);
      assert.strictEqual(wl1[1], true, 'listing 1 should have been whitelisted');
      const wl2 = await registry.listings.call(listing2);
      assert.strictEqual(wl2[1], true, 'listing 2 should have been whitelisted');
    });

    it('should not whitelist an array of 1 listing that is still pending an application', async () => {
      const listing = utils.getListingHash('tooearlybuddy.io');
      await utils.as(applicant, registry.apply, listing, minDeposit, '');

      const listings = [listing];
      try {
        await utils.as(applicant, registry.updateStatuses, listings);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'Listing should not have been whitelisted');
    });

    it('should not whitelist a listing that is currently being challenged', async () => {
      const listing = utils.getListingHash('dontwhitelist.io');

      await utils.as(applicant, registry.apply, listing, minDeposit, '');
      await utils.as(challenger, registry.challenge, listing, '');

      const listings = [listing];
      try {
        await registry.updateStatuses(listings);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'Listing should not have been whitelisted');
    });

    it('should not whitelist an array of 1 listing that failed a challenge', async () => {
      const listing = utils.getListingHash('dontwhitelist.net');

      await utils.as(applicant, registry.apply, listing, minDeposit, '');
      await utils.as(challenger, registry.challenge, listing, '');

      const plcrComplete = paramConfig.revealStageLength + paramConfig.commitStageLength + 1;
      await utils.increaseTime(plcrComplete);

      const listings = [listing];
      await registry.updateStatuses(listings);
      const result = await registry.isWhitelisted(listing);
      assert.strictEqual(result, false, 'Listing should not have been whitelisted');
    });

    it('should not be possible to add an array of 1 listing to the whitelist just by calling updateStatuses', async () => {
      const listing = utils.getListingHash('updatemenow.net');

      try {
        const listings = [listing];
        await utils.as(applicant, registry.updateStatuses, listings);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'Listing should not have been whitelisted');
    });
  });
});

