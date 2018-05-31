/* global artifacts */

const Token = artifacts.require('tokens/eip20/EIP20.sol');
const Math = artifacts.require('zeppelin/contracts/math/Math.sol')
const StandardMarketFactory = artifacts.require('StandardMarketFactory')
const StandardMarketWithPriceLoggerFactory = artifacts.require('StandardMarketWithPriceLoggerFactory')
const FutarchyChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const FutarchyOracleFactory = artifacts.require('FutarchyOracleFactory')
const CentralizedOracleFactory = artifacts.require('CentralizedOracleFactory')
const EventFactory = artifacts.require('EventFactory')
const LMSRMarketMaker = artifacts.require('LMSRMarketMaker')
const EtherToken = artifacts.require('EtherToken')

const fs = require('fs')
const config = JSON.parse(fs.readFileSync('../conf/config.json'))
const paramConfig = config.paramDefaults

const tradingPeriod = 60 * 60
const futarchyFundingAmount = paramConfig.minDeposit * 10 ** 18

module.exports = (deployer) => {
  return deployer.then(async () => {
    await deployer.deploy(Math)
    
    deployer.link(Math, [EtherToken, StandardMarketFactory, StandardMarketWithPriceLoggerFactory, FutarchyChallengeFactory, EventFactory, LMSRMarketMaker])

    await deployer.deploy(EventFactory)
    await deployer.deploy(StandardMarketWithPriceLoggerFactory)
    await deployer.deploy(CentralizedOracleFactory)
    await deployer.deploy(StandardMarketFactory)
    await deployer.deploy(LMSRMarketMaker)
    await deployer.deploy(
      FutarchyOracleFactory,
      EventFactory.address,
      StandardMarketWithPriceLoggerFactory.address
    )
    await deployer.deploy(
      FutarchyChallengeFactory,
      Token.address,
      futarchyFundingAmount,
      tradingPeriod,
      FutarchyOracleFactory.address,
      CentralizedOracleFactory.address,
      LMSRMarketMaker.address
    )
  }).catch((err) => { throw err })
};
