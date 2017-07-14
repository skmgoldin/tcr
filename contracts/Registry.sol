pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";

/*
=======
 TO DO
=======

implement events
deposit
token flooring issue
refactor & wrap check & transfer
appication struct delet domain param value
idea: store hash of param
    bytes32 MINDEPOSIT = //the hash
    bytes32 REGISTRYLEN = //the hash
use the one global struct for params instead of a mapping. snapshots are equal to canonical param struct

*/



contract Registry {

    /* 
     * Storage
     */
     
    //Registry storage
    StandardToken public token;
    PLCRVoting public voting;
    mapping(bytes32 => Publisher) public whitelist; //domainHash => Publisher struct
    mapping(bytes32 => Application) public appPool; //holds applications for both domain and parameter appPool
    mapping(bytes32 => Params) public paramSnapshots;
    mapping(uint => VoteInfo) public pollInfo; // holds information on individual polls
    mapping(address => mapping(uint => bool)) public voterInfo; // holds information on voters' token claims
    string domain;
    //Parameter storage
    mapping(bytes32 => uint) public Parameters;
    mapping(uint => bytes32) public idToHash;
    string parameter;
    uint value;

    struct Publisher {
        address owner;
        uint expTime;
        uint deposit;
        uint prevExpTime //
        uint nextExpTime //
        uint prevDeposit // total withdrawable amount
        uint nextDeposit // 
    }

    struct Application {
        address owner;
        bool challenged;
        uint challengeTime; //End of challenge period
        address challenger;

        string domain;
        string parameter;
        uint value;
    }

    struct Params {
        // parameters concerning the whitelist and application pool
        uint minDeposit;
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
        uint remainder;
    }

    

    /* 
     * Constructor
     */
    /// @param _minDeposit      application & challenger deposit amounts
    /// @param _challengeLen    duration of the challenge period
    /// @param _registryLen     duration of a registration’s validity
    /// @param _commitVoteLen   duration of the commit period in token votes
    /// @param _revealVoteLen   duration of reveal period in token votes 
    /// @param _dispensationPct percentage of forfeited deposit distributed to winning party; uint between 0 and 100 
    /// @param _majority        percentage of votes that constitutes the majority; uint between 0 and 100

    function Registry(address _token,
       uint _minDeposit,
       uint _challengeLen,
       uint _registryLen,
       uint _commitVoteLen,
       uint _revealVoteLen,
       uint _dispensationPct,
       uint _majority) {
        
       token = StandardToken(_token);
       // initialize values
       Parameters[sha3("minDeposit")]        = _minDeposit;
       Parameters[sha3("challengeLen")]      = _challengeLen;
       Parameters[sha3("registryLen")]       = _registryLen;
       Parameters[sha3("commitVoteLen")]     = _commitVoteLen;
       Parameters[sha3("revealVoteLen")]     = _revealVoteLen;
       Parameters[sha3("dispensationPct")]   = _dispensationPct;
       Parameters[sha3("majority")]          = _majority;
    }

    // called by an applicant to apply (moves them into the application pool on success)
    function apply(string _domain) public {
        bytes32 domainHash = sha3(_domain);
        require(hasRenewal[domainHash] == false);
        // initialize with the current values of all parameters
        initializeSnapshot(domainHash);
        initApplication(domainHash, msg.sender);
        appPool[domainHash].domain = _domain;
    }

    //helper function to apply() and proposeUpdate()
    //initialize general application
    function initApplication(bytes32 _hash, address _applicant) private {
        // applicant must pay the current value of minDeposit
        uint deposit = paramSnapshots[_hash].minDeposit;
        // check to prevent repeat applications
        require(appPool[_hash].owner == 0);
        // check that registry can take sufficient amount of tokens from the applicant
        require(token.allowance(_applicant, this) >= deposit);
        token.transferFrom(_applicant, this, deposit);        
        appPool[_hash].challengeTime = now + paramSnapshots[_hash].challengeLen;
        appPool[_hash].owner = _applicant;
    }

    function renew (string _domain) {
        bytes32 domainHash = sha3(_domain);
        // check if no active renewal
        require(hasRenewal(domainHash) == false);
        require(msg.sender == whitelist[domainHash].owner); // checks that you are the owner of the domain
        require(appPool[_hash].owner == 0); // no double renewal
        uint deposit = get('minDeposit');
        //Check if existing deposit is sufficient 
        if (whitelist[domainHash].deposit + whitelist[domainHash].prevDeposit >= deposit){
            //apply
            initializeSnapshot(_domain);        
            appPool[_hash].challengeTime = now + paramSnapshots[_hash].challengeLen;
            appPool[_hash].owner = msg.sender;
            // only take from deposit
            if (whitelist[domainHash].deposit >= deposit)
            {
                uint difference = whitelist[domainHash].deposit - deposit;
                whitelist[domainHash].deposit = difference;
            }
            // take whole deposit and part of prevDeposit
            else
            {
                // take all of locked deposit and a portion of unlocked deposit
                uint difference = deposit - whitelist[domainHash].deposit;
                uint difference2 = whitelist[domainHash].prevDeposit - difference;
                whitelist[domainHash].prevDeposit = difference2;
            }
             
        }
        //if insufficient # of tokens, then must send in the difference 
        else {
            uint difference = deposit-(whitelist[domainHash].deposit + whitelist.[domainHash].prevDeposit);
            require(token.allowance(msg.sender, this) >= difference);
            token.transferFrom(msg.sender, this, difference);
            //apply
            initializeSnapshot(_domain);              
            appPool[_hash].challengeTime = now + paramSnapshots[_hash].challengeLen;
            appPool[_hash].owner = msg.sender;
        }
    }

    function claimDeposit(string _domain) public {  // take out only part
        bytes32 domainHash = sha3(_domain);
        require(msg.sender == whitelist[domainHash].owner);
        if (hasRenewal(domainHash))  // updates token values if necessary
        {
            token.transfer(msg.sender, whitelist[domainHash].prevDeposit);
            whitelist[domainHash].prevDeposit = 0;
        }
    }

    // checks to see if a renewal has turned into current whitelist period
    // if there is a renewal and it has become the current whitelist period,
    // process and change state of variables
    function hasRenewal(bytes32 _hash) private returns (bool){
        // renewal start point is in the past
        if (whitelist[_hash].expTime <= now ) {
            if (whitelist[_hash].nextExpTime != whitelist[_hash].expTime)
            { // no active renewal
                return false;
            }
            // renewal is processed to change state of whitelist struct
            whitelist[_hash].prevExpTime = whitelist[_hash].expTime;
            whitelist[_hash].expTime = whitelist[_hash].nextExpTime;
            whitelist[_hash].prevDeposit += whitelist[_hash].deposit;
            whitelist[_hash].deposit = whitelist[_hash].nextDeposit;
            return false;
        }
        else
        {
            return true;
        }
    }

    // called by any adtoken holder to challenge an application to the whitelist
    // initialize vote to accept/reject a domain to the registry
    function challengeApplication(string _domain) public returns(pollID) {
        bytes32 domainHash = sha3(_domain);
        challenge(domainHash, msg.sender);
        // start a vote
        uint pollID = callVote(_domain 
        ,paramSnapshots[domainHash].majority
        ,paramSnapshots[domainHash].commitVoteLen
        ,paramSnapshots[domainHash].revealVoteLen);
        idToHash[pollID] = domainHash;
        return pollID;
    }

    //helper function to challengeApplication() and challengeProposal()
    function challenge(bytes32 _hash, address _challenger) private {
        // check that registry can take sufficient amount of tokens from the challenger
        uint deposit = paramSnapshots[_hash].minDeposit;
        require(token.allowance(_challenger, this) >= deposit);
        token.transferFrom(_challenger, this, deposit);

        // prevent someone from challenging an unintialized application, rechallenging,
        // or challenging after the challenge period has ended
        require(appPool[_hash].owner != 0);
        require(appPool[_hash].challenged == false);
        require(appPool[_hash].challengeTime > now);

        // update the application's status
        appPool[_hash].challenged = true;
        appPool[_hash].challenger = _challenger;
    }
    
    // helper function to the challenge() function. Initializes a vote through the voting contract
    // returns a poll id
    function callVote(string _proposalString, 
        uint _majority, 
        uint _commitVoteLen,
        uint _revealVoteLen
        ) private returns (uint) {
        // event that vote has started
        uint pollID = voting.startPoll( _proposalString, _majority, _commitVoteLen,  _revealVoteLen);
        return pollID;
    }

    // a one-time function for each completed vote
    // if domain won: domain is moved to the whitelist and applicant is rewarded tokens, return true
    // if domain lost: challenger is rewarded tokens, return false
    function processResult(uint _pollID) returns(bool)
    {
        require(pollInfo[_pollID].processed == false);
        bytes32 domainHash = idToHash[_pollID];
        // ensures the result cannot be processed again
        pollInfo[_pollID].processed = true;

        if (voting.isPassed(_pollID)) {
            // add to registry
            add(domainHash, appPool[domainHash].owner);
            delete appPool[domainHash].owner;
            // give tokens to applicant based on dist and total tokens
            return true;
        }
        else {
            delete appPool[domainHash].owner;
            // uint minDeposit = paramSnapshots[domainHash].minDeposit;
            // uint dispensationPct = paramSnapshots[domainHash].dispensationPct;
            // uint winning = minDeposit * dispensationPct;  // change math to be int between 0-100
            // token.transfer(appPool[domainHash].challenger, winning + minDeposit);
            return false;
        }
    }

    // called by each voter to claim their reward for each completed vote
    function claimReward(uint _pollID, uint _salt) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        uint reward = giveTokens(_pollID, _salt, msg.sender);
        // ensures a voter cannot claim tokens again
        token.transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
    }

    // number of tokens person used to vote / total number of tokens for winning side
    // scale using distribution number, give the tokens
    function giveTokens(uint _pollID, uint _salt, address _voter) private returns(uint) {
        bytes32 hash = idToHash[_pollID];
        uint minDeposit = paramSnapshots[hash].minDeposit;
        uint dispensationPct = paramSnapshots[hash].dispensationPct;
        uint totalTokens = voting.getTotalNumberOfTokensForWinningOption(_pollID);
        uint voterTokens = voting.getNumCorrectVote(_pollID, _salt, _voter);
        uint reward = voterTokens*minDeposit*(1-dispensationPct)/totalTokens;



        // check if there will be leftover from flooring, add into a pool claimable by winner
        // (to prevent token locking due to flooring of voter rewards)
        // uint modCheck = voterTokens % ;
        // uint purchaseAmount = msg.value - excessAmount;
        // uint tokenPurchase = purchaseAmount / price;


        return reward;
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
        delete appPool[domainHash].owner;
    }

    // private function to add a domain name to the whitelist
    function add(bytes32 _domainHash, address _owner) private {
        uint expiration = paramSnapshots[_domainHash].registryLen;
        whitelist[_domainHash].expTime = now + expiration;
        whitelist[_domainHash].owner = _owner;
        whitelist[_domainHash].deposit = paramSnapshots[_domainHash].minDeposit;
    }

    // checks if a domain name is in the whitelist and unexpired
    function isVerified(string _domain) public constant returns (bool) {
        bytes32 domainHash = sha3(_domain);
        return whitelist[domainHash].expTime > now;
    }

    // private function to initialize a snapshot of parameters for each application
    function initializeSnapshot(bytes32 _hash) private {
        initializeSnapshotParam(_hash);  // maybe put the two together
        paramSnapshots[_hash].registryLen = get("registryLen");
    }




