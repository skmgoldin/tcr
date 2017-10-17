/* eslint-env mocha */
/* global artifacts assert contract */
const Parameterizer = artifacts.require('./Parameterizer.sol');
const Token = artifacts.require('./historical/HumanStandardToken.sol');

const fs = require('fs');
const BN = require('bn.js');
const utils = require('./utils');

const adchainConfig = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = adchainConfig.paramDefaults;

const bigTen = number => new BN(number.toString(10), 10);

contract('Parameterizer', (accounts) => {
  describe('Function: proposeReparameterization', () => {
    const [proposer, secondProposer] = accounts;
    const pMinDeposit = bigTen(paramConfig.pMinDeposit);

    it('should add a new reparameterization proposal', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());

      const applicantStartingBalance = await token.balanceOf.call(proposer);

      const receipt = await utils.as(
        proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51',
      );

      const propID = utils.getReceiptValue(receipt, 'propID');
      const paramProposal = await parameterizer.proposalMap.call(propID);

      assert.strictEqual(paramProposal[6].toString(10), '51', 'The reparameterization proposal ' +
        'was not created, or not created correctly.');

      const applicantFinalBalance = await token.balanceOf.call(proposer);
      const expected = applicantStartingBalance.sub(pMinDeposit);
      assert.strictEqual(applicantFinalBalance.toString(10), expected.toString(10),
        'tokens were not properly transferred from proposer');
    });

    it('should not allow a NOOP reparameterization', async () => {
      const parameterizer = await Parameterizer.deployed();

      try {
        await utils.as(
          proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51',
        );
        assert(false, 'Performed NOOP reparameterization');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }
    });

    it('should not allow a reparameterization for a proposal that already exists', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());

      const applicantStartingBalance = await token.balanceOf.call(secondProposer);

      try {
        await utils.as(
          secondProposer, parameterizer.proposeReparameterization, 'voteQuorum', '51',
        );
        assert(false, 'should not have been able to make duplicate proposal');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const applicantEndingBalance = await token.balanceOf.call(secondProposer);

      assert.strictEqual(applicantEndingBalance.toString(10), applicantStartingBalance.toString(10), 'starting balance and '
        + 'ending balance should have been equal');
    });
  });
});

contract('Parameterizer', (accounts) => {
  describe('Function: challengeReparameterization', () => {
    const [proposer, challenger, voter] = accounts;

    it('should leave parameters unchanged if a proposal loses a challenge', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());

      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const challengerStartingBalance = await token.balanceOf.call(challenger);

      const receipt = await utils.as(
        proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51',
      );

      const propID = receipt.logs[0].args.propID;

      await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      await utils.increaseTime(
        paramConfig.pCommitStageLength + paramConfig.pRevealStageLength + 1,
      );

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get('voteQuorum');
      assert.strictEqual(voteQuorum.toString(10), '50', 'The proposal succeeded which ' +
        'should have been successfully challenged');

      const proposerFinalBalance = await token.balanceOf.call(proposer);
      const proposerExpected = proposerStartingBalance.sub(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(proposerFinalBalance.toString(10), proposerExpected.toString(10),
        'The challenge loser\'s token balance is not as expected');

      // Edge case, challenger gets both deposits back because there were no voters
      const challengerFinalBalance = await token.balanceOf.call(challenger);
      const challengerExpected = challengerStartingBalance.add(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(challengerFinalBalance.toString(10), challengerExpected.toString(10),
        'The challenge winner\'s token balance is not as expected');
    });

    it('should set new parameters if a proposal wins a challenge', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());
      const voting = await utils.getVoting();

      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const challengerStartingBalance = await token.balanceOf.call(challenger);

      const proposalReceipt = await utils.as(
        proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51',
      );

      const propID = proposalReceipt.logs[0].args.propID;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const challengeID = challengeReceipt.logs[0].args.pollID;

      await utils.commitVote(challengeID, '1', '10', '420', voter);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voter, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get('voteQuorum');
      assert.strictEqual(voteQuorum.toString(10), '51', 'The proposal failed which ' +
        'should have succeeded');

      const proposerFinalBalance = await token.balanceOf.call(proposer);
      const proposerExpected = proposerStartingBalance.add(
        utils.decimalMultiply(
          paramConfig.pMinDeposit, utils.decimalDivide(
            paramConfig.pDispensationPct, 100,
          ),
        ),
      );
      assert.strictEqual(proposerFinalBalance.toString(10), proposerExpected.toString(10),
        'The challenge winner\'s token balance is not as expected');

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      const challengerExpected = challengerStartingBalance.sub(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(challengerFinalBalance.toString(10), challengerExpected.toString(10),
        'The challenge loser\'s token balance is not as expected');
    });
  });
});

