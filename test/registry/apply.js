/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('EIP20.sol');

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
      // apply with accounts[1]
      await registry.apply(listing, paramConfig.minDeposit, { from: accounts[1] });
      // get the struct in the mapping
      const result = await registry.listings.call(listing);
      // check that Application is initialized correctly
      assert.strictEqual(result[0] * 1000 > Date.now(), true, 'challenge time < now');
      assert.strictEqual(result[1], false, 'challenged != false');
      assert.strictEqual(result[2], accounts[1], 'owner of application != address that applied');
      assert.strictEqual(
        result[3].toString(10),
        paramConfig.minDeposit.toString(10),
        'incorrect unstakedDeposit',
      );
    });

    it('should not allow a listing to apply which has a pending application', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('doublelisting.net');
      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit);
      try {
        await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit);
        assert(false, 'application was made for listing with an already pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should not allow a listing to apply which is already listed', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('nochallenge.net');
      const initialAmnt = await token.balanceOf.call(registry.address);
      // apply with accounts[1] with the same listing, should fail since there's
      // an existing application already
      try {
        await registry.apply(listing, paramConfig.minDeposit, { from: accounts[2] });
      } catch (err) {
        // TODO: Check if EVM error
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const finalAmt = await token.balanceOf.call(registry.address);
      assert.strictEqual(
        finalAmt.toString(10),
        initialAmnt.toString(10),
        'why did my wallet balance change',
      );
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
  });
});

