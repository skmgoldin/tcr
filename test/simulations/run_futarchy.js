import lkTestHelpers from 'lk-test-helpers'

const Parameterizer = artifacts.require('./Parameterizer.sol')
const Registry = artifacts.require('Registry.sol')
const Token = artifacts.require('EIP20.sol')
const OutcomeToken = artifacts.require('OutcomeToken')
const FutarchyChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const Event = artifacts.require('Event')
const EventFactory = artifacts.require('EventFactory')
const CategoricalEvent = artifacts.require('CategoricalEvent')
const ScalarEvent = artifacts.require('ScalarEvent')
const StandardMarket = artifacts.require('StandardMarket')
const StandardMarketFactory = artifacts.require('StandardMarketFactory')
const StandardMarketWithPriceLogger = artifacts.require('StandardMarketWithPriceLogger')
const StandardMarketWithPriceLoggerFactory = artifacts.require('StandardMarketWithPriceLoggerFactory')
const LMSRMarketMaker = artifacts.require('LMSRMarketMaker')
const FutarchyOracleFactory = artifacts.require('FutarchyOracleFactory')
const CentralizedTimedOracleFactory = artifacts.require('CentralizedTimedOracleFactory')
const FutarchyChallenge = artifacts.require('FutarchyChallenge')
const FutarchyOracle = artifacts.require('FutarchyOracle')

const fs = require('fs')
const BN = require('bignumber.js')

const config = JSON.parse(fs.readFileSync('./conf/config.json'))
const paramConfig = config.paramDefaults

const { increaseTime } = lkTestHelpers(web3)

const utils = require('../utils.js')