contract('Parameterizer', (accounts) => {
  describe('Function: processProposal', () => {
    const [proposer, challenger, voter] = accounts;

    it('should set new parameters if a proposal went unchallenged', async () => {
      const parameterizer = await Parameterizer.deployed();

      const receipt = await utils.as(
        proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51',
      );

      await utils.increaseTime(
        paramConfig.pApplyStageLength + 1,
      );

      const propID = receipt.logs[0].args.propID;
      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get.call('voteQuorum');
      assert.strictEqual(voteQuorum.toString(10), '51',
        'A proposal which went unchallenged failed to update its parameter',
      );
    });

    it('should not set new parameters if a proposal\'s processBy date has passed', async () => {
      const parameterizer = await Parameterizer.deployed();

      const receipt = await utils.as(
        proposer, parameterizer.proposeReparameterization, 'voteQuorum', '69',
      );

      const propID = receipt.logs[0].args.propID;
      const paramProp = await parameterizer.proposalMap.call(propID);
      const processBy = paramProp[5];
      await utils.increaseTime(processBy.toNumber() + 1);

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get.call('voteQuorum');
      assert.strictEqual(voteQuorum.toString(10), '51',
        'A proposal whose processBy date passed was able to update the parameterizer',
      );
    });

    it('should not set new parameters if a proposal\'s processBy date has passed, ' +
    'but should resolve any challenges against the domain', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());
      const voting = await utils.getVoting();

      const proposerStartingBalance = await token.balanceOf.call(proposer);
      const challengerStartingBalance = await token.balanceOf.call(challenger);

      const receipt = await utils.as(
        proposer, parameterizer.proposeReparameterization, 'voteQuorum', '69',
      );

      const propID = receipt.logs[0].args.propID;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const pollID = challengeReceipt.logs[0].args.pollID;
      await utils.commitVote(pollID, '0', '10', '420', voter);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voter, voting.revealVote, pollID, '0', '420');

      const paramProp = await parameterizer.proposalMap.call(propID);
      const processBy = paramProp[5];
      await utils.increaseTime(processBy.toNumber() + 1);

      await parameterizer.processProposal(propID);

      const voteQuorum = await parameterizer.get.call('voteQuorum');
      assert.strictEqual(voteQuorum.toString(10), '51',
        'A proposal whose processBy date passed was able to update the parameterizer',
      );

      const proposerFinalBalance = await token.balanceOf.call(proposer);
      const proposerExpected = proposerStartingBalance.sub(new BN(paramConfig.pMinDeposit, 10));
      assert.strictEqual(proposerFinalBalance.toString(10), proposerExpected.toString(10),
        'The challenge loser\'s token balance is not as expected',
      );

      const challengerFinalBalance = await token.balanceOf.call(challenger);
      const challengerExpected = challengerStartingBalance.add(
        utils.decimalMultiply(
          paramConfig.pMinDeposit, utils.decimalDivide(
            paramConfig.pDispensationPct, 100,
          ),
        ),
      );
      assert.strictEqual(challengerFinalBalance.toString(10), challengerExpected.toString(10),
        'The challenge winner\'s token balance is not as expected');
    });
  });
});

