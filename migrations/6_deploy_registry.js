/* global artifacts */

const Token = artifacts.require('tokens/eip20/EIP20.sol')
const Registry = artifacts.require('Registry.sol')
const Parameterizer = artifacts.require('Parameterizer.sol')
const FutarchyChallengeFactory = artifacts.require('FutarchyChallengeFactory.sol')

module.exports = (deployer, network, accounts) => {
  return deployer.then(async () => {
    await deployer.deploy(
      Registry,
      Token.address,
      FutarchyChallengeFactory.address,
      Parameterizer.address,
      'best registry'
    )
    if (network === 'development' || network === 'test' || network === 'coverage') {
      await approveRegistryFor(accounts);
    }
  }).catch((err) => { throw err })
}

async function approveRegistryFor(addresses) {
  const token = await Token.deployed();
  const user = addresses[0];
  const balanceOfUser = await token.balanceOf(user);
  await token.approve(Registry.address, balanceOfUser, { from: user });
  if (addresses.length === 1) { return true; }
  return approveRegistryFor(addresses.slice(1));
}


  // deployer.link(DLL, Registry);
  // deployer.link(AttributeStore, Registry);

  // return deployer.then(async () => {
  //   const config = JSON.parse(fs.readFileSync('./conf/config.json'));
  //   let tokenAddress = config.token.address;

  //   if (config.token.deployToken) {
  //     tokenAddress = Token.address;
  //   }

  //   return deployer.deploy(
  //     Registry,
  //     tokenAddress,
  //     PLCRVotingChallengeFactory.address,
  //     Parameterizer.address,
  //     config.name,
  //   );
  // })
  //   .then(async () => {
  //     if (network === 'development' || network === 'test' || network === 'coverage') {
  //       await approveRegistryFor(accounts);
  //     }
  //   }).catch((err) => { throw err; });
