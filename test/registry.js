/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const Token = artifacts.require('EIP20.sol');

const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const utils = require('./utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: deposit', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const incAmount = minDeposit.div(bigTen(2));
    const [applicant, challenger] = accounts;

    it('should increase the deposit for a specific listing in the listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('specificlisting.net');

      await utils.addToWhitelist(listing, minDeposit, applicant);
      await utils.as(applicant, registry.deposit, listing, incAmount);

      const unstakedDeposit = await utils.getUnstakedDeposit(listing);
      const expectedAmount = incAmount.add(minDeposit);
      assert.strictEqual(
        unstakedDeposit, expectedAmount.toString(10),
        'Unstaked deposit should be equal to the sum of the original + increase amount',
      );
    });

    it('should increase a deposit for a pending application', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('pendinglisting.net');
      await utils.as(applicant, registry.apply, listing, minDeposit);

      try {
        await utils.as(applicant, registry.deposit, listing, incAmount);

        const unstakedDeposit = await utils.getUnstakedDeposit(listing);
        const expectedAmount = incAmount.add(minDeposit);
        assert.strictEqual(unstakedDeposit, expectedAmount.toString(10), 'Deposit should have increased for pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should increase deposit for a whitelisted, challenged listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('challengelisting.net');
      await utils.addToWhitelist(listing, minDeposit, applicant);
      const originalDeposit = await utils.getUnstakedDeposit(listing);

      // challenge, then increase deposit
      await utils.as(challenger, registry.challenge, listing);
      await utils.as(applicant, registry.deposit, listing, incAmount);

      const afterIncDeposit = await utils.getUnstakedDeposit(listing);

      const expectedAmount = (
        bigTen(originalDeposit).add(bigTen(incAmount))
      ).sub(bigTen(minDeposit));

      assert.strictEqual(afterIncDeposit, expectedAmount.toString(10), 'Deposit should have increased for whitelisted, challenged listing');
    });

    it('should not increase deposit for a listing not owned by the msg.sender', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('notowner.com');
      await utils.addToWhitelist(listing, minDeposit, applicant);

      try {
        await utils.as(challenger, registry.deposit, listing, incAmount);
        assert(false, 'Deposit should not have increased when sent by the wrong msg.sender');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: tokenClaims', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const [applicant, challenger, voter] = accounts;

    it('should report properly whether a voter has claimed tokens', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const listing = utils.getListingHash('claims.com');

      await utils.addToWhitelist(listing, minDeposit, applicant);

      const pollID = await utils.challengeAndGetPollID(listing, challenger);

      await utils.commitVote(pollID, '0', '10', '420', voter);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      await utils.as(voter, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      await utils.as(challenger, registry.updateStatus, listing);

      const initialHasClaimed = await registry.tokenClaims.call(pollID, voter);
      assert.strictEqual(initialHasClaimed, false, 'The voter is purported to have claimed ' +
        'their reward, when in fact they have not');

      await utils.as(voter, registry.claimReward, pollID, '420');

      const finalHasClaimed = await registry.tokenClaims.call(pollID, voter);
      assert.strictEqual(finalHasClaimed, true, 'The voter is purported to not have claimed ' +
        'their reward, when in fact they have');
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: withdraw', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const withdrawAmount = minDeposit.div(bigTen(2));
    const [applicant, challenger] = accounts;

    it('should not withdraw tokens from a listing that has a deposit === minDeposit', async () => {
      const registry = await Registry.deployed();
      const dontChallengeListing = 'dontchallenge.net';
      const errMsg = 'applicant was able to withdraw tokens';

      await utils.addToWhitelist(dontChallengeListing, minDeposit, applicant);
      const origDeposit = await utils.getUnstakedDeposit(dontChallengeListing);

      try {
        await utils.as(applicant, registry.withdraw, dontChallengeListing, withdrawAmount);
        assert(false, errMsg);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const afterWithdrawDeposit = await utils.getUnstakedDeposit(dontChallengeListing);

      assert.strictEqual(afterWithdrawDeposit.toString(10), origDeposit.toString(10), errMsg);
    });

    it('should not withdraw tokens from a listing that is locked in a challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('shouldntwithdraw.net');

      // Whitelist, then challenge
      await utils.addToWhitelist(listing, minDeposit, applicant);
      await utils.as(challenger, registry.challenge, listing);

      try {
        // Attempt to withdraw; should fail
        await utils.as(applicant, registry.withdraw, listing, withdrawAmount);
        assert.strictEqual(false, 'Applicant should not have been able to withdraw from a challenged, locked listing');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      // TODO: check balance
      // TODO: apply, gets challenged, and then minDeposit lowers during challenge.
      // still shouldn't be able to withdraw anything.
      // when challenge ends, should be able to withdraw origDeposit - new minDeposit
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: updateStatus', () => {
    const [applicant, challenger] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);

    it('should whitelist listing if apply stage ended without a challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('whitelist.io');
      // note: this function calls registry.updateStatus at the end
      await utils.addToWhitelist(listing, minDeposit, applicant);

      const result = await registry.isWhitelisted.call(listing);
      assert.strictEqual(result, true, 'Listing should have been whitelisted');
    });

    it('should not whitelist a listing that is still pending an application', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('tooearlybuddy.io');
      await utils.as(applicant, registry.apply, listing, minDeposit);

      try {
        await utils.as(applicant, registry.updateStatus, listing);
        assert(false, 'Listing should not have been whitelisted');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not whitelist a listing that is currently being challenged', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('dontwhitelist.io');

      await utils.as(applicant, registry.apply, listing, minDeposit);
      await utils.as(challenger, registry.challenge, listing);

      try {
        await registry.updateStatus(listing);
        assert(false, 'Listing should not have been whitelisted');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not whitelist a listing that failed a challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('dontwhitelist.net');

      await utils.as(applicant, registry.apply, listing, minDeposit);
      await utils.as(challenger, registry.challenge, listing);

      const plcrComplete = paramConfig.revealStageLength + paramConfig.commitStageLength + 1;
      await utils.increaseTime(plcrComplete);

      await registry.updateStatus(listing);
      const result = await registry.isWhitelisted(listing);
      assert.strictEqual(result, false, 'Listing should not have been whitelisted');
    });

    it('should not be possible to add a listing to the whitelist just by calling updateStatus', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('updatemenow.net');

      try {
        await utils.as(applicant, registry.updateStatus, listing);
        assert(false, 'Listing should not have been whitelisted');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not be possible to add a listing to the whitelist just by calling updateStatus after it has been previously removed', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('somanypossibilities.net');

      await utils.addToWhitelist(listing, minDeposit, applicant);
      const resultOne = await registry.isWhitelisted(listing);
      assert.strictEqual(resultOne, true, 'Listing should have been whitelisted');

      await utils.as(applicant, registry.exit, listing);
      const resultTwo = await registry.isWhitelisted(listing);
      assert.strictEqual(resultTwo, false, 'Listing should not be in the whitelist');

      try {
        await utils.as(applicant, registry.updateStatus, listing);
        assert(false, 'Listing should not have been whitelisted');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: claimReward', () => {
    const [applicant, challenger, voterAlice] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);

    it('should transfer the correct number of tokens once a challenge has been resolved', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('claimthis.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, minDeposit);
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      // Challenge
      const pollID = await utils.challengeAndGetPollID(listing, challenger);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      // Update status
      await utils.as(applicant, registry.updateStatus, listing);

      // Alice claims reward
      const aliceVoterReward = await registry.voterReward(voterAlice, pollID, '420');
      await utils.as(voterAlice, registry.claimReward, pollID, '420');

      // Alice withdraws her voting rights
      await utils.as(voterAlice, voting.withdrawVotingRights, '500');

      const aliceExpected = aliceStartingBalance.add(aliceVoterReward);
      const aliceFinalBalance = await token.balanceOf.call(voterAlice);

      assert.strictEqual(
        aliceFinalBalance.toString(10), aliceExpected.toString(10),
        'alice should have the same balance as she started',
      );
    });

    it('should revert if challenge does not exist', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('reversion.net');
      await utils.addToWhitelist(listing, minDeposit, applicant);

      try {
        const nonPollID = '666';
        await utils.as(voterAlice, registry.claimReward, nonPollID, '420');
        assert(false, 'should not have been able to claimReward for non-existant challengeID');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should revert if provided salt is incorrect', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('sugar.net');
      const voting = await utils.getVoting();
      const token = Token.at(await registry.token.call());

      const applicantStartingBalance = await token.balanceOf.call(applicant);
      const aliceStartBal = await token.balanceOf.call(voterAlice);
      await utils.addToWhitelist(listing, minDeposit, applicant);

      const pollID = await utils.challengeAndGetPollID(listing, challenger);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      const applicantFinalBalance = await token.balanceOf.call(applicant);
      const aliceFinalBalance = await token.balanceOf.call(voterAlice);
      const expectedBalance = applicantStartingBalance.sub(minDeposit);

      assert.strictEqual(
        applicantFinalBalance.toString(10), expectedBalance.toString(10),
        'applicants final balance should be what they started with minus the minDeposit',
      );
      assert.strictEqual(
        aliceFinalBalance.toString(10), (aliceStartBal.sub(bigTen(500))).toString(10),
        'alices final balance should be exactly the same as her starting balance',
      );

      // Update status
      await utils.as(applicant, registry.updateStatus, listing);

      try {
        await utils.as(voterAlice, registry.claimReward, pollID, '421');
        assert(false, 'should not have been able to claimReward with the wrong salt');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not transfer tokens if msg.sender has already claimed tokens for a challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('sugar.net');
      const voting = await utils.getVoting();
      const token = Token.at(await registry.token.call());

      const applicantStartingBalance = await token.balanceOf.call(applicant);
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      await utils.addToWhitelist(listing, minDeposit, applicant);

      // Challenge
      const pollID = await utils.challengeAndGetPollID(listing, challenger);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      // Update status
      await utils.as(applicant, registry.updateStatus, listing);

      // Claim reward
      await utils.as(voterAlice, registry.claimReward, pollID, '420');

      try {
        await utils.as(voterAlice, registry.claimReward, pollID, '420');
        assert(false, 'should not have been able to call claimReward twice');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const applicantEndingBalance = await token.balanceOf.call(applicant);
      const appExpected = applicantStartingBalance.sub(minDeposit);

      const aliceEndingBalance = await token.balanceOf.call(voterAlice);
      const aliceExpected = aliceStartingBalance.add(minDeposit.div(bigTen(2))).sub(bigTen(500));

      assert.strictEqual(
        applicantEndingBalance.toString(10), appExpected.toString(10),
        'applicants ending balance is incorrect',
      );
      assert.strictEqual(
        aliceEndingBalance.toString(10), aliceExpected.toString(10),
        'alices ending balance is incorrect',
      );
    });

    it('should not transfer tokens for an unresolved challenge', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('unresolved.net');
      const voting = await utils.getVoting();
      const token = Token.at(await registry.token.call());

      const applicantStartingBalance = await token.balanceOf.call(applicant);
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      await utils.addToWhitelist(listing, minDeposit, applicant);

      // Challenge
      const pollID = await utils.challengeAndGetPollID(listing, challenger);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      try {
        await utils.as(voterAlice, registry.claimReward, pollID, '420');
        assert(false, 'should not have been able to claimReward for unresolved challenge');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const applicantEndingBalance = await token.balanceOf.call(applicant);
      const appExpected = applicantStartingBalance.sub(minDeposit);

      const aliceEndingBalance = await token.balanceOf.call(voterAlice);
      const aliceExpected = aliceStartingBalance.sub(bigTen(500));

      assert.strictEqual(
        applicantEndingBalance.toString(10), appExpected.toString(10),
        'applicants ending balance is incorrect',
      );
      assert.strictEqual(
        aliceEndingBalance.toString(10), aliceExpected.toString(10),
        'alices ending balance is incorrect',
      );
    });
  });
});

contract('Registry', () => {
  describe('Function: calculateVoterReward', () => {
    it('should return the correct value');
    it('should throw errors if given false arguments');
  });
});

contract('Registry', () => {
  describe('Function: canBeWhitelisted', () => {
    it('should return true for a listing that has passed all tests');
    it('should return false for a listing that failes any one of the tests');
  });
});

contract('Registry', () => {
  describe('Function: challengeCanBeResolved', () => {
    it('should return true for a poll that has ended');
    it('should return false if the poll either doesnt exist, or its still in contention');
  });
});

contract('Registry', () => {
  describe('Function: determineReward', () => {
    it('should return the correct value of reward for a given challengeID');
    it('should throw errors if it hasnt been resolved or its already ended');
  });
});

contract('Registry', (accounts) => {
  describe('Function: appWasMade', () => {
    const [applicant] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);
    it('should return true if applicationExpiry was previously initialized', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('wasthismade.net');

      // Apply
      await utils.as(applicant, registry.apply, listing, minDeposit);
      const result = await registry.appWasMade(listing);
      assert.strictEqual(result, true, 'should have returned true for the applied listing');

      // Commit stage complete
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      const resultTwo = await registry.appWasMade(listing);
      assert.strictEqual(resultTwo, true, 'should have returned true because app is still not expired');

      // Reveal stage complete, update status (whitelist it)
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      await utils.as(applicant, registry.updateStatus, listing);
      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'should have been whitelisted');
      const resultThree = await registry.appWasMade(listing);
      assert.strictEqual(resultThree, true, 'should have returned true because its whitelisted');

      // Exit
      await utils.as(applicant, registry.exit, listing);
      const resultFour = await registry.appWasMade(listing);
      assert.strictEqual(resultFour, false, 'should have returned false because exit');
    });

    it('should return false if applicationExpiry was uninitialized', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('falseapp.net');

      const result = await registry.appWasMade(listing);
      assert.strictEqual(result, false, 'should have returned false because listing was never applied');
    });
  });
});

contract('Registry', (accounts) => {
  const [applicant] = accounts;
  const minDeposit = bigTen(paramConfig.minDeposit);

  describe('Function: isExpired', () => {
    it('should return true if the argument is greater than the current block.timestamp', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('expiredlisting.net');

      await utils.as(applicant, registry.apply, listing, minDeposit);

      const result = await registry.listings.call(listing);

      // Voting period done (ie. app expired)
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);

      const isExpired = await registry.isExpired(result[0]);
      assert.strictEqual(isExpired, true, 'application should have expired.');
    });

    it('should return false if the argument is less than the current block.timestamp', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('notexpired.net');

      await utils.as(applicant, registry.apply, listing, minDeposit);

      const result = await registry.listings.call(listing);

      const isExpired = await registry.isExpired(result[0]);
      assert.strictEqual(isExpired, false, 'application should not have expired.');
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: isWhitelisted', () => {
    const [applicant] = accounts;

    it('should verify a listing is not in the whitelist', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('eth.eth'); // the listing to be tested
      const result = await registry.isWhitelisted.call(listing);
      assert.strictEqual(result, false, 'Listing should not be whitelisted');
    });

    it('should verify a listing is in the whitelist', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('eth.eth');
      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);
      const result = await registry.isWhitelisted.call(listing);
      assert.strictEqual(result, true, 'Listing should have been whitelisted');
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: apply', () => {
    const [applicant] = accounts;

    it('should allow a new listing to apply', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('nochallenge.net');
      // apply with accounts[1]
      await registry.apply(listing, paramConfig.minDeposit, { from: accounts[1] });
      // get the struct in the mapping
      const result = await registry.listings.call(listing);
      // check that Application is initialized correctly
      assert.strictEqual(result[0] * 1000 > Date.now(), true, 'challenge time < now');
      assert.strictEqual(result[1], false, 'challenged != false');
      assert.strictEqual(result[2], accounts[1], 'owner of application != address that applied');
      assert.strictEqual(
        result[3].toString(10),
        paramConfig.minDeposit.toString(10),
        'incorrect unstakedDeposit',
      );
    });

    it('should not allow a listing to apply which has a pending application', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('doublelisting.net');
      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit);
      try {
        await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit);
        assert(false, 'application was made for listing with an already pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should not allow a listing to apply which is already listed', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('nochallenge.net');
      const initialAmnt = await token.balanceOf.call(registry.address);
      // apply with accounts[1] with the same listing, should fail since there's
      // an existing application already
      try {
        await registry.apply(listing, paramConfig.minDeposit, { from: accounts[2] });
      } catch (err) {
        // TODO: Check if EVM error
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const finalAmt = await token.balanceOf.call(registry.address);
      assert.strictEqual(
        finalAmt.toString(10),
        initialAmnt.toString(10),
        'why did my wallet balance change',
      );
    });

    it(
      'should add a listing to the whitelist which went unchallenged in its application period',
      async () => {
        const registry = await Registry.deployed();
        const listing = utils.getListingHash('nochallenge.net');
        await utils.increaseTime(paramConfig.applyStageLength + 1);
        await registry.updateStatus(listing);
        const result = await registry.isWhitelisted.call(listing);
        assert.strictEqual(result, true, "listing didn't get whitelisted");
      },
    );
  });
});

