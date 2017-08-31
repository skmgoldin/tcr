const HDWalletProvider = require('truffle-hdwallet-provider');
const fs = require('fs');

let secrets;
let mnemonic = '';

if (fs.existsSync('secrets.json')) {
  secrets = JSON.parse(fs.readFileSync('secrets.json', 'utf8'));
  mnemonic = secrets.mnemonic;
}

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      gas: 4500000,
      gasPrice: 25000000000,
      network_id: '*', // Match any network id
    },
    rinkeby: {
      provider: new HDWalletProvider(mnemonic, 'https://testrpc.adchain.com:443'),
      network_id: '*',
      gas: 4500000,
      gasPrice: 25000000000,
    },
    adchain: {
      provider: new HDWalletProvider(mnemonic, 'https://testrpc.adchain.com:443'),
      network_id: '*',
      gas: 4500000,
      gasPrice: 25000000000,
    },
  },
};
