pragma solidity ^0.4.11;

import "./PLCRVoting.sol";

library Challenge {

  struct Instance {
      uint rewardPool;        // (remaining) pool of tokens distributed amongst winning voters
      address challenger;     // owner of Challenge
      bool resolved;          // indication of if challenge is resolved
      uint stake;             // number of tokens at risk for either party during challenge
      uint totalTokens;       // (remaining) amount of tokens used for voting by the winning side
  }

  /**
  @dev returns false if the challenge is uninitialized
  */
  function exists(Instance storage _self) constant public returns (bool) {
      return (_self.challenger != 0);
  }

  /**
  @dev determines whether a challenge is resolved or not. Throws if the challenge is uninitialized.
  */
  function isUnresolved(Instance storage _self)
  constant public returns (bool) {
      require(exists(_self));

      return (_self.resolved == false);
  }
}

