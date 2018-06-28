/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');
const BigNumber = require('bignumber.js');

contract('Registry', (accounts) => {
  describe('Function: initExit', () => {
    const [applicant, challenger] = accounts;

    let token;
    let registry;

    beforeEach(async () => {
      const { registryProxy, tokenInstance } = await utils.getProxies();
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, false, registry);
    });

    it('exitTimeDelay should be correctly set', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('hangoutz.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.initExit(listing, { from: applicant });
      // blockTimestamp is used to calculate when the applicant's exit time is up
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        finalApplicantTokenHoldings.toString(),
        initialApplicantTokenHoldings.sub(paramConfig.minDeposit).toString(),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );
      // Make sure exitTimeDelay was correctly set
      const listingStruct = await registry.listings.call(listing);
      const exitTime = blockTimestamp.add(paramConfig.exitTimeDelay);
      assert.strictEqual(listingStruct[5].toString(), exitTime.toString(), 'exitTime was not set correctly');

      // Make sure exitTimeExpiry was correctly set
      const exitTimeExpiry = exitTime.add(paramConfig.exitPeriodLen);
      assert.strictEqual(listingStruct[6].toString(), exitTimeExpiry.toString(), 'exitTimeExpiry was not initialized');
    });

    it('should not allow a listing to initialize an exit when a challenge exists', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('420.com');
      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      // Challenge a listing and then fail to initialize exit because of the challenge
      await registry.challenge(listing, '', { from: challenger });
      try {
        await registry.initExit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed due to an existing challenge');
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
      // Make sure the listing did not successfully initialize exit
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'exitTimeDelay was initialized');
      // Make sure exitTimeExpiry was correctly set
      assert.strictEqual(listingStruct[6].toString(), '0', 'exitTimeExpiry was initialized');
    });

    it('should not initialize an exit by someone who doesn\'t own the listing', async () => {
      // Adding an application to the whitelist
      const listing = utils.getListingHash('chilling.com');
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);

      try {
        // Another user (challenger) is trying initialize the applicant's exit
        await registry.initExit(listing, { from: challenger });
        assert(false, 'exit initialized when the listing owner did not call initExit()');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }

      // Make sure the listing did not successfully initialize exit
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'exit time should not have been initialized');
    });

    it('should revert if listing is in application stage', async () => {
      const listing = utils.getListingHash('nogoodnames.com');
      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');

      const initialListingStruct = await registry.listings.call(listing);
      // Getting blockTimestamp to prove the listing is indeed in application stage
      const blockTimestamp = new BigNumber(await utils.getBlockTimestamp());
      // Checking to see if the listing is still in application stage
      assert((initialListingStruct[0] > 0 && initialListingStruct[0] > blockTimestamp), 'Listing is not in application stage ');
      try {
        await registry.initExit(listing, { from: applicant });
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
        return;
      }

      assert(false, 'exit succeeded for non-whitelisted listing');
    });
  });
});

