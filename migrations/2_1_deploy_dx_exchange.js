/* eslint no-multi-spaces: 0, no-console: 0 */
//
// module.exports = (deployer, network) => {
//
// };


const Math = artifacts.require('Math')

const DutchExchange = artifacts.require('DutchExchange')
const EtherToken = artifacts.require('EtherToken')
const PriceFeed = artifacts.require('PriceFeed')
const PriceOracleInterface = artifacts.require('PriceOracleInterface')
const StandardToken = artifacts.require('StandardToken')
const TokenGNO = artifacts.require('TokenGNO')
const TokenRDN = artifacts.require('TokenRDN')
const TokenOMG = artifacts.require('TokenOMG')
const TokenOWL = artifacts.require('TokenOWL')
const TokenOWLProxy = artifacts.require('TokenOWLProxy')

const TokenMGN = artifacts.require('TokenFRT')
const Medianizer = artifacts.require('Medianizer')
const Proxy = artifacts.require('Proxy')
const OWLAirdrop = artifacts.require('OWLAirdrop')
// ETH price as reported by MakerDAO with 18 decimal places
let currentETHPrice = (1100 * (10 ** 18))

const getTime = new Promise((resolve, reject) => {
          web3.eth.getBlock('pending', (err, block) => {
            if(err) return reject(err)
            resolve(block.timestamp)
        })
    })

