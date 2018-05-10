pragma solidity ^0.4.8;
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/FutarchyOracleFactory.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/CentralizedOracleFactory.sol';
import "./ChallengeFactoryInterface.sol";
import "./FutarchyChallenge.sol";

contract FutarchyChallengeFactory is ChallengeFactoryInterface {

  address public token;
  uint public deposit;
  FutarchyOracleFactory futarchyOracleFactory;
  CentralizedOracleFactory centralizedOracleFactory;

  function FutarchyChallengeFactory(
    address _token,
    uint _deposit,
    FutarchyOracleFactory _futarchyOracleFactory,
    CentralizedOracleFactory _centralizedOracleFactory
  ) public {
    token = _token;
    deposit = _deposit;

    futarchyOracleFactory = _futarchyOracleFactory;
    centralizedOracleFactory = _centralizedOracleFactory;
  }

  function createChallenge(address _challenger, address _listingOwner) external returns (ChallengeInterface) {
    return new FutarchyChallenge(
      _challenger,
      _listingOwner,
      token,
      deposit,
      futarchyOracleFactory,
      centralizedOracleFactory
    );
  }
}
