/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: canBeSet', () => {
    const [proposer] = accounts;

    let token;
    let parameterizer;

    before(async () => {
      const { paramProxy, tokenInstance } = await utils.getProxies();
      parameterizer = paramProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, parameterizer, false);
    });

    it('should true if a proposal passed its application stage with no challenge', async () => {
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer, parameterizer);

      await utils.increaseTime(paramConfig.pCommitStageLength + 1);
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      const result = await parameterizer.canBeSet(propID);
      assert.strictEqual(result, true, 'should have returned true because enough time has passed');
    });

    it('should false if a proposal did not pass its application stage with no challenge', async () => {
      const propID = await utils.proposeReparamAndGetPropID('dispensationPct', '58', proposer, parameterizer);

      const betterBeFalse = await parameterizer.canBeSet(propID);
      assert.strictEqual(betterBeFalse, false, 'should have returned false because not enough time has passed');

      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      const result = await parameterizer.canBeSet(propID);
      assert.strictEqual(result, true, 'should have been able to set because commit period is done');
    });
  });
});

