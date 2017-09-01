/* global artifacts */

const Registry = artifacts.require('Registry.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const Sale = artifacts.require('historical/Sale.sol');

const fs = require('fs');

module.exports = (deployer, network) => {
  const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
  const parameterizerConfig = adchainConfig.RegistryDefaults;
  let tokenAddress = adchainConfig.TokenAddress;

  return deployer.then(async () => {
    if (network === 'development') {
      const sale = await Sale.deployed();
      tokenAddress = await sale.token.call();
    }
    return deployer.deploy(Parameterizer,
      tokenAddress,
      parameterizerConfig.minDeposit,
      parameterizerConfig.minParamDeposit,
      parameterizerConfig.applyStageLength,
      parameterizerConfig.commitPeriodLength,
      parameterizerConfig.revealPeriodLength,
      parameterizerConfig.dispensationPct,
      parameterizerConfig.voteQuorum,
    );
  })
    .then(() =>
      deployer.deploy(Registry,
        tokenAddress,
        Parameterizer.address,
      ),
    ).catch((err) => { throw err; });
};
