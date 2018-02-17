/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Voting = artifacts.require('PLCRVoting.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const Token = artifacts.require('tokens/eip20/EIP20.sol');

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));

contract('Registry', () => {
  describe('Function: Registry', () => {
    it('should instantiate the contract\'s storage correctly', async () => {
      const registry = await Registry.deployed();
      const errMsg = 'The contract\'s storage was not instantiated properly. Investigate:';

      // Get stored values
      const storedToken = await registry.token.call();
      const storedVoting = await registry.voting.call();
      const storedParameterizer = await registry.parameterizer.call();
      const storedName = await registry.name.call();

      // Check whether stored values are sane
      assert.strictEqual(storedToken, (await Token.deployed()).address, `${errMsg} token.`);
      assert.strictEqual(storedVoting, (await Voting.deployed()).address, `${errMsg} voting.`);
      assert.strictEqual(
        storedParameterizer, (await Parameterizer.deployed()).address,
        `${errMsg} parameterizer.`,
      );
      assert.strictEqual(storedName, config.name, `${errMsg} name.`);
    });
  });
});

