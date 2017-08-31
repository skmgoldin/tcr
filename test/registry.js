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

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.RegistryDefaults;

contract('Registry', (accounts) => {
  const [applicant, challenger] = accounts.slice(1);

  async function getVoting() {
    const registry = await Registry.deployed();
    const votingAddr = await registry.voting.call();
    const voting = await PLCRVoting.at(votingAddr);
    return voting;
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

  it('should verify a domain is not in the whitelist', async () => {
    const domain = 'eth.eth'; // the domain to be tested
    const registry = await Registry.deployed();
    const result = await registry.isWhitelisted.call(domain);
    assert.equal(result, false, 'Domain should not be whitelisted');
  });

  it('should allow a domain to apply', async () => {
    const domain = 'nochallenge.net';
    const registry = await Registry.deployed();
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
    const registry = await Registry.deployed();
    const token = await Token.deployed();
    const initalAmt = await token.balanceOf.call(registry.address);
    // apply with accounts[1] with the same domain, should fail since there's
    // an existing application already
    try { await registry.apply(domain, paramConfig.minDeposit, { from: accounts[2] }); } catch (error) { console.log('\tSuccess: failed to reapply domain'); }
    const finalAmt = await token.balanceOf.call(registry.address);
    assert.equal(finalAmt.toString(10), initalAmt.toString(10), 'why did my wallet balance change');
  });

  it('should add time to evm then not allow to challenge because challenge time passed', async () => {
    const domain = 'nochallenge.net';
    await increaseTime(60);
    const registry = await Registry.deployed();
    try { await registry.challenge(domain, { from: accounts[3] }); } catch (error) { console.log('\tSuccess: failed to allow challenge to start'); }
  });

  it('should update domain status to whitelisted because domain was not challenged', async () => {
    const domain = 'nochallenge.net';
    const registry = await Registry.deployed();
    await registry.updateStatus(domain);
    const result = await registry.isWhitelisted(domain);
    assert.equal(result, true, "domain didn't get whitelisted");
  });

  it('should withdraw, and then get delisted by challenge', async () => {
    const domain = 'nochallenge.net';
    const owner = accounts[1]; // owner of nochallenge.net
    const registry = await Registry.deployed();
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
    const registry = await Registry.deployed();
    // apply with accounts[2]
    await registry.apply(domain, paramConfig.minDeposit, { from: accounts[2] });
    // challenge with accounts[1]
    let result = await registry.challenge(domain, { from: accounts[1] });
    const pollID = result.receipt.logs[1].data;
    const voting = await getVoting();

    const salt = 1;
    const voteOption = 0;
    const hash = getSecretHash(voteOption, salt);

    // vote against with accounts[1:3]

    // commit
    const tokensArg = 10;
    const cpa = await voting.commitPeriodActive.call(pollID);
    assert.equal(cpa, true, 'commit period should be active');

    await voting.commitVote(pollID, hash, tokensArg, pollID - 1, { from: accounts[1] });
    const numTokens = await voting.getNumTokens(pollID, { from: accounts[1] });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    // await voting.commitVote(pollID, hash, tokensArg, pollID-1, {from: accounts[2]})
    // numTokens = await voting.getNumTokens(pollID, {from: accounts[2]})
    // assert.equal(numTokens, tokensArg, "wrong num tok committed")

    // //inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    let rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, true, 'reveal period should be active');

    // // reveal
    await voting.revealVote(pollID, salt, voteOption, { from: accounts[1] });
    // await voting.revealVote(pollID, salt, voteOption, {from: accounts[2]});

    // //inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, false, 'reveal period should not be active');

    // //updateStatus
    const pollResult = await voting.isPassed.call(pollID);
    assert.equal(pollResult, false, 'poll should not have passed');
    await registry.updateStatus(domain);

    // should not have been added to whitelist
    result = await registry.isWhitelisted(domain);
    assert.equal(result, false, 'domain should not be whitelisted');
  });

  it('should apply, pass challenge, and whitelist domain', async () => {
    const domain = 'failChallenge.net'; // domain to apply with
    const registry = await Registry.deployed();
    // apply with accounts[2]
    await registry.apply(domain, paramConfig.minDeposit, { from: accounts[2] });
    // challenge with accounts[1]
    let result = await registry.challenge(domain, { from: accounts[1] });
    const pollID = result.receipt.logs[1].data;
    const voting = await getVoting();

    const salt = 1;
    const voteOption = 1;
    const hash = getSecretHash(voteOption, salt);

    // vote against with accounts[1:3]

    // commit
    const tokensArg = 10;
    const cpa = await voting.commitPeriodActive.call(pollID);
    assert.equal(cpa, true, 'commit period should be active');

    await voting.commitVote(pollID, hash, tokensArg, pollID - 1, { from: accounts[1] });
    let numTokens = await voting.getNumTokens(pollID, { from: accounts[1] });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    await voting.commitVote(pollID, hash, tokensArg, pollID - 1, { from: accounts[2] });
    numTokens = await voting.getNumTokens(pollID, { from: accounts[2] });
    assert.equal(numTokens, tokensArg, 'wrong num tok committed');

    // inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    let rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, true, 'reveal period should be active');

    // reveal
    await voting.revealVote(pollID, salt, voteOption, { from: accounts[1] });
    await voting.revealVote(pollID, salt, voteOption, { from: accounts[2] });

    // inc time
    await increaseTime(paramConfig.commitPeriodLength + 1);
    rpa = await voting.revealPeriodActive.call(pollID);
    assert.equal(rpa, false, 'reveal period should not be active');

    // updateStatus
    const pollResult = await voting.isPassed.call(pollID);
    assert.equal(pollResult, true, 'poll should have passed');
    await registry.updateStatus(domain);

    // should not have been added to whitelist
    result = await registry.isWhitelisted(domain);
    assert.equal(result, true, 'domain should be whitelisted');
  });

  it('should allow a listing to exit when no challenge exists', async () => {
    const registry = await Registry.deployed();
    const token = await Token.deployed();
    const domain = 'consensys.net';

    const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

    await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
    await increaseTime(paramConfig.applyStageLength + 1);
    await registry.updateStatus(domain);

    const isWhitelisted = await registry.isWhitelisted(domain);
    assert.strictEqual(isWhitelisted, true, 'the domain was not added to the registry');

    await registry.exit(domain, { from: applicant });

    const isWhitelistedAfterExit = await registry.isWhitelisted(domain);
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
    const token = await Token.deployed();
    const domain = 'consensys.net';

    const initialApplicantTokenHoldings = await token.balanceOf.call(applicant);

    await registry.apply(domain, paramConfig.minDeposit, { from: applicant });
    await increaseTime(paramConfig.applyStageLength + 1);
    await registry.updateStatus(domain);

    const isWhitelisted = await registry.isWhitelisted(domain);
    assert.strictEqual(isWhitelisted, true, 'the domain was not added to the registry');

    await registry.challenge(domain, { from: challenger });
    try {
      await registry.exit(domain, { from: applicant });
    } catch (err) {
      // TODO: Check if is EVM error
      const isWhitelistedAfterExit = await registry.isWhitelisted(domain);
      assert.strictEqual(
        isWhitelistedAfterExit,
        true,
        'the domain was able to exit while a challenge was active',
      );

      const finalApplicantTokenHoldings = await token.balanceOf.call(applicant);
      assert(initialApplicantTokenHoldings.toString(10) > finalApplicantTokenHoldings.toString(10),
        'the applicant\'s tokens were returned in spite of failing to exit',
      );
    }
  });

  it('should not allow a listing to be exited by someone who doesn\'t own it');
});
