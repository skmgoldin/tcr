module.exports = {
  // use the local version of truffle
  testCommand: '../node_modules/.bin/truffle test --network coverage',
  // start blockchain on the same port specified in truffle.js
  // use the default delicious Ganache mnemonic
  testrpcOptions: '-p 7545 -m "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"'
};
