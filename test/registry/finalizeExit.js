/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');
const BigNumber = require('bignumber.js');

contract('Registry', (accounts) => {
  describe('Function: finalizeExit', () => {
    const [applicant, challenger] = accounts;

    let token;
    let registry;

    before(async () => {
      const { registryProxy, tokenInstance } = await utils.getProxies();
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, false, registry);
    });

    it('should allow a listing to exit when no challenge exists', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('google.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');
      // Exiting the whitelist
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
      // Make sure resetListing(), called in finalizeExit() correctly removed the listing
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'exit time did not reset');
    });

    it('should not allow a listing to finalize exit when exit was not initialized', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('youtube.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      // Trying to finalize an exit without ever calling initExit()
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
      // Make sure the listing did not successfully initialize exit
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'exit time was initialized even though initExit() was never called');
    });

    it('should not allow a listing to finalize exit during the waiting period', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('hangouts.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.initExit(listing, { from: applicant });
      // blockTimestamp is used to calculate when the applicant's exit time is up
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());
      // Trying to finalize exit during waiting period
      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed becuase the user called finalizeExit before the delay period was over');
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
      // Make sure exitTimeDelay was correctly set
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), blockTimestamp.add(paramConfig.exitTimeDelay).toString(), 'exit time was not initialized');
    });

    it('should not allow a listing to finalize an exit when a challenge does exist', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('520.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.initExit(listing, { from: applicant });
      // blockTimestamp is used to calculate when the applicant's exit time is up
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      // Challenge the listing
      await registry.challenge(listing, '', { from: challenger });
      // Assert that challenge does exit
      const initialListingStruct = await registry.listings.call(listing);
      assert.notStrictEqual(initialListingStruct[4].toString(), '0', 'Challenge was never created');
      // Trying to finalize an exit while there is an ongoing challenge
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

    it('should not allow a listing to finalize an exit when exitPeriodLen has elapsed', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('620-200.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      // Initialize exit and advance time passed exitPeriodLen
      await registry.initExit(listing, { from: applicant });
      // blockTimestamp is used to calculate when the applicant's exit time is up
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await utils.increaseTime(paramConfig.exitPeriodLen + 1);
      const listingStruct = await registry.listings.call(listing);

      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed since exitPeriodLen elapsed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the listing was able to exit since exitPeriodLen elapsed',
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
      // Add an application to the whitelsit
      const listing = utils.getListingHash('720-300.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      // Initialize exit and fast forward past exitPeriodLen
      await registry.initExit(listing, { from: applicant });
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await utils.increaseTime(paramConfig.exitPeriodLen + 1);
      // finalizeExit should fail since exitPeriodLen has passed
      try {
        await registry.finalizeExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed since exitPeriodLen elapsed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }

      // Re-initialize the exit and finalize exit
      await registry.initExit(listing, { from: applicant });
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      await registry.finalizeExit(listing, { from: applicant });

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        false,
        'the listing was not able to exit even though exitPeriodLen did not elapse',
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

