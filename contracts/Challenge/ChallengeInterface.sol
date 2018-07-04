pragma solidity ^0.4.24;

contract ChallengeInterface {
  function ended() public view returns (bool);
  function passed() public view returns (bool);
  function tokenLockAmount() public view returns (uint);
}