contract('Registry', (accounts) => {
  describe('Function: challenge', () => {
    const [applicant, challenger, voter, proposer] = accounts;

    it('should successfully challenge an application', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('failure.net');

      const challengerStartingBalance = await token.balanceOf.call(challenger);

      await utils.as(applicant, registry.apply, listing, paramConfig.minDeposit);
      await utils.challengeAndGetPollID(listing, challenger);
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, false, 'An application which should have failed succeeded');

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      // Note edge case: no voters, so challenger gets entire stake
      const expectedFinalBalance =
        challengerStartingBalance.add(new BN(paramConfig.minDeposit, 10));
      assert.strictEqual(
        challengerFinalBalance.toString(10), expectedFinalBalance.toString(10),
        'Reward not properly disbursed to challenger',
      );
    });

    it('should successfully challenge a listing', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('failure.net');

      const challengerStartingBalance = await token.balanceOf.call(challenger);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      await utils.challengeAndGetPollID(listing, challenger);
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, false, 'An application which should have failed succeeded');

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      // Note edge case: no voters, so challenger gets entire stake
      const expectedFinalBalance =
        challengerStartingBalance.add(new BN(paramConfig.minDeposit, 10));
      assert.strictEqual(
        challengerFinalBalance.toString(10), expectedFinalBalance.toString(10),
        'Reward not properly disbursed to challenger',
      );
    });

    it('should unsuccessfully challenge an application', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const listing = utils.getListingHash('winner.net');
      const minDeposit = new BN(paramConfig.minDeposit, 10);

      await utils.as(applicant, registry.apply, listing, minDeposit);
      const pollID = await utils.challengeAndGetPollID(listing, challenger);
      await utils.commitVote(pollID, 1, 10, 420, voter);
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      await utils.as(voter, voting.revealVote, pollID, 1, 420);
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelisted, true,
        'An application which should have succeeded failed',
      );

      const unstakedDeposit = await utils.getUnstakedDeposit(listing);
      const expectedUnstakedDeposit =
        minDeposit.add(minDeposit.mul(bigTen(paramConfig.dispensationPct).div(bigTen(100))));

      assert.strictEqual(
        unstakedDeposit.toString(10), expectedUnstakedDeposit.toString(10),
        'The challenge winner was not properly disbursed their tokens',
      );
    });

    it('should unsuccessfully challenge a listing', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const listing = utils.getListingHash('winner2.net');
      const minDeposit = new BN(paramConfig.minDeposit, 10);

      await utils.addToWhitelist(listing, minDeposit, applicant);

      const pollID = await utils.challengeAndGetPollID(listing, challenger);
      await utils.commitVote(pollID, 1, 10, 420, voter);
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      await utils.as(voter, voting.revealVote, pollID, 1, 420);
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'An application which should have succeeded failed');

      const unstakedDeposit = await utils.getUnstakedDeposit(listing);
      const expectedUnstakedDeposit = minDeposit.add(minDeposit.mul(new BN(paramConfig.dispensationPct, 10).div(new BN('100', 10))));
      assert.strictEqual(
        unstakedDeposit.toString(10), expectedUnstakedDeposit.toString(10),
        'The challenge winner was not properly disbursed their tokens',
      );
    });

    it('should touch-and-remove a listing with a depost below the current minimum', async () => {
      const registry = await Registry.deployed();
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('touchandremove.net');
      const minDeposit = new BN(paramConfig.minDeposit, 10);
      const newMinDeposit = minDeposit.add(new BN('1', 10));

      const applicantStartingBal = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, minDeposit, applicant);

      const receipt = await utils.as(
        proposer, parameterizer.proposeReparameterization,
        'minDeposit', newMinDeposit,
      );
      const propID = utils.getReceiptValue(receipt, 'propID');

      await utils.increaseTime(paramConfig.pApplyStageLength + 1);

      await parameterizer.processProposal(propID);

      const challengerStartingBal = await token.balanceOf.call(challenger);
      utils.as(challenger, registry.challenge, listing);
      const challengerFinalBal = await token.balanceOf.call(challenger);

      assert(
        challengerStartingBal.eq(challengerFinalBal),
        'Tokens were not returned to challenger',
      );

      const applicantFinalBal = await token.balanceOf.call(applicant);

      assert(
        applicantStartingBal.eq(applicantFinalBal),
        'Tokens were not returned to applicant',
      );

      assert(!await registry.isWhitelisted.call(listing), 'Listing was not removed');
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: exit', () => {
    const [applicant, challenger, voter] = accounts;

    it('should allow a listing to exit when no challenge exists', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('consensys.net');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.exit(listing, { from: applicant });

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelistedAfterExit, false, 'the listing was not removed on exit');

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert.strictEqual(
        initialApplicantTokenHoldings.toString(10),
        finalApplicantTokenHoldings.toString(10),
        'the applicant\'s tokens were not returned to them after exiting the registry',
      );
    });

    it('should not allow a listing to exit when a challenge does exist', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const listing = utils.getListingHash('consensys.net');

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(listing);
      assert.strictEqual(isWhitelisted, true, 'the listing was not added to the registry');

      await registry.challenge(listing, { from: challenger });
      try {
        await registry.exit(listing, { from: applicant });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the listing was able to exit while a challenge was active',
      );

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert(
        initialApplicantTokenHoldings.gt(finalApplicantTokenHoldings),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );

      // Clean up state, remove consensys.net (it fails its challenge due to draw)
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(listing);
    });

    it('should not allow a listing to be exited by someone who doesn\'t own it', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('consensys.net');

      await utils.addToWhitelist(listing, paramConfig.minDeposit, applicant);

      try {
        await registry.exit(listing, { from: voter });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const isWhitelistedAfterExit = await registry.isWhitelisted.call(listing);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the listing was exited by someone other than its owner',
      );
    });
  });
});

