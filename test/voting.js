/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const utils = require('./utils.js');

const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

contract('PLCRVoting', (accounts) => {
  describe('Function: commitVote', () => {
    const [applicant, challenger, voter] = accounts;

    it('should correctly update DLL state', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const firstDomain = 'first.net';
      const secondDomain = 'second.net';
      const minDeposit = new BN(paramConfig.minDeposit, 10);

      await utils.as(applicant, registry.apply, firstDomain, minDeposit, '');
      await utils.as(applicant, registry.apply, secondDomain, minDeposit, '');
      const firstPollID = await utils.challengeAndGetPollID(firstDomain, challenger);
      const secondPollID = await utils.challengeAndGetPollID(secondDomain, challenger);
      await utils.commitVote(firstPollID, 1, 7, 420, voter);
      await utils.commitVote(secondPollID, 1, 8, 420, voter);
      await utils.commitVote(firstPollID, 1, 9, 420, voter);
      const insertPoint = await voting.getInsertPointForNumTokens.call(voter, 6);
      const expectedInsertPoint = 0;

      assert.strictEqual(
        insertPoint.toString(10), expectedInsertPoint.toString(10),
        'The insert point was not correct',
      );
    });
  });
});
