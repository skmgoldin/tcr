/* global artifacts */

const Token = artifacts.require('EIP20.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRVotingChallengeFactory = artifacts.require('PLCRVotingChallengeFactory.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  /* async function approvePLCRFor(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    const balanceOfUser = await token.balanceOf.call(user);
    await token.approve(PLCRVoting.address, balanceOfUser, { from: user });
    if (addresses.length === 1) { return true; }
    return approvePLCRFor(addresses.slice(1));
  } */

  deployer.link(DLL, PLCRVotingChallengeFactory);
  deployer.link(AttributeStore, PLCRVotingChallengeFactory);

  return deployer.then(async () => {
    const config = JSON.parse(fs.readFileSync('./conf/config.json'));
    let tokenAddress = config.token.address;

    if (config.token.deployToken) {
      tokenAddress = Token.address;
    }

    return deployer.deploy(
      PLCRVotingChallengeFactory,
      tokenAddress,
    )
  })
    .then(async () => {
      /* if (network === 'test' || network === 'coverage') {
        await approvePLCRFor(accounts);
      } */
    }).catch((err) => { throw err; });
};
