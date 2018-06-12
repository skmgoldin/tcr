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

    before(async () => {
      const { registryProxy, tokenInstance } = await utils.getProxies();
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, false, registry);
    });

    it('exit time state should be correctly set', async () => {
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
        'the applicant\'s tokens were returned in spite of exit',
      );
      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), blockTimestamp.add(paramConfig.exitTimeDelay).toString(), 'exit time was not initialized');
    });

    it('should not allow a listing to initialize an exit when a challenge exists', async () => {
      const listing = utils.getListingHash('420.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.challenge(listing, '', { from: challenger });
      try {
        await registry.initExit(listing, { from: applicant });
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
      assert.strictEqual(listingStruct[5].toString(), '0', 'exit time was initialized');
    });

    it('should not initialize an exit by someone who doesn\'t own the listing', async () => {
      const listing = utils.getListingHash('chilling.com');

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);

      try {
        await registry.initExit(listing, { from: challenger });
        assert(false, 'exit initialized when it should have failed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the listing was initialized by someone other than its owner',
      );

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
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'exit succeeded for non-whitelisted listing');

      const listingStruct = await registry.listings.call(listing);
      assert.strictEqual(listingStruct[5].toString(), '0', 'exit time should not have been initialized');
    });
  });
});

