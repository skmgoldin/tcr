pragma solidity ^0.4.8;

import "tokens/eip20/EIP20Interface.sol";
import "./ChallengeFactoryInterface.sol";
import "./PLCRVotingChallenge.sol";

contract PLCRVotingChallengeFactory is ChallengeFactoryInterface {

  address public token;

  function PLCRVotingChallengeFactory(address _token) public {
    token = _token;
  }

  function createChallenge() external returns (ChallengeInterface) {
    return new PLCRVotingChallenge(token);
  }

}
