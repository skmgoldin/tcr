pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";

// to do:
// implement events
// keep deposit if never challenged (?) if win (?)

contract Registry {

    /*
     * Storage
     */
     
    //Registry storage
    //StandardToken public token;
    mapping(bytes32 => Publisher) public whitelist;
    mapping(bytes32 => Application) public appPool; //holds applications for both domain and parameter appPool
    mapping(uint => bool) public voteProcessed;
    mapping(address => mapping(uint => bool)) public voterInfo;
    string domain;
    //Parameter storage
    mapping(bytes32 => uint) public Parameters;
    mapping(uint => Application) public idToApplications;
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
        Param snapshot;

        string domain;
        string parameter;
        uint value;
    }

    struct Param {
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
        // applicant must pay the current value of minDeposit
        uint deposit = get("minDeposit");
        // check to prevent repeat applications
        require(appPool[domainHash].owner == 0);
        // check that registry can take sufficient amount of tokens from the applicant
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, this, deposit);
        // initialize application with a snapshot with the current values of all parameters
        initializeSnapshot(_domain);
        appPool[domainHash].challengeTime = now + appPool[domainHash].snapshot.challengeLen;
        appPool[domainHash].owner = msg.sender;
    }

    // called by any adtoken holder to challenge an application to the whitelist and start a vote
    function challenge(string _domain) {
        bytes32 domainHash = sha3(_domain);
        // check that registry can take sufficient amount of tokens from the challenger
        uint deposit = appPool[domainHash].snapshot.minDeposit;
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, this, deposit);
        // prevent someone from challenging an unintialized application, rechallenging,
        // or challenging after the challenge period has ended
        require(appPool[domainHash].owner != 0);
        require(appPool[domainHash].challenged == false);
        require(appPool[domainHash].challengeTime > now);
        // update the application's status
        appPool[domainHash].challenged = true;
        appPool[domainHash].challenger = msg.sender;
        appPool[domainHash].domain = _domain;
        // start a vote
        uint pollID = callVote(_domain, 0
        ,appPool[domainHash].snapshot.majority
        ,appPool[domainHash].snapshot.commitVoteLen
        ,appPool[domainHash].snapshot.revealVoteLen);
        idToApplications[pollID] = appPool[domainHash];
    }
    
    // helper function to the challenge() function. Initializes a vote through the voting contract
    // returns a poll id
    function callVote(string _proposalString, 
        uint _proposalValue
        uint _majority, 
        uint _commitVoteLen,
        uint _revealVoteLen
        ) private returns (uint) {
        // event that vote has started
        PollID = startPoll(string _proposalString, uint _majority, 
        uint _commitVoteLen, uint _revealVoteLen);

        return PollID
    }

    // a one-time function for each completed vote
    // if domain won: domain is moved to the whitelist and applicant is rewarded tokens
    // if domain lost: challenger is rewarded tokens
    function processResult(uint _pollID)
    {
        require(voteProcessed[_pollID] == false);
        domain = idToApplications[_pollID].domain;
        bytes32 domainHash = sha3(domain);
        if (didProposalPass(_pollID)) {
            //??what would happen if didProposalPass() called and vote's still ongoing??
            // add to registry
            add(domain, appPool[domainHash].owner);
            delete appPool[domainHash].owner;
            // give tokens to applicant based on dist and total tokens
        }
        else {
            delete appPool[domainHash].owner;
            uint minDeposit = appPool[domainHash].snapshot.minDeposit;
            uint dispensationPct = appPool[domainHash].snapshot.dispensationPct;
            uint winning = deposit * dispensationPct;
            tokens.transfer(appPool[domainHash].challenger, winning + deposit);
            // check math
        }
        // ensures the result cannot be processed again
        voteProcessed[_pollID] = true;
    }

    // called by each voter to claim their reward for each completed vote
    function claimReward(uint _pollID, uint _salt) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        uint reward = giveTokens(_pollID, _salt);
        // ensures a voter cannot claim tokens again
        transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
    }

    // number of tokens person used to vote / total number of tokens for winning side
    // scale using distribution number, give the tokens
    function giveTokens(uint _pollID, uint _salt) private returns(uint) {
        domain = idToApplications[_pollID].domain;
        bytes32 domainHash = sha3(domain);
        uint minDeposit = appPool[domainHash].snapshot[minDeposit];
        uint dispensationPct = appPool[domainHash].snapshot[dispensationPct];
        uint totalTokens = getTotalNumberOfTokensForWinningOption(_pollID);
        uint voterTokens = getNumCorrectInvestment(_pollID, _salt);
        uint reward = voterTokens*minDeposit*(1-dispensationPct)/totalTokens;
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
        add(_domain, appPool[domainHash].owner);
        delete appPool[domainHash].owner;
    }

    // private function to add a domain name to the whitelist
    function add(string _domain, address _owner) private {
        bytes32 domainHash = sha3(_domain);
        uint expiration = appPool[domainHash].snapshot.registryLen;
        whitelist[domainHash].expTime = now + expiration;
        whitelist[domainHash].owner = _owner;
        whitelist[domainHash].deposit = appPool[domainHash].snapshot.minDeposit;
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
        appPool[domainHash].snapshot.minDeposit = get("minDeposit");
        appPool[domainHash].snapshot.challengeLen = get("challengeLen");
        appPool[domainHash].snapshot.registryLen = get("registryLen");
        appPool[domainHash].snapshot.commitVoteLen = get("commitVoteLen");
        appPool[domainHash].snapshot.revealVoteLen = get("revealVoteLen");
        appPool[domainHash].snapshot.majority = get("majority");
        appPool[domainHash].snapshot.dispensationPct = get("dispensationPct");
    }




