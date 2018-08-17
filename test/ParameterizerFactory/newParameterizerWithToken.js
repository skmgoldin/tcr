/* eslint-env mocha */
/* global contract assert artifacts */

const ParameterizerFactory = artifacts.require('./ParameterizerFactory.sol');
const Token = artifacts.require('tokens/eip20/EIP20.sol');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('ParameterizerFactory', (accounts) => {
  describe('Function: newParameterizerWithToken', () => {
    let parameterizerFactory;

    before(async () => {
      parameterizerFactory = await ParameterizerFactory.deployed();
    });

    it('should deploy and initialize a new Parameterizer contract', async () => {
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
      const parameterizerReceipt = await parameterizerFactory.newParameterizerWithToken(
        tokenParams.supply,
        tokenParams.name,
        tokenParams.decimals,
        tokenParams.symbol,
        parameters,
        { from: accounts[0] },
      );
      const { creator, token } = parameterizerReceipt.logs[0].args;

      const tokenInstance = await Token.at(token);
      const actualName = await tokenInstance.name.call();
      assert.strictEqual(actualName, tokenParams.name, 'token.name is incorrect');

      // verify: parameterizer's creator
      assert.strictEqual(creator, accounts[0], 'the creator emitted in the newParameterizer event ' +
        'not correspond to the one which sent the creation transaction');
    });
  });
});
