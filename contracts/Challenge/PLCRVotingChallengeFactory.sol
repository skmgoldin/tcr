pragma solidity ^0.4.8;

import "../Parameterizer.sol";
import "./ChallengeFactoryInterface.sol";
import "./PLCRVotingChallenge.sol";

contract PLCRVotingChallengeFactory is ChallengeFactoryInterface {

  // ============
  // STATE:
  // ============
  // GLOBAL VARIABLES
  address public token;                // Address of the TCR's intrinsic ERC20 token
  Parameterizer public parameterizer;  // Address of the TCR's associeted Parameterizer contract

  // ------------
  // CONSTRUCTOR:
  // ------------
  /// @dev Contructor                  Sets the global state for the factory
  /// @param _tokenAddr                Address of the TCR's intrinsic ERC20 token
  /// @param _parameterizer            Address of the TCR's associeted Parameterizer contract
  function PLCRVotingChallengeFactory(address _tokenAddr, address _parameterizer) public {
    token = _tokenAddr;
    parameterizer = Parameterizer(_parameterizer);
  }

  // --------------------
  // FACTORY INTERFACE:
  // --------------------
  /// @dev createChallenge           Creates challenge associated to a Registry listing
  /// @param _challenger             Address of the challenger
  /// @param _listingOwner           Address of the listing owner
  /// @return ChallengeInterface    Newly created Challenge
  function createChallenge(address _challenger, address _listingOwner) external returns (ChallengeInterface) {
    uint deposit = parameterizer.get("minDeposit");
    return new PLCRVotingChallenge(
      _challenger,
      _listingOwner,
      token,
      parameterizer.get("commitStageLen"),
      parameterizer.get("revealStageLen"),
      parameterizer.get("voteQuorum"),
      ((100 - parameterizer.get("dispensationPct")) * deposit) / 100,
      deposit
    );
  }

}
