pragma solidity ^0.4.11;

import "./PLCRVoting.sol";

library Challenge {

  struct Instance {
      address challenger;     // owner of Challenge
      uint pollID;            // ID of the poll where the challenge is being voted
      bool resolved;          // indication of if challenge is resolved
      uint rewardPool;        // (remaining) pool of tokens distributed amongst winning voters
      uint stake;             // number of tokens at risk for either party during challenge
      uint totalTokens;       // (remaining) amount of tokens used for voting by the winning side
      PLCRVoting voting;      // PLCRVoting instance
  }

  /**
  @dev returns false if the challenge is uninitialized
  */
  function exists(Instance storage _self) constant public returns (bool) {
      return (_self.pollID != 0);
  }

  /**
  @dev determines whether a challenge is resolved or not. Throws if the challenge is uninitialized.
  */
  function isUnresolved(Instance storage _self)
  constant public returns (bool) {
      require(exists(_self));

      return (_self.resolved == false);
  }

  function New(
    address _challenger,
    uint _rewardPool,
    uint _stake,
    PLCRVoting _voting,
    uint _voteQuorum,
    uint _commitStageLen,
    uint _revealStageLen
  ) public returns (Instance) {

    uint pollID = _voting.startPoll(_voteQuorum, _commitStageLen, _revealStageLen);

    return Instance({
      challenger: msg.sender,
      pollID: pollID,
      resolved: false,
      rewardPool: _rewardPool,
      stake: _stake,
      totalTokens: 0,
      voting: _voting
    });
  }
}

