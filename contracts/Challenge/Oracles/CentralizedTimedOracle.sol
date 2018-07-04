pragma solidity ^0.4.24;

import './TimedOracle.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/Oracle.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/CentralizedOracleFactory.sol';


//TODO: Make TimedOracle AND PriceOracle separately to PR for Gnosis
// right now this is a combination of centralized and Timed oracle
contract CentralizedTimedOracle is Oracle, TimedOracle {

  event OutcomeAssignment(int outcome);

  address public owner;
  bytes public ipfsHash;
  bool public isSet;
  int public outcome;

  modifier isOwner () {
    // Only owner is allowed to proceed
    require(msg.sender == owner);
    _;
  }

  function CentralizedTimedOracle(
    address _owner,
    bytes _ipfsHash,
    uint _resolutionDate
  ) public
    TimedOracle(_resolutionDate)
  {
    owner = _owner;
    ipfsHash = _ipfsHash;
  }

  /// @dev Sets event outcome
  /// @param _outcome Event outcome
  function setOutcome(int _outcome)
      public
      resolutionDatePassed
      isOwner
  {
      // Result is not set yet
      require(!isSet);
      isSet = true;
      outcome = _outcome;
      OutcomeAssignment(_outcome);
  }

  /// @dev Returns if winning outcome is set
  /// @return Is outcome set?
  function isOutcomeSet()
      public
      view
      returns (bool)
  {
      return isSet;
  }

  /// @dev Returns outcome
  /// @return Outcome
  function getOutcome()
      public
      view
      returns (int)
  {
      return outcome;
  }
}
