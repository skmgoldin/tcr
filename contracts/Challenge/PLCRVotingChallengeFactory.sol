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

  function createChallenge(address challenger) external returns (ChallengeInterface) {
    uint deposit = parameterizer.get("minDeposit");
    return new PLCRVotingChallenge(
      challenger,
      token,
      parameterizer.get("commitStageLen"),
      parameterizer.get("revealStageLen"),
      parameterizer.get("voteQuorum"),
      ((100 - parameterizer.get("dispensationPct")) * deposit) / 100,
      deposit
    );
  }

}
