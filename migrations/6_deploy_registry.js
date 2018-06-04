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
