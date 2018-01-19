/* global artifacts */

const Token = artifacts.require('EIP20.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRVoting = artifacts.require('PLCRVoting.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  async function approvePLCRFor(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    const balanceOfUser = await token.balanceOf(user);
    await token.approve(PLCRVoting.address, balanceOfUser, { from: user });
    if (addresses.length === 1) { return true; }
    return approvePLCRFor(addresses.slice(1));
  }

  deployer.link(DLL, PLCRVoting);
  deployer.link(AttributeStore, PLCRVoting);

  return deployer.then(async () => {
    const config = JSON.parse(fs.readFileSync('./conf/config.json'));
    let tokenAddress = config.TokenAddress;

    if (network !== 'mainnet') {
      tokenAddress = Token.address;
    }

    return deployer.deploy(
      PLCRVoting,
      tokenAddress,
    );
  })
    .then(async () => {
      if (network === 'test') {
        await approvePLCRFor(accounts);
      }
    }).catch((err) => { throw err; });
};