module.exports = function deploy(deployer, network, accounts) {

  if (network === 'mainnet') {
    // deployer.deploy(Math)
    //
    //   // Linking
    //   .then(() => deployer.link(Math, [StandardToken, EtherToken, TokenGNO, TokenMGN, TokenOWL, TokenOWLProxy, OWLAirdrop]))
    //   // Deployment of Tokens
    //   .then(() => deployer.deploy(TokenMGN, accounts[0]))
    //   .then(() => deployer.deploy(TokenOWL))
    //   .then(() => deployer.deploy(TokenOWLProxy, TokenOWL.address))
    //
    //
    //   // Deployment of PriceFeedInfrastructure
    //   .then(() => deployer.deploy(PriceOracleInterface, accounts[0], '0x729D19f657BD0614b4985Cf1D82531c67569197B'))
    //
    //   // Deployment of DutchExchange
    //   .then(() => deployer.deploy(DutchExchange))
    //   .then(() => deployer.deploy(Proxy, DutchExchange.address))
    //
    //   // @dev DX Constructor creates exchange
    //   .then(() => Proxy.deployed())
    //   .then(p => DutchExchange.at(p.address).setupDutchExchange(
    //     TokenMGN.address,
    //     TokenOWLProxy.address,
    //     accounts[0],                           // @param _owner will be the admin of the contract
    //     '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // @param _ETH               - address of ETH ERC-20 token
    //     PriceOracleInterface.address,        // @param _priceOracleAddress - address of priceOracle
    //     10000000000000000000,            // @param _thresholdNewTokenPair: 10 dollar
    //     1000000000000000000,            // @param _thresholdNewAuction:     1 dollar
    //   ))
    //   .then(() => TokenMGN.deployed())
    //   .then(T => T.updateMinter(Proxy.address))

    // deploying the OWLAIRDROP is delayed to later
    //  .then(() => getTime)
    //  .then((t) => deployer.deploy(OWLAirdrop, TokenOWLProxy.address, '0x6810e776880C02933D47DB1b9fc05908e5386b96', (t + 30 * 24 * 60 * 60)))

    //  .then(() => TokenOWLProxy.deployed())
    //   .then(T => TokenOWL.at(T.address).setMinter(OWLAirdrop.address))

    // At some later point we would change the ownerShip of the MagnoliaTokens
    // .then(() => TokenMGN.deployed())
    // .then(T => T.updateOwner(Proxy.address))
  }

  else if (network === 'kovan') {
    // deployer.deploy(Math)
    //
    //   // Linking
    //   .then(() => deployer.link(Math, [StandardToken, EtherToken, TokenGNO, TokenMGN, TokenOWL, TokenOWLProxy, OWLAirdrop]))
    //   .then(() => deployer.link(Math, [TokenRDN, TokenOMG]))
    //   // Deployment of Tokens
    //   .then(() => deployer.deploy(EtherToken))
    //   .then(() => deployer.deploy(TokenGNO, 100000 * (10 ** 18)))
    //   .then(() => deployer.deploy(TokenRDN, 100000 * (10 ** 18)))
    //   .then(() => deployer.deploy(TokenOMG, 100000 * (10 ** 18)))
    //   .then(() => deployer.deploy(TokenMGN, accounts[0]))
    //   .then(() => deployer.deploy(TokenOWL))
    //   .then(() => deployer.deploy(TokenOWLProxy, TokenOWL.address))
    //
    //
    //   // Deployment of PriceFeedInfrastructure
    //   .then(() => deployer.deploy(PriceOracleInterface, accounts[0], '0xa944bd4b25c9f186a846fd5668941aa3d3b8425f'))
    //
    //   // Deployment of DutchExchange
    //   .then(() => deployer.deploy(DutchExchange))
    //   .then(() => deployer.deploy(Proxy, DutchExchange.address))
    //
    //   // @dev DX Constructor creates exchange
    //   .then(() => Proxy.deployed())
    //   .then(p => DutchExchange.at(p.address).setupDutchExchange(
    //     TokenMGN.address,
    //     TokenOWLProxy.address,
    //     accounts[0],                           // @param _owner will be the admin of the contract
    //     EtherToken.address,                   // @param _ETH               - address of ETH ERC-20 token
    //     PriceOracleInterface.address,        // @param _priceOracleAddress - address of priceOracle
    //     10000000000000000000000,            // @param _thresholdNewTokenPair: 10,000 dollar
    //     1000000000000000000000,            // @param _thresholdNewAuction:     1,000 dollar
    //   ))
    //   .then(() => TokenMGN.deployed())
    //   .then(T => T.updateMinter(Proxy.address))
    //   .then(() => getTime)
    //   .then((t) => deployer.deploy(OWLAirdrop, TokenOWLProxy.address, TokenGNO.address, (t + 30 * 24 * 60 * 60))) // in 30 days
    //   .then(() => TokenOWLProxy.deployed())
    //   .then(T => TokenOWL.at(T.address).setMinter(OWLAirdrop.address))

    // At some later point we would change the ownerShip of the MagnoliaTokens
    // .then(() => TokenMGN.deployed())
    // .then(T => T.updateOwner(Proxy.address))

  } else if (network === 'rinkeby') {

    // currentETHPrice = (730 * (10 ** 18))
    //
    // deployer.deploy(Math)
    //   // Linking
    //   .then(() => deployer.link(Math, [StandardToken, EtherToken, TokenGNO, TokenMGN, TokenOWL, TokenOWLProxy, OWLAirdrop]))
    //   .then(() => deployer.link(Math, [TokenRDN, TokenOMG]))
    //
    //   // Deployment of Tokens
    //   //.then(() => deployer.deploy(TokenGNO, 100000 * (10 ** 18)))
    //   //.then(() => deployer.deploy(TokenRDN, 100000 * (10 ** 18)))
    //   //.then(() => deployer.deploy(TokenOMG, 100000 * (10 ** 18)))
    //   .then(() => deployer.deploy(TokenMGN, accounts[0]))
    //   .then(() => deployer.deploy(TokenOWL))
    //   .then(() => deployer.deploy(TokenOWLProxy, TokenOWL.address))
    //
    //
    //   // Deployment of PriceFeedInfrastructure
    //   .then(() => deployer.deploy(PriceFeed))
    //   .then(() => deployer.deploy(Medianizer))
    //   .then(() => deployer.deploy(PriceOracleInterface, accounts[0], Medianizer.address))
    //   .then(() => Medianizer.deployed())
    //   .then(M => M.set(PriceFeed.address, { from: accounts[0] }))
    //   .then(() => PriceFeed.deployed())
    //   .then(P => P.post(currentETHPrice, 1516168838 * 2, Medianizer.address, { from: accounts[0] }))
    //
    //   // Deployment of DutchExchange
    //   .then(() => deployer.deploy(DutchExchange))
    //   .then(() => deployer.deploy(Proxy, DutchExchange.address))
    //
    //   // @dev DX Constructor creates exchange
    //   .then(() => Proxy.deployed())
    //   .then(p => DutchExchange.at(p.address).setupDutchExchange(
    //     TokenMGN.address,
    //     TokenOWLProxy.address,
    //     accounts[0],                           // @param _owner will be the admin of the contract
    //     '0xc778417e063141139fce010982780140aa0cd5ab',                   // @param _ETH               - address of ETH ERC-20 token
    //     PriceOracleInterface.address,        // @param _priceOracleAddress - address of priceOracle
    //     10000000000000000000,            // @param _thresholdNewTokenPair: 10 dollar
    //     1000000000000000000,            // @param _thresholdNewAuction:     1 dollar
    //   ))
    //   .then(() => TokenMGN.deployed())
    //   .then(T => T.updateMinter(Proxy.address))
    //   .then(() => getTime)
    //   .then((t) => deployer.deploy(OWLAirdrop, TokenOWLProxy.address, TokenGNO.address, (t + 2 * 24 * 60 * 60))) // in 2 days
    //   .then(() => TokenOWLProxy.deployed())
    //   .then(T => TokenOWL.at(T.address).setMinter(OWLAirdrop.address))

    // At some later point we would change the ownerShip of the MagnoliaTokens
    // .then(() => TokenMGN.deployed())
    // .then(T => T.updateOwner(Proxy.address))
  } else {
    console.log("ELSE OTHER!!!!")
    deployer.deploy(Math)
      // Linking
      .then(() => deployer.link(Math, [StandardToken, EtherToken, TokenGNO, TokenMGN, TokenOWL, TokenOWLProxy, OWLAirdrop]))
      .then(() => deployer.link(Math, [TokenRDN, TokenOMG]))

      // Deployment of Tokens
      // .then(() => deployer.deploy(EtherToken))
      // .then(() => deployer.deploy(TokenGNO, 100000 * (10 ** 18)))
      // .then(() => deployer.deploy(TokenRDN, 100000 * (10 ** 18)))
      // .then(() => deployer.deploy(TokenOMG, 100000 * (10 ** 18)))
      .then(() => deployer.deploy(TokenMGN, accounts[0]))
      .then(() => deployer.deploy(TokenOWL))
      .then(() => deployer.deploy(TokenOWLProxy, TokenOWL.address))

      // Deployment of PriceFeedInfrastructure
      .then(() => deployer.deploy(PriceFeed))
      .then(() => deployer.deploy(Medianizer))
      .then(() => deployer.deploy(PriceOracleInterface, accounts[0], Medianizer.address))
      .then(() => Medianizer.deployed())
      .then(M => M.set(PriceFeed.address, { from: accounts[0] }))
      .then(() => PriceFeed.deployed())
      .then(P => P.post(currentETHPrice, 1516168838 * 2, Medianizer.address, { from: accounts[0] }))

      // Deployment of DutchExchange
      .then(() => deployer.deploy(DutchExchange))
      .then(() => deployer.deploy(Proxy, DutchExchange.address))

      // @dev DX Constructor creates exchange
      .then(() => Proxy.deployed())
      .then(p => DutchExchange.at(p.address).setupDutchExchange(
        TokenMGN.address,
        TokenOWLProxy.address,
        accounts[0],                           // @param _owner will be the admin of the contract
        EtherToken.address,                   // @param _ETH               - address of ETH ERC-20 token
        PriceOracleInterface.address,        // @param _priceOracleAddress - address of priceOracle
        10000000000000000000000,            // @param _thresholdNewTokenPair: 10,000 dollar
        1000000000000000000000,            // @param _thresholdNewAuction:     1,000 dollar
      ))
      // .then(() => TokenMGN.deployed())
      // .then(T => T.updateMinter(Proxy.address))
      // .then(() => getTime)
      // .then((t) => deployer.deploy(OWLAirdrop, TokenOWLProxy.address, TokenGNO.address, (t + 30 * 60 * 60)))

      // .then(() => TokenOWLProxy.deployed())
      // .then(T => TokenOWL.at(T.address).setMinter(OWLAirdrop.address))
    // At some later point we would change the ownerShip of the MagnoliaTokens
    // .then(() => TokenMGN.deployed())
    // .then(T => T.updateOwner(Proxy.address))
  }

}
