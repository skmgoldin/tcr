/* global artifacts */

const Token = artifacts.require('tokens/eip20/EIP20.sol');

const BN = require('bignumber.js');
const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  const totalSupply = new BN('1000000000000000000000000', 10);
  const decimals = '18';
  const config = JSON.parse(fs.readFileSync('./conf/config.json'));

  async function giveTokensTo(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    let allocation;
    if (network === 'test') {
      allocation = totalSupply.div(new BN(accounts.length, 10));
    } else {
      allocation = totalSupply.div(new BN(config.testnets[network].tokenHolders.length, 10));
    }

    console.log('Allocating ' +
    `${allocation.toString(10).slice(0, allocation.toString(10).length - 18)}` +
    ' TEST tokens to: ', user);
    await token.transfer(user, allocation);

    if (addresses.length === 1) { return true; }
    return giveTokensTo(addresses.slice(1));
  }

  if (network !== 'mainnet') {
    deployer.deploy(Token, totalSupply, 'TestCoin', decimals, 'TEST')
      .then(() => {
        if (network === 'test') {
          return giveTokensTo(accounts);
        }
        return giveTokensTo(config.testnets[network].tokenHolders);
      });
    return;
  }
  console.log('skipping optional deploy of test-only contracts.');
};
