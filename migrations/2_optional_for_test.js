/* global artifacts */

const Token = artifacts.require('tokens/eip20/EIP20.sol');

module.exports = (deployer, network) => {
  if (network === 'test') {
    deployer.deploy(Token, '1000000', 'TestCoin', '0', 'TEST');
    return;
  }
  console.log('skipping optional dev-only deploy of optional contracts.');
};
