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
  describe('Function: withdraw', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const withdrawAmount = minDeposit.div(bigTen(2));
    const [applicant, challenger] = accounts;

    it('should not withdraw tokens from a listing that has a deposit === minDeposit', async () => {
      const registry = await Registry.deployed();
      const dontChallengeListing = 'dontchallenge.net';
      const errMsg = 'applicant was able to withdraw tokens';

      await utils.addToWhitelist(dontChallengeListing, minDeposit, applicant);
      const origDeposit = await utils.getUnstakedDeposit(dontChallengeListing);

      try {
        await utils.as(applicant, registry.withdraw, dontChallengeListing, withdrawAmount);
        assert(false, errMsg);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const afterWithdrawDeposit = await utils.getUnstakedDeposit(dontChallengeListing);

      assert.strictEqual(afterWithdrawDeposit.toString(10), origDeposit.toString(10), errMsg);
    });

    it('should not withdraw tokens where the amount is less than twice the minDeposit and the listing is locked in ' +
     'a challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('shouldntwithdraw.net');

      const deposit = minDeposit.plus(bigTen(1));

      // Whitelist, then challenge
      await utils.addToWhitelist(listing, deposit, applicant);
      await utils.as(challenger, registry.challenge, listing, '');

      try {
        // Attempt to withdraw; should fail
        await utils.as(applicant, registry.withdraw, listing, '1');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert.strictEqual(false, 'Applicant should not have been able to withdraw from a challenged, locked listing');
      // TODO: check balance
      // TODO: apply, gets challenged, and then minDeposit lowers during challenge.
      // still shouldn't be able to withdraw anything.
      // when challenge ends, should be able to withdraw origDeposit - new minDeposit
    });

    it('should revert if the message sender is not the owner of the application/listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('challengerWithdraw.net');

      const deposit = minDeposit.plus(bigTen(1));

      // Whitelist
      await utils.addToWhitelist(listing, deposit, applicant);

      try {
        // Attempt to withdraw; should fail
        await utils.as(challenger, registry.withdraw, listing, '1');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'non-owner should not be able to withdraw from listing.');
    });

    it('should allow listing owner to withdraw and decrease the UnstakedDeposit while there is not a challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('ITWORKS.net');

      const deposit = minDeposit.plus(bigTen(1));

      // Whitelist
      await utils.addToWhitelist(listing, deposit, applicant);

      await utils.as(applicant, registry.withdraw, listing, '1');

      const afterWithdrawDeposit = await utils.getUnstakedDeposit(listing);

      assert.strictEqual(minDeposit.toString(), afterWithdrawDeposit.toString(), `UnstakedDeposit should be ${minDeposit.toString()}`);
    });

    it('should not allow withdrawal greater than UnstakedDeposit', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('moreThanIOwn.net');

      // calculate the amount to withdraw: greater than the unstaked deposit
      const unstakedDeposit = await utils.getUnstakedDeposit(listing);
      const withdrawGreaterAmount = new BN(unstakedDeposit, 10).plus('1');

      // Whitelist
      await utils.addToWhitelist(listing, minDeposit, applicant);
      try {
        await utils.as(applicant, registry.withdraw, listing, withdrawGreaterAmount.toString());
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'withdrew more than the UnstakedDeposit');
    });
  });
});

