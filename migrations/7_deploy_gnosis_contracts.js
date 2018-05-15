const StandardMarketFactory = artifacts.require('StandardMarketFactory')
const StandardMarketWithPriceLoggerFactory = artifacts.require('StandardMarketWithPriceLoggerFactory')
const FutarchyChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const EventFactory = artifacts.require('EventFactory')
const LMSRMarketMaker = artifacts.require('LMSRMarketMaker')
const EtherToken = artifacts.require('EtherToken')
const Math = artifacts.require('Math')

module.exports = function (deployer) {
  deployer.deploy(
    Math
  )
  deployer.link(Math, [EtherToken, StandardMarketFactory, StandardMarketWithPriceLoggerFactory, FutarchyChallengeFactory, EventFactory, LMSRMarketMaker])
}
