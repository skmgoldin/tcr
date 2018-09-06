# Token-Curated Registry

[ ![Codeship Status for skmgoldin/tcr](https://app.codeship.com/projects/b140cce0-ac77-0135-0738-52e8b96e2dec/status?branch=master)](https://app.codeship.com/projects/257003)

A hash-keyed [token-curated registry (TCR)](https://medium.com/@ilovebagels/token-curated-registries-1-0-61a232f8dac7). [Owner's Manual available](https://github.com/skmgoldin/tcr/blob/master/owners_manual.md).

Mainnet factory: [0x74bd1d07a158e8a9eecfbd2267766f5919e2b21c](https://etherscan.io/address/0x74bd1d07a158e8a9eecfbd2267766f5919e2b21c#code)

Rinkeby factory: [0x2bddfc0c506a00ea3a6ccea5fbbda8843377dcb1](https://rinkeby.etherscan.io/address/0x2bddfc0c506a00ea3a6ccea5fbbda8843377dcb1#code)

EPM: [tcr](https://www.ethpm.com/registry/packages/44)

## Initialize
The only environmental dependency you need is Node. Presently we can guarantee this all works with Node 8.
```
npm install
npm run compile
```

## Tests
The repo has a comprehensive test suite. You can run it with `npm run test`. To run the tests with the RPC logs, use `npm run test gas`.

## Composition of the repo
The repo is composed as a Truffle project, and is largely idiomatic to Truffle's conventions. The tests are in the `test` directory, the contracts are in the `contracts` directory and the migrations (deployment scripts) are in the `migrations` directory. Furthermore there is a `conf` directory containing json files where deployments can be parameterized.

## Deploying your own TCR
Since [v1.1.0](https://github.com/skmgoldin/tcr/releases/tag/v1.1.0), only the factory contracts are deployed during `truffle migrate`. To deploy a RegistryFactory to any network you can use the NPM scripts in the `package.json`. To deploy to a local Ganache instance, set an environment variable `MNEMONIC` to the mnemonic exposed by Ganache. To spawn proxy contracts using a deployed RegistryFactory, execute the snippet in [/scripts](./scripts) by running:

```
npm run deploy-proxies:[network]
```

## Packages
The repo consumes several EPM packages. `dll` and `attrstore` are libraries used in PLCRVoting's doubly-linked list abstraction. `tokens` provides an ERC20-comaptible token implementation. `plcr-revival` features batched executions for some transactions. All packages are installed automatically when running `npm install`.

