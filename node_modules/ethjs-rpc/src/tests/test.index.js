const EthRPC = require('../index.js');
const assert = require('chai').assert;
const TestRPC = require('ethereumjs-testrpc');
const provider = TestRPC.provider({});
const provider2 = TestRPC.provider({});

describe('ethjs-rpc', () => {
  describe('construction', () => {
    it('should construct normally', () => {
      const eth = new EthRPC(provider);

      assert.equal(typeof eth, 'object');
      assert.equal(typeof eth.currentProvider, 'object');
      assert.equal(typeof eth.options, 'object');
    });

    it('should throw when invalid construction params', () => {
      assert.throws(() => EthRPC(provider), Error); // eslint-disable-line
    });
  });

  describe('setProvider', () => {
    it('should change provider', (done) => {
      const eth = new EthRPC(provider);
      eth.sendAsync({ method: 'eth_accounts' }, (err, accounts1) => {
        assert.equal(err, null);
        eth.setProvider(provider2);

        eth.sendAsync({ method: 'eth_accounts' }, (err2, accounts2) => {
          assert.equal(err2, null);
          assert.notDeepEqual(accounts1, accounts2);
          done();
        });
      });
    });

    it('should handle invalid provider', () => {
      assert.throws(() => new EthRPC(23423), Error);
    });
  });

  describe('sendAsync', () => {
    it('should handle normal calls', (done) => {
      const eth = new EthRPC(provider);
      eth.sendAsync({ method: 'eth_accounts' }, (err, accounts1) => {
        assert.equal(err, null);
        assert.equal(Array.isArray(accounts1), true);
        assert.equal(accounts1.length > 0, true);
        done();
      });
    });

    it('should handle invalid response', (done) => {
      const eth = new EthRPC({ sendAsync: (payload, cb) => {
        cb(null, { error: 'Some Error!!' });
      } });
      eth.sendAsync({ method: 'eth_accounts' }, (err, accounts1) => {
        assert.equal(typeof err, 'object');
        assert.equal(accounts1, null);
        done();
      });
    });

    it('should handle invalid errors', (done) => {
      const eth = new EthRPC({ sendAsync: (payload, cb) => {
        cb('Some error!');
      } });
      eth.sendAsync({ method: 'eth_accounts' }, (err, accounts1) => {
        assert.equal(typeof err, 'object');
        assert.equal(accounts1, null);
        done();
      });
    });
  });
});
