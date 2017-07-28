pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";
import "./Test.sol";

/*
=======
 TO DO
=======

implement events
refactor & wrap check & transfer ?

*/



contract Registry {

/* Storage
 */
     
    // Registry storage
    StandardToken public token;
    PLCRVoting public voting;
    mapping(bytes32 => Publisher) public whitelist; // domainHash => Publisher struct
    mapping(bytes32 => Application) public appPool; // holds applications for both domain and parameter appPool
    mapping(bytes32 => Params) public paramSnapshots;
    mapping(uint => VoteInfo) public pollInfo; // holds information on individual polls
    mapping(address => mapping(uint => bool)) public voterInfo; // holds information on voters' token claims
    string domain;
    // Parameter storage
    mapping(bytes32 => uint) public Parameters;
    mapping(uint => bytes32) public idToHash;
    string parameter;
    uint value;

/* Structs
 */
    struct Publisher {
        address owner;
        uint expTime;     // expiration of whitelist listing + renewal time
        uint expCurrent;  // expiration of the current whitelist period (tells us when renewal starts)
        uint deposit;

        uint prevDeposit; // total withdrawable amount
        uint nextDeposit; // deposit of renewal
        bool renewal; 
    }

    struct Application {
        address owner;
        bool challenged;
        uint challengeTime; //End of challenge period
        address challenger;
        string domain;

        // for parameter changes
        string parameter;
        uint value;
    }

    struct Params {
        // parameters concerning the whitelist and application pool
        uint minDeposit;
        uint minParamDeposit;
        uint challengeLen;
        uint registryLen;

        // parameters to be passed into the voting contract
        uint commitVoteLen;
        uint revealVoteLen;
        uint majority;

        // parameter representing the scale of how token rewards are distributed
        uint dispensationPct;
    }

    struct VoteInfo {
        // if the vote has been processed
        bool processed;
        // amount of leftover tokens available for winning party to claim
        // (a byproduct of needing to floor the distributed tokens to voters)
        uint256 remainder;
        address claimer;
    }

/* Constants
 */
    uint256 constant private MULTIPLIER = 10 ** 18;  // constant used to help represent doubles as ints
    bytes32 constant private MINDEPOSIT_h = sha3("minDeposit");
    bytes32 constant private MINPARAMDEPOSIT_h = sha3("minParamDeposit");
    bytes32 constant private CHALLENGELEN_h = sha3("challengeLen");
    bytes32 constant private REGISTRYLEN_h = sha3("registryLen");
    bytes32 constant private COMMITVOTELEN_h = sha3("commitVoteLen");
    bytes32 constant private REVEALVOTELEN_h = sha3("revealVoteLen");
    bytes32 constant private DISPENSATIONPCT_h = sha3("dispensationPct");
    bytes32 constant private MAJORITY_h = sha3("majority");
    

/* Constructor
 */
    /// @param _minDeposit      application & challenger deposit amounts for domains
    /// @param _minParamDeposit application & challenger deposit amounts for parameters
    /// @param _challengeLen    duration of the challenge period
    /// @param _registryLen     duration of a registration’s validity
    /// @param _commitVoteLen   duration of the commit period in token votes
    /// @param _revealVoteLen   duration of reveal period in token votes 
    /// @param _dispensationPct percentage of forfeited deposit distributed to winning party; uint between 0 and 100 
    /// @param _majority        percentage of votes that constitutes the majority; uint between 0 and 100
    function Registry(address _token,
        address _voting,
        uint _minDeposit,
        uint _minParamDeposit,
        uint _challengeLen,
        uint _registryLen,
        uint _commitVoteLen,
        uint _revealVoteLen,
        uint _dispensationPct,
        uint _majority) {

        token = StandardToken(_token);
        voting = PLCRVoting(_voting);
        // initialize values
        Parameters[MINDEPOSIT_h]        = _minDeposit;
        Parameters[MINPARAMDEPOSIT_h]   = _minParamDeposit;
        Parameters[CHALLENGELEN_h]      = _challengeLen;
        Parameters[REGISTRYLEN_h]       = _registryLen;
        Parameters[COMMITVOTELEN_h]     = _commitVoteLen;
        Parameters[REVEALVOTELEN_h]     = _revealVoteLen;
        Parameters[DISPENSATIONPCT_h]   = _dispensationPct;
        Parameters[MAJORITY_h]          = _majority;
    }


/* Registry Functions
 */

    // called by applicant to add to application pool on success
    function apply(string _domain) public {
        bytes32 domainHash = sha3(_domain);
        require(appPool[domainHash].owner == 0); // not in appPool
        // check if new applicant or renewal
        if (whitelist[domainHash].owner == 0)  // new applicant
        {
            // initialize with the current values of all parameters
            initializeSnapshot(domainHash);
            initApplication(domainHash, paramSnapshots[domainHash].minDeposit, msg.sender);
            appPool[domainHash].domain = _domain;
        }
        else  // renewal
        {
            renew(domainHash);
        }
    }

    // helper function to apply() and proposeUpdate()
    // obtain deposit from applicant and initialize challenge end time and owner
    function initApplication(bytes32 _hash, uint deposit, address _applicant) private {
        require(appPool[_hash].owner == 0); // prevent repeat applications
        require(token.transferFrom(_applicant, this, deposit)); // pay deposit
        setAppAttr(_hash, _applicant);
    }

    // called by owner of a domain on the whitelist
    // make necessary token transfers and initialize application for renewal in the appPool
    function renew (bytes32 _domainHash) private {
        bytes32 domainHash = sha3(_domain);
        require(hasRenewal(domainHash) == false); //prevent duplicate renewals
        require(msg.sender == whitelist[domainHash].owner); // must be the owner of the domain
        uint minDeposit = Parameters[MINDEPOSIT_h];
        uint lockedTok = whitelist[domainHash].deposit;
        uint unlockedTok = whitelist[domainHash].prevDeposit;
        uint extraNeeded;

        if (lockedTok + unlockedTok >= minDeposit) 
        {// existing total num tokens is sufficient 
            if (lockedTok >= minDeposit) 
            {// have enough locked tok, only take from currently locked deposit
                whitelist[domainHash].deposit = lockedTok - minDeposit;
            }
            else // lockedTok < minDeposit
            {// not enough locked tok, take entire locked deposit and part of unlocked 
                extraNeeded = minDeposit - lockedTok;
                // update num unlocked tokens
                whitelist[domainHash].prevDeposit = unlockedTok - extraNeeded;
                whitelist[domainHash].deposit = 0;
            } 
        }
        else 
        { // existing total num tokens is not sufficient, must send in more tokens
            extraNeeded = minDeposit - (lockedTok + unlockedTok);
            require(token.transferFrom(msg.sender, this, extraNeeded));
            whitelist[domainHash].deposit = 0;
            whitelist[domainHash].prevDeposit = 0;
        }
        // apply
        initializeSnapshot(domainHash);
        setAppAttr(domainHash, msg.sender);
        whitelist[domainHash].renewal = true;
    }

    // called by the owner of a domain on the whitelist 
    // renew domain on the whitelist and allow additional renewal
    // without calling this, apply will not let a whitelist member
    // renew, and claimDeposit will not let them withdraw newly
    // freed tokens
    // however, isVerified will still return true without this call
    // for the renewal period as well as the current (or newly expired) whitelist period
    function activateRenewal(string _domain) public {
        bytes32 _hash = sha3(_domain);  
        if (hasRenewal(_hash) && whitelist[_hash].expCurrent < now)
        {
            whitelist[_hash].expCurrent = whitelist[_hash].expTime;
            whitelist[_hash].prevDeposit += whitelist[_hash].deposit;
            whitelist[_hash].deposit = whitelist[_hash].nextDeposit;
            whitelist[_hash].renewal = false;
        }
    }

    // called by adtoken holder to challenge an application
    // initialize vote to accept/reject a domain to the registry
    function challengeApplication(string _domain) public returns(uint) {
        bytes32 domainHash = sha3(_domain);
        challenge(domainHash, paramSnapshots[domainHash].minDeposit, msg.sender);
        // start a vote
        uint pollID = callVote(_domain 
        ,paramSnapshots[domainHash].majority
        ,paramSnapshots[domainHash].commitVoteLen
        ,paramSnapshots[domainHash].revealVoteLen);
        idToHash[pollID] = domainHash;
        return pollID;
    }

    // helper function to challengeApplication() and challengeProposal()
    // transfer tokens update application status 
    function challenge(bytes32 _hash, uint deposit, address _challenger) private {
        // take tokens from challenger
        require(token.transferFrom(_challenger, this, deposit));

        // prevent someone from challenging an unintialized application, rechallenging,
        // or challenging after the challenge period has ended
        require(appPool[_hash].owner != 0);
        require(appPool[_hash].challenged == false);
        require(appPool[_hash].challengeTime > now);

        // update application status 
        appPool[_hash].challenged = true;
        appPool[_hash].challenger = _challenger;
    }
    
    // helper function to challenge() 
    // initialize vote through the voting contract. Return poll id
    function callVote(string _proposalString, 
        uint _majority, 
        uint _commitVoteLen, 
        uint _revealVoteLen) private returns (uint) {
        // event that vote has started
        uint pollID = voting.startPoll( _proposalString, _majority, _commitVoteLen,  _revealVoteLen);
        return pollID;
    }
    
    // one-time function for each completed vote
    // if domain won: domain is moved to the whitelist and applicant is rewarded tokens, return true
    // if domain lost: challenger is rewarded tokens, return false
    function processResult(uint _pollID) returns (bool) {
        bytes32 domainHash = idToHash[_pollID];
        require(isDomainApp(domainHash));  // processing parameter hash is unintended behavior
        require(pollInfo[_pollID].processed == false);
        // ensures the result cannot be processed again
        pollInfo[_pollID].processed = true;

        if (voting.isPassed(_pollID)) {
            // add to registry
            add(domainHash, appPool[domainHash].owner);
            pollInfo[_pollID].claimer = appPool[domainHash].owner;
            // give tokens to applicant based on dist and total tokens
            giveWinnerReward(domainHash, appPool[domainHash].owner);
            // uninitialize application
            delete appPool[domainHash].owner;
            return true;
        }
        else {
            pollInfo[_pollID].claimer = appPool[domainHash].challenger;
            giveWinnerReward(domainHash, appPool[domainHash].challenger);
            require(token.transfer(appPool[domainHash].challenger, paramSnapshots[domainHash].minDeposit));
            delete appPool[domainHash].owner;
            return false;
        }
    }

    // called to move an applying domain to the whitelist
    // iff the domain's challenge period has passed without a challenge
    function moveToRegistry(string _domain) public {
        bytes32 domainHash = sha3(_domain);
        require(appPool[domainHash].challengeTime < now); 
        require(appPool[domainHash].challenged == false);
        // prevents moving a domain to the registry without ever applying
        require(appPool[domainHash].owner != 0);
        // prevent applicant from moving to registry multiple times
        add(domainHash, appPool[domainHash].owner);
        delete appPool[domainHash].owner; // remove from appPool
    }

    // helper function to moveToRegistry() and processResult()
    // add a domain to whitelist or update renewal attributes
    function add(bytes32 _domainHash, address _owner) private {
        uint expiration = paramSnapshots[_domainHash].registryLen;
        if (whitelist[_domainHash].renewal == true) 
        {
            if (whitelist[_domainHash].expCurrent < now) // if expired off whitelist
            { //determine the next expiry starting from now
                whitelist[_domainHash].expTime = now + expiration;
            }
            else // if domain has not expired
            { //determine next expiry starting from the end of the current expiry
                whitelist[_domainHash].expTime = whitelist[_domainHash].expCurrent + expiration;
            }
            whitelist[_domainHash].nextDeposit = paramSnapshots[_domainHash].minDeposit;
        }
        else
        {
            whitelist[_domainHash].expCurrent = now + expiration;
            whitelist[_domainHash].expTime = now + expiration;
            whitelist[_domainHash].deposit = paramSnapshots[_domainHash].minDeposit;
        }
        whitelist[_domainHash].owner = _owner;
    }

/* Token Distribution Functions
 */

    // called by the owner of a domain on the whitelist
    // withdraw any number of unlocked tokens
    function claimDeposit(string _domain, uint _amount) public {
        bytes32 domainHash = sha3(_domain);
        uint unlockedTok = whitelist[domainHash].prevDeposit;
        require(msg.sender == whitelist[domainHash].owner);
        require(unlockedTok >= _amount);
        token.transfer(msg.sender, _amount);
        whitelist[domainHash].prevDeposit = unlockedTok - _amount;
    }

    // called by voter to claim reward for each completed vote
    function claimReward(uint _pollID, uint _salt) public {
        // ensure voter has not already claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        uint reward = calculateTokens(_pollID, _salt, msg.sender);
        // ensures a voter cannot claim tokens again
        token.transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
    }

    // helper function to claimReward()
    // number of tokens person used to vote / total number of tokens for winning side
    // scale using distribution number, give the tokens
    function calculateTokens(uint _pollID, uint _salt, address _voter) private returns(uint) {
        bytes32 hash = idToHash[_pollID];
        uint256 minDeposit = paramSnapshots[hash].minDeposit;
        uint256 dispensationPct = paramSnapshots[hash].dispensationPct;
        uint256 totalTokens = voting.getTotalNumberOfTokensForWinningOption(_pollID);
        uint256 voterTokens = voting.getNumPassingTokens(_pollID, _salt, _voter);

        uint256 rewardTokens = minDeposit * (100 - dispensationPct)*MULTIPLIER / 100;
        // what happens if expression does not divide evenly
        uint256 numerator = voterTokens * rewardTokens; 
        uint256 denominator = totalTokens * MULTIPLIER;
        uint256 remainder = numerator % denominator;

        // save remainder tokens in the form of decimal numbers with 18 places represented
        // as a uint256
        pollInfo[_pollID].remainder += remainder;
        
        return numerator / denominator;
    }

    // gives reminder tokens from poll to a designated claimer
    // the claimer is the winner of the challenge
    // for every poll there will be ~0.5 nano AdTokens burned,
    // since the winner cannot withdraw a decimal amount of nano AdToken 
    function claimExtraReward(uint _pollID) public {
        uint256 totalTokens = voting.getTotalNumberOfTokensForWinningOption(_pollID);
        uint256 reward = pollInfo[_pollID].remainder / (MULTIPLIER);
        reward = reward / totalTokens;
        pollInfo[_pollID].remainder = pollInfo[_pollID].remainder - reward * MULTIPLIER;
        token.transfer(pollInfo[_pollID].claimer, reward);
    }

    // helper function to processResult() 
    // reward a portion of minDeposit to _address
    // reward extra token to _address if dispensationPct does not divide minDeposit evenly
    function giveWinnerReward(bytes32 _hash, address _address) private {
        uint256 minDeposit = paramSnapshots[_hash].minDeposit;
        uint256 dispensationPct = paramSnapshots[_hash].dispensationPct;
        uint256 rewardTokens = minDeposit * (dispensationPct) / 100;
        if ((minDeposit * dispensationPct) % 100 != 0) {
            rewardTokens++;
        }
        require(token.transfer(_address, rewardTokens));
    }

/*****************************************************************************/


/* Registry Helper Functions
 */

    // STATIC

    // returns true if a renewal has been initialized
    function hasRenewal(bytes32 _hash) private constant returns (bool) {
        return whitelist[_hash].renewal;
    } 

    // returns true if Application is for domain and not parameter
    function isDomainApp(bytes32 _hash) private constant returns(bool){
        return bytes(appPool[_hash].parameter).length == 0;  // checks if param string is initialized
    }

    // returns true if a domain name is in the whitelist and unexpired
    // provided for the user to verify the status of their domain
    function isInRegistry(string _domain) public constant returns (bool) {
        bytes32 domainHash = sha3(_domain);
        return whitelist[domainHash].expTime > now;
    }

    // DYNAMIC

    // Initialize snapshot of parameters for each application
    function initializeSnapshot(bytes32 _hash) private {
        initializeSnapshotParam(_hash);  // maybe put the two together
        paramSnapshots[_hash].registryLen = Parameters[REGISTRYLEN_h];
    }

    // set the challenge end time and the owner of an application
    function setAppAttr(bytes32 _hash, address _applicant) private {
        delete appPool[_hash].challenged;
        appPool[_hash].challengeTime = now + paramSnapshots[_hash].challengeLen;
        appPool[_hash].owner = _applicant;
    }




/*****************************************************************************/


/* Parameter Functions
 */

    // called by a user who wishes to change a parameter
    // initialize proposal to change a parameter
    function proposeUpdate(string _parameter, uint _value) public {
        bytes32 parameterHash = sha3(_parameter, _value);
        // initialize application with a with the current values of all parameters
        initializeSnapshotParam(parameterHash);
        initApplication(parameterHash, paramSnapshots[parameterHash].minParamDeposit, msg.sender);
        appPool[parameterHash].parameter = _parameter;
        appPool[parameterHash].value = _value;
    }
    
    // called by user who wishes to reject a proposal
    // initialize vote to accept/reject the param change proposal
    function challengeProposal(string _parameter, uint _value) public returns(uint){
        bytes32 parameterHash = sha3(_parameter, _value);
        challenge(parameterHash, paramSnapshots[parameterHash].minParamDeposit, msg.sender);
        // start a vote
        uint pollID = callVote(_parameter
        ,paramSnapshots[parameterHash].majority
        ,paramSnapshots[parameterHash].commitVoteLen
        ,paramSnapshots[parameterHash].revealVoteLen);
        idToHash[pollID] = parameterHash;
        return pollID;
    }

    // a one-time function for each completed vote
    // if proposal won: new parameter value is set, and applicant is rewarded tokens, return true
    // if prospsal lost: challenger is rewarded tokens, return false
    function processProposal(uint _pollID) returns(bool) {
        require(pollInfo[_pollID].processed == false);        
        bytes32 parameterHash = idToHash[_pollID];
        parameter = appPool[parameterHash].parameter;
        value = appPool[parameterHash].value;
        delete appPool[parameterHash].owner;

        // ensures the result cannot be processed again
        pollInfo[_pollID].processed = true;
        
        if (voting.isPassed(_pollID)) {
            pollInfo[_pollID].claimer = appPool[parameterHash].owner;
            // setting the value of parameter
            Parameters[sha3(parameter)] = value;
            // give winning tokens to applicant
            giveWinnerReward(parameterHash, appPool[parameterHash].owner);
            //give minParamDeposit to applicant
            token.transfer(appPool[parameterHash].owner, paramSnapshots[parameterHash].minParamDeposit);
            return true;
        }
        else {
            pollInfo[_pollID].claimer = appPool[parameterHash].challenger;
            // give winning tokens to challenger
            giveWinnerReward(parameterHash, appPool[parameterHash].challenger);
            //give minParamDeposit to challenger
            token.transfer(appPool[parameterHash].challenger, paramSnapshots[parameterHash].minParamDeposit);
            return false;
        }
    }
    
    // called to change parameter
    // iff the proposal's challenge period has passed without a challenge
    function setParams(string _parameter, uint _value) public {
        bytes32 parameterHash = sha3(_parameter, _value);
        require(appPool[parameterHash].challengeTime < now); 
        require(appPool[parameterHash].challenged == false);
        // prevents moving a domain to the registry without ever applying
        require(appPool[parameterHash].owner != 0);
        // prevent applicant from moving to registry multiple times
        Parameters[sha3(_parameter)] = _value;
        // return proposer's deposit
        token.transfer(appPool[parameterHash].owner, paramSnapshots[parameterHash].minParamDeposit);
        delete appPool[parameterHash].owner;
    }
    
/* Parameter Helper Functions
 */

    // private function to initialize a snapshot of parameters for each proposal
    function initializeSnapshotParam(bytes32 _hash) private {
        paramSnapshots[_hash].minDeposit = Parameters[MINDEPOSIT_h];
        paramSnapshots[_hash].minParamDeposit = Parameters[MINPARAMDEPOSIT_h];
        paramSnapshots[_hash].challengeLen = Parameters[CHALLENGELEN_h];
        paramSnapshots[_hash].commitVoteLen = Parameters[COMMITVOTELEN_h];
        paramSnapshots[_hash].revealVoteLen = Parameters[REVEALVOTELEN_h];
        paramSnapshots[_hash].majority = Parameters[MAJORITY_h];
        paramSnapshots[_hash].dispensationPct = Parameters[DISPENSATIONPCT_h];
    }

    // provided for users to get value of parameter
    /// @param _keyword key for hashmap (only useful when keyword matches variable name)
    function get(string _keyword) public constant returns (uint) {
       return Parameters[sha3(_keyword)];
    }



   
/*****************************************************************************/



/* Testing-Related Helper Functions
 */

    function toHash(string _domain) returns (bytes32){
        return sha3(_domain);
    }
    function toParameterHash(string _parameter, uint _value) returns (bytes32){
        return sha3(_parameter, _value);
    }
    function getCurrentTime() returns (uint){
        return now;
    }
    



}
