pragma solidity ^0.4.8;
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/FutarchyOracleFactory.sol';
import './Oracles/DutchExchangeMock.sol';
import './Oracles/CentralizedTimedOracleFactory.sol';
import "./ChallengeFactoryInterface.sol";
import "./FutarchyChallenge.sol";
import "zeppelin/math/SafeMath.sol";

contract FutarchyChallengeFactory is ChallengeFactoryInterface {
  // ------
  // EVENTS
  // ------
  event SetUpperAndLowerBound(uint upperBound, uint lowerBound);

  // -------
  // STATE:
  // -------
  // GLOBAL VARIABLES
  address public token;              // Address of the TCR's intrinsic ERC20 token
  address public comparatorToken;    // Address of token to which TCR's intrinsic token will be compared
  uint public stakeAmount;           // Amount that must be staked to initiate a Challenge
  uint public tradingPeriod;         // Duration for open trading on futarchy prediction markets
  uint public timeToPriceResolution; // Duration from start of prediction markets until date of final price resolution

  FutarchyOracleFactory public futarchyOracleFactory;                  // Factory for creating Futarchy Oracles
  CentralizedTimedOracleFactory public centralizedTimedOracleFactory;  // Factory for creating Oracles to resolve Futarchy's scalar prediction markets
  LMSRMarketMaker public lmsrMarketMaker;                              // LMSR Market Maker for futarchy's prediction markets
  DutchExchangeMock public dutchExchange;                              // Dutch Exchange contract to retrive token prices

  uint NUM_PRICE_POINTS = 5;  // number of past price points to reference for price average when determining TCR token value

  // ------------
  // CONSTRUCTOR:
  // ------------
  /// @dev Contructor                  Sets the global state of the factory
  /// @param _tokenAddr                Address of the TCR's intrinsic ERC20 token
  /// @param _comparatorToken          Address of token to which TCR's intrinsic token value will be compared
  /// @param _stakeAmount              Amount that must be staked to initiate a Challenge
  /// @param _tradingPeriod            Duration for open trading on futarchy prediction markets before futarchy resolution
  /// @param _timeToPriceResolution    Duration from start of prediction markets until date of final price resolution
  /// @param _futarchyOracleFactory    Factory for creating Futarchy Oracles
  /// @param _centralizedTimedOracleFactory Factory for creating Oracles to resolve Futarchy's scalar prediction markets
  /// @param _lmsrMarketMaker          LMSR Market Maker for futarchy's prediction markets
  function FutarchyChallengeFactory(
    address _tokenAddr,
    address _comparatorToken,
    uint _stakeAmount,
    uint _tradingPeriod,
    uint _timeToPriceResolution,
    FutarchyOracleFactory _futarchyOracleFactory,
    CentralizedTimedOracleFactory _centralizedTimedOracleFactory,
    LMSRMarketMaker _lmsrMarketMaker,
    DutchExchangeMock _dutchExchange
  ) public {
    token                 = _tokenAddr;
    comparatorToken       = _comparatorToken;
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

  function determinePriceBounds() external returns (uint upperBound, uint lowerBound) {
    uint currentAuctionIndex = dutchExchange.getAuctionIndex(token, comparatorToken);
    uint firstReferencedIndex = currentAuctionIndex - NUM_PRICE_POINTS;

    uint i = 0;
    uint num;
    uint den;
    uint avgPrice;
    while(i < NUM_PRICE_POINTS) {
      (num, den) = dutchExchange.getPriceInPastAuction(token, comparatorToken, firstReferencedIndex + i);
      avgPrice += (num * 10**18)/uint(den);
      i++;
    }
    avgPrice = avgPrice/uint(NUM_PRICE_POINTS);

    upperBound = avgPrice * 2;
    lowerBound = 0;

    SetUpperAndLowerBound(upperBound, lowerBound);
  }
}
