var Registry = artifacts.require("./Registry.sol");
var Token = artifacts.require("./HumanStandardToken.sol");
var Voting = artifacts.require("./PLCRVoting.sol");

const fs = require("fs");

module.exports = function(deployer) {
    let adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
    let tokenConfig = adchainConfig.TokenArguments;
    let registryConfig = adchainConfig.RegistryDefaults;

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
            Registry,
            Token.address,
            registryConfig.minDeposit,
            registryConfig.minParamDeposit,
            registryConfig.applyStageLength,
            registryConfig.commitPeriodLength,
            registryConfig.revealPeriodLength,
            registryConfig.dispensationPct,
            registryConfig.voteQuorum
        );
    });
};
// module.exports = function(deployer) {
//     deployer.deploy(Token);
//     deployer.deploy(Registry)
// };