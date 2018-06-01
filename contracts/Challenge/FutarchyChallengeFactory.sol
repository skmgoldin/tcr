pragma solidity ^0.4.8;
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/FutarchyOracleFactory.sol';
import '@gnosis.pm/dx-contracts/contracts/DutchExchange.sol';
import './Oracles/CentralizedTimedOracleFactory.sol';
import "./ChallengeFactoryInterface.sol";
import "./FutarchyChallenge.sol";

contract FutarchyChallengeFactory is ChallengeFactoryInterface {

  // ============
  // STATE:
  // ============
  // GLOBAL VARIABLES
  address public token;              // Address of the TCR's intrinsic ERC20 token
  uint public stakeAmount;           // Amount that must be staked to initiate a Challenge
  uint public tradingPeriod;         // Duration for open trading on futarchy prediction markets
  uint public timeToPriceResolution; // Duration from start of prediction markets until date of final price resolution

  FutarchyOracleFactory public futarchyOracleFactory;                  // Factory for creating Futarchy Oracles
  CentralizedTimedOracleFactory public centralizedTimedOracleFactory;  // Factory for creating Oracles to resolve Futarchy's scalar prediction markets
  LMSRMarketMaker public lmsrMarketMaker;                              // LMSR Market Maker for futarchy's prediction markets
  DutchExchange public dutchExchange;                                  // Dutch Exchange contract to retrive token prices

  // ------------
  // CONSTRUCTOR:
  // ------------
  /// @dev Contructor                  Sets the global state of the factory
  /// @param _tokenAddr                Address of the TCR's intrinsic ERC20 token
  /// @param _stakeAmount              Amount that must be staked to initiate a Challenge
  /// @param _tradingPeriod            Duration for open trading on futarchy prediction markets before futarchy resolution
  /// @param _timeToPriceResolution    Duration from start of prediction markets until date of final price resolution
  /// @param _futarchyOracleFactory    Factory for creating Futarchy Oracles
  /// @param _centralizedTimedOracleFactory Factory for creating Oracles to resolve Futarchy's scalar prediction markets
  /// @param _lmsrMarketMaker          LMSR Market Maker for futarchy's prediction markets
  function FutarchyChallengeFactory(
    address _tokenAddr,
    uint _stakeAmount,
    uint _tradingPeriod,
    uint _timeToPriceResolution,
    FutarchyOracleFactory _futarchyOracleFactory,
    CentralizedTimedOracleFactory _centralizedTimedOracleFactory,
    LMSRMarketMaker _lmsrMarketMaker,
    DutchExchange _dutchExchange
  ) public {
    token                 = _tokenAddr;
    stakeAmount           = _stakeAmount;
    tradingPeriod         = _tradingPeriod;
    timeToPriceResolution = _timeToPriceResolution;

    futarchyOracleFactory         = _futarchyOracleFactory;
    centralizedTimedOracleFactory = _centralizedTimedOracleFactory;
    lmsrMarketMaker               = _lmsrMarketMaker;
    dutchExchange                 = _dutchExchange;
  }

  // --------------------
  // FACTORY INTERFACE:
  // --------------------
  /// @dev createChallenge        Creates challenge associated to a Registry listing
  /// @param _challenger          Address of the challenger
  /// @param _listingOwner        Address of the listing owner
  /// @return ChallengeInterface Newly created Challenge
  function createChallenge(address _challenger, address _listingOwner) external returns (ChallengeInterface) {
    return new FutarchyChallenge(
      token,
      _challenger,
      _listingOwner,
      stakeAmount,
      tradingPeriod,
      timeToPriceResolution,
      futarchyOracleFactory,
      centralizedTimedOracleFactory,
      lmsrMarketMaker
    );
  }

  function determinePriceBounds() internal returns (uint upperBound, int lowerBound) {
    // call dx FIVE TIMES to get five lastest prices.
    // determine spread...then double that.
  }
}
