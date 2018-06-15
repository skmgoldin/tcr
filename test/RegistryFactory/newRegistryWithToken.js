/* eslint-env mocha */
/* global contract assert artifacts */

const EIP20 = artifacts.require('tokens/eip20/EIP20.sol');
const RegistryFactory = artifacts.require('./RegistryFactory.sol');
const Registry = artifacts.require('./Registry.sol');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('RegistryFactory', (accounts) => {
  describe('Function: newRegistryWithToken', () => {
    let registryFactory;

    before(async () => {
      registryFactory = await RegistryFactory.deployed();
    });

    it('should deploy and initialize a new Registry contract', async () => {
      const tokenParams = {
        supply: '1000',
        name: 'TEST',
        decimals: '2',
        symbol: 'TST',
      };

      // new parameterizer using factory/proxy
      const parameters = [
        paramConfig.minDeposit,
        paramConfig.pMinDeposit,
        paramConfig.applyStageLength,
        paramConfig.pApplyStageLength,
        paramConfig.commitStageLength,
        paramConfig.pCommitStageLength,
        paramConfig.revealStageLength,
        paramConfig.pRevealStageLength,
        paramConfig.dispensationPct,
        paramConfig.pDispensationPct,
        paramConfig.voteQuorum,
        paramConfig.pVoteQuorum,
      ];

      // new registry using factory/proxy
      const registryReceipt = await registryFactory.newRegistryWithToken(
        tokenParams.supply,
        tokenParams.name,
        tokenParams.decimals,
        tokenParams.symbol,
        parameters,
        'NEW TCR',
        { from: accounts[0] },
      );
      const { creator } = registryReceipt.logs[0].args;
      const registry = Registry.at(registryReceipt.logs[0].args.registry);

      // verify: registry's token
      const registryToken = EIP20.at(await registry.token.call());
      const tokenName = await registryToken.name.call();
      assert.strictEqual(
        tokenName,
        tokenParams.name,
        'the token attached to the Registry contract does not correspond to the one emitted in the newRegistry event',
      );
      // verify: registry's name
      const registryName = await registry.name.call();
      assert.strictEqual(
        registryName,
        'NEW TCR',
        'the registry\'s name is incorrect',
      );
      // verify: registry's creator
      assert.strictEqual(creator, accounts[0], 'the creator emitted in the newRegistry event ' +
        'not correspond to the one which sent the creation transaction');
    });
  });
});
