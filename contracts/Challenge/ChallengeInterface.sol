pragma solidity ^0.4.8;

contract ChallengeInterface {
  function ended() public view returns (bool);
  function passed() view public returns (bool);
  function determineReward() public view returns (uint);
}
