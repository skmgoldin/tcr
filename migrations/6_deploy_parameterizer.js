/* global artifacts */

const Token = artifacts.require('EIP20.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRVoting = artifacts.require('PLCRVoting.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  async function approveParameterizerFor(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    const balanceOfUser = await token.balanceOf(user);
    await token.approve(Parameterizer.address, balanceOfUser, { from: user });
    if (addresses.length === 1) { return true; }
    return approveParameterizerFor(addresses.slice(1));
  }

  deployer.link(DLL, Parameterizer);
  deployer.link(AttributeStore, Parameterizer);

  return deployer.then(async () => {
    const config = JSON.parse(fs.readFileSync('./conf/config.json'));
    const parameterizerConfig = config.paramDefaults;
    let tokenAddress = config.TokenAddress;

    if (network !== 'mainnet') {
      tokenAddress = Token.address;
    }

    return deployer.deploy(
      Parameterizer,
      tokenAddress,
      PLCRVoting.address,
      parameterizerConfig.minDeposit,
      parameterizerConfig.pMinDeposit,
      parameterizerConfig.applyStageLength,
      parameterizerConfig.pApplyStageLength,
      parameterizerConfig.commitStageLength,
      parameterizerConfig.pCommitStageLength,
      parameterizerConfig.revealStageLength,
      parameterizerConfig.pRevealStageLength,
      parameterizerConfig.dispensationPct,
      parameterizerConfig.pDispensationPct,
      parameterizerConfig.voteQuorum,
      parameterizerConfig.pVoteQuorum,
    );
  })
    .then(async () => {
      if (network === 'test') {
        await approveParameterizerFor(accounts);
      }
    }).catch((err) => { throw err; });
};
