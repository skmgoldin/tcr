/* global artifacts */

const Token = artifacts.require('tokens/eip20/EIP20.sol');

module.exports = (deployer, network, accounts) => {
  async function giveTokensTo(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    await token.transfer(user, '100000');
    if (addresses.length === 1) { return true; }
    return giveTokensTo(addresses.slice(1));
  }

  if (network === 'test') {
    deployer.deploy(Token, '1000000', 'TestCoin', '0', 'TEST')
      .then(() => giveTokensTo(accounts));
    return;
  }
  console.log('skipping optional deploy of test-only contracts.');
};
