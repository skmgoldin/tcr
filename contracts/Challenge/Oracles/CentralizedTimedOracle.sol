pragma solidity ^0.4.8;

import './TimedOracle.sol';
import '@gnosis.pm/gnosis-core-contracts/contracts/Oracles/CentralizedOracleFactory.sol';


//TODO: Make TimedOracle AND PriceOracle separately to PR for Gnosis
// right now this is a combination of centralized and Timed oracle
contract CentralizedTimedOracle is CentralizedOracle, TimedOracle {

  function CentralizedTimedOracle(
    address _owner,
    bytes _ipfsHash,
    uint _resolutionDate
  ) public
    CentralizedOracle(_owner, _ipfsHash)
    TimedOracle(_resolutionDate)
  {}

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

}
