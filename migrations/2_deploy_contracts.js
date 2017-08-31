/* global artifacts */

const Registry = artifacts.require('./Registry.sol');
const Parameterizer = artifacts.require('./Parameterizer.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  const owner = accounts[0];
  const users = accounts.slice(1, 3);

  const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
  const tokenConfig = adchainConfig.TokenArguments;
  const parameterizerConfig = adchainConfig.RegistryDefaults;
  const voteTokenConfig = adchainConfig.VoteTokenDistribution;
  const tokenAddress = adchainConfig.TokenAddress;

  deployer.deploy(
      Parameterizer,
      tokenAddress,
      parameterizerConfig.minDeposit,
      parameterizerConfig.minParamDeposit,
      parameterizerConfig.applyStageLength,
      parameterizerConfig.commitPeriodLength,
      parameterizerConfig.revealPeriodLength,
      parameterizerConfig.dispensationPct,
      parameterizerConfig.voteQuorum,
    ))
    .then(() => deployer.deploy(
      Registry,
      tokenAddress,
      Parameterizer.address,
    ))
};
