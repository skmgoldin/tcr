pragma solidity ^0.4.8;

import "./ChallengeInterface.sol";

contract ChallengeFactoryInterface {
  function createChallenge(address challenger) external returns (ChallengeInterface);
}
