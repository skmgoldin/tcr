pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";

/*
=======
 TO DO
=======

implement events
refactor & wrap check & transfer

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

        uint nextExpTime; //
        uint prevDeposit; // total withdrawable amount
        uint nextDeposit; //
        bool renewal; 
    }

    struct Application {
        address owner;
        bool challenged;
        uint challengeTime; //End of challenge period
        address challenger;

        string parameter;
        string domain;
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
        uint256 remainder;
        address claimer;
    }

    // constant used to help represent doubles as ints
    uint256 constant private MULTIPLIER = 10 ** 18;

    

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
        // must be a new member of the whitelist
        require(whitelist[domainHash].owner == 0);
        // initialize with the current values of all parameters
        initializeSnapshot(domainHash);
        initApplication(domainHash, msg.sender);
        appPool[domainHash].domain = _domain;
    }

    // helper function to apply() and proposeUpdate()
    // initialize general application
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
        require(appPool[domainHash].owner == 0); // no double renewal
        uint deposit = get('minDeposit');
        //Check if existing deposit is sufficient 
        if (whitelist[domainHash].deposit + whitelist[domainHash].prevDeposit >= deposit){
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
                difference = deposit - whitelist[domainHash].deposit;
                uint difference2 = whitelist[domainHash].prevDeposit - difference;
                whitelist[domainHash].prevDeposit = difference2;
            } 
        }
        //if insufficient # of tokens, then must send in the difference 
        else {
            difference = deposit-(whitelist[domainHash].deposit + whitelist[domainHash].prevDeposit);
            require(token.allowance(msg.sender, this) >= difference);
            token.transferFrom(msg.sender, this, difference);
            whitelist[domainHash].deposit = 0;
            whitelist[domainHash].prevDeposit = 0;
        }
        //apply
        initializeSnapshot(domainHash);              
        appPool[domainHash].challengeTime = now + paramSnapshots[domainHash].challengeLen;
        appPool[domainHash].owner = msg.sender;
        whitelist[domainHash].renewal = true;
    }

    function claimDeposit(string _domain, uint _amount) public {
        bytes32 domainHash = sha3(_domain);
        require(msg.sender == whitelist[domainHash].owner);
        uint difference = whitelist[domainHash].prevDeposit - _amount;
        require(difference >= 0);
        token.transfer(msg.sender, _amount);
        whitelist[domainHash].prevDeposit = difference;
    }

    // called by domain owner to activate renewal period and allow additional renewals
    function activateRenewal(string _domain) public {
        bytes32 _hash = sha3(_domain);
        if (hasRenewal(_hash) && whitelist[_hash].expTime <= now)
        {
            whitelist[_hash].expTime = whitelist[_hash].nextExpTime;
            whitelist[_hash].prevDeposit += whitelist[_hash].deposit;
            whitelist[_hash].deposit = whitelist[_hash].nextDeposit;
            whitelist[_hash].renewal = false;
        }
    }

    // called by any adtoken holder to challenge an application to the whitelist
    // initialize vote to accept/reject a domain to the registry
    function challengeApplication(string _domain) public returns(uint) {
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

    // helper function to challengeApplication() and challengeProposal()
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
        bytes32 domainHash = idToHash[_pollID];
        require(isDomainApp(domainHash));  // processing parameter hash this way is unintended behavior
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
            token.transfer(appPool[domainHash].challenger, paramSnapshots[domainHash].minDeposit);
            delete appPool[domainHash].owner;
            return false;
        }
    }

    // internal function to give applicant/challenger reward
    // if dispensationPct does not divide minDeposit evenly, gives then the extra token
    function giveWinnerReward(bytes32 _hash, address _address) private {
        uint256 minDeposit = paramSnapshots[_hash].minDeposit;
        uint256 dispensationPct = paramSnapshots[_hash].dispensationPct;
        uint256 rewardTokens = minDeposit * (dispensationPct) / 100;
        if ((minDeposit * dispensationPct) % 100 != 0) {
            rewardTokens++;
        }
        token.transfer(_address, rewardTokens);
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
        uint256 minDeposit = paramSnapshots[hash].minDeposit;
        uint256 dispensationPct = paramSnapshots[hash].dispensationPct;
        uint256 totalTokens = voting.getTotalNumberOfTokensForWinningOption(_pollID);
        uint256 voterTokens = voting.getNumPassingTokens(_pollID, _salt, _voter);

        uint256 rewardTokens = minDeposit * (100 - dispensationPct) / 100;
        uint256 numerator = voterTokens * rewardTokens * MULTIPLIER; 
        uint256 denominator = totalTokens * MULTIPLIER;
        uint256 remainder = numerator % denominator;

        // save remainder tokens in the form of decimal numbers with 18 places represented
        // as a uint256
        pollInfo[_pollID].remainder += remainder;

        return numerator / denominator;
    }

    function claimExtraReward(uint _pollID) {
        uint256 reward = pollInfo[_pollID].remainder / MULTIPLIER;
        pollInfo[_pollID].remainder = pollInfo[_pollID].remainder - reward * MULTIPLIER;
        token.transfer(pollInfo[_pollID].claimer, reward);
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

    // ISSUE WITH OVERLAP

    // private function to add a domain name to the whitelist
    function add(bytes32 _domainHash, address _owner) private {
        uint expiration = paramSnapshots[_domainHash].registryLen;
        if (whitelist[_domainHash].renewal = true)
        {
            whitelist[_domainHash].nextExpTime = whitelist[_domainHash].expTime + expiration;
            whitelist[_domainHash].nextDeposit = paramSnapshots[_domainHash].minDeposit;
        }
        else
        {
            whitelist[_domainHash].expTime = now + expiration;
            whitelist[_domainHash].deposit = paramSnapshots[_domainHash].minDeposit;
        }
        whitelist[_domainHash].owner = _owner;
    }

    /*
     * Helper Functions
     */

    // STATIC

    // returns true if a renewal has been initialized
    function hasRenewal(bytes32 _hash) private constant returns (bool) {
        return whitelist[_hash].renewal;
    } 

    //returns true if Application is for domain and not parameter
    function isDomainApp(bytes32 _hash) private constant returns(bool){
        return bytes(appPool[_hash].parameter).length == 0;  // checks if param string is initialized
    }

    // checks if a domain name is in the whitelist and unexpired
    function isVerified(string _domain) public constant returns (bool) {
        bytes32 domainHash = sha3(_domain);
        return whitelist[domainHash].expTime > now;
    }

    // DYNAMIC

    // private function to initialize a snapshot of parameters for each application
    function initializeSnapshot(bytes32 _hash) private {
        initializeSnapshotParam(_hash);  // maybe put the two together
        paramSnapshots[_hash].registryLen = get("registryLen");
    }




/*****************************************************************************/




    //called by a user who wishes to change a parameter
    //initializes a proposal to change a parameter
    function proposeUpdate(string _parameter, uint _value) public {
        //require(_parameter != "");
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
        delete appPool[parameterHash].owner;
        
        if (voting.isPassed(_pollID)) {
            pollInfo[_pollID].claimer = appPool[parameterHash].owner;
            // setting the value of parameter
            Parameters[sha3(parameter)] = value;
            // give tokens to applicant based on dist and total tokens IMPLEMENT
            giveWinnerReward(parameterHash, appPool[parameterHash].owner);
            token.transfer(appPool[parameterHash].owner, paramSnapshots[parameterHash].minDeposit);
            return true;
        }
        else {
            pollInfo[_pollID].claimer = appPool[parameterHash].challenger;
            // give tokens to challenger based on dist and total tokens
            giveWinnerReward(parameterHash, appPool[parameterHash].challenger);
            token.transfer(appPool[parameterHash].challenger, paramSnapshots[parameterHash].minDeposit);
            return false;
        }
        // ensures the result cannot be processed again
        pollInfo[_pollID].processed = true;
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




    // Helper Functions
     // FOR TESTING
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
