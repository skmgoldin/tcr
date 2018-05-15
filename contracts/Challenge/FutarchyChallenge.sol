pragma solidity ^0.4.8;
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/FutarchyOracleFactory.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/CentralizedOracleFactory.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/MarketMakers/LMSRMarketMaker.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Tokens/Token.sol';
import "zeppelin/math/SafeMath.sol";
import "./ChallengeInterface.sol";

contract  FutarchyChallenge is ChallengeInterface {
  // ============
  // STATE VARIABLES:
  // ============

  address challenger;     /// the address of the challenger
  address listingOwner;   /// the address of the listingOwner
  bool isStarted;         /// true if challenger has executed start()
  uint stake;             /// number of tokens at stake for either party during challenge
  uint tradingPeriod;
  FutarchyOracle public futarchyOracle;
  FutarchyOracleFactory futarchyOracleFactory;
  CentralizedOracleFactory centralizedOracleFactory;
  LMSRMarketMaker lmsrMarketMaker;
  Token public token;

  function FutarchyChallenge(
    address _challenger,
    address _listingOwner,
    address _tokenAddr,
    uint _stake,
    uint _tradingPeriod,
    FutarchyOracleFactory _futarchyOracleFactory,
    CentralizedOracleFactory _centralizedOracleFactory,
    LMSRMarketMaker _lmsrMarketMaker
  ) public {
    challenger = _challenger;
    listingOwner = _listingOwner;

    token = Token(_tokenAddr);
    stake = _stake;
    tradingPeriod = _tradingPeriod;
    futarchyOracleFactory = _futarchyOracleFactory;
    centralizedOracleFactory = _centralizedOracleFactory;
    lmsrMarketMaker = _lmsrMarketMaker;
  }

  function start(int _lowerBound, int _upperBound) public {
    CentralizedOracle _centralizedOracle = centralizedOracleFactory.createCentralizedOracle('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
    uint _startDate = now + 60;

    futarchyOracle = futarchyOracleFactory.createFutarchyOracle(
      token,
      _centralizedOracle,
      2,
      _lowerBound,
      _upperBound,
      lmsrMarketMaker,
      0,
      tradingPeriod,
      _startDate
    );

    require(token.transferFrom(msg.sender, this, stake));
    require(token.approve(futarchyOracle, stake));
    futarchyOracle.fund(stake);
  }

  function ended() public view returns (bool) {return true;}
  function passed() public view returns (bool) {return true;}
  function tokenLockAmount() public view returns (uint) {return 1;}
}
