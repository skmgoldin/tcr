pragma solidity ^0.4.8;

import "../Registry.sol";
import "./ChallengeInterface.sol";

contract ChallengeFactoryInterface {
  function createChallenge(address _challenger, address _listingOwner, Registry _registry) external returns (ChallengeInterface);
}
