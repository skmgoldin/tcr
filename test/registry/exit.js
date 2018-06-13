/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('EIP20.sol');

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

contract('Registry', (accounts) => {
  describe('Function: exit', () => {
    const [applicant, challenger, voter] = accounts;

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
      assert(
        initialApplicantTokenHoldings.gt(finalApplicantTokenHoldings),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );
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
      assert(
        initialApplicantTokenHoldings.gt(finalApplicantTokenHoldings),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );
    });

    it('should not allow a listing to exit when a challenge does exist', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('420.com');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.challenge(listing, '', { from: challenger });
      try {
        await registry.initExit(listing, { from: applicant });
        await utils.increaseTime(paramConfig.exitTimeDelay + 1);
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
      assert(
        initialApplicantTokenHoldings.gt(finalApplicantTokenHoldings),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );

      // Clean up state, remove consensys.net (it fails its challenge due to draw)
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);
    });

    it('should not initialize an exit by someone who doesn\'t own the listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('chilling.com');

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      try {
        await registry.initExit(listing, { from: voter });
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
    });

    it('should not finalize an exit by someone who doesn\'t own the listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('helpme.com');

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);
      await registry.initExit(listing, { from: applicant });
      await utils.increaseTime(paramConfig.exitTimeDelay + 1);
      try {
        await registry.finalizeExit(listing, { from: voter });
        assert(false, 'exit finalized when it should have failed');
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
    });

    it('should revert if listing is in application stage', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('nogoodnames.com');

      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');

      try {
        await registry.initExit(listing, { from: applicant });
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'exit succeeded for non-whitelisted listing');
    });
  });
});

