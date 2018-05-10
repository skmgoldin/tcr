const Parameterizer = artifacts.require('./Parameterizer.sol')
const Registry = artifacts.require('Registry.sol')
const Token = artifacts.require('EIP20.sol')
const ChallengeFactory = artifacts.require('FutarchyChallengeFactory')
const EventFactory = artifacts.require('EventFactory')
const StandardMarketWithPriceLoggerFactory = artifacts.require('StandardMarketWithPriceLoggerFactory')
const FutarchyOracleFactory = artifacts.require('FutarchyOracleFactory')
const CentralizedOracleFactory = artifacts.require('CentralizedOracleFactory')
const FutarchyChallenge = artifacts.require('FutarchyChallenge')

const fs = require('fs')
const BN = require('bignumber.js')

const config = JSON.parse(fs.readFileSync('./conf/config.json'))
const paramConfig = config.paramDefaults

const utils = require('../utils.js')

contract('simulate TCR apply/futarchyChallenge/resolve', (accounts) => {
  describe.only('do it...', () => {
    const [_, applicant, challenger, voterFor, voterAgainst] = accounts
    it('...', async () => {
      const token = await Token.deployed()
      const parameterizer         = await Parameterizer.deployed()
      const eventFactory          = await EventFactory.new()
      const marketFactory         = await StandardMarketWithPriceLoggerFactory.new()
      const centralizedOracleFactory = await CentralizedOracleFactory.new()
      const futarchyOracleFactory = await FutarchyOracleFactory.new(eventFactory.address, marketFactory.address)
      const challengeFactory      = await ChallengeFactory.new(token.address, paramConfig.minDeposit, futarchyOracleFactory.address, centralizedOracleFactory.address)

      const registry = await Registry.new(token.address, challengeFactory.address, parameterizer.address, 'best registry' )

      await logBalances(accounts, token, registry)
      await token.approve(registry.address, 50, {from: applicant})
      const listingHash = utils.getListingHash('nochallenge.net')
      await utils.as(applicant, registry.apply, listingHash, paramConfig.minDeposit, '')
      await logBalances(accounts, token, registry)

      const listingResult = await registry.listings.call(listingHash)

      await token.approve(registry.address, 50, {from: challenger})
      const receipt = await utils.as(challenger, registry.createChallenge, listingHash, '')
      const { challengeID } = receipt.logs[0].args

      const challenge = await getFutarchyChallenge(challengeID, registry)
      console.log('challenge: ', challenge)
    })
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
