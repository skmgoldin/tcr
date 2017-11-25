/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const Token = artifacts.require('Token.sol');

const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('./utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: getAllListings', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const incAmount = minDeposit.div(bigTen(2));
    const [applicant, challenger] = accounts;

    it('should add three domains to the whitelist', async () => {
      const registry = await Registry.deployed();

      await utils.addToWhitelist('0', minDeposit, applicant);
      await utils.addToWhitelist('1', minDeposit, applicant);
      await utils.addToWhitelist('2', minDeposit, applicant);

      const listed = await registry.getAllListings.call();

      console.log(listed.toString(10));
    });
  });
});

