const cp = require('child_process');
const process = require('process');
const fs = require('fs');
const hdkey = require('ethereumjs-wallet/hdkey');
const bip39 = require('bip39');
const TestRPC = require('ethereumjs-testrpc');

const ACCOUNTS = 10;
const ACCOUNTFUNDING = '0x33B2E3C9FD0804000000000'; // One billion Ether in Wei
const HDPATH = 'm/44\'/60\'/0\'/0/';

function generateAccounts(mnemonic, hdPathIndex, totalToGenerate, accumulatedAddrs) {
  const hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonic));
  const node = hdwallet.derivePath(HDPATH + hdPathIndex.toString());
  const secretKey = node.getWallet().getPrivateKeyString();
  accumulatedAddrs.push({
    secretKey,
    balance: ACCOUNTFUNDING,
  });

  const nextHDPathIndex = hdPathIndex + 1;
  if (nextHDPathIndex === totalToGenerate) {
    return accumulatedAddrs;
  }

  return generateAccounts(mnemonic, nextHDPathIndex, totalToGenerate, accumulatedAddrs);
}

try {
  cp.execSync('npm run lint ./');
} catch (err) {
  console.log(err.stdout.toString());
  process.exit(1);
}

let secrets;
let mnemonic;
if (!fs.existsSync('secrets.json')) {
  console.log('No secrets.json found. Running tests with a default mnemonic...');
  mnemonic = '';
} else {
  secrets = JSON.parse(fs.readFileSync('secrets.json', 'utf8'));
  mnemonic = secrets.mnemonic;
}

const testRPCInput = { accounts: generateAccounts(mnemonic, 0, ACCOUNTS, []) };

TestRPC.server(testRPCInput).listen(8545);
const truffle = cp.spawn('truffle', ['test']);

truffle.stdout.on('data', (data) => {
  process.stdout.write(data.toString());
});

truffle.stderr.on('data', (data) => {
  process.stdout.write(data.toString());
});

truffle.on('exit', (code) => {
  process.exit(code);
});

