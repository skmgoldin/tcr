/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const Token = artifacts.require('Token.sol');

const fs = require('fs');
const BN = require('bignumber.js');

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.paramDefaults;

const utils = require('./utils.js');

const bigTen = number => new BN(number.toString(10), 10);

contract('Registry', (accounts) => {
  describe('Function: deposit', () => {
    const minDeposit = bigTen(paramConfig.minDeposit);
    const incAmount = minDeposit.div(bigTen(2));
    const [applicant, challenger] = accounts;

    it('should increase the deposit for a specific domain in the listing', async () => {
      const registry = await Registry.deployed();
      const domain = 'specificdomain.net';

      await utils.addToWhitelist(domain, minDeposit, applicant);
      await utils.as(applicant, registry.deposit, domain, incAmount);

      const unstakedDeposit = await utils.getUnstakedDeposit(domain);
      const expectedAmount = incAmount.add(minDeposit);
      assert.strictEqual(unstakedDeposit, expectedAmount.toString(10),
        'Unstaked deposit should be equal to the sum of the original + increase amount');
    });

    it('should increase a deposit for a pending application', async () => {
      const registry = await Registry.deployed();
      const domain = 'pendingdomain.net';
      await utils.as(applicant, registry.apply, domain, minDeposit);

      try {
        await utils.as(applicant, registry.deposit, domain, incAmount);

        const unstakedDeposit = await utils.getUnstakedDeposit(domain);
        const expectedAmount = incAmount.add(minDeposit);
        assert.strictEqual(unstakedDeposit, expectedAmount.toString(10), 'Deposit should have increased for pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should increase deposit for a whitelisted, challenged domain', async () => {
      const registry = await Registry.deployed();
      const domain = 'challengedomain.net';
      await utils.addToWhitelist(domain, minDeposit, applicant);
      const originalDeposit = await utils.getUnstakedDeposit(domain);

      // challenge, then increase deposit
      await utils.as(challenger, registry.challenge, domain);
      await utils.as(applicant, registry.deposit, domain, incAmount);

      const afterIncDeposit = await utils.getUnstakedDeposit(domain);

      const expectedAmount = (
        bigTen(originalDeposit).add(bigTen(incAmount))
      ).sub(bigTen(minDeposit));

      assert.strictEqual(afterIncDeposit, expectedAmount.toString(10), 'Deposit should have increased for whitelisted, challenged domain');
    });

    it('should not increase deposit for a listing not owned by the msg.sender', async () => {
      const registry = await Registry.deployed();
      const domain = 'notowner.com';
      await utils.addToWhitelist(domain, minDeposit, applicant);

      try {
        await utils.as(challenger, registry.deposit, domain, incAmount);
        assert(false, 'Deposit should not have increased when sent by the wrong msg.sender');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
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
      const dontChallengeDomain = 'dontchallenge.net';
      const errMsg = 'applicant was able to withdraw tokens';

      await utils.addToWhitelist(dontChallengeDomain, minDeposit, applicant);
      const origDeposit = await utils.getUnstakedDeposit(dontChallengeDomain);

      try {
        await utils.as(applicant, registry.withdraw, dontChallengeDomain, withdrawAmount);
        assert(false, errMsg);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const afterWithdrawDeposit = await utils.getUnstakedDeposit(dontChallengeDomain);

      assert.strictEqual(afterWithdrawDeposit.toString(10), origDeposit.toString(10), errMsg);
    });

    it('should not withdraw tokens from a domain that is locked in a challenge', async () => {
      const registry = await Registry.deployed();
      const domain = 'shouldntwithdraw.net';

      // Whitelist, then challenge
      await utils.addToWhitelist(domain, minDeposit, applicant);
      await utils.as(challenger, registry.challenge, domain);

      try {
        // Attempt to withdraw; should fail
        await utils.as(applicant, registry.withdraw, domain, withdrawAmount);
        assert.strictEqual(false, 'Applicant should not have been able to withdraw from a challenged, locked domain');
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

    it('should whitelist domain if apply stage ended without a challenge', async () => {
      const registry = await Registry.deployed();
      const domain = 'whitelist.io';
      // note: this function calls registry.updateStatus at the end
      await utils.addToWhitelist(domain, minDeposit, applicant);

      const result = await registry.isWhitelisted.call(domain);
      assert.strictEqual(result, true, 'Domain should have been whitelisted');
    });

    it('should not whitelist a domain that is still pending an application', async () => {
      const registry = await Registry.deployed();
      const domain = 'tooearlybuddy.io';
      await utils.as(applicant, registry.apply, domain, minDeposit);

      try {
        await utils.as(applicant, registry.updateStatus, domain);
        assert(false, 'Domain should not have been whitelisted');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not whitelist a domain that is currently being challenged', async () => {
      const registry = await Registry.deployed();
      const domain = 'dontwhitelist.io';

      await utils.as(applicant, registry.apply, domain, minDeposit);
      await utils.as(challenger, registry.challenge, domain);

      try {
        await registry.updateStatus(domain);
        assert(false, 'Domain should not have been whitelisted');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not whitelist a domain that failed a challenge', async () => {
      const registry = await Registry.deployed();
      const domain = 'dontwhitelist.net';

      await utils.as(applicant, registry.apply, domain, minDeposit);
      await utils.as(challenger, registry.challenge, domain);

      const plcrComplete = paramConfig.revealStageLength + paramConfig.commitStageLength + 1;
      await utils.increaseTime(plcrComplete);

      await registry.updateStatus(domain);
      const result = await registry.isWhitelisted(domain);
      assert.strictEqual(result, false, 'Domain should not have been whitelisted');
    });

    it('should not be possible to add a domain to the whitelist just by calling updateStatus', async () => {
      const registry = await Registry.deployed();
      const domain = 'updatemenow.net';

      try {
        await utils.as(applicant, registry.updateStatus, domain);
        assert(false, 'Domain should not have been whitelisted');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not be possible to add a domain to the whitelist just by calling updateStatus after it has been previously removed', async () => {
      const registry = await Registry.deployed();
      const domain = 'somanypossibilities.net';

      await utils.addToWhitelist(domain, minDeposit, applicant);
      const resultOne = await registry.isWhitelisted(domain);
      assert.strictEqual(resultOne, true, 'Domain should have been whitelisted');

      await utils.as(applicant, registry.exit, domain);
      const resultTwo = await registry.isWhitelisted(domain);
      assert.strictEqual(resultTwo, false, 'Domain should not be in the whitelist');

      try {
        await utils.as(applicant, registry.updateStatus, domain);
        assert(false, 'Domain should not have been whitelisted');
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
      const domain = 'claimthis.net';

      // Apply
      await utils.as(applicant, registry.apply, domain, minDeposit);
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      // Challenge
      const pollID = await utils.challengeAndGetPollID(domain, challenger);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      // Update status
      await utils.as(applicant, registry.updateStatus, domain);

      // Alice claims reward
      const aliceVoterReward = await registry.voterReward(voterAlice, pollID, '420');
      await utils.as(voterAlice, registry.claimReward, pollID, '420');

      // Alice withdraws her voting rights
      await utils.as(voterAlice, voting.withdrawVotingRights, '500');

      const aliceExpected = aliceStartingBalance.add(aliceVoterReward);
      const aliceFinalBalance = await token.balanceOf.call(voterAlice);

      assert.strictEqual(aliceFinalBalance.toString(10), aliceExpected.toString(10),
        'alice should have the same balance as she started');
    });

    it('should revert if challenge does not exist', async () => {
      const registry = await Registry.deployed();
      const domain = 'reversion.net';
      await utils.addToWhitelist(domain, minDeposit, applicant);

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
      const domain = 'sugar.net';
      const voting = await utils.getVoting();
      const token = Token.at(await registry.token.call());

      const applicantStartingBalance = await token.balanceOf.call(applicant);
      const aliceStartBal = await token.balanceOf.call(voterAlice);
      await utils.addToWhitelist(domain, minDeposit, applicant);

      const pollID = await utils.challengeAndGetPollID(domain, challenger);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      const applicantFinalBalance = await token.balanceOf.call(applicant);
      const aliceFinalBalance = await token.balanceOf.call(voterAlice);
      const expectedBalance = applicantStartingBalance.sub(minDeposit);

      assert.strictEqual(applicantFinalBalance.toString(10), expectedBalance.toString(10),
        'applicants final balance should be what they started with minus the minDeposit');
      assert.strictEqual(
        aliceFinalBalance.toString(10), (aliceStartBal.sub(bigTen(500))).toString(10),
        'alices final balance should be exactly the same as her starting balance');

      // Update status
      await utils.as(applicant, registry.updateStatus, domain);

      try {
        await utils.as(voterAlice, registry.claimReward, pollID, '421');
        assert(false, 'should not have been able to claimReward with the wrong salt');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not transfer tokens if msg.sender has already claimed tokens for a challenge', async () => {
      const registry = await Registry.deployed();
      const domain = 'sugar.net';
      const voting = await utils.getVoting();
      const token = Token.at(await registry.token.call());

      const applicantStartingBalance = await token.balanceOf.call(applicant);
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      await utils.addToWhitelist(domain, minDeposit, applicant);

      // Challenge
      const pollID = await utils.challengeAndGetPollID(domain, challenger);

      // Alice is so committed
      await utils.commitVote(pollID, '0', 500, '420', voterAlice);
      await utils.increaseTime(paramConfig.commitStageLength + 1);

      // Alice is so revealing
      await utils.as(voterAlice, voting.revealVote, pollID, '0', '420');
      await utils.increaseTime(paramConfig.revealStageLength + 1);

      // Update status
      await utils.as(applicant, registry.updateStatus, domain);

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
      const aliceExpected = aliceStartingBalance.add(
        minDeposit.div(bigTen(2)),
      ).sub(bigTen(500));

      assert.strictEqual(
        applicantEndingBalance.toString(10), appExpected.toString(10),
        'applicants ending balance is incorrect');
      assert.strictEqual(
        aliceEndingBalance.toString(10), aliceExpected.toString(10),
        'alices ending balance is incorrect');
    });

    it('should not transfer tokens for an unresolved challenge', async () => {
      const registry = await Registry.deployed();
      const domain = 'unresolved.net';
      const voting = await utils.getVoting();
      const token = Token.at(await registry.token.call());

      const applicantStartingBalance = await token.balanceOf.call(applicant);
      const aliceStartingBalance = await token.balanceOf.call(voterAlice);

      await utils.addToWhitelist(domain, minDeposit, applicant);

      // Challenge
      const pollID = await utils.challengeAndGetPollID(domain, challenger);

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
        'applicants ending balance is incorrect');
      assert.strictEqual(
        aliceEndingBalance.toString(10), aliceExpected.toString(10),
        'alices ending balance is incorrect');
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
    it('should return true for a domain that has passed all tests');
    it('should return false for a domain that failes any one of the tests');
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
      const domain = 'wasthismade.net';

      // Apply
      await utils.as(applicant, registry.apply, domain, minDeposit);
      const result = await registry.appWasMade(domain);
      assert.strictEqual(result, true, 'should have returned true for the applied domain');

      // Commit stage complete
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      const resultTwo = await registry.appWasMade(domain);
      assert.strictEqual(resultTwo, true, 'should have returned true because app is still not expired');

      // Reveal stage complete, update status (whitelist it)
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      await utils.as(applicant, registry.updateStatus, domain);
      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, true, 'should have been whitelisted');
      const resultThree = await registry.appWasMade(domain);
      assert.strictEqual(resultThree, true, 'should have returned true because its whitelisted');

      // Exit
      await utils.as(applicant, registry.exit, domain);
      const resultFour = await registry.appWasMade(domain);
      assert.strictEqual(resultFour, false, 'should have returned false because exit');
    });

    it('should return false if applicationExpiry was uninitialized', async () => {
      const registry = await Registry.deployed();
      const domain = 'falseapp.net';

      const result = await registry.appWasMade(domain);
      assert.strictEqual(result, false, 'should have returned false because domain was never applied');
    });
  });
});

contract('Registry', (accounts) => {
  const [applicant] = accounts;
  const minDeposit = bigTen(paramConfig.minDeposit);

  describe('Function: isExpired', () => {
    it('should return true if the argument is greater than the current block.timestamp', async () => {
      const registry = await Registry.deployed();
      const domain = 'expireddomain.net';

      await utils.as(applicant, registry.apply, domain, minDeposit);

      const hash = utils.getDomainHash(domain);
      const result = await registry.listingMap.call(hash);

      // Voting period done (ie. app expired)
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);

      const isExpired = await registry.isExpired(result[0]);
      assert.strictEqual(isExpired, true, 'application should have expired.');
    });

    it('should return false if the argument is less than the current block.timestamp', async () => {
      const registry = await Registry.deployed();
      const domain = 'notexpired.net';

      await utils.as(applicant, registry.apply, domain, minDeposit);

      const hash = utils.getDomainHash(domain);
      const result = await registry.listingMap.call(hash);

      const isExpired = await registry.isExpired(result[0]);
      assert.strictEqual(isExpired, false, 'application should not have expired.');
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: isWhitelisted', () => {
    const [applicant] = accounts;

    it('should verify a domain is not in the whitelist', async () => {
      const registry = await Registry.deployed();
      const domain = 'eth.eth'; // the domain to be tested
      const result = await registry.isWhitelisted.call(domain);
      assert.strictEqual(result, false, 'Domain should not be whitelisted');
    });

    it('should verify a domain is in the whitelist', async () => {
      const registry = await Registry.deployed();
      const domain = 'eth.eth';
      await utils.addToWhitelist(domain, paramConfig.minDeposit, applicant);
      const result = await registry.isWhitelisted.call(domain);
      assert.strictEqual(result, true, 'Domain should have been whitelisted');
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: apply', () => {
    const [applicant] = accounts;

    it('should allow a new domain to apply', async () => {
      const registry = await Registry.deployed();
      const domain = 'nochallenge.net';
      // apply with accounts[1]
      await registry.apply(domain, paramConfig.minDeposit, { from: accounts[1] });
      // hash the domain so we can identify in listingMap
      const hash = utils.getDomainHash(domain);
      // get the struct in the mapping
      const result = await registry.listingMap.call(hash);
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

    it('should not allow a domain to apply which has a pending application', async () => {
      const registry = await Registry.deployed();
      const domain = 'doubledomain.net';
      await utils.as(applicant, registry.apply, domain, paramConfig.minDeposit);
      try {
        await utils.as(applicant, registry.apply, domain, paramConfig.minDeposit);
        assert(false, 'application was made for domain with an already pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should not allow a domain to apply which is already listed', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const domain = 'nochallenge.net';
      const initialAmnt = await token.balanceOf.call(registry.address);
      // apply with accounts[1] with the same domain, should fail since there's
      // an existing application already
      try {
        await registry.apply(domain, paramConfig.minDeposit, { from: accounts[2] });
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

    it('should add a domain to the whitelist which went unchallenged in its application period',
      async () => {
        const registry = await Registry.deployed();
        const domain = 'nochallenge.net';
        await utils.increaseTime(paramConfig.applyStageLength + 1);
        await registry.updateStatus(domain);
        const result = await registry.isWhitelisted.call(domain);
        assert.strictEqual(result, true, "domain didn't get whitelisted");
      });
  });
});

contract('Registry', (accounts) => {
  describe('Function: challenge', () => {
    const [applicant, challenger, voter, proposer] = accounts;

    it('should successfully challenge an application', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const domain = 'failure.net';

      const challengerStartingBalance = await token.balanceOf.call(challenger);

      await utils.as(applicant, registry.apply, domain, paramConfig.minDeposit);
      await utils.challengeAndGetPollID(domain, challenger);
      await utils.increaseTime(
        paramConfig.commitStageLength + paramConfig.revealStageLength + 1,
      );
      await registry.updateStatus(domain);

      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, false, 'An application which should have failed succeeded');

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      // Note edge case: no voters, so challenger gets entire stake
      const expectedFinalBalance = challengerStartingBalance.add(
        new BN(paramConfig.minDeposit, 10),
      );
      assert.strictEqual(challengerFinalBalance.toString(10), expectedFinalBalance.toString(10),
        'Reward not properly disbursed to challenger');
    });

    it('should successfully challenge a listing', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const domain = 'failure.net';

      const challengerStartingBalance = await token.balanceOf.call(challenger);

      await utils.addToWhitelist(domain, paramConfig.minDeposit, applicant);

      await utils.challengeAndGetPollID(domain, challenger);
      await utils.increaseTime(
        paramConfig.commitStageLength + paramConfig.revealStageLength + 1,
      );
      await registry.updateStatus(domain);

      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, false, 'An application which should have failed succeeded');

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      // Note edge case: no voters, so challenger gets entire stake
      const expectedFinalBalance = challengerStartingBalance.add(
        new BN(paramConfig.minDeposit, 10),
      );
      assert.strictEqual(challengerFinalBalance.toString(10), expectedFinalBalance.toString(10),
        'Reward not properly disbursed to challenger');
    });

    it('should unsuccessfully challenge an application', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const domain = 'winner.net';
      const minDeposit = new BN(paramConfig.minDeposit, 10);

      await utils.as(applicant, registry.apply, domain, minDeposit);
      const pollID = await utils.challengeAndGetPollID(domain, challenger);
      await utils.commitVote(pollID, 1, 10, 420, voter);
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      await utils.as(voter, voting.revealVote, pollID, 1, 420);
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      await registry.updateStatus(domain);

      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, true, 'An application which should have succeeded failed');

      const unstakedDeposit = await utils.getUnstakedDeposit(domain);
      const expectedUnstakedDeposit = minDeposit.add(
        minDeposit.mul(
          bigTen(paramConfig.dispensationPct).div(bigTen(100)),
        ),
      );

      assert.strictEqual(unstakedDeposit.toString(10), expectedUnstakedDeposit.toString(10),
        'The challenge winner was not properly disbursed their tokens');
    });

    it('should unsuccessfully challenge a listing', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const domain = 'winner2.net';
      const minDeposit = new BN(paramConfig.minDeposit, 10);

      await utils.addToWhitelist(domain, minDeposit, applicant);

      const pollID = await utils.challengeAndGetPollID(domain, challenger);
      await utils.commitVote(pollID, 1, 10, 420, voter);
      await utils.increaseTime(paramConfig.commitStageLength + 1);
      await utils.as(voter, voting.revealVote, pollID, 1, 420);
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      await registry.updateStatus(domain);

      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, true, 'An application which should have succeeded failed');

      const unstakedDeposit = await utils.getUnstakedDeposit(domain);
      const expectedUnstakedDeposit = minDeposit.add(
        minDeposit.mul(new BN(paramConfig.dispensationPct, 10).div(new BN('100', 10))),
      );
      assert.strictEqual(unstakedDeposit.toString(10), expectedUnstakedDeposit.toString(10),
        'The challenge winner was not properly disbursed their tokens');
    });

    it('should touch-and-remove a listing with a depost below the current minimum', async () => {
      const registry = await Registry.deployed();
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await registry.token.call());
      const domain = 'touchandremove.net';
      const minDeposit = new BN(paramConfig.minDeposit, 10);
      const newMinDeposit = minDeposit.add(new BN('1', 10));

      const applicantStartingBal = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(domain, minDeposit, applicant);

      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization,
        'minDeposit', newMinDeposit);
      const propID = utils.getReceiptValue(receipt, 'propID');

      await utils.increaseTime(paramConfig.pApplyStageLength + 1);

      await parameterizer.processProposal(propID);

      const challengerStartingBal = await token.balanceOf.call(challenger);
      utils.as(challenger, registry.challenge, domain);
      const challengerFinalBal = await token.balanceOf.call(challenger);

      assert(challengerStartingBal.eq(challengerFinalBal),
        'Tokens were not returned to challenger');

      const applicantFinalBal = await token.balanceOf.call(applicant);

      assert(applicantStartingBal.eq(applicantFinalBal),
        'Tokens were not returned to applicant');

      assert(!await registry.isWhitelisted.call(domain), 'Domain was not removed');
    });
  });
});

contract('Registry', (accounts) => {
  describe('Function: exit', () => {
    const [applicant, challenger, voter] = accounts;

    it('should allow a listing to exit when no challenge exists', async () => {
      const registry = await Registry.deployed();
      const token = Token.at(await registry.token.call());
      const domain = 'consensys.net';

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(domain, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, true, 'the domain was not added to the registry');

      await registry.exit(domain, { from: applicant });

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelistedAfterExit, false, 'the domain was not removed on exit');

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
      const domain = 'consensys.net';

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await utils.addToWhitelist(domain, paramConfig.minDeposit, applicant);

      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, true, 'the domain was not added to the registry');

      await registry.challenge(domain, { from: challenger });
      try {
        await registry.exit(domain, { from: applicant });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }

      const isWhitelistedAfterExit = await registry.isWhitelisted.call(domain);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the domain was able to exit while a challenge was active',
      );

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert(
        initialApplicantTokenHoldings.toString(10) >
        finalApplicantTokenHoldings.toString(10),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );

      // Clean up state, remove consensys.net (it fails its challenge due to draw)
      await utils.increaseTime(paramConfig.commitStageLength + paramConfig.revealStageLength + 1);
      await registry.updateStatus(domain);
    });

    it('should not allow a listing to be exited by someone who doesn\'t own it', async () => {
      const registry = await Registry.deployed();
      const domain = 'consensys.net';

      await utils.addToWhitelist(domain, paramConfig.minDeposit, applicant);

      try {
        await registry.exit(domain, { from: voter });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
      const isWhitelistedAfterExit = await registry.isWhitelisted.call(domain);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the domain was exited by someone other than its owner',
      );
    });
  });
});

contract('Registry', (accounts) => {
  describe('User stories', () => {
    const [applicant, challenger, voter] = accounts;
    const minDeposit = bigTen(paramConfig.minDeposit);

    it('should apply, fail challenge, and reject domain', async () => {
      const registry = await Registry.deployed();
      const domain = 'failChallenge.net'; // domain to apply with
      // apply with accounts[2]
      await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
      // challenge with accounts[1]
      await registry.challenge(domain, { from: challenger });

      await utils.increaseTime(paramConfig.revealStageLength + paramConfig.commitStageLength + 1);
      await registry.updateStatus(domain);

      // should not have been added to whitelist
      const result = await registry.isWhitelisted(domain);
      assert.strictEqual(result, false, 'domain should not be whitelisted');
    });

    it('should apply, pass challenge, and whitelist domain', async () => {
      const registry = await Registry.deployed();
      const voting = await utils.getVoting();
      const domain = 'passChallenge.net';

      await utils.as(applicant, registry.apply, domain, minDeposit);

      // Challenge and get back the pollID
      const pollID = await utils.challengeAndGetPollID(domain, challenger);

      // Make sure it's cool to commit
      const cpa = await voting.commitStageActive.call(pollID);
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
      const commitStageActive = await voting.commitStageActive.call(pollID);
      assert.strictEqual(commitStageActive, false, 'Commit period should be inactive');
      // Make sure reveal period is active
      let rpa = await voting.revealStageActive.call(pollID);
      assert.strictEqual(rpa, true, 'Reveal period should be active');

      await voting.revealVote(pollID, voteOption, salt, { from: voter });

      // End reveal period
      await utils.increaseTime(paramConfig.revealStageLength + 1);
      rpa = await voting.revealStageActive.call(pollID);
      assert.strictEqual(rpa, false, 'Reveal period should not be active');

      // updateStatus
      const pollResult = await voting.isPassed.call(pollID);
      assert.strictEqual(pollResult, true, 'Poll should have passed');

      // Add to whitelist
      await registry.updateStatus(domain);
      const result = await registry.isWhitelisted(domain);
      assert.strictEqual(result, true, 'Domain should be whitelisted');
    });
  });
});
