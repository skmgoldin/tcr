pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";

// to do:
// implement events
// deposit
// token flooring issue

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

    

    // Constructor
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
    function apply(string _domain) {
        bytes32 domainHash = sha3(_domain);
        // initialize with the current values of all parameters
        initializeSnapshot(_domain);
        initApplication(domainHash, msg.sender);
        appPool[domainHash].domain = _domain;
    }



    //helper function to apply() and proposeUpdate()
    //initialize general application
    function initApplication(bytes32 _hash, address _applicant) {
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
        require(msg.sender == whitelist[domainHash].owner );
        if (whitelist[domainHash].deposit >= get(minDeposit)){
            apply(_domain);
        }
        else {
            //emit event need to send in more money, then the person
            //has to take back deposit then re-apply
        }
    }

    function claimDeposit(string _domain){
        bytes32 domainHash = sha3(_domain);
        require(msg.sender == whitelist[domainHash].owner );
        require(now >= whitelist[domainHash].expTime);
        require(whitelist[domainHash].deposit > 0);
        token.transfer(msg.sender,whitelist[domainHash].deposit);
        whitelist[domainHash].deposit = 0;
    }

    // called by any adtoken holder to challenge an application to the whitelist
    // initialize vote to accept/reject a domain to the registry
    function challengeApplication(string _domain) {
        bytes32 domainHash = sha3(_domain);
        challenge(domainHash, msg.sender);
        // start a vote
        uint pollID = callVote(_domain 
        ,paramSnapshots[domainHash].majority
        ,paramSnapshots[domainHash].commitVoteLen
        ,paramSnapshots[domainHash].revealVoteLen);
        idToHash[pollID] = domainHash;
    }

    //helper function to challengeApplication() and challengeProposal()
    function challenge(bytes32 _hash, address _challenger) {
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
    // if domain won: domain is moved to the whitelist and applicant is rewarded tokens
    // if domain lost: challenger is rewarded tokens
    function processResult(uint _pollID)
    {
        require(pollInfo[_pollID].processed == false);
        bytes32 domainHash = idToHash[_pollID];

        if (voting.isPassed(_pollID)) {
            //??what would happen if didProposalPass() called and vote's still ongoing??
            // add to registry
            add(domainHash, appPool[domainHash].owner);
            delete appPool[domainHash].owner;
            // give tokens to applicant based on dist and total tokens
        }
        else {
            delete appPool[domainHash].owner;
            uint minDeposit = paramSnapshots[domainHash].minDeposit;
            uint dispensationPct = paramSnapshots[domainHash].dispensationPct;
            uint winning = minDeposit * dispensationPct;  // change math to be int between 0-100
            token.transfer(appPool[domainHash].challenger, winning + minDeposit);
        }
        // ensures the result cannot be processed again
        pollInfo[_pollID].processed = true;
    }

    // called by each voter to claim their reward for each completed vote
    function claimReward(uint _pollID, uint _salt) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        uint reward = giveTokens(_pollID, _salt);
        // ensures a voter cannot claim tokens again
        token.transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
    }

    // number of tokens person used to vote / total number of tokens for winning side
    // scale using distribution number, give the tokens
    function giveTokens(uint _pollID, uint _salt) private returns(uint) {
        bytes32 hash = idToHash[_pollID];
        uint minDeposit = paramSnapshots[hash].minDeposit;
        uint dispensationPct = paramSnapshots[hash].dispensationPct;
        uint totalTokens = voting.getTotalNumberOfTokensForWinningOption(_pollID);
        uint voterTokens = voting.getNumCorrectVote(_pollID, _salt);
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
    function moveToRegistry(string _domain) {
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
    function isVerified(string _domain) returns (bool) {
        bytes32 domainHash = sha3(_domain);
        if (whitelist[domainHash].expTime > now) {
            return true;
        }
        else {
            return false;
        }
    }

    // private function to initialize a snapshot of parameters for each application
    function initializeSnapshot(string _domain) private {
        bytes32 domainHash = sha3(_domain);
        initializeSnapshotParam(domainHash);  // maybe put the two together
        paramSnapshots[domainHash].registryLen = get("registryLen");
    }




/*****************************************************************************/




    //called by a user who wishes to change a parameter
    //initializes a proposal to change a parameter
    function proposeUpdate(string _parameter, uint _value) {
        bytes32 parameterHash = sha3(_parameter, _value);
        // initialize application with a with the current values of all parameters
        initializeSnapshotParam(parameterHash);
        initApplication(parameterHash, msg.sender);
        appPool[parameterHash].parameter = _parameter;
        appPool[parameterHash].value = _value;
    }
    
    //called by user who wishes to reject a proposal
    //initializes a vote to accept/reject the param change proposal
    function challengeProposal(string _parameter, uint _value) {
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
    function setParams(string _parameter, uint _value) {
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
    // if proposal won: new parameter value is set, and applicant is rewarded tokens
    // if prospsal lost: challenger is rewarded tokens
    function processProposal(uint _pollID)
    {
        require(pollInfo[_pollID].processed == false);
        bytes32 parameterHash = idToHash[_pollID];
        parameter = appPool[parameterHash].parameter;
        value = appPool[parameterHash].value;
        if (voting.isPassed(_pollID)) {
            // setting the value of parameter
            Parameters[sha3(parameter)] = value;
            delete appPool[parameterHash].owner;
            // give tokens to applicant based on dist and total tokens IMPLEMENT
        }
        else {
            delete appPool[parameterHash].owner;
            // give tokens to challenger based on dist and total tokens
        }
        // ensures the result cannot be processed again
        pollInfo[_pollID].processed = true;
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
    function get(string _keyword) returns (uint) {
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