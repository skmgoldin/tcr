/* eslint-env mocha */
/* global artifacts assert contract */
const Parameterizer = artifacts.require('./Parameterizer.sol');

const utils = require('../utils');

contract('Parameterizer', (accounts) => {
  describe('Function: propExists', () => {
    const [proposer] = accounts;

    it('should true if a proposal exists for the provided propID', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer);
      const result = await parameterizer.propExists(propID);
      assert.strictEqual(result, true, 'should have been true cause I literally just made the proposal');
    });

    it('should false if no proposal exists for the provided propID', async () => {
      const parameterizer = await Parameterizer.deployed();
      const result = await parameterizer.propExists('666');
      assert.strictEqual(result, false, 'should have been false cause i just made it up!');
    });
  });
});

