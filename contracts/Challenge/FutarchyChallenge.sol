pragma solidity ^0.4.8;
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/FutarchyOracleFactory.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/CentralizedOracleFactory.sol';
import "tokens/eip20/EIP20Interface.sol";
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
  FutarchyOracle futarchyOracle;
  FutarchyOracleFactory futarchyOracleFactory;
  CentralizedOracleFactory centralizedOracleFactory;
  EIP20Interface public token;

  function FutarchyChallenge(
    address _challenger,
    address _listingOwner,
    address _tokenAddr,
    uint _stake,
    FutarchyOracleFactory _futarchyOracleFactory,
    CentralizedOracleFactory _centralizedOracleFactory
  ) public {
    challenger = _challenger;
    listingOwner = _listingOwner;

    token = EIP20Interface(_tokenAddr);
    stake = _stake;
    futarchyOracleFactory = _futarchyOracleFactory;
    centralizedOracleFactory = _centralizedOracleFactory;
  }

  function ended() public view returns (bool) {return true;}
  function passed() public view returns (bool) {return true;}
  function tokenLockAmount() public view returns (uint) {return 1;}
}
