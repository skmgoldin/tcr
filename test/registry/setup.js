/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Voting = artifacts.require('PLCRVoting.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const Token = artifacts.require('tokens/eip20/EIP20.sol');

const fs = require('fs');
const utils = require('../utils.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));

contract('Registry', () => {
  describe('Function: setup', () => {
    it('should not allow setup to be invoked once the contract is constructed', async () => {
      const registry = await Registry.deployed();
      const errMsg = 'The contract\'s storage was improperly changed. Investigate:';

      try {
        await registry.setup('0', '0', '0', '0');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());

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

        return;
      }

      assert(false, 'Setup was able to be invoked after construction');
    });
  });
});

