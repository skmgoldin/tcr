pragma solidity ^0.4.8;
import "./HumanStandardToken.sol";

contract PLCRVoting {
    uint public pollID = 0 ;

    function startPoll(string _proposalString, 
        uint _majority,uint _commitVoteLen, uint _revealVoteLen) returns (uint){
        pollID += 1;
        return pollID;
    }
    function isPassed (uint _pollID) returns (bool) {
        return ((_pollID %2)==0);
    }
    function getTotalNumberOfTokensForWinningOption (uint _pollID) returns (uint) {
        return 100;
    }
    function getNumPassingTokens(uint _pollID,uint _salt,address _voter) returns (uint) {
        return 5;
    }
}
