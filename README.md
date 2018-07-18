# Token-Curated Registry

[ ![Codeship Status for skmgoldin/tcr](https://app.codeship.com/projects/b140cce0-ac77-0135-0738-52e8b96e2dec/status?branch=master)](https://app.codeship.com/projects/257003)

A hash-keyed [token-curated registry (TCR)](https://medium.com/@ilovebagels/token-curated-registries-1-0-61a232f8dac7). [Owner's Manual available](https://github.com/skmgoldin/tcr/blob/master/owners_manual.md).

Mainnet factory: [0xcc0df91b86795f21c3d43dbeb3ede0dfcf8dccaf](https://etherscan.io/address/0xcc0df91b86795f21c3d43dbeb3ede0dfcf8dccaf#code)

Rinkeby factory: [0x822415a1e4d0d7f99425d794a817d9b823bdcd0c](https://rinkeby.etherscan.io/address/0x822415a1e4d0d7f99425d794a817d9b823bdcd0c#code)

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
<!-- deprecated, needs rewording -->
<!-- To deploy your own TCR, first open up `conf/config.json`. The `paramDefaults` object in the config JSON will specify the starting parameters your TCR is deployed with. In the `token` object, set `deployToken` to `true` if you want to deploy this TCR's token as part of the TCR deployment. You can specifiy initial recipients of the token in the `tokenHolders` array. If you have already deployed a token, set `deployToken` to `false` and provide the token's address in the `address` property. The token should be EIP20. -->

The `package.json` includes scripts for deploying to rinkeby and mainnet. Modify `truffle.js` and `package.json` if you need other networks. You'll need a `secrets.json` file with a funded mnemonic on the `m/44'/60'/0'/0/0` HD path in the root of the repo to deploy. Your `secrets.json` should look like this:

```json
{
  "mnemonic": "my good mnemonic ..."
}
```

If you prefer to use an environment variable, your `.bashrc` or `.bash_profile` should look something like:

```bash
export MNEMONIC='my good mnemonic ...'
```

You can use [https://iancoleman.io/bip39/](https://iancoleman.io/bip39/) to generate a mnemonic and derive its `m/44'/60'/0'/0/0` address.

## Deploy proxies
Note: since [v1.1.0](https://github.com/skmgoldin/tcr/releases/tag/v1.1.0), only the factory contracts are deployed during `truffle migrate`. To spawn proxy contracts using a deployed RegistryFactory, execute the snippet in [/scripts](./scripts) by running:

```
npm run deploy-proxies:[network]
```

## Packages
The repo consumes several EPM packages. `dll` and `attrstore` are libraries used in PLCRVoting's doubly-linked list abstraction. `tokens` provides an ERC20-comaptible token implementation. `plcr-revival` features batched executions for some transactions. All packages are installed automatically when running `npm install`.

