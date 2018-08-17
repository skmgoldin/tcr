/* eslint-env mocha */
/* global assert contract */
const utils = require('../utils');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: get', () => {
    let token;
    let voting;
    let parameterizer;

    before(async () => {
      const { votingProxy, paramProxy, tokenInstance } = await utils.getProxies(token);
      voting = votingProxy;
      parameterizer = paramProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, voting, parameterizer, false);
    });
    it('should get a parameter', async () => {
      const result = await parameterizer.get.call('minDeposit');
      assert.equal(result, paramConfig.minDeposit, 'minDeposit param has wrong value');
    });
  });
});

