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
  describe('Function: appWasMade', () => {
    const [applicant] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);
    it('should return true if applicationExpiry was previously initialized', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('wasthismade.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, minDeposit, '');
      const result = await registry.appWasMade(listing);
      assert.strictEqual(result, true, 'should have returned true for the applied listing');

      // Commit stage complete
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      const resultTwo = await registry.appWasMade(listing);
      assert.strictEqual(resultTwo, true, 'should have returned true because app is still not expired');

      // Reveal stage complete, update status (whitelist it)
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      await utils.as(applicant, registry.updateStatus, listing);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'should have been whitelisted');
      const resultThree = await registry.appWasMade(listing);
      assert.strictEqual(resultThree, true, 'should have returned true because its whitelisted');

      // Exit
      await utils.as(applicant, registry.exit, listing);
      const resultFour = await registry.appWasMade(listing);
      assert.strictEqual(resultFour, false, 'should have returned false because exit');
    });

    it('should return false if applicationExpiry was uninitialized', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('falseapp.net');

      const result = await registry.appWasMade(listing);
      assert.strictEqual(result, false, 'should have returned false because listing was never applied');
    });
  });
});

