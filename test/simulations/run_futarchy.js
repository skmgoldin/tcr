import _ from 'lodash'
import lkTestHelpers from 'lk-test-helpers'
import fcrjs from 'fcr-js'

const Parameterizer = artifacts.require('./Parameterizer.sol')
const Registry = artifacts.require('Registry.sol')
const Token = artifacts.require('EIP20.sol')
const OutcomeToken = artifacts.require('OutcomeToken')
const FutarchyChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const EtherToken = artifacts.require('EtherToken')
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
const CentralizedTimedOracle = artifacts.require('CentralizedTimedOracle')
const FutarchyChallenge = artifacts.require('FutarchyChallenge')
const FutarchyOracle = artifacts.require('FutarchyOracle')
const DutchExchange = artifacts.require('DutchExchangeMock')

const fs = require('fs')
const BN = require('bignumber.js')
const Web3_beta = require('web3')

const config = JSON.parse(fs.readFileSync('./conf/config.json'))
const fcrJsConfig = JSON.parse(fs.readFileSync('./test/fcrJsConfig.json'))
const paramConfig = config.paramDefaults

const { increaseTime } = lkTestHelpers(web3)

const utils = require('../utils.js')

const web3_beta = new Web3_beta(new Web3_beta.providers.HttpProvider(fcrJsConfig.local.web3Url))

