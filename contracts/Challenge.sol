pragma solidity^0.4.11;

import "./PLCRVoting.sol";
import "tokens/eip20/EIP20.sol";

library Challenge {

  // ------
  // DATA STRUCTURES
  // ------

  struct Data {
    uint rewardPool;        // (remaining) Pool of tokens distributed amongst winning voters
    PLCRVoting voting;      // Address of a PLCRVoting contract
    EIP20 token;            // Address of an ERC20 token contract
    uint challengeID;       // An ID corresponding to a pollID in the PLCR contract
    address challenger;     // Owner of Challenge
    bool resolved;          // Indication of if challenge is resolved
    uint stake;             // Number of tokens at risk for either party during challenge
    uint winningTokens;     // (remaining) Amount of tokens used for voting by the winning side
    mapping(address =>
            bool) tokenClaims; // maps addresses to token claim data for this challenge
  }

  // --------
  // GETTERS
  // --------

  /// @dev returns true if the application/listing is initialized
  function isInitialized(Data storage _self) constant public returns (bool) {
    return _self.challengeID > 0;
  }

  /// @dev returns true if the application/listing has a resolved challenge
  function isResolved(Data storage _self) constant public returns (bool) {
    return _self.resolved;
  }

  /// @dev determines whether voting has concluded in a challenge for a given domain. Throws if no challenge exists.
  function canBeResolved(Data storage _self) constant public returns (bool) {
    return _self.voting.pollEnded(_self.challengeID) && _self.resolved == false;
  }

  /// @dev determines the number of tokens awarded to the winning party in a challenge.
  function challengeWinnerReward(Data storage _self) public constant returns (uint) {
    // Edge case, nobody voted, give all tokens to the challenger.
    if (_self.voting.getTotalNumberOfTokensForWinningOption(_self.challengeID) == 0) {
      return 2 * _self.stake;
    }

    return (2 * _self.stake) - _self.rewardPool;
  }

  /**
  @dev                Calculates the provided voter's token reward for the given poll.
  @param _voter       The address of the voter whose reward balance is to be returned
  @param _salt        The salt of the voter's commit hash in the given poll
  @return             The uint indicating the voter's reward 
  */
  function voterReward(Data storage _self, address _voter, uint _salt)
  public constant returns (uint) {
    uint voterTokens = _self.voting.getNumPassingTokens(_voter, _self.challengeID, _salt);
    return (voterTokens * _self.rewardPool) / _self.winningTokens;
  }

  // --------
  // STATE-CHANGING FUNCTIONS
  // --------

  /**
  @dev called by a voter to claim his/her reward for each completed vote.
  @param _voter the address of the voter to claim a reward for
  @param _salt the salt of a voter's commit hash in the given poll
  */
  function claimReward(Data storage _self, address _voter, uint _salt) public returns (uint) {
    // Ensures the voter has not already claimed tokens and challenge results have been processed
    require(_self.tokenClaims[_voter] == false);
    require(isResolved(_self));

    uint voterTokens = _self.voting.getNumPassingTokens(_voter, _self.challengeID, _salt);
    uint reward = voterReward(_self, _voter, _salt);

    // Subtracts the voter's information to preserve the participation ratios
    // of other voters compared to the remaining pool of rewards
    _self.winningTokens -= voterTokens;
    _self.rewardPool -= reward;

    require(_self.token.transfer(_voter, reward));

    // Ensures a voter cannot claim tokens again
    _self.tokenClaims[_voter] = true;
    
    return reward;
  }
}

