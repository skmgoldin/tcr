/* global artifacts network */
const fs = require('fs');

const RegistryFactory = artifacts.require('RegistryFactory.sol');

const config = JSON.parse(fs.readFileSync('../conf/config.json'));
const paramConfig = config.paramDefaults;

module.exports = (done) => {
  async function deployProxies(networkID) {
    const registryFactoryAddress = (
      networkID === '1' ? '0xcc0df91b86795f21c3d43dbeb3ede0dfcf8dccaf' // mainnet
      : networkID === '4' ? '0x822415a1e4d0d7f99425d794a817d9b823bdcd0c' // rinkeby
      : RegistryFactory.address // development
    );

    console.log(`RegistryFactory:   ${registryFactoryAddress}`);
    console.log('');
    console.log('Deploying proxy contracts...');

    const registryFactory = await RegistryFactory.at(registryFactoryAddress);
    const registryReceipt = await registryFactory.newRegistryWithToken(
      config.token.supply,
      config.token.name,
      config.token.decimals,
      config.token.symbol,
      [
        paramConfig.minDeposit,
        paramConfig.pMinDeposit,
        paramConfig.applyStageLength,
        paramConfig.pApplyStageLength,
        paramConfig.commitStageLength,
        paramConfig.pCommitStageLength,
        paramConfig.revealStageLength,
        paramConfig.pRevealStageLength,
        paramConfig.dispensationPct,
        paramConfig.pDispensationPct,
        paramConfig.voteQuorum,
        paramConfig.pVoteQuorum,
      ],
      config.name,
    );

    const {
      token,
      plcr,
      parameterizer,
      registry,
    } = registryReceipt.logs[0].args;

    console.log('');
    console.log(`Proxy contracts successfully migrated to network_id: ${networkID}`)
    console.log('');
    console.log(`${config.token.name}:          ${token}`);
    console.log(`PLCRVoting:        ${plcr}`);
    console.log(`Parameterizer:     ${parameterizer}`);
    console.log(`Registry:          ${registry}`);
    console.log('');

    return true;
  }

  // web3 requires callback syntax. silly!
  web3.version.getNetwork((err, network) => {
    if (err) {
      return done(err); // truffle exec exits if an error gets returned
    }
    return deployProxies(network).then(() => done());
  });
}
