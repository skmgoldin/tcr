/* eslint-env mocha */
/* global assert contract */
const fs = require('fs');
const BN = require('bn.js');
const utils = require('../utils');

const config = JSON.parse(fs.readFileSync('./conf/config.json'));
const paramConfig = config.paramDefaults;

const bigTen = number => new BN(number.toString(10), 10);

contract('Parameterizer', (accounts) => {
  describe('Function: proposeReparameterization', () => {
    const [proposer, secondProposer] = accounts;
    const pMinDeposit = bigTen(paramConfig.pMinDeposit);

    let token;
    let parameterizer;

    before(async () => {
      const { paramProxy, tokenInstance } = await utils.getProxies();
      parameterizer = paramProxy;
      token = tokenInstance;

      await utils.approveProxies(accounts, token, false, parameterizer, false);
    });

    // Put this first to ensure test does not conflict with proposals already made.
    it('should not allow a NOOP reparameterization', async () => {
      // Get value to be reparameterized.
      const voteQuorum = await parameterizer.get.call('voteQuorum');

      try {
        await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', voteQuorum.toString());
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'Performed NOOP reparameterization');
    });


    it('should revert on proposals for dispensationPct and pDispensationPct with values greater ' +
      'than 100', async () => {
      const BAD_VALUE = '101';

      // Try to propose bad values for both dispensationPct and pDispensationPct. Expect both to
      // revert.
      try {
        await utils.as(
          proposer, parameterizer.proposeReparameterization, 'dispensationPct',
          BAD_VALUE,
        );
      } catch (errOne) {
        assert(utils.isEVMException(errOne), errOne.toString());

        try {
          await utils.as(
            proposer, parameterizer.proposeReparameterization, 'pDispensationPct',
            BAD_VALUE,
          );
        } catch (errTwo) {
          assert(utils.isEVMException(errTwo), errTwo.toString());

          return;
        }
      }

      assert(false, 'One of the bad proposals was accepted');
    });

    it('should add a new reparameterization proposal', async () => {
      const applicantStartingBalance = await token.balanceOf.call(proposer);

      const receipt = await utils.as(proposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');

      const propID = utils.getReceiptValue(receipt, 'propID');
      const paramProposal = await parameterizer.proposals.call(propID);

      assert.strictEqual(paramProposal[6].toString(10), '51', 'The reparameterization proposal ' +
        'was not created, or not created correctly.');

      const applicantFinalBalance = await token.balanceOf.call(proposer);
      const expected = applicantStartingBalance.sub(pMinDeposit);
      assert.strictEqual(
        applicantFinalBalance.toString(10), expected.toString(10),
        'tokens were not properly transferred from proposer',
      );
    });

    it('should not allow a reparameterization for a proposal that already exists', async () => {
      const applicantStartingBalance = await token.balanceOf.call(secondProposer);

      try {
        await utils.as(secondProposer, parameterizer.proposeReparameterization, 'voteQuorum', '51');
        assert(false, 'should not have been able to make duplicate proposal');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
      }

      const applicantEndingBalance = await token.balanceOf.call(secondProposer);

      assert.strictEqual(applicantEndingBalance.toString(10), applicantStartingBalance.toString(10), 'starting balance and '
        + 'ending balance should have been equal');
    });

    it('should revert if token transfer from user fails', async () => {
      // Approve the contract to transfer 0 tokens from account so the transfer will fail
      await token.approve(parameterizer.address, '0', { from: secondProposer });

      try {
        await utils.as(secondProposer, parameterizer.proposeReparameterization, 'voteQuorum', '89');
      } catch (err) {
        assert(utils.isEVMException(err), err.toString());
        return;
      }
      assert(false, 'allowed proposal with fewer tokens than minDeposit');
    });
  });
});

