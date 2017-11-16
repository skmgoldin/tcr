const Sale = artifacts.require('optional/Sale.sol');
const fs = require('fs');
const BN = require('bn.js');

module.exports = (deployer, network, accounts) => {
  if (network != 'mainnet') {
    const saleConf = JSON.parse(fs.readFileSync('./conf/optional/sale.json'));
    const tokenConf = JSON.parse(fs.readFileSync('./conf/optional/token.json'));
    const preBuyersConf = JSON.parse(fs.readFileSync('./conf/optional/preBuyers.json'));
    const foundersConf = JSON.parse(fs.readFileSync('./conf/optional/founders.json'));

    saleConf.owner = accounts[0];

    const preBuyers = [];
    const preBuyersTokens = [];
    for (recipient in preBuyersConf) {
      preBuyers.push(preBuyersConf[recipient].address);
      preBuyersTokens.push(new BN(preBuyersConf[recipient].amount, 10));
    }

    const founders = [];
    const foundersTokens = [];
    for (recipient in foundersConf.founders) {
      founders.push(foundersConf.founders[recipient].address);
      foundersTokens.push(new BN(foundersConf.founders[recipient].amount, 10));
    }

    const vestingDates = [];
    for (date in foundersConf.vestingDates) {
      vestingDates.push(foundersConf.vestingDates[date]);
    }

    return deployer.deploy(Sale,
      saleConf.owner,
      saleConf.wallet,
      tokenConf.initialAmount,
      tokenConf.tokenName,
      tokenConf.decimalUnits,
      tokenConf.tokenSymbol,
      saleConf.price,
      saleConf.startBlock,
      saleConf.freezeBlock,
    )
      .then(() => Sale.deployed())
      .then(sale => sale.distributePreBuyersRewards(
        preBuyers,
        preBuyersTokens,
      ))
      .then(() => Sale.deployed())
      .then(sale => sale.distributeFoundersRewards(
        founders,
        foundersTokens,
        vestingDates,
      ));
  }
  console.log('skipping optional dev-only deploy of optional contracts.');
};
