var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol");
var Voting = artifacts.require("./PLCRVoting.sol");
var Parameterizer = artifacts.require("./Parameterizer.sol");

const fs = require("fs");

module.exports = function(deployer) {
    let adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
    let tokenConfig = adchainConfig.TokenArguments;
    let parameterizerConfig = adchainConfig.RegistryDefaults;

    // console.log("token", tokenConfig);
    // console.log("registry", registryConfig);

    deployer.deploy(
        Token,
        tokenConfig.totalSupply,
        tokenConfig.name,
        tokenConfig.decimalUnits,
        tokenConfig.symbol
    ).then(() => {
        return deployer.deploy(
            Voting,
            Token.address
        );
    })
    .then(() => {
        return deployer.deploy(
            Parameterizer,
            Token.address,
            Voting.address,
            parameterizerConfig.minDeposit,
            parameterizerConfig.minParamDeposit,
            parameterizerConfig.applyStageLength,
            parameterizerConfig.commitPeriodLength,
            parameterizerConfig.revealPeriodLength,
            parameterizerConfig.dispensationPct,
            parameterizerConfig.voteQuorum
        );
    })
    .then(() => {
        return deployer.deploy(
            Registry,
            Token.address,
            Parameterizer.address,
            Voting.address
        );
    });
};
// module.exports = function(deployer) {
//     deployer.deploy(Token);
//     deployer.deploy(Registry)
// };