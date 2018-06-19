/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('EIP20.sol');

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');
const BigNumber = require('bignumber.js');

contract('Registry', (accounts) => {
  describe('Function: finalizeExit', () => {
    const [applicant, challenger] = accounts;

    it('should allow a listing to exit when no challenge exists', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('google.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');
      await registry.initExit(listing, { from: applicant });
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await registry.finalizeExit(listing, { from: applicant });

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelistedAfterExit, false, 'the listing was not removed on exit');

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        initialApplicantTokenHoldings.toString(10),
        finalApplicantTokenHoldings.toString(10),
        'the applicant\'s tokens were not returned to them after exiting the registry',
      );

      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'exit time did not reset');
    });

    it('should not allow a listing to finalize exit when exit was not initialized', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('youtube.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');
      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed due to exit not being initialized');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelistedAfterExit, true, 'the listing was removed on finalizeExit');

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        finalApplicantTokenHoldings.toString(),
        initialApplicantTokenHoldings.sub(paramConfig.minDeposit).toString(),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );

      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'exit time was initialized');
    });

    it('should not allow a listing to finalize exit when time is not up', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('hangouts.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');
      await registry.initExit(listing, { from: applicant });
      // blockTimestamp is used to calculate when the applicant's exit time is up
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());
      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed due to time not being up');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert(isWhitelistedAfterExit, true, 'the listing was removed on finalizeExit');

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        finalApplicantTokenHoldings.toString(),
        initialApplicantTokenHoldings.sub(paramConfig.minDeposit).toString(),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), blockTimestamp.add(paramConfig.exitTimeDelay).toString(), 'exit time was not initialized');
    });

    it('should not allow a listing to finalize an exit when a challenge does exist', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('520.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.initExit(listing, { from: applicant });
      // blockTimestamp is used to calculate when the applicant's exit time is up
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await registry.challenge(listing, '', { from: challenger });
      // Make an assertion to prove that challenge does exit
      const initialListingStruct = await registry.listings.call(listing);
      assert.notStrictEqual(initialListingStruct[4].toString(), '0', 'Challenge was never created');
      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the listing was able to exit while a challenge was active',
      );
      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        finalApplicantTokenHoldings.toString(),
        initialApplicantTokenHoldings.sub(paramConfig.minDeposit).toString(),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), blockTimestamp.add(paramConfig.exitTimeDelay).toString(), 'exit time was not initialized');
    });

    it('should not allow a listing to finalize an exit when exitTimeExpiry has elapsed', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('620-200.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.initExit(listing, { from: applicant });

      // blockTimestamp is used to calculate when the applicant's exit time is up
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());

      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await utils.increaseTime(paramConfig.exitTimeExpiry + 1);
      const listingStruct = await registry.listings.call(listing);

      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed since exitTimeExpiry elapsed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the listing was able to exit since exitTimeExpiry elapsed',
      );
      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        finalApplicantTokenHoldings.toString(),
        initialApplicantTokenHoldings.sub(paramConfig.minDeposit).toString(),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );

      assert.strictEqual(listingStruct[5].toString(), blockTimestamp.add(paramConfig.exitTimeDelay).toString(), 'exit time was not initialized');
    });

    it('should allow a listing to finalize after re-initializing a previous exit', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('720-300.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      // Initialize exit and fast forward past expiry date
      await registry.initExit(listing, { from: applicant });
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await utils.increaseTime(paramConfig.exitTimeExpiry + 1);
      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed since exitTimeExpiry elapsed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }

      // Re-initialize the exit and finalize the exit before the expiry time
      await registry.initExit(listing, { from: applicant });
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await registry.finalizeExit(listing, { from: applicant });

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        false,
        'the listing was not able to exit even though exitTimeExpiry did not elapse',
      );
      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        finalApplicantTokenHoldings.toString(),
        initialApplicantTokenHoldings.toString(),
        'the applicant\'s tokens were not returned in spite of exiting',
      );
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'user was not able to successfully exit the listing');
    });
  });
});

