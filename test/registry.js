/* eslint-env mocha */
/* global assert contract artifacts */
const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('Token.sol');

const fs = require('fs');
const BN = require('bn.js');

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.RegistryDefaults;

const utils = require('./utils.js');

const bigTen = number => new BN(number, 10);

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

      const currentDeposit = await utils.getCurrentDeposit(domain);
      const expectedAmount = incAmount.add(minDeposit);
      assert.strictEqual(currentDeposit, expectedAmount.toString(10),
        'Current deposit should be equal to the sum of the original + increase amount');
    });

    it('should increase a deposit for a pending application', async () => {
      const registry = await Registry.deployed();
      const domain = 'pendingdomain.net';
      await utils.as(applicant, registry.apply, domain, minDeposit);

      try {
        await utils.as(applicant, registry.deposit, domain, incAmount);

        const currentDeposit = await utils.getCurrentDeposit(domain);
        const expectedAmount = incAmount.add(minDeposit);
        assert.strictEqual(currentDeposit, expectedAmount.toString(10), 'Deposit should have increased for pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should increase deposit for a whitelisted, challenged domain', async () => {
      const registry = await Registry.deployed();
      const domain = 'challengedomain.net';
      await utils.addToWhitelist(domain, minDeposit, applicant);
      const originalDeposit = await utils.getCurrentDeposit(domain);

      // challenge, then increase deposit
      await utils.as(challenger, registry.challenge, domain);
      await utils.as(applicant, registry.deposit, domain, incAmount);

      const afterIncDeposit = await utils.getCurrentDeposit(domain);
      const expectedAmount =
        (bigTen(originalDeposit).add(bigTen(incAmount))).sub(bigTen(minDeposit));

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
      const origDeposit = await utils.getCurrentDeposit(dontChallengeDomain);

      try {
        await utils.as(applicant, registry.withdraw, dontChallengeDomain, withdrawAmount);
        assert(false, errMsg);
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const afterWithdrawDeposit = await utils.getCurrentDeposit(dontChallengeDomain);

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

      const plcrComplete = paramConfig.revealPeriodLength + paramConfig.commitPeriodLength + 1;
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

contract('Registry', () => {
  describe('Function: claimReward', () => {});
});

contract('Registry', () => {
  describe('Function: appExists', () => {});
});

contract('Registry', () => {
  describe('Function: isExpired', () => {});
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
        'incorrect currentDeposit',
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

contract('Registry', () => {
  describe('Function: challenge', () => {
    it('should successfully challenge an application');
    it('should successfully challenge a listing');
    it('should unsuccessfully challenge an application');
    it('should unsuccessfully challenge a listing');
    it('should touch-and-remove a listing with a depost below the current minimum');
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
        // TODO: Check if is EVM error
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

      // Clean up state, remove consensys.net from application stage
      await utils.increaseTime(paramConfig.commitPeriodLength + paramConfig.revealPeriodLength + 1);
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
        // TODO: Check if is EVM error
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

      await utils.increaseTime(paramConfig.revealPeriodLength + paramConfig.commitPeriodLength + 1);
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
      await utils.increaseTime(paramConfig.commitPeriodLength + 1);
      // Make sure commit period is inactive
      const commitPeriodActive = await voting.commitPeriodActive.call(pollID);
      assert.strictEqual(commitPeriodActive, false, 'Commit period should be inactive');
      // Make sure reveal period is active
      let rpa = await voting.revealPeriodActive.call(pollID);
      assert.strictEqual(rpa, true, 'Reveal period should be active');

      await voting.revealVote(pollID, voteOption, salt, { from: voter });

      // End reveal period
      await utils.increaseTime(paramConfig.revealPeriodLength + 1);
      rpa = await voting.revealPeriodActive.call(pollID);
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
