pragma solidity ^0.4.8;
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/FutarchyOracleFactory.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/CentralizedOracleFactory.sol';
import "./ChallengeFactoryInterface.sol";
import "./FutarchyChallenge.sol";

contract FutarchyChallengeFactory is ChallengeFactoryInterface {

  // ============
  // STATE:
  // ============
  // GLOBAL VARIABLES
  address public token;        // Address of the TCR's intrinsic ERC20 token
  uint public stakeAmount;     // Amount that must be staked to initiate a Challenge
  uint public tradingPeriod;   // Duration for open trading on futarchy prediction markets

  FutarchyOracleFactory public futarchyOracleFactory;        // Factory for creating Futarchy Oracles
  CentralizedOracleFactory public centralizedOracleFactory;  // Factory for creating Oracles to resolve Futarchy's scalar prediction markets
  LMSRMarketMaker public lmsrMarketMaker;                    // LMSR Market Maker for futarchy's prediction markets

  // ------------
  // CONSTRUCTOR:
  // ------------
  /// @dev Contructor                  Sets the global state of the factory
  /// @param _tokenAddr                Address of the TCR's intrinsic ERC20 token
  /// @param _stakeAmount              Amount that must be staked to initiate a Challenge
  /// @param _tradingPeriod            Duration for open trading on futarchy prediction markets
  /// @param _futarchyOracleFactory    Factory for creating Futarchy Oracles
  /// @param _centralizedOracleFactory Factory for creating Oracles to resolve Futarchy's scalar prediction markets
  /// @param _lmsrMarketMaker          LMSR Market Maker for futarchy's prediction markets
  function FutarchyChallengeFactory(
    address _tokenAddr,
    uint _stakeAmount,
    uint _tradingPeriod,
    FutarchyOracleFactory _futarchyOracleFactory,
    CentralizedOracleFactory _centralizedOracleFactory,
    LMSRMarketMaker _lmsrMarketMaker
  ) public {
    token         = _tokenAddr;
    stakeAmount   = _stakeAmount;
    tradingPeriod = _tradingPeriod;

    futarchyOracleFactory    = _futarchyOracleFactory;
    centralizedOracleFactory = _centralizedOracleFactory;
    lmsrMarketMaker          = _lmsrMarketMaker;
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
      futarchyOracleFactory,
      centralizedOracleFactory,
      lmsrMarketMaker
    );
  }
}