contract('Parameterizer', (accounts) => {
  describe('Function: claimReward', () => {
    const [proposer, challenger, voterAlice, voterBob] = accounts;

    it('should give the correct number of tokens to a voter on the winning side.', async () => {
      const parameterizer = await Parameterizer.deployed();
      const token = Token.at(await parameterizer.token.call());
      const voting = await utils.getVoting();

      const voterAliceStartingBalance = await token.balanceOf.call(voterAlice);

      const proposalReceipt = await utils.as(
        proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51',
      );

      const propID = proposalReceipt.logs[0].args.propID;

      const challengeReceipt =
        await utils.as(challenger, parameterizer.challengeReparameterization, propID);

      const challengeID = challengeReceipt.logs[0].args.pollID;

      await utils.commitVote(challengeID, '1', '10', '420', voterAlice);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      await parameterizer.processProposal(propID);

      await utils.as(voterAlice, parameterizer.claimReward, challengeID, '420');
      await utils.as(voterAlice, voting.withdrawVotingRights, '10');

      const voterAliceFinalBalance = await token.balanceOf.call(voterAlice);
      const voterAliceExpected = voterAliceStartingBalance.add(
        utils.decimalMultiply(
          paramConfig.pMinDeposit, utils.decimalDivide(
            bigTen(100).sub(bigTen(paramConfig.pDispensationPct)), 100,
          ),
        ),
      );
      assert.strictEqual(voterAliceFinalBalance.toString(10), voterAliceExpected.toString(10),
        'A voterAlice\'s token balance is not as expected after claiming a reward');
    });

    it('should give the correct number of tokens to multiple voters on the winning side.',
      async () => {
        const parameterizer = await Parameterizer.deployed();
        // const token = Token.at(await parameterizer.token.call());
        const voting = await utils.getVoting();

        // const voterAliceStartingBalance = await token.balanceOf.call(voterAlice);
        // const voterBobStartingBalance = await token.balanceOf.call(voterBob);

        const proposalReceipt = await utils.as(
          proposer, parameterizer.proposeReparameterization, 'voteQuorum', '52',
        );

        const propID = proposalReceipt.logs[0].args.propID;

        const challengeReceipt =
          await utils.as(challenger, parameterizer.challengeReparameterization, propID);

        const challengeID = challengeReceipt.logs[0].args.pollID;

        await utils.commitVote(challengeID, '1', '10', '420', voterAlice);
        await utils.commitVote(challengeID, '1', '20', '420', voterBob);
        await utils.increaseTime(paramConfig.pCommitStageLength + 1);

        await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
        await utils.as(voterBob, voting.revealVote, challengeID, '1', '420');
        await utils.increaseTime(paramConfig.pRevealStageLength + 1);

        await parameterizer.processProposal(propID);

        const voterAliceReward = await parameterizer.calculateVoterReward.call(voterAlice,
          challengeID, '420');
        await utils.as(voterAlice, parameterizer.claimReward, challengeID, '420');
        await utils.as(voterAlice, voting.withdrawVotingRights, '10');

        const voterBobReward = await parameterizer.calculateVoterReward.call(voterBob,
          challengeID, '420');
        await utils.as(voterBob, parameterizer.claimReward, challengeID, '420');
        await utils.as(voterBob, voting.withdrawVotingRights, '20');

        // TODO: do better than approximately.
        assert.approximately(
          voterBobReward.toNumber(10),
          voterAliceReward.mul(new BN('2', 10)).toNumber(10),
          1,
          'Rewards were not properly distributed between voters',
        );
        // TODO: add asserts for final balances
      });

    it('should give zero tokens to a voter who cannot reveal a vote on the winning side.');
  });
});