contract('simulate TCR apply/futarchyChallenge/resolve', (accounts) => {
    it.only('...', async () => {
      const [creator, applicant, challenger, voterFor, voterAgainst, buyer1] = accounts
      const tradingPeriod = 60 * 60
      const futarchyFundingAmount = paramConfig.minDeposit * 10 ** 18
      const categoricalMarketFunding = 10 * 10 ** 18
      const scalarMarketFunding = 10 * 10 ** 18
      const approvalAmount = 20 * 10 ** 18

      const token = await Token.deployed()
      for(let account of accounts) {
        await token.transfer(account, 100 * 10 ** 18);
      }
      const parameterizer         = await Parameterizer.deployed()
      const eventFactory          = await EventFactory.new()
      const marketFactory         = await StandardMarketWithPriceLoggerFactory.new()
      const centralizedTimedOracleFactory = await CentralizedTimedOracleFactory.new()
      const standardMarketFactory = await StandardMarketFactory.new()
      const futarchyOracleFactory = await FutarchyOracleFactory.new(eventFactory.address, marketFactory.address)
      const lmsrMarketMaker = await LMSRMarketMaker.new()
      const timeToPriceResolution = 60 * 60 * 24 * 7 // a week

      const futarchyChallengeFactory = await FutarchyChallengeFactory.new(
        token.address,
        futarchyFundingAmount,
        tradingPeriod,
        timeToPriceResolution,
        futarchyOracleFactory.address,
        centralizedTimedOracleFactory.address,
        lmsrMarketMaker.address
      )
      console.log('----------------------- CREATING REGISTRY -----------------------')
      const registry = await Registry.new(token.address, futarchyChallengeFactory.address, parameterizer.address, 'best registry' )
      await logTCRBalances(accounts, token, registry)
      await token.approve(registry.address, approvalAmount, {from: applicant})
      const listingHash = utils.getListingHash('nochallenge.net')
      await utils.as(applicant, registry.apply, listingHash, futarchyFundingAmount, '')
      console.log('----------------------- SUBMITTING APPLICATION -----------------------')
      await logTCRBalances(accounts, token, registry)

      const listingResult = await registry.listings.call(listingHash)

      const receipt = await utils.as(challenger, registry.createChallenge, listingHash, '')

      const { challengeID } = receipt.logs[0].args

      const challenge = await getFutarchyChallenge(challengeID, registry)
      console.log('----------------------- SUBMITTING CHALLENGE -----------------------')
      await logTCRBalances(accounts, token, registry, challenge)
      await token.approve(challenge.address, futarchyFundingAmount, {from: challenger})
      await challenge.start(100, 200, {from: challenger})
      console.log('----------------------- STARTING CHALLENGE -----------------------')
      const futarchyAddress = await challenge.futarchyOracle();
      const futarchyOracle = await FutarchyOracle.at(futarchyAddress)

      const marketForAccepted = StandardMarketWithPriceLogger.at(await futarchyOracle.markets(0))
      const marketForDenied = StandardMarketWithPriceLogger.at(await futarchyOracle.markets(1))
      const categoricalEvent = CategoricalEvent.at(await futarchyOracle.categoricalEvent())
      const acceptedLongShortEvent = ScalarEvent.at(await marketForAccepted.eventContract())
      const deniedLongShortEvent = ScalarEvent.at(await marketForDenied.eventContract())
      await logTCRBalances(accounts, token, registry, challenge, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)

      // create standard market w/ LMSR for categorical event
      console.log('-----------------------create categorical market -----------------------')
      const categoricalEventMarketFee = 0
      const { logs: createCategoricalMarketLogs } = await standardMarketFactory.createMarket(
        categoricalEvent.address,
        lmsrMarketMaker.address,
        categoricalEventMarketFee
      )
      await logTCRBalances(accounts, token, registry, challenge, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)
      const { market: categoricalMarketAddress } = createCategoricalMarketLogs.find(
        e => e.event === 'StandardMarketCreation'
      ).args
      const categoricalMarket = StandardMarket.at(categoricalMarketAddress)

      const acceptedDeniedTokenAddresses = await categoricalEvent.getOutcomeTokens()
      const acceptedToken = OutcomeToken.at(acceptedDeniedTokenAddresses[0])
      const deniedToken = OutcomeToken.at(acceptedDeniedTokenAddresses[1])

      const acceptedLongShortTokenAddresses = await acceptedLongShortEvent.getOutcomeTokens()
      const acceptedLongToken = OutcomeToken.at(acceptedLongShortTokenAddresses[1])
      const acceptedShortToken = OutcomeToken.at(acceptedLongShortTokenAddresses[0])

      const deniedLongShortTokenAddresses = await deniedLongShortEvent.getOutcomeTokens()
      const deniedLongToken = OutcomeToken.at(deniedLongShortTokenAddresses[1])
      const deniedShortToken = OutcomeToken.at(deniedLongShortTokenAddresses[0])

      console.log('-----------------------fund the categorical market-----------------------')
      await fundMarket(categoricalMarket, token, categoricalMarketFunding, creator)
      console.log('')
      await logTCRBalances(accounts, token, registry, challenge, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)

      const buyAmt = 3 * 10 ** 18
      console.log('----------------------- buy ACCEPTED -----------------------')
      await marketBuy(categoricalMarket, 0, buyAmt, buyer1)
      await logTCRBalances(accounts, token, registry, challenge, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)

      console.log('----------------------- buy LONG_ACCEPTED -----------------------')
      await logTCRBalances(accounts, token, registry, challenge, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)
      await marketBuy(marketForAccepted, 1, buyAmt, buyer1)

      // console.log('  *** buy SHORT_ACCEPTED')
      // await marketBuy(marketForAccepted, 0, buyAmt, buyer1)
      console.log('')

      await logBalances()
      await logOutcomeTokenCosts()

      console.log('----------------------- execute setOutcome -----------------------')
      increaseTime(tradingPeriod + 1000)
      await futarchyOracle.setOutcome()
      console.log('')

      const challengePassed = await challenge.passed()
      console.log('  Challenge.passed(): ', challengePassed)
      console.log('')

      console.log('  *** update registry')
      await registry.updateStatus(listingHash)
      console.log('')

      console.log('  Listing isWhitelisted(): ', await registry.isWhitelisted(listingHash))
      console.log('')

      async function marketBuy (market, outcomeTokenIndex, buyAmount, from) {
        const evtContract = Event.at(await market.eventContract())
        const collateralToken = Token.at(await evtContract.collateralToken())
        const cost = await getOutcomeTokenCost(
          market.address,
          outcomeTokenIndex,
          buyAmount
        )
        const fee = await getMarketFee(market, cost)
        const maxCost = cost + fee + 1000

        await collateralToken.approve(market.address, maxCost, { from })
        await market.buy(outcomeTokenIndex, buyAmt, maxCost, { from })
      }

      async function fundMarket (market, collateralToken, fundingAmount, from) {
        await collateralToken.approve(market.address, fundingAmount, { from })
        await market.fund(fundingAmount, { from })
      }

      async function logBalances () {
        await logTokenHolderBalances()
        await logEventContractBalances()
        await logMarketContractBalances()
      }

      async function logTokenHolderBalances () {
        console.log('  Token Holders')
        console.log('  -------------')
        console.log('    Market Creator')
        console.log('    --------------')
        await logTokenBalances(creator)
        console.log('   ')

        console.log('    Buyer: LONG_ACCEPTED')
        console.log('    --------------------')
        await logTokenBalances(buyer1)
        console.log('   ')
      }

      async function logEventContractBalances () {
        console.log('  Event Contracts')
        console.log('  ---------------')

        console.log('    ACCEPTED/DENIED : ETH')
        console.log('    ---------------------')
        await logTokenBalances(categoricalEvent.address)
        console.log('   ')

        console.log('    LONG/SHORT : ACCEPTED')
        console.log('    ---------------------')
        await logTokenBalances(acceptedLongShortEvent.address)
        console.log('   ')

        console.log('    LONG/SHORT : DENIED')
        console.log('    -------------------')
        await logTokenBalances(deniedLongShortEvent.address)
        console.log('')
      }

      async function logMarketContractBalances () {
        console.log('  Market Contracts')
        console.log('  ----------------')

        console.log('    ACCEPTED | DENIED')
        console.log('    ------------------------------')
        await logTokenBalances(categoricalMarket.address)
        console.log('   ')

        console.log('    LONG_ACCEPTED | SHORT_ACCEPTED')
        console.log('    ------------------------------')
        await logTokenBalances(marketForAccepted.address)
        console.log('   ')

        console.log('    LONG_DENIED | SHORT_DENIED')
        console.log('    --------------------------')
        await logTokenBalances(marketForDenied.address)
        console.log('   ')
      }

      async function logTokenBalances (account) {
        await logTokenBalance('Accepted', acceptedToken, account)
        await logTokenBalance('Denied', deniedToken, account)
        await logTokenBalance('ShortAccepted', acceptedShortToken, account)
        await logTokenBalance('LongAccepted', acceptedLongToken, account)
        await logTokenBalance('ShortDenied', deniedShortToken, account)
        await logTokenBalance('LongDenied', deniedLongToken, account)
      }

      async function logTokenBalance (tokenName, token, account) {
        const bal = (await token.balanceOf(account)).toNumber()
        if (bal > 0) {
          console.log(`    ${tokenName}: ${bal / 10 ** 18}`)
        }
      }

      async function logOutcomeTokenCosts () {
        const acceptedCost = await getOutcomeTokenCost(categoricalMarket.address, 0, 1e15)
        const deniedCost = await getOutcomeTokenCost(categoricalMarket.address, 1, 1e15)
        const longAcceptedCost = await getOutcomeTokenCost(marketForAccepted.address, 1, 1e15)
        const shortAcceptedCost = await getOutcomeTokenCost(marketForAccepted.address, 0, 1e15)
        const longDeniedCost = await getOutcomeTokenCost(marketForDenied.address, 1, 1e15)
        const shortDeniedCost = await getOutcomeTokenCost(marketForDenied.address, 0, 1e15)
        console.log('  Outcome Token Prices')
        console.log('  --------------------')
        console.log('  ACCEPTED:       ', acceptedCost / 10 ** 15)
        console.log('  DENIED:         ', deniedCost / 10 ** 15)
        console.log('  SHORT_ACCEPTED: ', shortAcceptedCost / 10 ** 15)
        console.log('  LONG_ACCEPTED:  ', longAcceptedCost / 10 ** 15)
        console.log('  SHORT_DENIED:   ', shortDeniedCost / 10 ** 15)
        console.log('  LONG_DENIED:    ', longDeniedCost / 10 ** 15)
        console.log('')
      }

      async function getOutcomeTokenCost (marketAddress, outcomeTokenIndex, tokenAmount) {
        const cost = await lmsrMarketMaker.calcCost(marketAddress, outcomeTokenIndex, tokenAmount)
        return cost.toNumber()
      }

      async function getMarketFee (market, tokenCost) {
        const fee = await market.calcMarketFee.call(tokenCost)
        return fee.toNumber()
      }

    })
 })

