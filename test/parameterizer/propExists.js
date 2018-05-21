/* eslint-env mocha */
/* global assert contract */
const utils = require('../utils');

contract('Parameterizer', (accounts) => {
  describe('Function: propExists', () => {
    const [proposer] = accounts;

    let token;
    let parameterizer;

    before(async () => {
      const { paramProxy, tokenInstance } = await utils.getProxies();
      parameterizer = paramProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, parameterizer, false);
    });

    it('should true if a proposal exists for the provided propID', async () => {
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer, parameterizer);
      const result = await parameterizer.propExists(propID);
      assert.strictEqual(result, true, 'should have been true cause I literally just made the proposal');
    });

    it('should false if no proposal exists for the provided propID', async () => {
      const result = await parameterizer.propExists('666');
      assert.strictEqual(result, false, 'should have been false cause i just made it up!');
    });
  });
});

