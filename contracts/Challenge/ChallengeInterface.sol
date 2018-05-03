pragma solidity ^0.4.8;

contract ChallengeInterface {
  function start() public;
  function started() public view returns (bool);
  function ended() public view returns (bool);
  function passed() public view returns (bool);
  function tokenRewardAmount() public view returns (uint);
  function tokenLockAmount() public view returns (uint);
}
