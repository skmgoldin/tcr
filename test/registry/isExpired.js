/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');

const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  const [applicant] = accounts;
  const minDeposit = bigTen(paramConfig.minDeposit);

  describe('Function: isExpired', () => {
    it('should return true if the argument is greater than the current block.timestamp', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('expiredlisting.net');

      await utils.as(applicant, registry.apply, listing, minDeposit);

      const result = await registry.listings.call(listing);

      // Voting period done (ie. app expired)
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);

      const isExpired = await registry.isExpired(result[0]);
      assert.strictEqual(isExpired, true, 'application should have expired.');
    });

    it('should return false if the argument is less than the current block.timestamp', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('notexpired.net');

      await utils.as(applicant, registry.apply, listing, minDeposit);

      const result = await registry.listings.call(listing);

      const isExpired = await registry.isExpired(result[0]);
      assert.strictEqual(isExpired, false, 'application should not have expired.');
    });
  });
});

