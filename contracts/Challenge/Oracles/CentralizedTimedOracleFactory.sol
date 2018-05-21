pragma solidity ^0.4.15;
import "../Oracles/CentralizedTimedOracle.sol";


/// @title Centralized oracle factory contract - Allows to create centralized oracle contracts
/// @author Stefan George - <stefan@gnosis.pm>
contract CentralizedTimedOracleFactory {

    /*
     *  Events
     */
    event CentralizedTimedOracleCreation(address indexed creator, CentralizedTimedOracle centralizedTimedOracle, bytes ipfsHash, uint resolutionDate);

    /*
     *  Public functions
     */
    /// @dev Creates a new centralized oracle contract
    /// @param ipfsHash Hash idxentifying off chain event description
    /// @return Oracle contract
    function createCentralizedTimedOracle(bytes ipfsHash, uint resolutionDate)
        external
        returns (CentralizedTimedOracle centralizedTimedOracle)
    {
        centralizedTimedOracle = new CentralizedTimedOracle(msg.sender, ipfsHash, resolutionDate);
        CentralizedTimedOracleCreation(msg.sender, centralizedTimedOracle, ipfsHash, resolutionDate);
    }
}
