/* eslint-env mocha */
/* global artifacts assert contract */
const Parameterizer = artifacts.require('./Parameterizer.sol');

const fs = require('fs');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('Parameterizer', (accounts) => {
  describe('Function: challengeCanBeResolved', () => {
    const [proposer, challenger] = accounts;

    it('should true if a challenge is ready to be resolved', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer);

      await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      await utils.increaseTime(paramConfig.pCommitStageLength);
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      const result = await parameterizer.challengeCanBeResolved(propID);
      assert.strictEqual(result, true, 'should have been true cause enough time has passed');
    });

    it('should false if a challenge is not ready to be resolved', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '59', proposer);

      await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      await utils.increaseTime(paramConfig.pCommitStageLength);

      const result = await parameterizer.challengeCanBeResolved(propID);
      assert.strictEqual(result, false, 'should have been false because not enough time has passed');
    });
  });
});

