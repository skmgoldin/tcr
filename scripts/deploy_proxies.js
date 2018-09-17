/* global artifacts web3 */
const fs = require('fs');
const BN = require('bignumber.js');

const RegistryFactory = artifacts.require('RegistryFactory.sol');
const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('EIP20.sol');

const config = JSON.parse(fs.readFileSync('../conf/config.json'));
const paramConfig = config.paramDefaults;

module.exports = (done) => {
  async function deployProxies(networkID) {
    let registryFactoryAddress;
    if (networkID === '1') {
      registryFactoryAddress = '0xcc0df91b86795f21c3d43dbeb3ede0dfcf8dccaf'; // mainnet
    } else if (networkID === '4') {
      registryFactoryAddress = '0x2bddfc0c506a00ea3a6ccea5fbbda8843377dcb1'; // rinkeby
    } else {
      registryFactoryAddress = RegistryFactory.address; // development
    }

    /* eslint-disable no-console */
    console.log('Using RegistryFactory at:');
    console.log(`     ${registryFactoryAddress}`);
    console.log('');
    console.log('Deploying proxy contracts...');
    console.log('...');
    /* eslint-enable no-console */

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
        paramConfig.exitTimeDelay,
        paramConfig.exitPeriodLen,
      ],
      config.name,
    );

    const {
      token,
      plcr,
      parameterizer,
      registry,
    } = registryReceipt.logs[0].args;

    const registryProxy = await Registry.at(registry);
    const tokenProxy = await Token.at(token);
    const registryName = await registryProxy.name.call();

    /* eslint-disable no-console */
    console.log(`Proxy contracts successfully migrated to network_id: ${networkID}`);
    console.log('');
    console.log(`${config.token.name} (EIP20):`);
    console.log(`     ${token}`);
    console.log('PLCRVoting:');
    console.log(`     ${plcr}`);
    console.log('Parameterizer:');
    console.log(`     ${parameterizer}`);
    console.log(`${registryName} (Registry):`);
    console.log(`     ${registry}`);
    console.log('');

    const evenTokenDispensation =
      new BN(config.token.supply).div(config.token.tokenHolders.length).toString();
    console.log(`Dispensing ${config.token.supply} tokens evenly to ${config.token.tokenHolders.length} addresses:`);
    console.log('');

    await Promise.all(config.token.tokenHolders.map(async (account) => {
      console.log(`Transferring tokens to address: ${account}`);
      return tokenProxy.transfer(account, evenTokenDispensation);
    }));
    /* eslint-enable no-console */

    return true;
  }

  // web3 requires callback syntax. silly!
  web3.version.getNetwork((err, network) => {
    if (err) {
      return done(err); // truffle exec exits if an error gets returned
    }
    return deployProxies(network).then(() => done());
  });
};
