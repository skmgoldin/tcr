/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: updateStatus', () => {
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

    it('should whitelist listing if apply stage ended without a challenge', async () => {
      const listing = utils.getListingHash('whitelist.io');
      // note: this function calls registry.updateStatus at the end
      await utils.addToWhitelist(listing, minDeposit, applicant, registry);

      const result = await registry.isWhitelisted.call(listing);
      assert.strictEqual(result, true, 'Listing should have been whitelisted');
    });

    it('should not whitelist a listing that is still pending an application', async () => {
      const listing = utils.getListingHash('tooearlybuddy.io');
      await utils.as(applicant, registry.apply, listing, minDeposit, '');

      try {
        await utils.as(applicant, registry.updateStatus, listing);
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

      try {
        await registry.updateStatus(listing);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'Listing should not have been whitelisted');
    });

    it('should not whitelist a listing that failed a challenge', async () => {
      const listing = utils.getListingHash('dontwhitelist.net');

      await utils.as(applicant, registry.apply, listing, minDeposit, '');
      await utils.as(challenger, registry.challenge, listing, '');

      const plcrComplete = paramConfig.revealStageLength + paramConfig.commitStageLength + 1;
      await utils.increaseTime(plcrComplete);

      await registry.updateStatus(listing);
      const result = await registry.isWhitelisted(listing);
      assert.strictEqual(result, false, 'Listing should not have been whitelisted');
    });

    it('should not be possible to add a listing to the whitelist just by calling updateStatus', async () => {
      const listing = utils.getListingHash('updatemenow.net');

      try {
        await utils.as(applicant, registry.updateStatus, listing);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'Listing should not have been whitelisted');
    });

    it('should not be possible to add a listing to the whitelist just by calling updateStatus after it has been previously removed', async () => {
      const listing = utils.getListingHash('somanypossibilities.net');

      await utils.addToWhitelist(listing, minDeposit, applicant, registry);
      const resultOne = await registry.isWhitelisted(listing);
      assert.strictEqual(resultOne, true, 'Listing should have been whitelisted');

      await utils.as(applicant, registry.exit, listing);
      const resultTwo = await registry.isWhitelisted(listing);
      assert.strictEqual(resultTwo, false, 'Listing should not be in the whitelist');

      try {
        await utils.as(applicant, registry.updateStatus, listing);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'Listing should not have been whitelisted');
    });
  });
});