/*****************************************************************************/




    //called by a user who wishes to change a parameter
    //initializes a proposal to change a parameter
    function proposeUpdate(string _parameter, uint _value) public {
        bytes32 parameterHash = sha3(_parameter, _value);
        // initialize application with a with the current values of all parameters
        initializeSnapshotParam(parameterHash);
        initApplication(parameterHash, msg.sender);
        appPool[parameterHash].parameter = _parameter;
        appPool[parameterHash].value = _value;
    }
    
    //called by user who wishes to reject a proposal
    //initializes a vote to accept/reject the param change proposal
    function challengeProposal(string _parameter, uint _value) public {
        bytes32 parameterHash = sha3(_parameter, _value);
        challenge(parameterHash, msg.sender);
        // start a vote
        uint pollID = callVote(_parameter
        ,paramSnapshots[parameterHash].majority
        ,paramSnapshots[parameterHash].commitVoteLen
        ,paramSnapshots[parameterHash].revealVoteLen);
        idToHash[pollID] = parameterHash;
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
        delete appPool[parameterHash].owner;
    }

    // a one-time function for each completed vote
    // if proposal won: new parameter value is set, and applicant is rewarded tokens, return true
    // if prospsal lost: challenger is rewarded tokens, return false
    function processProposal(uint _pollID) returns(bool)
    {
        require(pollInfo[_pollID].processed == false);        
        bytes32 parameterHash = idToHash[_pollID];
        parameter = appPool[parameterHash].parameter;
        value = appPool[parameterHash].value;
        // ensures the result cannot be processed again
        pollInfo[_pollID].processed = true;
        delete appPool[parameterHash].owner;
        
        if (voting.isPassed(_pollID)) {
            // setting the value of parameter
            Parameters[sha3(parameter)] = value;
            // give tokens to applicant based on dist and total tokens IMPLEMENT
            return true;
        }
        else {
            // give tokens to challenger based on dist and total tokens
            return false;
        }

    }

    function claimParamReward(uint _pollID, uint _salt) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        uint reward = giveTokens(_pollID, _salt);
        // ensures a voter cannot claim tokens again
        token.transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
    }

    
     // private function to initialize a snapshot of parameters for each proposal
     function initializeSnapshotParam(bytes32 _hash) private {
        paramSnapshots[_hash].minDeposit = get("minDeposit");
        paramSnapshots[_hash].challengeLen = get("challengeLen");
        paramSnapshots[_hash].commitVoteLen = get("commitVoteLen");
        paramSnapshots[_hash].revealVoteLen = get("revealVoteLen");
        paramSnapshots[_hash].majority = get("majority");
        paramSnapshots[_hash].dispensationPct = get("dispensationPct");
    }

    // interface for retrieving config parameter from hashmapping
    /// @param _keyword key for hashmap (only useful when keyword matches variable name)
    function get(string _keyword) public constant returns (uint) {
       return Parameters[sha3(_keyword)];
    }



   
/*****************************************************************************/




    // FOR TESTING
    function toHash(string _domain) returns (bytes32){
        return sha3(_domain);
    }
    function getCurrentTime() returns (uint){
        return now;
    }


}
