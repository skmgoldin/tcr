/* eslint no-multi-spaces: 0, no-console: 0 */
//
// module.exports = (deployer, network) => {
//
// };


const Math = artifacts.require('@gnosis.pm/gnosis-core-contracts/Math')

const DutchExchangeMock = artifacts.require('DutchExchangeMock')
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
  if (network == 'testing' || network == 'development') {
      deployer.deploy(Math)
      // Linking
      .then(() => deployer.link(Math, [StandardToken, EtherToken, TokenGNO, TokenMGN, TokenOWL, TokenOWLProxy, OWLAirdrop]))
      .then(() => deployer.link(Math, [TokenRDN, TokenOMG]))

      // Deployment of Tokens
      .then(() => deployer.deploy(EtherToken))
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
      .then(() => deployer.deploy(DutchExchangeMock))
      .then(() => deployer.deploy(Proxy, DutchExchangeMock.address))

      // @dev DX Constructor creates exchange
      .then(() => Proxy.deployed())
      .then(p => DutchExchangeMock.at(p.address).setupDutchExchange(
        TokenMGN.address,
        TokenOWLProxy.address,
        accounts[0],                           // @param _owner will be the admin of the contract
        EtherToken.address,                   // @param _ETH               - address of ETH ERC-20 token
        PriceOracleInterface.address,        // @param _priceOracleAddress - address of priceOracle
        10000000000000000000000,            // @param _thresholdNewTokenPair: 10,000 dollar
        1000000000000000000000,            // @param _thresholdNewAuction:     1,000 dollar
      ))
    }
}