contract('Parameterizer', (accounts) => {
  describe('Function: calculateVoterReward', () => {
    const [proposer, challenger, voterAlice] = accounts;

    it('should return the correct number of tokens to voter on the winning side.', async () => {
      const parameterizer = await Parameterizer.deployed();
      const voting = await utils.getVoting();

      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer);
      const challengeID = await utils.challengeReparamAndGetChallengeID(propID, challenger);

      // Alice commits a vote: FOR, 10 tokens, 420 salt
      await utils.commitVote(challengeID, '1', '10', '420', voterAlice);
      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      // Alice reveals her vote: FOR, 420 salt
      await utils.as(voterAlice, voting.revealVote, challengeID, '1', '420');
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      await parameterizer.processProposal(propID);

      // Grab the challenge struct after the proposal has been processed
      const challenge = await parameterizer.challengeMap.call(challengeID);
      const voterTokens = await voting.getNumPassingTokens(voterAlice, challengeID, '420'); // 10
      const rewardPool = challenge[0]; // 250,000
      const totalTokens = challenge[4]; // 10

      // This is the exact formula in the function
      const expectedVoterReward = (voterTokens * rewardPool) / totalTokens; // 250,000
      const voterReward = await parameterizer.calculateVoterReward(voterAlice, challengeID, '420');

      assert.strictEqual(expectedVoterReward.toString(10), voterReward.toString(10),
        'voterReward should have equaled tokens * pool / total');
    });
    it('should return zero tokens to a voter who cannot reveal a vote on the winning side.');
  });
});

contract('Parameterizer', (accounts) => {
  describe('Function: canBeSet', () => {
    const [proposer] = accounts;

    it('should true if a proposal passed its application stage with no challenge', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer);

      await utils.increaseTime(paramConfig.pCommitStageLength + 1);
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      const result = await parameterizer.canBeSet(propID);
      assert.strictEqual(result, true, 'should have returned true because enough time has passed');
    });

    it('should false if a proposal did not pass its application stage with no challenge', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('dispensationPct', '58', proposer);

      const betterBeFalse = await parameterizer.canBeSet(propID);
      assert.strictEqual(betterBeFalse, false, 'should have returned false because not enough time has passed');

      await utils.increaseTime(paramConfig.pCommitStageLength + 1);

      const result = await parameterizer.canBeSet(propID);
      assert.strictEqual(result, true, 'should have been able to set because commit period is done');
    });
  });
});

contract('Parameterizer', (accounts) => {
  describe('Function: propExists', () => {
    const [proposer] = accounts;

    it('should true if a proposal exists for the provided propID', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer);
      const result = await parameterizer.propExists(propID);
      assert.strictEqual(result, true, 'should have been true cause I literally just made the proposal');
    });

    it('should false if no proposal exists for the provided propID', async () => {
      const parameterizer = await Parameterizer.deployed();
      const result = await parameterizer.propExists('666');
      assert.strictEqual(result, false, 'should have been false cause i just made it up!');
    });
  });
});

contract('Parameterizer', (accounts) => {
  describe('Function: challengeCanBeResolved', () => {
    const [proposer, challenger] = accounts;

    it('should true if a challenge is ready to be resolved', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '51', proposer);

      await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      await utils.increaseTime(paramConfig.pCommitStageLength);
      await utils.increaseTime(paramConfig.pRevealStageLength + 1);

      const result = await parameterizer.challengeCanBeResolved(propID);
      assert.strictEqual(result, true, 'should have been true cause enough time has passed');
    });

    it('should false if a challenge is not ready to be resolved', async () => {
      const parameterizer = await Parameterizer.deployed();
      const propID = await utils.proposeReparamAndGetPropID('voteQuorum', '59', proposer);

      await utils.as(challenger, parameterizer.challengeReparameterization, propID);
      await utils.increaseTime(paramConfig.pCommitStageLength);

      const result = await parameterizer.challengeCanBeResolved(propID);
      assert.strictEqual(result, false, 'should have been false because not enough time has passed');
    });
  });
});

contract('Parameterizer', () => {
  describe('Function: determineReward', () => {
    it('should return the correct number of tokens to be granted to the winning entity in a challenge.');
  });
});

contract('Parameterizer', () => {
  describe('Function: get', () => {
    it('should get a parameter', async () => {
      const param = await Parameterizer.deployed();
      const result = await param.get.call('minDeposit');
      assert.equal(result, paramConfig.minDeposit, 'minDeposit param has wrong value');
    });
  });
});

