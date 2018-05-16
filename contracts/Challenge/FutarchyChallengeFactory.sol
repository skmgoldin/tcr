pragma solidity ^0.4.8;
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/FutarchyOracleFactory.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/CentralizedOracleFactory.sol';
import "./ChallengeFactoryInterface.sol";
import "./FutarchyChallenge.sol";

contract FutarchyChallengeFactory is ChallengeFactoryInterface {

  address public token;
  uint public deposit;
  uint public tradingPeriod;
  FutarchyOracleFactory futarchyOracleFactory;
  CentralizedOracleFactory centralizedOracleFactory;
  LMSRMarketMaker lmsrMarketMaker;

  function FutarchyChallengeFactory(
    address _token,
    uint _deposit,
    uint _tradingPeriod,
    FutarchyOracleFactory _futarchyOracleFactory,
    CentralizedOracleFactory _centralizedOracleFactory,
    LMSRMarketMaker _lmsrMarketMaker
  ) public {
    token = _token;
    deposit = _deposit;
    tradingPeriod = _tradingPeriod;

    futarchyOracleFactory = _futarchyOracleFactory;
    centralizedOracleFactory = _centralizedOracleFactory;
    lmsrMarketMaker = _lmsrMarketMaker;
  }

  function createChallenge(address _challenger, address _listingOwner) external returns (ChallengeInterface) {
    return new FutarchyChallenge(
      _challenger,
      _listingOwner,
      token,
      deposit,
      tradingPeriod,
      futarchyOracleFactory,
      centralizedOracleFactory,
      lmsrMarketMaker
    );
  }
}