async function logTCRBalances(accounts, token, registry, challenge = null, catEvent = null, aScal = null, dScal = null) {
  const [_, applicant, challenger, voterFor, voterAgainst] = accounts
  const applicantBalance = (await token.balanceOf.call(applicant)).toNumber()
  const challengerBalance = (await token.balanceOf.call(challenger)).toNumber()
  const voterForBalance = (await token.balanceOf.call(voterFor)).toNumber()
  const voterAgainstBalance = (await token.balanceOf.call(voterAgainst)).toNumber()
  const registryBalance = (await token.balanceOf.call(registry.address)).toNumber()
  console.log('balances:')
  console.log(`  applicant: ${applicantBalance}`)
  console.log(`  challenger: ${challengerBalance}`)
  console.log(`  Registry Contract: ${registryBalance}`)
  if(challenge) {
    const challengeBalance = (await token.balanceOf.call(challenge.address)).toNumber()
    console.log(`  Challenge Contract: ${challengeBalance}`)
  } else {
    console.log('  Challenge Contract: NULL')
  }
  if(catEvent) {
    const catEventBalance = (await token.balanceOf.call(catEvent.address)).toNumber()
    console.log(`  Categorical Event: ${catEventBalance}`)
  } else {
    console.log('   Categorical Event: NULL')
  }
  if(aScal) {
    const aColToken = await OutcomeToken.at(await aScal.collateralToken())
    const aScalBalance = (await aColToken.balanceOf.call(aScal.address)).toNumber()
    console.log(`  Scalar Accepted Event: ${aScalBalance}`)
  } else {
    console.log('   Scalar Accepted Event: NULL')
  }
  if(dScal) {
    const aColToken = await OutcomeToken.at(await dScal.collateralToken())
    const dScalBalance = (await aColToken.balanceOf.call(dScal.address)).toNumber()
    console.log(`  Denied Accepted Event: ${dScalBalance}`)
  } else {
    console.log('   Denied Accepted Event: NULL')
  }
  console.log('')
  console.log('')
  console.log('')
}

async function logRegistryStatus(registry) {
  console.log('----------')
  console.log('REGISTRY STATUS')
  console.log('----------')
}

async function getFutarchyChallenge(challengeID, registry) {
  const challenge = await registry.challenges(challengeID)
  return FutarchyChallenge.at(challenge)
}
