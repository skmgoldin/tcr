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
    const [applicant, challenger, voter1, voter2] = accounts

    it('...', async () => {
      console.log('')

      const registry = await Registry.deployed()
      const voting = await utils.getVoting();

      // logEventsFor(registry)

      const token = Token.at(await registry.token.call());
      const listingHash = utils.getListingHash('nochallenge.net')

      console.log(`apply with listingHash=${listingHash}`)
      console.log('')

      await utils.as(applicant, registry.apply, listingHash, paramConfig.minDeposit, '')
      const listingResult = await registry.listings.call(listingHash)
      await logBalances(accounts, token)

      const receipt = await utils.as(challenger, registry.challenge, listingHash, '')
      const { challengeID } = receipt.logs[0].args

      console.log(`challenge #${challengeID} issued`)
      console.log('')

      console.log('commit votes')
      console.log('')
      await utils.commitVote(challengeID, 1, 7, 420, voter1)
      await utils.commitVote(challengeID, 0, 1, 420, voter2)
      await utils.increaseTime(paramConfig.commitStageLength + 1)

      console.log('reveal votes')
      console.log('')
      await voting.revealVote(challengeID, 1, 420, { from: voter1 })
      await voting.revealVote(challengeID, 0, 420, { from: voter2 })
      await utils.increaseTime(paramConfig.revealStageLength)
      
      console.log('update status')
      console.log('')
      await registry.updateStatus(listingHash)

      await logBalances(accounts, token)
      await logVoterRewardInfo(challengeID, voter1, voter2)

      console.log('claim voter rewards')
      console.log('')
      try { await registry.claimReward(challengeID, 420, { from: voter1 }) } catch (err) { }
      try { await registry.claimReward(challengeID, 420, { from: voter2 }) } catch (err) { }

      await logBalances(accounts, token)

      await logChallengeInfo(challengeID)
      await logVotingInfo(challengeID)
      await logListingInfo(listingHash)
    })
  })
})

async function logBalances(accounts, token) {
  const [applicant, challenger, voter1, voter2] = accounts
  const applicantBalance = (await token.balanceOf.call(applicant)).toNumber()
  const challengerBalance = (await token.balanceOf.call(challenger)).toNumber()
  const voter1Balance = (await token.balanceOf.call(voter1)).toNumber()
  const voter2Balance = (await token.balanceOf.call(voter2)).toNumber()
  console.log('balances:')
  console.log(`  applicant: ${applicantBalance}`)
  console.log(`  challenger: ${challengerBalance}`)
  console.log(`  voter1: ${voter1Balance}`)
  console.log(`  voter2: ${voter2Balance}`)
  console.log('')
}

async function logListingInfo(listingHash) {
  const registry = await Registry.deployed()
  console.log(`listing: ${listingHash}`)
  try {
    console.log(`  challengeCanBeResolved: ${await registry.challengeCanBeResolved(listingHash)}`)
  } catch (err) {
    console.log(`  challengeCanBeResolved: `)
  }
  console.log(`  canBeWhitelisted: ${await registry.canBeWhitelisted(listingHash)}`)
  console.log(`  isWhitelisted: ${await registry.isWhitelisted(listingHash)}`)
  console.log('')
}

async function logChallengeInfo(challengeID) {
  const registry = await Registry.deployed()
  const challengeResult = await registry.challenges(challengeID)
  console.log(`challenge: #${challengeID}`)
  console.log(`  rewardPool: ${challengeResult[0].toNumber()}`)
  console.log(`  challenger: ${challengeResult[1]}`)
  console.log(`  resolved: ${challengeResult[2]}`)
  console.log(`  stake: ${challengeResult[3].toNumber()}`)
  console.log(`  totalTokens: ${challengeResult[4].toNumber()}`)
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

async function logVoterRewardInfo(pollID, voter1, voter2) {
  const registry = await Registry.deployed()

  let voter1Reward, voter2Reward
  try {
    voter1Reward = await registry.voterReward(voter1, pollID, 420)
  } catch (err) {
    voter1Reward = ''
  }

  try {
    voter2Reward = await registry.voterReward(voter2, pollID, 420)
  } catch (err) {
    voter2Reward = ''
  }

  console.log(`Voter1 reward: ${voter1Reward}`)
  console.log(`Voter2 reward: ${voter2Reward}`)
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
