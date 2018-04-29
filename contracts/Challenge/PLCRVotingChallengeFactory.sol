pragma solidity ^0.4.8;

import "../Parameterizer.sol";
import "./ChallengeFactoryInterface.sol";
import "./PLCRVotingChallenge.sol";

contract PLCRVotingChallengeFactory is ChallengeFactoryInterface {

  address public token;
  Parameterizer public parameterizer;

  function PLCRVotingChallengeFactory(address _token, address _parameterizer) public {
    token = _token;
    parameterizer = Parameterizer(_parameterizer);
  }

  function createChallenge() external returns (ChallengeInterface) {
    return new PLCRVotingChallenge(
      token,
      parameterizer.get("commitStageLen"),
      parameterizer.get("revealStageLen"),
      parameterizer.get("voteQuorum")
    );
  }

}
