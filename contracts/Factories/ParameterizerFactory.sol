pragma solidity^0.4.21;

import "../Parameterizer.sol";

contract ParameterizerFactory {
    function create(address _token, address _plcr) public returns (Parameterizer) {
        uint minDeposit = 10;
        uint pMinDeposit = 100;
        uint applyStageLength = 600;
        uint pApplyStageLength = 1200;
        uint commitStageLength = 600;
        uint pCommitStageLength = 1200;
        uint revealStageLength = 600;
        uint pRevealStageLength = 1200;
        uint dispensationPct = 50;
        uint pDispensationPct = 50;
        uint voteQuorum = 50;
        uint pVoteQuorum = 50;

        return new Parameterizer(
            _token,
            _plcr,
            minDeposit,
            pMinDeposit,
            applyStageLength,
            pApplyStageLength,
            commitStageLength,
            pCommitStageLength,
            revealStageLength,
            pRevealStageLength,
            dispensationPct,
            pDispensationPct,
            voteQuorum,
            pVoteQuorum
        );
    }
}