contract('simulate TCR apply/futarchyChallenge/resolve', (accounts) => {

    it.only('...', async () => {
      const [creator, applicant, challenger, voterFor, voterAgainst, buyer1, buyer2] = accounts
      const tradingPeriod = 60 * 60
      const futarchyFundingAmount = paramConfig.minDeposit * 10 ** 18
      const categoricalMarketFunding = 10 * 10 ** 18
      const scalarMarketFunding = 10 * 10 ** 18
      const approvalAmount = 20 * 10 ** 18

      const token = await Token.deployed()
      for(let account of accounts) {
        await token.transfer(account, 100 * 10 ** 18);
      }
      const dutchExchange         = await DutchExchange.deployed()
      const etherToken            = await EtherToken.deployed()
      const parameterizer         = await Parameterizer.deployed()
      const outcomeToken          = await OutcomeToken.deployed()
      const eventFactory          = await EventFactory.deployed()
      const marketFactory         = await StandardMarketWithPriceLoggerFactory.deployed()
      const centralizedTimedOracleFactory = await CentralizedTimedOracleFactory.new()
      const standardMarketFactory = await StandardMarketFactory.deployed()
      const futarchyOracleFactory = await FutarchyOracleFactory.deployed()
      const lmsrMarketMaker = await LMSRMarketMaker.new()
      const timeToPriceResolution = 60 * 60 * 24 * 7 // a week
      const upperBound = 200
      const lowerBound = 100

      const futarchyChallengeFactory = await FutarchyChallengeFactory.new(
        token.address,
        etherToken.address,
        futarchyFundingAmount,
        tradingPeriod,
        timeToPriceResolution,
        futarchyOracleFactory.address,
        centralizedTimedOracleFactory.address,
        lmsrMarketMaker.address,
        dutchExchange.address
      )

      console.log('----------------------- CREATING REGISTRY -----------------------')
      const registry = await Registry.new(token.address, futarchyChallengeFactory.address, parameterizer.address, 'best registry' )
      await logTCRBalances(accounts, token, registry)
 
      const fcr = fcrjs(web3_beta, _.merge(fcrJsConfig.local, {
        registryAddress: registry.address,
        tokenAddress: token.address,
        LMSRMarketMakerAddress: lmsrMarketMaker.address
      }))


      console.log('----------------------- SUBMITTING APPLICATION -----------------------')
      await token.approve(registry.address, approvalAmount, {from: applicant})
      await fcr.registry.apply(applicant, 'nochallenge.net', futarchyFundingAmount, '')
      await logTCRBalances(accounts, token, registry)






      console.log('----------------------- SUBMITTING CHALLENGE -----------------------')
      const listingHash = web3_beta.utils.fromAscii('nochallenge.net')
      const receipt = await utils.as(challenger, registry.createChallenge, listingHash, '')
      const { challengeID } = receipt.logs[0].args
      const challenge = await getFutarchyChallenge(challengeID, registry)
      await logTCRBalances(accounts, token, registry, challenge)





      console.log('----------------------- STARTING CHALLENGE -----------------------')
      await token.approve(challenge.address, futarchyFundingAmount, {from: challenger})
      await challenge.start({from: challenger})
      const futarchyAddress = await challenge.futarchyOracle();
      const futarchyOracle = await FutarchyOracle.at(futarchyAddress)
      const marketForAccepted = StandardMarketWithPriceLogger.at(await futarchyOracle.markets(0))
      const marketForDenied = StandardMarketWithPriceLogger.at(await futarchyOracle.markets(1))
      const categoricalEvent = CategoricalEvent.at(await futarchyOracle.categoricalEvent())
      const acceptedLongShortEvent = ScalarEvent.at(await marketForAccepted.eventContract())
      const deniedLongShortEvent = ScalarEvent.at(await marketForDenied.eventContract())
      await logTCRBalances(accounts, token, registry, challenge, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)

      const acceptedToken = await OutcomeToken.at(await acceptedLongShortEvent.collateralToken())
      const acceptedLongToken = await OutcomeToken.at(await acceptedLongShortEvent.outcomeTokens(1))



      console.log('----------------------- FUNDING CHALLENGE -----------------------')
      await token.approve(challenge.address, futarchyFundingAmount, {from: challenger})
      await challenge.fund({from: challenger})
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])






      console.log('----------------------- Buy ACCEPTED -----------------------')
      const buyAmt1 = 8 * 10 ** 18
      const buyAmt2 = 4 * 10 **18
      await token.approve(categoricalEvent.address, buyAmt1 , {from: buyer1});
      await categoricalEvent.buyAllOutcomes(buyAmt1, {from: buyer1})
      await token.approve(categoricalEvent.address, buyAmt2, {from: buyer2});
      await categoricalEvent.buyAllOutcomes(buyAmt2, {from: buyer2})
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)





      console.log('----------------------- Buy LONG_ACCEPTED/SHORT_ACCEPTED -----------------------')
      await marketBuy(marketForAccepted, 0, [buyAmt1 * 1.5, 0], buyer1)
      await marketBuy(marketForAccepted, 1, [0, buyAmt2 * 1.5], buyer2)
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)
      console.log('')






      console.log('----------------------- Execute setOutcome -----------------------')
      increaseTime(tradingPeriod + 1000)
      await futarchyOracle.setOutcome()
      await categoricalEvent.setOutcome()
      console.log('')

      const challengePassed = await challenge.passed()
      console.log('  Challenge.passed(): ', challengePassed)
      console.log('')
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)





      console.log('  ----------------------- Update Registry -----------------------')
      await registry.updateStatus(listingHash)
      console.log('')
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])
      console.log('  Listing isWhitelisted(): ', await registry.isWhitelisted(listingHash))
      console.log('')
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)





      console.log('----------------------- Resolve Scalar Markets -----------------------')
      console.log('')
      console.log(' -- increase time to resolution date')
      await utils.increaseTime(timeToPriceResolution + 1)

      const scalarAcceptedEventAddr = await marketForAccepted.eventContract()
      const scalarAcceptedEvent = await ScalarEvent.at(scalarAcceptedEventAddr)
      console.log('scalarAccepted')
      const scalarDeniedEventAddr = await marketForDenied.eventContract()
      const scalarDeniedEvent = await ScalarEvent.at(scalarDeniedEventAddr)
      console.log('scalarDenied')

      const scalarOracleAddr = await scalarAcceptedEvent.oracle()
      const scalarOracle = await CentralizedTimedOracle.at(scalarOracleAddr)

      const outcomePrice = (lowerBound + (upperBound - lowerBound) * 0.75) * 10 ** 18

      console.log("outcomePrice!! ", outcomePrice / 10 **18)

      await challenge.setScalarOutcome(scalarOracleAddr, outcomePrice)
      await scalarAcceptedEvent.setOutcome()
      await scalarDeniedEvent.setOutcome()
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)





      console.log('----------------------- Redeem Winnings -----------------------')
      await scalarAcceptedEvent.redeemWinnings({from: buyer1 })
      await scalarAcceptedEvent.redeemWinnings({from: buyer2 })
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])
      await categoricalEvent.redeemWinnings({from: buyer1 })
      await categoricalEvent.redeemWinnings({from: buyer2 })
      console.log('')
      console.log('----redeeming categorical... -------')
      console.log('')
      await logTokenBalance('Accepted Token', acceptedToken, [buyer1, buyer2])
      await logTokenBalance('Accepted Long Token', acceptedLongToken, [buyer1, buyer2])
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)






      console.log('----------------------- Close Futarchy Markets -----------------------')
      await challenge.close()
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)
      console.log("reward amount: ", (await challenge.winnerRewardAmount()).toNumber())
      console.log('')
      console.log('')





      console.log('----------------------- Redeem Winner Reward -----------------------')
      await registry.allocateWinnerReward(challengeID)
      await logTCRBalances(accounts, token, registry, challenge, futarchyOracle, categoricalEvent, acceptedLongShortEvent, deniedLongShortEvent)







      async function marketBuy (market, outcomeTokenIndex, arrayGuy, from) {
        const evtContract = Event.at(await market.eventContract())
        const collateralToken = Token.at(await evtContract.collateralToken())
        const cost = await getOutcomeTokenCost(market.address, arrayGuy)
        const fee = await getMarketFee(market, cost)
        const maxCost = cost + fee + 1000

        await collateralToken.approve(market.address, maxCost, { from })
        await market.trade(arrayGuy, maxCost, { from })
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

      async function logTokenBalance (tokenName, token, accountArray) {
        console.log(`   ${tokenName} balances:`)
        for (let account of accountArray) {
          const bal = (await token.balanceOf(account)).toNumber()
            console.log(`          ${await accountName(account)}: ${bal / 10 ** 18}`)
        }
      }

      async function accountName(accountAddr) {
        const accountNames = ["creator", "applicant", "challenger", "voterFor", "voterAgainst", "buyer1", "buyer2"]
        let i = 0
        for(let account of accounts) {
          if(account == accountAddr) {return accountNames[i] }
          i++
        }
      }

      async function logOutcomeTokenCosts () {
        const acceptedCost = await getOutcomeTokenCost(categoricalMarket.address, [1e15, 0])
        const deniedCost = await getOutcomeTokenCost(categoricalMarket.address, [0, 1e15])
        const longAcceptedCost = await getOutcomeTokenCost(marketForAccepted.address, [0, 1e15])
        const shortAcceptedCost = await getOutcomeTokenCost(marketForAccepted.address, [1e15, 0])
        const longDeniedCost = await getOutcomeTokenCost(marketForDenied.address, [0, 1e15])
        const shortDeniedCost = await getOutcomeTokenCost(marketForDenied.address, [1e15, 0])
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

      async function getOutcomeTokenCost (marketAddr, arrayGuy) {
        const cost = await lmsrMarketMaker.calcNetCost(marketAddr, arrayGuy)
        return cost.toNumber()
      }

      async function getMarketFee (market, tokenCost) {
        const fee = await market.calcMarketFee.call(tokenCost)
        return fee.toNumber()
      }
    })
 })

