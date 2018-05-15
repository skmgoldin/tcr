const Parameterizer = artifacts.require('./Parameterizer.sol')
const Registry = artifacts.require('Registry.sol')
const Token = artifacts.require('EIP20.sol')
const ChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const EventFactory = artifacts.require('EventFactory')
const StandardMarketWithPriceLoggerFactory = artifacts.require('StandardMarketWithPriceLoggerFactory')
const LMSRMarketMaker = artifacts.require('LMSRMarketMaker')
const FutarchyOracleFactory = artifacts.require('FutarchyOracleFactory')
const CentralizedOracleFactory = artifacts.require('CentralizedOracleFactory')
const FutarchyChallenge = artifacts.require('FutarchyChallenge')
const FutarchyOracle = artifacts.require('FutarchyOracle')

const fs = require('fs')
const BN = require('bignumber.js')

const config = JSON.parse(fs.readFileSync('./conf/config.json'))
const paramConfig = config.paramDefaults

const utils = require('../utils.js')

contract('simulate TCR apply/futarchyChallenge/resolve', (accounts) => {
    it.only('...', async () => {
      const [_, applicant, challenger, voterFor, voterAgainst] = accounts
      console.log('accounts! ', _)
      const tradingPeriod = 60 * 60
      const token = await Token.deployed()
      for(let account of accounts) {
        await token.transfer(account, 100);
      }
      const parameterizer         = await Parameterizer.deployed()
      const eventFactory          = await EventFactory.new()
      const marketFactory         = await StandardMarketWithPriceLoggerFactory.new()
      const centralizedOracleFactory = await CentralizedOracleFactory.new()
      const futarchyOracleFactory = await FutarchyOracleFactory.new(eventFactory.address, marketFactory.address)
      const lmsrMarketMaker = await LMSRMarketMaker.new()

      const challengeFactory = await ChallengeFactory.new(
        token.address,
        paramConfig.minDeposit,
        tradingPeriod,
        futarchyOracleFactory.address,
        centralizedOracleFactory.address,
        lmsrMarketMaker.address
      )
      const registry = await Registry.new(token.address, challengeFactory.address, parameterizer.address, 'best registry' )

      await logBalances(accounts, token, registry)
      await token.approve(registry.address, 66, {from: applicant})
      const listingHash = utils.getListingHash('nochallenge.net')
      await utils.as(applicant, registry.apply, listingHash, paramConfig.minDeposit, '')
      await logBalances(accounts, token, registry)

      const listingResult = await registry.listings.call(listingHash)


      const receipt = await utils.as(challenger, registry.createChallenge, listingHash, '')
      const { challengeID } = receipt.logs[0].args

      const challenge = await getFutarchyChallenge(challengeID, registry)
      await token.approve(challenge.address, 77, {from: challenger})
      await challenge.start(100, 200, {from: challenger})
      const futarchyAddress = await challenge.futarchyOracle();
      const futarchyOracle = await FutarchyOracle.at(futarchyAddress)
      const marketAccepted = await futarchyOracle.markets(0)
      const marketDenied = await futarchyOracle.markets(1)
      const categoricalEvent = await futarchyOracle.categoricalEvent()

      //runMarketTrades(categoricalEvent, acceptedScalar, deniedScalar)

      
    })
})

async function logBalances(accounts, token, registry) {
  const [_, applicant, challenger, voterFor, voterAgainst] = accounts
  const applicantBalance = (await token.balanceOf.call(applicant)).toNumber()
  const challengerBalance = (await token.balanceOf.call(challenger)).toNumber()
  const voterForBalance = (await token.balanceOf.call(voterFor)).toNumber()
  const voterAgainstBalance = (await token.balanceOf.call(voterAgainst)).toNumber()
  const registryBalance = (await token.balanceOf.call(registry.address)).toNumber()
  console.log('balances:')
  console.log(`  applicant: ${applicantBalance}`)
  console.log(`  challenger: ${challengerBalance}`)
  console.log(`  voterFor: ${voterForBalance}`)
  console.log(`  voterAgainst: ${voterAgainstBalance}`)
  console.log(`  Registry Contract: ${registryBalance}`)
  // if (plcrChallenge) {
  //   const plcrChallengeBalance = (await token.balanceOf.call(plcrChallenge.address)).toNumber()
  //   console.log(`  PLCRChallenge Contract: ${plcrChallengeBalance}`)
  // }
  console.log('')
}

async function getFutarchyChallenge(challengeID, registry) {
  const challenge = await registry.challenges(challengeID)
  return FutarchyChallenge.at(challenge)
}
