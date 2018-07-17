pragma solidity ^0.4.8;

contract ChallengeInterface {
  /// @dev returns whether challenge is ready for resolutin
  function ended() public view returns (bool);

  /// @dev returns whether challenge has passed
  function passed() public view returns (bool);

  /// @dev returns how much token the challenger staked
  function stake() public view returns (uint);

  /// @dev returns the amount of challenge deposit tokens
  ///      the challenge requires to carry out functionality
  function requiredTokenDeposit() public view returns(uint);
    
  /// @dev returns the number of tokens awarded to the winning party
  function tokenRewardAmount() public view returns (uint);
}
