pragma solidity ^0.4.24;

contract TimedOracle {

  // ============
  // STATE:
  // ============
  // GLOBAL VARIABLES
  uint public resolutionDate;

  modifier resolutionDatePassed() {
    require(now > resolutionDate);
    _;
  }

  function TimedOracle(uint _resolutionDate) public {
    resolutionDate = _resolutionDate;
  }

}
