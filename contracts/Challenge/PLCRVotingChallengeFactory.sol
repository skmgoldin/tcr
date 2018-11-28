pragma solidity ^0.4.8;

import "../Parameterizer.sol";
import "../Registry.sol";
import "./ChallengeFactoryInterface.sol";
import "./PLCRVotingChallenge.sol";

contract PLCRVotingChallengeFactory is ChallengeFactoryInterface {

  // ============
  // STATE:
  // ============
  // GLOBAL VARIABLES
  Parameterizer public parameterizer;  // Address of the TCR's associeted Parameterizer contract

  // ------------
  // CONSTRUCTOR:
  // ------------
  /// @dev Constructor                 Sets the global state for the factory
  /// @param _parameterizer            Address of the TCR's associeted Parameterizer contract
  function PLCRVotingChallengeFactory(address _parameterizer) public {
    parameterizer = Parameterizer(_parameterizer);
  }

  // --------------------
  // FACTORY INTERFACE:
  // --------------------
  /// @dev createChallenge           Creates challenge associated to a Registry listing
  /// @param _challenger             Address of the challenger
  /// @param _listingOwner           Address of the listing owner
  /// @return ChallengeInterface      Newly created Challenge
  function createChallenge(address _challenger, address _listingOwner, Registry _registry) external returns (ChallengeInterface) {
    return new PLCRVotingChallenge(
      _challenger,
      _listingOwner,
      _registry,
      parameterizer
    );
  }

}
