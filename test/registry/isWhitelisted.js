/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

contract('Registry', (accounts) => {
  describe('Function: isWhitelisted', () => {
    const [applicant] = accounts;

    let token;
    let registry;

    before(async () => {
      const { registryProxy, tokenInstance } = await utils.getProxies();
      registry = registryProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, false, registry);
    });

    it('should verify a listing is not in the whitelist', async () => {
      const listing = utils.getListingHash('eth.eth'); // the listing to be tested
      const result = await registry.isWhitelisted.call(listing);
      assert.strictEqual(result, false, 'Listing should not be whitelisted');
    });

    it('should verify a listing is in the whitelist', async () => {
      const listing = utils.getListingHash('eth.eth');
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant, registry);
      const result = await registry.isWhitelisted.call(listing);
      assert.strictEqual(result, true, 'Listing should have been whitelisted');
    });
  });
});

