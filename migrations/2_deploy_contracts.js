var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol");
var PLCRVoting = artifacts.require("./PLCRVoting.sol");
var Parameterizer = artifacts.require("./Parameterizer.sol");

const fs = require("fs");

module.exports = (deployer, network, accounts) => {
    const owner = accounts[0];
    const users = accounts.slice(1, 10);

    let adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
    let tokenConfig = adchainConfig.TokenArguments;
    let parameterizerConfig = adchainConfig.RegistryDefaults;
    let voteTokenConfig = adchainConfig.VoteTokenDistribution;

    deployer.deploy(
        Token,
        tokenConfig.totalSupply,
        tokenConfig.name,
        tokenConfig.decimalUnits,
        tokenConfig.symbol
    )
    .then(() => {
        return deployer.deploy(
            Registry,
            Token.address,
            parameterizerConfig.minDeposit,
            parameterizerConfig.minParamDeposit,
            parameterizerConfig.applyStageLength,
            parameterizerConfig.commitPeriodLength,
            parameterizerConfig.revealPeriodLength,
            parameterizerConfig.dispensationPct,
            parameterizerConfig.voteQuorum
        );
    })
    .then(async () => {
        let token = await Token.deployed();
        let registry = await Registry.deployed();
        let votingAddr = await registry.voting.call();
        let voting = await PLCRVoting.at(votingAddr);
        let paramAddr = await registry.parameterizer.call();

        console.log("  Distributing tokens to users...");

        return await Promise.all(
            users.map(async (user, idx) => {
                let tokenAmt = voteTokenConfig.userAmounts[idx];
                if (tokenAmt != 0) {
                    await token.transfer(user, 3 * tokenAmt, {from: owner}) 
                    await token.approve(votingAddr, tokenAmt, {from: user})
                    await voting.requestVotingRights(tokenAmt, {from: user})
                    await token.approve(Registry.address, tokenAmt, {from: user})
                    await token.approve(paramAddr, tokenAmt, {from: user})
                }
            })
        );
    });
};