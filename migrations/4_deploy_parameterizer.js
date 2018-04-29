/* global artifacts */

const Token = artifacts.require('EIP20.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');

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
    let tokenAddress = config.token.address;

    if (config.token.deployToken) {
      tokenAddress = Token.address;
    }

    return deployer.deploy(
      Parameterizer,
      tokenAddress,
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
      if (network === 'development' || network === 'test' || network === 'coverage') {
        await approveParameterizerFor(accounts);
      }
    }).catch((err) => { throw err; });
};
