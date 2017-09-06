/* eslint-env mocha */
/* global artifacts */

const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const abi = require('ethereumjs-abi');
const fs = require('fs');

const ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'));

const Token = artifacts.require('./HumanStandardToken.sol');
const PLCRVoting = artifacts.require('./PLCRVoting.sol');
const Registry = artifacts.require('./Registry.sol');
const Sale = artifacts.require('historical/Sale.sol');

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.RegistryDefaults;

let registry;
let token;

const utils = {
  getVoting: async () => {
    const votingAddr = await registry.voting.call();
    return PLCRVoting.at(votingAddr);
  },
  increaseTime: async seconds =>
    new Promise((resolve, reject) => ethRPC.sendAsync({
      method: 'evm_increaseTime',
      params: [seconds],
    }, (err) => {
      if (err) reject(err);
      resolve();
    }))
      .then(() => new Promise((resolve, reject) => ethRPC.sendAsync({
        method: 'evm_mine',
        params: [],
      }, (err) => {
        if (err) reject(err);
        resolve();
      }))),
  getVoteSaltHash: (vote, salt) => (
    `0x${abi.soliditySHA3(['uint', 'uint'], [vote, salt]).toString('hex')}`
  ),
  getDomainHash: domain => (
    `0x${abi.soliditySHA3(['string'], [domain]).toString('hex')}`
  ),
  buyTokens: async (address, etherAmount) => {
    const sale = await Sale.deployed();
    await sale.purchaseTokens({ from: address, value: etherAmount });
  },
  approvePLCR: async (address, adtAmount) => {
    const plcrAddr = await registry.voting.call();
    await token.approve(plcrAddr, adtAmount, { from: address });
  },
  setupForTests: async (accounts) => {
    async function buyTokensFor(addresses) {
      await utils.buyTokens(addresses[0], '1000000000000000000');
      if (addresses.length === 1) { return true; }
      return buyTokensFor(addresses.slice(1));
    }

    async function approveRegistryFor(addresses) {
      const user = addresses[0];
      const balanceOfUser = await token.balanceOf(user);
      await token.approve(registry.address, balanceOfUser, { from: user });
      if (addresses.length === 1) { return true; }
      return approveRegistryFor(addresses.slice(1));
    }

    async function approvePLCRFor(addresses) {
      const user = addresses[0];
      const balanceOfUser = await token.balanceOf(user);
      await utils.approvePLCR(user, balanceOfUser);
      if (addresses.length === 1) { return true; }
      return approvePLCRFor(addresses.slice(1));
    }
    registry = await Registry.deployed();
    token = Token.at(await registry.token.call());

    const [applicant, challenger, voter] = accounts.slice(1);

    await buyTokensFor(accounts.slice(1));
    await approveRegistryFor(accounts.slice(1));
    await approvePLCRFor(accounts.slice(1));

    return [registry, token, applicant, challenger, voter];
  },
  addToWhitelist: async (domain, deposit, actor) => {
    await utils.as(actor, registry.apply, domain, deposit);
    await utils.increaseTime(paramConfig.applyStageLength + 1);
    await utils.as(actor, registry.updateStatus, domain);
  },
  as: (actor, fn, ...args) => {
    function detectSendObject(potentialSendObj) {
      function hasOwnProperty(obj, prop) {
        const proto = obj.constructor.prototype;
        return (prop in obj) &&
          (!(prop in proto) || proto[prop] !== obj[prop]);
      }
      if (typeof potentialSendObj !== 'object') { return undefined; }
      if (
        hasOwnProperty(potentialSendObj, 'from') ||
        hasOwnProperty(potentialSendObj, 'to') ||
        hasOwnProperty(potentialSendObj, 'gas') ||
        hasOwnProperty(potentialSendObj, 'gasPrice') ||
        hasOwnProperty(potentialSendObj, 'value')
      ) {
        throw new Error('It is unsafe to use "as" with custom send objects');
      }
      return undefined;
    }
    detectSendObject(args[args.length - 1]);
    const sendObject = { from: actor };
    return fn(...args, sendObject);
  },
  isEVMException: err => (
    err.toString().includes('invalid opcode')
  ),
};

module.exports = utils;
