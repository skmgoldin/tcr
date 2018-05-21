/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

contract('Registry', (accounts) => {
  describe('Function: exit', () => {
    const [applicant, challenger, voter] = accounts;

    let token;
    let registry;

    before(async () => {
      const { registryProxy, tokenInstance } = await utils.getProxies();
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, false, registry);
    });

    it('should allow a listing to exit when no challenge exists', async () => {
      const listing = utils.getListingHash('consensys.net');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.exit(listing, { from: applicant });

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelistedAfterExit, false, 'the listing was not removed on exit');

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        initialApplicantTokenHoldings.toString(10),
        finalApplicantTokenHoldings.toString(10),
        'the applicant\'s tokens were not returned to them after exiting the registry',
      );
    });

    it('should not allow a listing to exit when a challenge does exist', async () => {
      const listing = utils.getListingHash('consensys.net');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.challenge(listing, '', { from: challenger });
      try {
        await registry.exit(listing, { from: applicant });
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
      assert(
        initialApplicantTokenHoldings.gt(finalApplicantTokenHoldings),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );

      // Clean up state, remove consensys.net (it fails its challenge due to draw)
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);
    });

    it('should not allow a listing to be exited by someone who doesn\'t own it', async () => {
      const listing = utils.getListingHash('consensys.net');

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);

      try {
        await registry.exit(listing, { from: voter });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the listing was exited by someone other than its owner',
      );
    });

    it('should revert if listing is in application stage', async () => {
      const listing = utils.getListingHash('real.net');

      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');

      try {
        await registry.exit(listing, { from: applicant });
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'exit succeeded for non-whitelisted listing');
    });
  });
});

