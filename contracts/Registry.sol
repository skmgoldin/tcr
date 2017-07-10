pragma solidity 0.4.11;
import "./StandardToken.sol";
// import "./PartialLockVoting.sol";
// import "./Parametrizer.sol";

// to do:
// implement events
// check on delete in solidity
// keep deposit if never challenged (?) if win (?)

contract Registry {

    StandardToken public token;
    

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

    mapping(bytes32 => Publisher) public whitelist;
    mapping(bytes32 => Application) public appPool;
    mapping(uint => bool) public voteProcessed;
    mapping(address => mapping(uint => bool)) public voterInfo;

    // Constructor
    /// @param _minDeposit      application & challenger deposit amounts
    /// @param _challengeLen    duration of the challenge period
    /// @param _registryLen     duration of a registration’s validity
    /// @param _commitVoteLen   duration of the commit period in token votes
    /// @param _revealVoteLen   duration of reveal period in token votes 
    /// @param _dispensationPct percentage of forfeited deposit distributed to winning party; uint between 0 and 100 
    /// @param _proposalThresh  share of tokens required to initiate a reparameterization
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
       paramMap[sha3("minDeposit")]        = _minDeposit;
       paramMap[sha3("challengeLen")]      = _challengeLen;
       paramMap[sha3("registryLen")]       = _registryLen;
       paramMap[sha3("commitVoteLen")]     = _commitVoteLen;
       paramMap[sha3("revealVoteLen")]     = _revealVoteLen;
       paramMap[sha3("dispensationPct")]   = _dispensationPct;
       paramMap[sha3("majority")]          = _majority;
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
        appPool[domainHash].challengeTime = now + appPool[domainHash].snapshot[challengeLen];
        appPool[domainHash].owner = msg.sender;
    }

    // called by any adtoken holder to challenge an application to the whitelist and start a vote
    function challenge(string _domain) {
        bytes32 domainHash = sha3(_domain);
        // check that registry can take sufficient amount of tokens from the challenger
        uint deposit = appPool[domainHash].snapshot[minDeposit];
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
        // start a vote
        // poll ID = callVote(voting params);
    }

    function callVote(bytes32 _domainHash) private returns (bool) {
        // event that vote has started
        // ??
    }

    // a one-time function for each completed vote
    // if domain won: domain is moved to the whitelist and applicant is rewarded tokens
    // if domain lost: challenger is rewarded tokens
    function processResult(uint _pollID)
    {
        require(voteProcessed[_pollID] == false);
        // string domain = ??;
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
            deposit = appPool[domainHash].snapshot[minDeposit]
            winning = appPool[domainHash].snapshot[minDeposit]*appPool[domainHash].snapshot[dispensationPct]
            tokens.transfer(appPool[domainHash].challenger, winning+ deposit)
            // check math
        }
        // ensures the result cannot be processed again
        voteProcessed[_pollID] = true;
    }

    // called by each voter to claim their reward for each completed vote
    function claimReward(uint _pollID, uint _salt) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        reward = giveTokens(_pollID, _salt);
        // ensures a voter cannot claim tokens again
        transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
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
    function add(string _domain, address _owner)  {
        bytes32 domainHash = sha3(_domain);
        uint expiration = appPool[domainHash].snapshot[registryLen];
        whitelist[domainHash].expTime = now + expiration;
        whitelist[domainHash].owner = _owner;
        whitelist[domainHash].deposit = appPool[domainHash].snapshot[minDeposit];
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
    function initializeSnapshot(string _domain) {
        bytes32 domainHash = sha3(_domain);
        appPool[domainHash].snapshot[minDeposit] = get("minDeposit");
        appPool[domainHash].snapshot[challengeLen] = get("challengeLen");
        appPool[domainHash].snapshot[registryLen] = get("registryLen");
        appPool[domainHash].snapshot[commitVoteLen] = get("commitVoteLen");
        appPool[domainHash].snapshot[revealVoteLen] = get("revealVoteLen");
        appPool[domainHash].snapshot[majority] = get("majority");
        appPool[domainHash].snapshot[dispensationPct] = get("dispensationPct");
    }

    function giveTokens(uint _pollID, uint _salt) returns(uint) {
        // number of tokens person used to vote / total number of tokens for winning side
        // scale using distribution number
        // give the tokens
        // string domain = ??
        bytes32 domainHash = sha3(domain);
        uint minDeposit = appPool[domainHash].snapshot[minDeposit];
        uint dispensationPct = appPool[domainHash].snapshot[dispensationPct];
        uint totalTokens = getTotalNumberOfTokensForWinningOption(_pollID);
        uint voterTokens = getNumCorrectInvestment(_pollID, _salt)

        uint reward = voterTokens*minDeposit*(1-dispensationPct)/totalTokens;
        return reward;
    }

    // FOR TESTING
    function toHash(string _domain) returns (bytes32){
        return sha3(_domain);
    }
    function getCurrentTime() returns (uint){
        return now;
    }




/*******************************************************************/


    mapping(bytes32 => Application) public Proposals; // similar to appPool
    mapping(bytes32 => uint) public Parameters;


    function proposeUpdate(string _parameter, uint _value) {
        parameterHash = sha3(_parameter, _value);
        // applicant must pay the current value of minDeposit
        uint deposit = get("minDeposit");
        // check that registry can take sufficient amount of tokens from the applicant
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, this, deposit);
        // initialize application with a snapshot with the current values of all parameters
        initializeSnapshotParam(parameterHash);
        Proposals[parameterHash].challengeTime= now + Proposals[parameterHash].snapshot[challengeLen];
        Proposals[parameterHash].owner = msg.sender;

    }

    function challengeProposal(string _parameter, uint _value) {
        parameterHash = sha3(_parameter, _value);
        
        // check that registry can take sufficient amount of tokens from the challenger
        uint deposit = Proposals[parameterHash ].snapshot[minDeposit];
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, this, deposit);
        
        // prevent someone from challenging an unintialized application, rechallenging,
        // or challenging after the challenge period has ended
        require(Proposals[parameterHash].owner != 0);
        require(Proposals[parameterHash].challenged == false);
        require(Proposals[parameterHash].challengeTime> now);
        
        // update the application's status
        Proposals[parameterHash].challenged = true;
        Proposals[parameterHash].challenger = msg.sender;
        // start a vote
        // poll ID = callVote(voting params);
    }
    
    // called to change parameter
    // iff the proposal's challenge period has passed without a challenge
    function setParams(string _parameter, uint _value) {
        parameterHash = sha3(_parameter, _value);
        require(Proposals[parameterHash].challengeTime < now); 
        require(Proposals[parameterHash].challenged == false);
        // prevents moving a domain to the registry without ever applying
        require(Proposals[parameterHash].owner != 0);
        // prevent applicant from moving to registry multiple times
        Parameters[sha3(_parameter)] = _value;
        delete Proposals[parameterHash].owner;
    }

    // a one-time function for each completed vote
    // if proposal won: new parameter value is set, and applicant is rewarded tokens
    // if prospsal lost: challenger is rewarded tokens
    function processProposal(uint _pollID)
    {
        require(voteProcessed[_pollID] == false);
        // string parameter = ??;
        //uint value = ??
        parameterHash = sha3(parameter, value);
        if (didProposalPass(_pollID)) {
            //??what would happen if didProposalPass() called and vote's still ongoing??
            // setting the value of parameter
            Parameters[sha3(parameter)] = value;
            delete Proposals[parameterHash].owner;
            // give tokens to applicant based on dist and total tokens
        }
        else {
            delete Proposals[parameterHash].owner;
            // give tokens to challenger based on dist and total tokens
        }
        // ensures the result cannot be processed again
        voteProcessed[_pollID] = true;
    }

    function claimParamReward(uint _pollID, uint _salt) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        reward = giveTokens(_pollID, _salt);
        // ensures a voter cannot claim tokens again
        transfer(msg.sender, reward);
        voterInfo[msg.sender][_pollID] = true;
    }

     function giveParamTokens(uint _pollID, uint _salt) returns(uint) {
        // number of tokens person used to vote / total number of tokens for winning side
        // scale using distribution number
        // give the tokens
        // string parameter = ??
        parameterHash = sha3(parameter, value);
        uint minDeposit = Proposals[parameterHash].snapshot[minDeposit];
        uint dispensationPct = Proposals[parameterHash].snapshot[dispensationPct];
        uint totalTokens = getTotalNumberOfTokensForWinningOption(_pollID);
        uint voterTokens = getNumCorrectInvestment(_pollID, _salt)

        uint reward = voterTokens*minDeposit*(1-dispensationPct)/totalTokens;
        return reward;
    }

     function initializeSnapshotParam(byte32 _hash) {
        Proposals[_hash].snapshot[minDeposit] = get("minDeposit");
        Proposals[_hash].snapshot[challengeLen] = get("challengeLen");
        Proposals[_hash].snapshot[commitVoteLen] = get("commitVoteLen");
        Proposals[_hash].snapshot[revealVoteLen] = get("revealVoteLen");
        Proposals[_hash].snapshot[majority] = get("majority");
        Proposals[_hash].snapshot[dispensationPct] = get("dispensationPct");
    }

    // interface for retrieving config parameter from hashmapping
    /// @param _keyword key for hashmap (only useful when keyword matches variable name)
    function get(string _keyword) returns (uint) {
       return Parameters[sha3(_keyword)];
    }

   
}