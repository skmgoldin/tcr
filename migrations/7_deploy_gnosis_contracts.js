const StandardMarketWithPriceLoggerFactory = artifacts.require('StandardMarketWithPriceLoggerFactory')
const FutarchyChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const EventFactory = artifacts.require('EventFactory')
const LMSRMarketMaker = artifacts.require('LMSRMarketMaker')
const Math = artifacts.require('Math')

module.exports = function (deployer) {
  deployer.deploy(
    Math
  )
  deployer.link(Math, [StandardMarketWithPriceLoggerFactory, FutarchyChallengeFactory, EventFactory, LMSRMarketMaker])
}
