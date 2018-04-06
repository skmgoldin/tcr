import "./Registry.sol";
import "./Parameterizer.sol";

import "tokens/eip20/EIP20.sol";
import "plcrvoting/PLCRVoting.sol";

contract Factory {
    function create(string _tokenName, string _tokenSymbol) public {
        EIP20 token = deployToken(_tokenName, _tokenSymbol);
        PLCRVoting plcr = new PLCRVoting(token);
        Parameterizer parameterizer = deployParameterizer(token, plcr);
        Registry registry = new Registry(token, plcr, parameterizer, _tokenName);

        emit Deployed(registry, parameterizer, plcr, token);
    }

    function deployToken(string _name, string _symbol) private returns (EIP20) {
        uint supply = 1000;
        uint8 decimals = 18;

        EIP20 token = new EIP20(supply, _name, decimals, _symbol);
        token.transfer(msg.sender, supply);

        return token;
    }

    function deployParameterizer(EIP20 _token, PLCRVoting _plcr) private returns (Parameterizer) {
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

    event Deployed(address registry, address parameterizer, address plcr, address token);
}
