/* eslint-env mocha */
/* global contract assert artifacts */

const EIP20 = artifacts.require('tokens/eip20/EIP20.sol');
const PLCRFactory = artifacts.require('./PLCRFactory.sol');
const PLCRVoting = artifacts.require('./PLCRVoting.sol');
const ParameterizerFactory = artifacts.require('./ParameterizerFactory.sol');
const Parameterizer = artifacts.require('./Parameterizer.sol');
const RegistryFactory = artifacts.require('./RegistryFactory.sol');
const Registry = artifacts.require('./Registry.sol');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('RegistryFactory', (accounts) => {
  describe('Function: newRegistryBYOTokenAndFriends', () => {
    let registryFactory;
    let parameterizerFactory;
    let plcrFactory;

    before(async () => {
      plcrFactory = await PLCRFactory.deployed();
      parameterizerFactory = await ParameterizerFactory.deployed();
      registryFactory = await RegistryFactory.deployed();
    });

    it('should deploy and initialize a new Registry contract', async () => {
      const tokenParams = {
        supply: '1000',
        name: 'TEST',
        decimals: '2',
        symbol: 'TST',
      };
      // new EIP20 token
      const token = await EIP20.new(
        tokenParams.supply,
        tokenParams.name,
        tokenParams.decimals,
        tokenParams.symbol,
      );
      // new plcr using factory/proxy
      const plcrReceipt = await plcrFactory.newPLCRBYOToken(token.address);
      const plcr = PLCRVoting.at(plcrReceipt.logs[0].args.plcr);

      // verify: plcr's token is the one we deployed earlier
      const plcrToken = await plcr.token.call();
      assert.strictEqual(
        plcrToken,
        token.address,
        'the token connected to plcr is incorrect',
      );

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
      const parameterizerReceipt = await parameterizerFactory
        .newParameterizerBYOTokenAndPLCR(token.address, plcr.address, parameters);
      const parameterizer = Parameterizer.at(parameterizerReceipt.logs[0].args.parameterizer);

      // verify: parameterizer's token
      const parameterizerToken = await parameterizer.token.call();
      assert.strictEqual(
        parameterizerToken,
        token.address,
        'the token connected to parameterizer is incorrect',
      );

      // new registry using factory/proxy
      const registryReceipt = await registryFactory.newRegistryBYOTokenAndFriends(
        token.address,
        plcr.address,
        parameterizer.address,
        'NEW TCR',
      );
      const { creator } = registryReceipt.logs[0].args;
      const registry = Registry.at(registryReceipt.logs[0].args.registry);

      // verify: registry's token
      const registryToken = await registry.token.call();
      assert.strictEqual(
        registryToken,
        token.address,
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
      // verify: registry's plcr
      const registryPLCR = await registry.voting.call();
      assert.strictEqual(
        registryPLCR,
        plcr.address,
        'the registry\'s plcr is incorrect',
      );
    });
  });
});
