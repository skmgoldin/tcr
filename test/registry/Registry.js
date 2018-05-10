/* eslint-env mocha */
/* global assert contract artifacts */

const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('EIP20.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
// const PLCRVoting = artifacts.require('PLCRVoting.sol');

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));

contract('Registry', () => {
  describe('Function: Registry (constructor)', () => {
    it('should instantiate storage variables with the values in the config file', async () => {
      const registry = await Registry.deployed();
      const token = await Token.deployed();
      const parameterizer = await Parameterizer.deployed();
      const plcrVoting = await PLCRVoting.deployed();

      assert.strictEqual((await registry.token.call()), token.address, 'The token storage ' +
        'variable is improperly initialized');
      assert.strictEqual(
        (await registry.parameterizer.call()), parameterizer.address,
        'The parameterizer storage variable is improperly initialized',
      );
      assert.strictEqual(
        (await registry.voting.call()), plcrVoting.address,
        'The voting storage variable is improperly initialized',
      );
      assert.strictEqual(
        (await registry.name.call()), config.name,
        'The name storage variable is improperly initialized',
      );
    });
  });
});
