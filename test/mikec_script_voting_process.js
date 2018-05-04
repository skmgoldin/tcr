/* eslint-env mocha */
/* global assert contract artifacts */
const Parameterizer = artifacts.require('./Parameterizer.sol')
const Registry = artifacts.require('Registry.sol')
const Token = artifacts.require('EIP20.sol')

const fs = require('fs')
const BN = require('bignumber.js')

const config = JSON.parse(fs.readFileSync('./conf/config.json'))
const paramConfig = config.paramDefaults

const utils = require('./utils.js')

contract('simulate TCR apply/challenge/resolve', (accounts) => {
  describe.only('do it...', () => {
    const [_, applicant, challenger, voterFor, voterAgainst] = accounts

    it('...', async () => {
      console.log('')

      const registry = await Registry.deployed()

      // logEventsFor(registry)

      const numVotesFor = 20
      const numVotesAgainst = 10

      const token = Token.at(await registry.token.call());
      const listingHash = utils.getListingHash('nochallenge.net')

      await logBalances(accounts, token)

      console.log(`*** apply with listingHash=${listingHash}`)
      console.log('')
      await utils.as(applicant, registry.apply, listingHash, paramConfig.minDeposit, '')
      const listingResult = await registry.listings.call(listingHash)
      await logBalances(accounts, token)

      const receipt = await utils.as(challenger, registry.createChallenge, listingHash, '')
      const { challengeID } = receipt.logs[0].args
      const plcrChallenge = await utils.getPLCRChallenge(challengeID)
      console.log(`*** challenge #${challengeID} created`)
      console.log('')
      await logBalances(accounts, token, plcrChallenge)

      await utils.as(challenger, token.approve, plcrChallenge.address, 10 * 10 ** 18)
      await utils.as(challenger, plcrChallenge.start)
      console.log(`*** challenge started`)
      console.log('')
      await logBalances(accounts, token, plcrChallenge)

      await logListingInfo(listingHash)

      console.log('*** commit votes')
      console.log('')
      await utils.commitVote(challengeID, 1, numVotesFor, 420, voterFor)
      await utils.commitVote(challengeID, 0, numVotesAgainst, 420, voterAgainst)
      await utils.increaseTime(paramConfig.commitStageLength + 1)

      console.log('*** reveal votes')
      console.log('')
      await plcrChallenge.revealVote(1, 420, { from: voterFor })
      await plcrChallenge.revealVote(0, 420, { from: voterAgainst })
      await utils.increaseTime(paramConfig.revealStageLength)
      await logBalances(accounts, token, plcrChallenge)
      await logChallengeReward(challengeID)
      
      console.log('*** update status (resolve challenge, update application status based on voting')
      console.log('')
      await registry.updateStatus(listingHash)
      await logBalances(accounts, token, plcrChallenge)
      await logChallengeInfo(challengeID)
      await logVoterRewardInfo(challengeID, voterFor, voterAgainst)

      console.log('*** voters claim rewards')
      console.log('')
      try { await plcrChallenge.claimVoterReward(420, { from: voterFor }) } catch (err) { }
      try { await plcrChallenge.claimVoterReward(420, { from: voterAgainst }) } catch (err) { }
      await logBalances(accounts, token, plcrChallenge)

      console.log('*** winner (either challenger or listing owner) claims reward')
      console.log('')
      await plcrChallenge.transferWinnerReward()
      await logBalances(accounts, token, plcrChallenge)

      console.log('*** voters withdraw tokens from PLCR')
      console.log('')
      await plcrChallenge.withdrawVotingRights({ from: voterFor })
      await plcrChallenge.withdrawVotingRights({ from: voterAgainst })
      await logBalances(accounts, token, plcrChallenge)
      await logListingInfo(listingHash)

      /* console.log('*** try to exit listing (works if challenge was not successful)')
      console.log('')
      try { await registry.exit(listingHash, { from: applicant }) } catch (err) { }
      await logBalances(accounts, token, plcrChallenge)

      await logVotingInfo(challengeID)
      await logListingInfo(listingHash) */
    })
  })
})

async function logBalances(accounts, token, plcrChallenge) {
  const registry = await Registry.deployed()
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
  console.log(`  Registry: ${registryBalance}`)
  if (plcrChallenge) {
    const plcrChallengeBalance = (await token.balanceOf.call(plcrChallenge.address)).toNumber()
    console.log(`  PLCRChallenge: ${plcrChallengeBalance}`)
  }
  console.log('')
}

async function logListingInfo(listingHash) {
  const registry = await Registry.deployed()
  const listing = await registry.listings(listingHash)
  console.log(`listing: ${listingHash}`)
  try {
    console.log(`  challengeCanBeResolved: ${await registry.challengeCanBeResolved(listingHash)}`)
  } catch (err) {
    console.log(`  challengeCanBeResolved: `)
  }
  console.log(`  canBeWhitelisted: ${await registry.canBeWhitelisted(listingHash)}`)
  console.log(`  isWhitelisted: ${await registry.isWhitelisted(listingHash)}`)
  console.log(`  unstakedDeposit: ${listing[3].toNumber()}`)
  console.log('')
}

async function logChallengeInfo(challengeID) {
  const registry = await Registry.deployed()
  const plcrChallenge = await utils.getPLCRChallenge(challengeID)
  console.log(`challenge: #${challengeID}`)
  console.log(`   started(): ${await plcrChallenge.started()}`)
  console.log(`   ended(): ${await plcrChallenge.ended()}`)
  console.log(`   passed(): ${await plcrChallenge.passed()}`)
  console.log(`   tokenLockAmount(): ${await plcrChallenge.tokenLockAmount()}`)
  console.log(`   tokenRewardAmount(): ${await plcrChallenge.tokenRewardAmount()}`)
  console.log('')
}

async function logChallengeReward(challengeID) {
  const plcrChallenge = await utils.getPLCRChallenge(challengeID)
  console.log(`Challenge #${challengeID} reward: ${await plcrChallenge.tokenRewardAmount()}`)
  console.log('')
}

async function logVotingInfo(pollID) {
  const voting = await utils.getVoting();
  console.log('Voting:')
  console.log(`  isPassed: ${await voting.isPassed(pollID)}`)
  console.log(`  numWinning: ${await voting.getTotalNumberOfTokensForWinningOption(pollID)}`)
  console.log(`  pollEnded: ${await voting.pollEnded(pollID)}`)
  console.log(`  commitPeriodActive: ${await voting.commitPeriodActive(pollID)}`)
  console.log(`  revealPeriodActive: ${await voting.revealPeriodActive(pollID)}`)
  console.log('')
}

async function logVoterRewardInfo(pollID, voterFor, voterAgainst) {
  const registry = await Registry.deployed()

  let voterForReward, voterAgainstReward
  try {
    voterForReward = await registry.voterReward(voterFor, pollID, 420)
  } catch (err) {
    voterForReward = ''
  }

  try {
    voterAgainstReward = await registry.voterReward(voterAgainst, pollID, 420)
  } catch (err) {
    voterAgainstReward = ''
  }

  console.log(`voterFor reward: ${voterForReward}`)
  console.log(`voterAgainst reward: ${voterAgainstReward}`)
  console.log('')
}

function logEventsFor(contract) {
  const events = contract.allEvents();
  events.watch(function(error, result) {
    if(error) {
      console.log('Error');
    }
    else {
      console.log('Event: ', result.event + '');
      for(key in result.args) {
        console.log(`  ${key}: ${result.args[key]}`)
      }
    }
    console.log('')
  })
}
