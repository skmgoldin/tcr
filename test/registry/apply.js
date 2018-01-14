/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

contract('Registry', (accounts) => {
  describe('Function: apply', () => {
    const [applicant] = accounts;

    it('should allow a new listing to apply', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('nochallenge.net');

      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');

      // get the struct in the mapping
      const result = await registry.listings.call(listing);
      // check that Application is initialized correctly
      assert.strictEqual(result[0].gt(0), true, 'challenge time < now');
      assert.strictEqual(result[1], false, 'whitelisted != false');
      assert.strictEqual(result[2], applicant, 'owner of application != address that applied');
      assert.strictEqual(
        result[3].toString(10),
        paramConfig.minDeposit.toString(10),
        'incorrect unstakedDeposit',
      );
    });

    it('should not allow a listing to apply which has a pending application', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('nochallenge.net');
      try {
        await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'application was made for listing with an already pending application');
    });

    it(
      'should add a listing to the whitelist which went unchallenged in its application period',
      async () => {
        const registry = await Registry.deployed();
        const listing = utils.getListingHash('nochallenge.net');
        await utils.increaseTime(paramConfig.applyStageLength + 1);
        await registry.updateStatus(listing);
        const result = await registry.isWhitelisted.call(listing);
        assert.strictEqual(result, true, "listing didn't get whitelisted");
      },
    );

    it('should not allow a listing to apply which is already listed', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('nochallenge.net');

      try {
        await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');
      } catch (err) {
        // TODO: Check if EVM error
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
        return;
      }
      assert(false, 'application was made for an already-listed entry');
    });
  });
});

