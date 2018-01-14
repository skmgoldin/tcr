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

    it('should not withdraw tokens from a listing that is locked in a challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('shouldntwithdraw.net');

      // Whitelist, then challenge
      await utils.addToWhitelist(listing, minDeposit, applicant);
      await utils.as(challenger, registry.challenge, listing, '');

      try {
        // Attempt to withdraw; should fail
        await utils.as(applicant, registry.withdraw, listing, withdrawAmount);
        assert.strictEqual(false, 'Applicant should not have been able to withdraw from a challenged, locked listing');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      // TODO: check balance
      // TODO: apply, gets challenged, and then minDeposit lowers during challenge.
      // still shouldn't be able to withdraw anything.
      // when challenge ends, should be able to withdraw origDeposit - new minDeposit
    });
  });
});

