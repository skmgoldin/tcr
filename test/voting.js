/* eslint-env mocha */
/* global assert contract */
const utils = require('./utils.js');

const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('PLCRVoting', (accounts) => {
  describe('Function: commitVote', () => {
    const [applicant, challenger, voter] = accounts;

    let token;
    let voting;
    let parameterizer;
    let registry;

    before(async () => {
      const {
        votingProxy, paramProxy, registryProxy, tokenInstance,
      } = await utils.getProxies();
      voting = votingProxy;
      parameterizer = paramProxy;
      registry = registryProxy;
      token = tokenInstance;


      await utils.approveProxies(accounts, token, voting, parameterizer, registry);
    });

    it('should correctly update DLL state', async () => {
      const firstDomain = 'first.net';
      const secondDomain = 'second.net';
      const minDeposit = new BN(paramConfig.minDeposit, 10);

      await utils.as(applicant, registry.apply, firstDomain, minDeposit, '');
      await utils.as(applicant, registry.apply, secondDomain, minDeposit, '');
      const firstPollID = await utils.challengeAndGetPollID(firstDomain, challenger, registry);
      const secondPollID = await utils.challengeAndGetPollID(secondDomain, challenger, registry);
      await utils.commitVote(firstPollID, 1, 7, 420, voter, voting);
      await utils.commitVote(secondPollID, 1, 8, 420, voter, voting);
      await utils.commitVote(firstPollID, 1, 9, 420, voter, voting);
      const insertPoint = await voting.getInsertPointForNumTokens.call(voter, 6, firstPollID);
      const expectedInsertPoint = 0;

      assert.strictEqual(
        insertPoint.toString(10), expectedInsertPoint.toString(10),
        'The insert point was not correct',
      );
    });
  });
});