/*****************************************************************************/




    //called by a user who wishes to change a parameter
    //initializes a proposal to change a parameter
    function proposeUpdate(string _parameter, uint _value) {
        bytes32 parameterHash = sha3(_parameter, _value);
        // applicant must pay the current value of minDeposit
        uint deposit = get("minDeposit");
        // check that registry can take sufficient amount of tokens from the applicant
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, this, deposit);
        // initialize application with a snapshot with the current values of all parameters
        initializeSnapshotParam(parameterHash);
        uint challengeLen = appPool[parameterHash].snapshot[challengeLen];
        appPool[parameterHash].challengeTime= now + challengeLen;
        appPool[parameterHash].owner = msg.sender;

    }
    
    //called by user who wishes to reject a proposal
    //initializes a vote to accept/reject the param change proposal
    function challengeProposal(string _parameter, uint _value) {
        bytes32 parameterHash = sha3(_parameter, _value);
        
        // check that registry can take sufficient amount of tokens from the challenger
        uint deposit = appPool[parameterHash].snapshot.minDeposit;
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, this, deposit);
        
        // prevent someone from challenging an unintialized application, rechallenging,
        // or challenging after the challenge period has ended
        require(appPool[parameterHash].owner != 0);
        require(appPool[parameterHash].challenged == false);
        require(appPool[parameterHash].challengeTime> now);
        
        // update the application's status
        appPool[parameterHash].challenged = true;
        appPool[parameterHash].challenger = msg.sender;
        appPool[parameterHash].parameter = _parameter;
        appPool[parameterHash].value = _value;
        // start a vote
        // pollID = callVote(voting params);
        // idToApplications[pollID] = appPool[parameterHash];
        // start a vote
        uint pollID = callVote(_parameter, _value
        ,appPool[parameterHash].snapshot.majority
        ,appPool[parameterHash].snapshot.commitVoteLen
        ,appPool[parameterHash].snapshot.revealVoteLen);
        idToApplications[pollID] = appPool[parameterHash];
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
        require(voteProcessed[_pollID] == false);
        parameter = idToApplications[_pollID].parameter;
        value = idToApplications[_pollID].value;
        bytes32 parameterHash = sha3(parameter, value);
        if (didProposalPass(_pollID)) {
            // setting the value of parameter
            Parameters[sha3(parameter)] = value;
            delete appPool[parameterHash].owner;
            // give tokens to applicant based on dist and total tokens
        }
        else {
            delete appPool[parameterHash].owner;
            // give tokens to challenger based on dist and total tokens
        }
        // ensures the result cannot be processed again
        voteProcessed[_pollID] = true;
    }

    function claimParamReward(uint _pollID, uint _salt) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        uint reward = giveParamTokens(_pollID, _salt);
        // ensures a voter cannot claim tokens again
        transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
    }

    // number of tokens person used to vote / total number of tokens for winning side
    // scale using distribution number, give the tokens
     function giveParamTokens(uint _pollID, uint _salt) returns(uint) {
        parameter = idToApplications[_pollID].parameter;
        value = idToApplications[_pollID].value;
        bytes32 parameterHash = sha3(parameter, value);
        uint minDeposit = appPool[parameterHash].snapshot[minDeposit];
        uint dispensationPct = appPool[parameterHash].snapshot[dispensationPct];
        uint totalTokens = getTotalNumberOfTokensForWinningOption(_pollID);
        uint voterTokens = getNumCorrectInvestment(_pollID, _salt);

        uint reward = voterTokens*minDeposit*(1-dispensationPct)/totalTokens;
        return reward;
    }
    
     // private function to initialize a snapshot of parameters for each proposal
     function initializeSnapshotParam(bytes32 _hash) private {
        appPool[_hash].snapshot.minDeposit = get("minDeposit");
        appPool[_hash].snapshot.challengeLen = get("challengeLen");
        appPool[_hash].snapshot.commitVoteLen = get("commitVoteLen");
        appPool[_hash].snapshot.revealVoteLen = get("revealVoteLen");
        appPool[_hash].snapshot.majority = get("majority");
        appPool[_hash].snapshot.dispensationPct = get("dispensationPct");
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