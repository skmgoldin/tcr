/* global artifacts */

const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('Token.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const Sale = artifacts.require('historical/Sale.sol');
const DLL = artifacts.require('DLL.sol');
const Challenge = artifacts.require('Challenge.sol');
const AttributeStore = artifacts.require('AttributeStore.sol');
const PLCRVoting = artifacts.require('PLCRVoting.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  async function setupForTests(tokenAddress) {
    async function buyTokensFor(addresses) {
      const sale = await Sale.deployed();
      const user = addresses[0];
      await sale.purchaseTokens({ from: user, value: '1000000000000000000' });
      if (addresses.length === 1) { return true; }
      return buyTokensFor(addresses.slice(1));
    }

    async function approveRegistryFor(addresses) {
      const token = Token.at(tokenAddress);
      const user = addresses[0];
      const balanceOfUser = await token.balanceOf(user);
      await token.approve(Registry.address, balanceOfUser, { from: user });
      if (addresses.length === 1) { return true; }
      return approveRegistryFor(addresses.slice(1));
    }

    async function approveParameterizerFor(addresses) {
      const token = Token.at(tokenAddress);
      const user = addresses[0];
      const balanceOfUser = await token.balanceOf(user);
      await token.approve(Parameterizer.address, balanceOfUser, { from: user });
      if (addresses.length === 1) { return true; }
      return approveParameterizerFor(addresses.slice(1));
    }

    async function approvePLCRFor(addresses) {
      const token = Token.at(tokenAddress);
      const registry = await Registry.deployed();
      const user = addresses[0];
      const balanceOfUser = await token.balanceOf(user);
      const plcrAddr = await registry.voting.call();
      await token.approve(plcrAddr, balanceOfUser, { from: user });
      if (addresses.length === 1) { return true; }
      return approvePLCRFor(addresses.slice(1));
    }

    await buyTokensFor(accounts);
    await approveRegistryFor(accounts);
    await approveParameterizerFor(accounts);
    await approvePLCRFor(accounts);
  }

  const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
  const parameterizerConfig = adchainConfig.paramDefaults;
  let tokenAddress = adchainConfig.TokenAddress;

  deployer.deploy(DLL);
  deployer.deploy(AttributeStore);
  deployer.deploy(Challenge);

  deployer.link(DLL, PLCRVoting);
  deployer.link(AttributeStore, PLCRVoting);

  deployer.link(DLL, Parameterizer);
  deployer.link(AttributeStore, Parameterizer);
  deployer.link(Challenge, Parameterizer);

  deployer.link(DLL, Registry);
  deployer.link(AttributeStore, Registry);
  deployer.link(Challenge, Registry);

  return deployer.then(async () => {
    if (network !== 'mainnet') {
      const sale = await Sale.deployed();
      tokenAddress = await sale.token.call();
    }
    return deployer.deploy(PLCRVoting,
      tokenAddress,
    );
  })
    .then(() =>
      deployer.deploy(Parameterizer,
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
      )
        .then(() =>
          deployer.deploy(Registry,
            tokenAddress,
            PLCRVoting.address,
            Parameterizer.address,
          ),
        )
        .then(async () => {
          if (network === 'development') {
            await setupForTests(tokenAddress);
          }
        }).catch((err) => { throw err; }),
    );
};
