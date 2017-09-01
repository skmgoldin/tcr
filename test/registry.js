/* eslint-env mocha */
/* global artifacts assert contract */

const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');

const ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'));
const abi = require('ethereumjs-abi');
const fs = require('fs');

const Token = artifacts.require('./HumanStandardToken.sol');
const PLCRVoting = artifacts.require('./PLCRVoting.sol');
const Registry = artifacts.require('./Registry.sol');
const Sale = artifacts.require('historical/Sale.sol');

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.RegistryDefaults;

contract('Registry', (accounts) => {
  const [applicant, challenger, voter] = accounts.slice(1);
  let registry;
  let token;

  async function getVoting() {
    const votingAddr = await registry.voting.call();
    return PLCRVoting.at(votingAddr);
  }

  // increases time
  async function increaseTime(seconds) {
    return new Promise((resolve, reject) => ethRPC.sendAsync({
      method: 'evm_increaseTime',
      params: [seconds],
    }, (err) => {
      if (err) reject(err);
      resolve();
    }))
      .then(() => new Promise((resolve, reject) => ethRPC.sendAsync({
        method: 'evm_mine',
        params: [],
      }, (err) => {
        if (err) reject(err);
        resolve();
      })));
  }

  function getSecretHash(vote, salt) {
    return `0x${abi.soliditySHA3(['uint', 'uint'],
      [vote, salt]).toString('hex')}`;
  }

  async function buyTokens(address, etherAmount) {
    const sale = await Sale.deployed();
    await sale.purchaseTokens({ from: address, value: etherAmount });
  }

  async function approvePLCR(address, adtAmount) {
    const plcrAddr = await registry.voting.call();
    await token.approve(plcrAddr, adtAmount, { from: address });
  }

  before(async () => {
    async function buyTokensFor(addresses) {
      await buyTokens(addresses[0], '1000000000000000000');
      if (addresses.length === 1) { return true; }
      return buyTokensFor(addresses.slice(1));
    }

    async function approveRegistryFor(addresses) {
      const user = addresses[0];
      const balanceOfUser = await token.balanceOf(user);
      await token.approve(registry.address, balanceOfUser, { from: user });
      if (addresses.length === 1) { return true; }
      return approveRegistryFor(addresses.slice(1));
    }

    async function approvePLCRFor(addresses) {
      const user = addresses[0];
      const balanceOfUser = await token.balanceOf(user);
      await approvePLCR(user, balanceOfUser);
      if (addresses.length === 1) { return true; }
      return approvePLCRFor(addresses.slice(1));
    }
    registry = await Registry.deployed();
    token = Token.at(await registry.token.call());

    await buyTokensFor(accounts.slice(1));
    await approveRegistryFor(accounts.slice(1));
    await approvePLCRFor(accounts.slice(1));
  });


  it('should verify a domain is not in the whitelist', async () => {
    const domain = 'eth.eth'; // the domain to be tested
    const result = await registry.isWhitelisted.call(domain);
    assert.equal(result, false, 'Domain should not be whitelisted');
  });

  it('should allow a domain to apply', async () => {
    const domain = 'nochallenge.net';
    // apply with accounts[1]
    await registry.apply(domain, paramConfig.minDeposit, { from: accounts[1] });
    // hash the domain so we can identify in listingMap
    const hash = `0x${abi.soliditySHA3(['string'], [domain]).toString('hex')}`;
    // get the struct in the mapping
    const result = await registry.listingMap.call(hash);
    // check that Application is initialized correctly
    assert.equal(result[0] * 1000 > Date.now(), true, 'challenge time < now');
    assert.equal(result[1], false, 'challenged != false');
    assert.equal(result[2], accounts[1], 'owner of application != address that applied');
    assert.equal(result[3], paramConfig.minDeposit, 'incorrect currentDeposit');
  });

  it('should not let address apply with domains that are already in listingMap', async () => {
    const domain = 'nochallenge.net';
    const initalAmt = await token.balanceOf.call(registry.address);
    // apply with accounts[1] with the same domain, should fail since there's
    // an existing application already
    try { await registry.apply(domain, paramConfig.minDeposit, { from: accounts[2] }); } catch (error) { console.log('\tSuccess: failed to reapply domain'); }
    const finalAmt = await token.balanceOf.call(registry.address);
    assert.equal(finalAmt.toString(10), initalAmt.toString(10), 'why did my wallet balance change');
  });

  it('should update domain status to whitelisted because domain was not challenged', async () => {
    const domain = 'nochallenge.net';
    await increaseTime(paramConfig.applyStageLength + 1);
    await registry.updateStatus(domain);
    const result = await registry.isWhitelisted.call(domain);
    assert.equal(result, true, "domain didn't get whitelisted");
  });

  it('should withdraw, and then get delisted by challenge', async () => {
    const domain = 'nochallenge.net';
    const owner = accounts[1]; // owner of nochallenge.net
    const result = await registry.isWhitelisted.call(domain);
    assert.equal(result, true, "domain didn't get whitelisted");
    await registry.withdraw(domain, 20, { from: owner });
    // challenge with accounts[3]
    await registry.challenge(domain, { from: accounts[3] });
    const whitelisted = await registry.isWhitelisted.call(domain);
    assert.equal(whitelisted, false, 'domain is still whitelisted');
  });

  it('should apply, fail challenge, and reject domain', async () => {
    const domain = 'failChallenge.net'; // domain to apply with
    // apply with accounts[2]
    await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
    // challenge with accounts[1]
    await registry.challenge(domain, { from: challenger });

    await increaseTime(paramConfig.revealPeriodLength + paramConfig.commitPeriodLength + 1);
    await registry.updateStatus(domain);

    // should not have been added to whitelist
    const result = await registry.isWhitelisted(domain);
    assert.equal(result, false, 'domain should not be whitelisted');
  });

  it('should apply, pass challenge, and whitelist domain', async () => {
    const domain = 'passChallenge.net'; // domain to apply with
    // apply with accounts[2]
    await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
    // challenge with accounts[1]
    const receipt = await registry.challenge(domain, { from: challenger });
    const pollID = receipt.logs[0].args.pollID;
    const voting = await getVoting();

    const salt = 420;
    const voteOption = 1;
    const hash = getSecretHash(voteOption, salt);

    // commit
    const tokensArg = 10;
    const cpa = await voting.commitPeriodActive.call(pollID);
    assert.equal(cpa, true, 'commit period should be active');

    // voter has never voted before, use pollID 0
    await voting.requestVotingRights(tokensArg, { from: voter });
    await voting.commitVote(pollID, hash, tokensArg, 0, { from: voter });
    const numTokens = await voting.getNumTokens(pollID, { from: voter });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    // reveal
    await increaseTime(paramConfig.commitPeriodLength + 1);
    let rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, true, 'reveal period should be active');
    await voting.revealVote(pollID, salt, voteOption, { from: voter });

    // inc time
    await increaseTime(paramConfig.revealPeriodLength + 1);
    rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, false, 'reveal period should not be active');

    // updateStatus
    const pollResult = await voting.isPassed.call(pollID);
    assert.equal(pollResult, true, 'poll should have passed');
    await registry.updateStatus(domain);

    // should have been added to whitelist
    const result = await registry.isWhitelisted(domain);
    assert.equal(result, true, 'domain should be whitelisted');
  });

  describe('function: exit', () => {
    it('should allow a listing to exit when no challenge exists', async () => {
      const domain = 'consensys.net';

      const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

      await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
      await increaseTime(paramConfig.applyStageLength + 1);
      await registry.updateStatus(domain);

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

      await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
      await increaseTime(paramConfig.applyStageLength + 1);
      await registry.updateStatus(domain);

      const isWhitelisted = await registry.isWhitelisted.call(domain);
      assert.strictEqual(isWhitelisted, true, 'the domain was not added to the registry');

      await registry.challenge(domain, { from: challenger });
      try {
        await registry.exit(domain, { from: applicant });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        // TODO: Check if is EVM error
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
      }

      // Clean up state, remove consensys.net from application stage
      await increaseTime(paramConfig.commitPeriodLength + paramConfig.revealPeriodLength + 1);
      await registry.updateStatus(domain);
    });

    it('should not allow a listing to be exited by someone who doesn\'t own it', async () => {
      const domain = 'consensys.net';

      await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
      await increaseTime(paramConfig.applyStageLength + 1);
      await registry.updateStatus(domain);

      try {
        await registry.exit(domain, { from: voter });
        assert(false, 'exit succeeded when it should have failed');
      } catch (err) {
        // TODO: Check if is EVM error
        const isWhitelistedAfterExit = await registry.isWhitelisted.call(domain);
        assert.strictEqual(
          isWhitelistedAfterExit,
          true,
          'the domain was exited by someone other than its owner',
        );
      }
    });
  });
});
