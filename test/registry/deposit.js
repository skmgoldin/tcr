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
  describe('Function: deposit', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const incAmount = minDeposit.div(bigTen(2));
    const [applicant, challenger] = accounts;

    it('should increase the deposit for a specific listing in the listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('specificlisting.net');

      await utils.addToWhitelist(listing, minDeposit, applicant);
      await utils.as(applicant, registry.deposit, listing, incAmount);

      const unstakedDeposit = await utils.getUnstakedDeposit(listing);
      const expectedAmount = incAmount.add(minDeposit);
      assert.strictEqual(
        unstakedDeposit, expectedAmount.toString(10),
        'Unstaked deposit should be equal to the sum of the original + increase amount',
      );
    });

    it('should increase a deposit for a pending application', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('pendinglisting.net');
      await utils.as(applicant, registry.apply, listing, minDeposit, '');

      try {
        await utils.as(applicant, registry.deposit, listing, incAmount);

        const unstakedDeposit = await utils.getUnstakedDeposit(listing);
        const expectedAmount = incAmount.add(minDeposit);
        assert.strictEqual(unstakedDeposit, expectedAmount.toString(10), 'Deposit should have increased for pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should increase deposit for a whitelisted, challenged listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('challengelisting.net');
      await utils.addToWhitelist(listing, minDeposit, applicant);
      const originalDeposit = await utils.getUnstakedDeposit(listing);

      // challenge, then increase deposit
      await utils.as(challenger, registry.challenge, listing, '');
      await utils.as(applicant, registry.deposit, listing, incAmount);

      const afterIncDeposit = await utils.getUnstakedDeposit(listing);

      const expectedAmount = (
        bigTen(originalDeposit).add(bigTen(incAmount))
      ).sub(bigTen(minDeposit));

      assert.strictEqual(afterIncDeposit, expectedAmount.toString(10), 'Deposit should have increased for whitelisted, challenged listing');
    });

    it('should not increase deposit for a listing not owned by the msg.sender', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('notowner.com');
      await utils.addToWhitelist(listing, minDeposit, applicant);

      try {
        await utils.as(challenger, registry.deposit, listing, incAmount);
        assert(false, 'Deposit should not have increased when sent by the wrong msg.sender');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });
  });
});

