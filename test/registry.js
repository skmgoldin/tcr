/* eslint-env mocha */
/* global assert contract */

const fs = require('fs');
const BN = require('bn.js');

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.RegistryDefaults;

const utils = require('./utils.js');

let registry;
let token;
let applicant;
let challenger;
let voter;

contract('Registry', (accounts) => {
  before(async () => {
    [registry, token, applicant, challenger, voter] = await utils.setupForTests(accounts);
  });

  describe('Function: deposit', () => {
    const minDeposit = paramConfig.minDeposit;
    const incAmount = minDeposit / 2;

    it('should increase the deposit for a specific domain in the listing', async () => {
      const domain = 'specificdomain.net';
      await utils.addToWhitelist(domain, minDeposit, applicant);

      await utils.as(applicant, registry.deposit, domain, incAmount);

      const currentDeposit = await utils.getCurrentDeposit(domain);
      const expectedAmount = incAmount + minDeposit;
      assert.strictEqual(currentDeposit.toString(10), expectedAmount.toString(10), 'Current deposit should be equal to the sum of the original + increase amount');
    });

    it('should increase a deposit for a pending application', async () => {
      const domain = 'pendingdomain.net';
      await utils.as(applicant, registry.apply, domain, minDeposit);

      try {
        await utils.as(applicant, registry.deposit, domain, incAmount);

        const currentDeposit = await utils.getCurrentDeposit(domain);
        const expectedAmount = incAmount + minDeposit;
        assert.strictEqual(currentDeposit.toString(10), expectedAmount.toString(10), 'deposit was not made correctly for pending application');
      } catch (err) {
        const errMsg = err.toString();
        assert(utils.isEVMException(err), errMsg);
      }
    });

    it('should increase deposit for a whitelisted, challenged domain', async () => {
      const domain = 'challengedomain.net';
      await utils.addToWhitelist(domain, minDeposit, applicant);
      const originalDeposit = await utils.getCurrentDeposit(domain);

      // challenge, then increase deposit
      await utils.as(challenger, registry.challenge, domain);
      await utils.as(applicant, registry.deposit, domain, incAmount);

      const afterIncDeposit = await utils.getCurrentDeposit(domain);
      const expectedAmount = (new BN(originalDeposit).add(new BN(incAmount))) - new BN(minDeposit);
      assert.strictEqual(afterIncDeposit.toString(10), expectedAmount.toString(10), 'deposit for whitelisted, challenged domain should have been increased');
    });
  });
});

contract('Registry', () => {
  describe('Function: withdraw', () => {});
});

contract('Registry', () => {
  describe('Function: updateStatus', () => {});
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
  before(async () => {
    [registry, token, applicant, challenger, voter] = await utils.setupForTests(accounts);
  });

  describe('Function: isWhitelisted', () => {
    it('should verify a domain is not in the whitelist', async () => {
      const domain = 'eth.eth'; // the domain to be tested
      const result = await registry.isWhitelisted.call(domain);
      assert.strictEqual(result, false, 'Domain should not be whitelisted');
    });

    it('should verify a domain is in the whitelist', async () => {
      const domain = 'eth.eth';
      await utils.addToWhitelist(domain, paramConfig.minDeposit, applicant);
      const result = await registry.isWhitelisted.call(domain);
      assert.strictEqual(result, true, 'Domain should have been whitelisted');
    });
  });
});

contract('Registry', (accounts) => {
  before(async () => {
    [registry, token, applicant, challenger, voter] = await utils.setupForTests(accounts);
  });

  describe('Function: apply', () => {
    it('should allow a new domain to apply', async () => {
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
        const domain = 'nochallenge.net';
        await utils.increaseTime(paramConfig.applyStageLength + 1);
        await registry.updateStatus(domain);
        const result = await registry.isWhitelisted.call(domain);
        assert.strictEqual(result, true, "domain didn't get whitelisted");
      });
  });
});

contract('Registry', (accounts) => {
  before(async () => {
    [registry, token, applicant, challenger, voter] = await utils.setupForTests(accounts);
  });

  describe('Function: challenge', () => {
    it('should successfully challenge an application');
    it('should successfully challenge a listing');
    it('should unsuccessfully challenge an application');
    it('should unsuccessfully challenge a listing');
    it('should touch-and-remove a listing with a depost below the current minimum');
  });
});

contract('Registry', (accounts) => {
  before(async () => {
    [registry, token, applicant, challenger, voter] = await utils.setupForTests(accounts);
  });

  describe('Function: exit', () => {
    it('should allow a listing to exit when no challenge exists', async () => {
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
  before(async () => {
    [registry, token, applicant, challenger, voter] = await utils.setupForTests(accounts);
  });
  describe('User stories', () => {
    it('should apply, fail challenge, and reject domain', async () => {
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
      const domain = 'passChallenge.net'; // domain to apply with
      // apply with accounts[2]
      await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
      // challenge with accounts[1]
      const receipt = await registry.challenge(domain, { from: challenger });
      const pollID = receipt.logs[0].args.pollID;
      const voting = await utils.getVoting();

      const salt = 420;
      const voteOption = 1;
      const hash = utils.getVoteSaltHash(voteOption, salt);

      // commit
      const tokensArg = 10;
      const cpa = await voting.commitPeriodActive.call(pollID);
      assert.strictEqual(cpa, true, 'commit period should be active');

      // voter has never voted before, use pollID 0
      await voting.requestVotingRights(tokensArg, { from: voter });
      await voting.commitVote(pollID, hash, tokensArg, 0, { from: voter });
      const numTokens = await voting.getNumTokens(pollID, { from: voter });
      assert.strictEqual(numTokens.toString(10), tokensArg.toString(10), 'wrong num tok committed');

      // reveal
      await utils.increaseTime(paramConfig.commitPeriodLength + 1);
      let rpa = await voting.revealPeriodActive.call(pollID);
      assert.strictEqual(rpa, true, 'reveal period should be active');
      await voting.revealVote(pollID, salt, voteOption, { from: voter });

      // inc time
      await utils.increaseTime(paramConfig.revealPeriodLength + 1);
      rpa = await voting.revealPeriodActive.call(pollID);
      assert.strictEqual(rpa, false, 'reveal period should not be active');

      // updateStatus
      const pollResult = await voting.isPassed.call(pollID);
      assert.strictEqual(pollResult, true, 'poll should have passed');
      await registry.updateStatus(domain);

      // should have been added to whitelist
      const result = await registry.isWhitelisted(domain);
      assert.strictEqual(result, true, 'domain should be whitelisted');
    });
  });
});