async function logTCRBalances(accounts, token, registry, challenge = null, futarchyOracle = null, catEvent = null, aScal = null, dScal = null) {
  const [_, applicant, challenger, voterFor, voterAgainst, buyer1, buyer2] = accounts
  const applicantBalance = (await token.balanceOf.call(applicant)).toNumber()/10**18
  const challengerBalance = (await token.balanceOf.call(challenger)).toNumber()/10**18
  const voterForBalance = (await token.balanceOf.call(voterFor)).toNumber()/10**18
  const voterAgainstBalance = (await token.balanceOf.call(voterAgainst)).toNumber()/10**18
  const registryBalance = (await token.balanceOf.call(registry.address)).toNumber()/10**18
  const buyer1Balance = (await token.balanceOf.call(buyer1)).toNumber()/10**18
  const buyer2Balance = (await token.balanceOf.call(buyer2)).toNumber()/10**18
  console.log('')
  console.log('')
  console.log('')
  console.log('balances:')
  console.log(`  applicant:  ${applicantBalance}`)
  console.log(`  challenger: ${challengerBalance}`)
  console.log(`  buyer1:     ${buyer1Balance}`)
  console.log(`  buyer2:     ${buyer2Balance}`)
  console.log(`  Registry Contract: ${registryBalance}`)
  if(challenge) {
    const challengeBalance = (await token.balanceOf.call(challenge.address)).toNumber()/10**18
    console.log(`  Challenge Contract: ${challengeBalance}`)
  } else {
    console.log('  Challenge Contract: NULL')
  }
  if(futarchyOracle) {
    const futarchyBalance = (await token.balanceOf.call(futarchyOracle.address)).toNumber()/10**18
    console.log(`  Futarchy Oracle Contract: ${futarchyBalance}`)
  } else {
    console.log('  Futarchy Oracle Contract: NULL')
  }
  if(catEvent) {
    const catEventBalance = (await token.balanceOf.call(catEvent.address)).toNumber()/10**18
    console.log(`  Categorical Event: ${catEventBalance}`)
  } else {
    console.log('   Categorical Event: NULL')
  }
  if(aScal) {
    const acceptedToken = await OutcomeToken.at(await aScal.collateralToken())
    const aScalBalance = (await acceptedToken.balanceOf.call(aScal.address)).toNumber()/10**18
    console.log(`  Scalar Accepted Event: ${aScalBalance}`)
  } else {
    console.log('   Scalar Accepted Event: NULL')
  }
  if(dScal) {
    const acceptedToken = await OutcomeToken.at(await dScal.collateralToken())
    const dScalBalance = (await acceptedToken.balanceOf.call(dScal.address)).toNumber()/10**18
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
  const challenge = (await registry.challenges(challengeID))[0]
  return FutarchyChallenge.at(challenge)
}
