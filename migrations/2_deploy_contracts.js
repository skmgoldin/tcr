/* global artifacts */

const Registry = artifacts.require('./Registry.sol');
const Token = artifacts.require('./HumanStandardToken.sol');
const PLCRVoting = artifacts.require('./PLCRVoting.sol');
const Parameterizer = artifacts.require('./Parameterizer.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  const owner = accounts[0];
  const users = accounts.slice(1, 3);

  const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
  const tokenConfig = adchainConfig.TokenArguments;
  const parameterizerConfig = adchainConfig.RegistryDefaults;
  const voteTokenConfig = adchainConfig.VoteTokenDistribution;

  deployer.deploy(
    Token,
    tokenConfig.totalSupply,
    tokenConfig.name,
    tokenConfig.decimalUnits,
    tokenConfig.symbol
  )
    .then(() => deployer.deploy(
      Parameterizer,
      Token.address,
      parameterizerConfig.minDeposit,
      parameterizerConfig.minParamDeposit,
      parameterizerConfig.applyStageLength,
      parameterizerConfig.commitPeriodLength,
      parameterizerConfig.revealPeriodLength,
      parameterizerConfig.dispensationPct,
      parameterizerConfig.voteQuorum
    ))
    .then(() => deployer.deploy(
      Registry,
      Token.address,
      Parameterizer.address
    ))
    .then(async () => {
      const token = await Token.deployed();

      const registry = await Registry.deployed();
      const votingAddr = await registry.voting.call();
      const voting = await PLCRVoting.at(votingAddr);

      const param = await Parameterizer.deployed();
      const votingParamAddr = await param.voting.call();
      const votingParam = await PLCRVoting.at(votingParamAddr);

      console.log('  Distributing tokens to users...');

      return Promise.all(
        users.map(async (user, idx) => {
          const tokenAmt = voteTokenConfig.userAmounts[idx];
          if (tokenAmt !== 0) {
            // distribute adtoken from owner to users
            await token.transfer(user, 3 * tokenAmt, { from: owner });
            // allow each instance of PLCRvoting an allotment of user's adtoken
            await token.approve(votingAddr, tokenAmt, { from: user });
            await token.approve(votingParamAddr, tokenAmt, { from: user });
            // exchange user's adtoken for voting rights in each instance of PLCRvoting
            await voting.requestVotingRights(tokenAmt, { from: user });
            await votingParam.requestVotingRights(tokenAmt, { from: user });
            // allow Registry and Parameterizer to take deposits
            await token.approve(Registry.address, tokenAmt, { from: user });
            await token.approve(Parameterizer.address, tokenAmt, { from: user });
          }
        })
      );
    });
};
