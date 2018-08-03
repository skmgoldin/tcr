pragma solidity ^0.4.24;

import "./ChallengeInterface.sol";

contract ChallengeFactoryInterface {
  function createChallenge(address registry, address challenger, address listingOwner) external returns (ChallengeInterface);
}