contract('Registry', (accounts) => {
  describe('User stories', () => {
    const [applicant, challenger, voter] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);

    it('should apply, fail challenge, and reject listing', async () => {
      const registry = await Registry.deployed();
      const listing = utils.getListingHash('failChallenge.net'); // listing to apply with
      // apply with accounts[2]
      await registry.apply(listing, paramConfig.minDeposit, { from: applicant });
      // challenge with accounts[1]
      await registry.challenge(listing, { from: challenger });

      await utils.increaseTime(paramConfig.revealStageLength + paramConfig.commitStageLength + 1);
      await registry.updateStatus(listing);

      // should not have been added to whitelist
      const result = await registry.isWhitelisted(listing);
      assert.strictEqual(result, false, 'listing should not be whitelisted');
    });

    it('should apply, pass challenge, and whitelist listing', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const listing = utils.getListingHash('passChallenge.net');

      await utils.as(applicant, registry.apply, listing, minDeposit);

      // Challenge and get back the pollID
      const pollID = await utils.challengeAndGetPollID(listing, challenger);

      // Make sure it's cool to commit
      const cpa = await voting.commitPeriodActive.call(pollID);
      assert.strictEqual(cpa, true, 'Commit period should be active');

      // Virgin commit
      const tokensArg = 10;
      const salt = 420;
      const voteOption = 1;
      await utils.commitVote(pollID, voteOption, tokensArg, salt, voter);

      const numTokens = await voting.getNumTokens.call(voter, pollID);
      assert.strictEqual(numTokens.toString(10), tokensArg.toString(10), 'Should have committed the correct number of tokens');

      // Reveal
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      // Make sure commit period is inactive
      const commitPeriodActive = await voting.commitPeriodActive.call(pollID);
      assert.strictEqual(commitPeriodActive, false, 'Commit period should be inactive');
      // Make sure reveal period is active
      let rpa = await voting.revealPeriodActive.call(pollID);
      assert.strictEqual(rpa, true, 'Reveal period should be active');

      await voting.revealVote(pollID, voteOption, salt, { from: voter });

      // End reveal period
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      rpa = await voting.revealPeriodActive.call(pollID);
      assert.strictEqual(rpa, false, 'Reveal period should not be active');

      // updateStatus
      const pollResult = await voting.isPassed.call(pollID);
      assert.strictEqual(pollResult, true, 'Poll should have passed');

      // Add to whitelist
      await registry.updateStatus(listing);
      const result = await registry.isWhitelisted(listing);
      assert.strictEqual(result, true, 'Listing should be whitelisted');
    });
  });
});
