pragma solidity ^0.4.11;

import "./Parameterizer.sol";
import "./Challenge/PLCRVotingChallengeFactory.sol";

contract PLCRVotingRegistry is Registry {

    /**
    @dev Initializer. Create a new PLCRVotingChallengeFactory, then init the registry
    */
    function init(address _token, address _parameterizer, string _name) public {
        challengeFactory = new PLCRVotingChallengeFactory(_parameterizer);
        super.init(_token, _parameterizer, _name);
    }

}
