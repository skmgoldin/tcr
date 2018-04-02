/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
// const Parameterizer = artifacts.require('Parameterizer.sol');
// const Token = artifacts.require('EIP20.sol');

const fs = require('fs');
// const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('../utils.js');

// const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: determineReward', () => {
    const [applicant, challenger] = accounts;
    it('should revert if the challenge has already been resolved', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('failure.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');
      // Challenge
      const challengeID = await utils.challengeAndGetPollID(listing, challenger);
      // Resolve challenge
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);

      // Try to determine reward
      try {
        await utils.as(challenger, registry.determineReward, challengeID);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'determined reward after challenge already resolved');
    });

    it('should revert if the poll has not ended yet', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('failure.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit, '');
      // Challenge
      const challengeID = await utils.challengeAndGetPollID(listing, challenger);

      try {
        await utils.as(challenger, registry.determineReward, challengeID);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'determined reward before poll has ended');
    });
  });
});

