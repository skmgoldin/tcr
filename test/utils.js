const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const abi = require('ethereumjs-abi');

const ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'));

const Token = artifacts.require('./HumanStandardToken.sol');
const PLCRVoting = artifacts.require('./PLCRVoting.sol');
const Registry = artifacts.require('./Registry.sol');
const Sale = artifacts.require('historical/Sale.sol');

let registry;
let token;
let applicant;
let challenger;
let voter;

const utils = {
  getVoting: async () => {
    const votingAddr = await registry.voting.call();
    return PLCRVoting.at(votingAddr);
  },
  increaseTime: async (seconds) => {
    return new Promise((resolve, reject) => ethRPC.sendAsync({
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
      })));
  },
  getSecretHash: (vote, salt) => {
    return `0x${abi.soliditySHA3(['uint', 'uint'],
      [vote, salt]).toString('hex')}`;
  },
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

    [applicant, challenger, voter] = accounts.slice(1);

    await buyTokensFor(accounts.slice(1));
    await approveRegistryFor(accounts.slice(1));
    await approvePLCRFor(accounts.slice(1));

    return [registry, token, applicant, challenger, voter]
  }
}

module.exports = utils;