/* global artifacts */

const Registry = artifacts.require('./Registry.sol');
const Parameterizer = artifacts.require('./Parameterizer.sol');

const fs = require('fs');

module.exports = (deployer) => {
  const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
  const parameterizerConfig = adchainConfig.RegistryDefaults;
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
  )
    .then(() => deployer.deploy(
      Registry,
      tokenAddress,
      Parameterizer.address,
    ));
};
