/* global artifacts */

const Token = artifacts.require('tokens/eip20/EIP20.sol');
const Math = artifacts.require('Math')
const StandardMarketFactory = artifacts.require('StandardMarketFactory')
const StandardMarketWithPriceLoggerFactory = artifacts.require('StandardMarketWithPriceLoggerFactory')
const FutarchyChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const FutarchyOracleFactory = artifacts.require('FutarchyOracleFactory')
const CentralizedTimedOracleFactory = artifacts.require('CentralizedTimedOracleFactory')
const EventFactory = artifacts.require('EventFactory')
const LMSRMarketMaker = artifacts.require('LMSRMarketMaker')
const EtherToken = artifacts.require('EtherToken')
const DutchExchange = artifacts.require('DutchExchangeMock')

const fs = require('fs')
const config = JSON.parse(fs.readFileSync('../conf/config.json'))
const paramConfig = config.paramDefaults

const tradingPeriod = 60 * 60
const timeToPriceResolution = 60 * 60 * 24 * 7 // a week
const futarchyFundingAmount = paramConfig.minDeposit * 10 ** 18

module.exports = (deployer) => {
  return deployer.then(async () => {
    await deployer.deploy(Math)
    
    deployer.link(Math, [EtherToken, StandardMarketFactory, StandardMarketWithPriceLoggerFactory, FutarchyChallengeFactory, EventFactory, LMSRMarketMaker])

    await deployer.deploy(EventFactory)
    await deployer.deploy(StandardMarketWithPriceLoggerFactory)
    await deployer.deploy(CentralizedTimedOracleFactory)
    await deployer.deploy(StandardMarketFactory)
    await deployer.deploy(LMSRMarketMaker)
    await deployer.deploy(DutchExchange)
    await deployer.deploy(
      FutarchyOracleFactory,
      EventFactory.address,
      StandardMarketWithPriceLoggerFactory.address
    )
    await deployer.deploy(
      FutarchyChallengeFactory,
      Token.address,
      EtherToken.address,
      futarchyFundingAmount,
      tradingPeriod,
      timeToPriceResolution,
      FutarchyOracleFactory.address,
      CentralizedTimedOracleFactory.address,
      LMSRMarketMaker.address,
      DutchExchange.address
    )
  }).catch((err) => { throw err })
};
