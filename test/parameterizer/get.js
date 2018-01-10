/* eslint-env mocha */
/* global artifacts assert contract */
const Parameterizer = artifacts.require('./Parameterizer.sol');

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', () => {
  describe('Function: get', () => {
    it('should get a parameter', async () => {
      const param = await Parameterizer.deployed();
      const result = await param.get.call('minDeposit');
      assert.equal(result, paramConfig.minDeposit, 'minDeposit param has wrong value');
    });
  });
});

