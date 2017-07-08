pragma solidity 0.4.11;
import "./StandardToken.sol";
// import "./PartialLockVoting.sol";
// import "./Parametrizer.sol";

// to do:
// implement events
// check on delete in solidity
// keep deposit if never challenged (?) if win (?)
// ask about wallet location

contract Registry {

    address public wallet;
    StandardToken public token;
    

    struct Publisher {
        address owner;
        uint expTime;
        uint deposit;
    }

    struct Application {
        address owner;
        bool challenged;
        uint challengeTime; //should be challegeEndTime
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
    function Registry(address _token, address _wallet) {
        token = StandardToken(_token);
        wallet = _wallet;
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
        token.transferFrom(msg.sender, wallet, deposit);
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
        token.transferFrom(msg.sender, wallet, deposit);
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
            // add to registry
            add(domain, appPool[domainHash].owner);
            appPool[domainHash].owner = 0;
            // give tokens to applicant based on dist and total tokens
        }
        else {
            appPool[domainHash].owner = 0;
            // give tokens to challenger based on dist and total tokens
        }
        // ensures the result cannot be processed again
        voteProcessed[_pollID] = true;
    }

    // called by each voter to claim their reward for each completed vote
    function claimReward(uint _pollID) {
        // checks if a voter has claimed tokens
        require(voterInfo[msg.sender][_pollID] == false);
        giveTokens(_pollID, msg.sender);
        // ensures a voter cannot claim tokens again
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
        appPool[domainHash].owner = 0; // use delete or write a deleter
    }

    // private function to add a domain name to the whitelist
    function add(string _domain, address _owner)  {
        bytes32 domainHash = sha3(_domain);
        uint expiration = appPool[domainHash].snapshot[registryLen];
        whitelist[domainHash].expTime = now + expiration;
        whitelist[domainHash].owner = _owner;
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

    function giveTokens(uint _pollID, uint _salt) {
        // number of tokens person used to vote / total number of tokens for winning side
        // scale using distribution number
        // give the tokens
        // string domain = ??
        bytes32 domainHash = sha3(domain);
        getNumCorrectInvestment(_pollID, _salt)*appPool[domainHash].snapshot[minDeposit]*(1-dispensationPct)/getTotalNumberOfTokensForWinningOption(_pollID);
    }

    // FOR TESTING
    function toHash(string _domain) returns (bytes32){
        return sha3(_domain);
    }
    function getCurrentTime() returns (uint){
        return now;
    }




/*******************************************************************/



    mapping(bytes32 => Proposals) public paramProposals;
    mapping(bytes32 => uint) public Parameters;

    struct Proposals {
        address owner;
        bool challenged;
        uint challengeEndTime; //expiry of challenge period
        address challenger;
        proposealParam snapshot;

    }

    struct proposalParam {
        // parameters concerning the whitelist and application pool
        uint minDeposit;
        uint challengeLen;

        // parameters to be passed into the voting contract
        uint commitVoteLen;
        uint revealVoteLen;
        uint majority;

        // parameter representing the scale of how token rewards are distributed
        uint dispensationPct;
    }


    function proposeUpdate(string _parameter, uint _value) {
        parameterHash = sha3(_parameter, _value);
        // applicant must pay the current value of minDeposit
        uint deposit = get("minDeposit");
        // check that registry can take sufficient amount of tokens from the applicant
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, wallet, deposit);
        // initialize application with a snapshot with the current values of all parameters
        initializeSnapshotParam(parameterHash);
        paramProposals[parameterHash ].challengeEndTime= now + paramProposals[parameterHash ].snapshot[challengeLen];
        paramProposals[parameterHash ].owner = msg.sender;

    }

    function challengeProposal(string _parameter, uint _value) {
        parameterHash = sha3(_parameter, _value);
        
        // check that registry can take sufficient amount of tokens from the challenger
        uint deposit = paramProposals[parameterHash ].snapshot[minDeposit];
        require(token.allowance(msg.sender, this) >= deposit);
        token.transferFrom(msg.sender, wallet, deposit);
        
        // prevent someone from challenging an unintialized application, rechallenging,
        // or challenging after the challenge period has ended
        require(paramProposals[parameterHash ].owner != 0);
        require(paramProposals[parameterHash ].challenged == false);
        require(paramProposals[parameterHash ].challengeEndTime> now);
        
        // update the application's status
        paramProposals[parameterHash ].challenged = true;
        paramProposals[parameterHash ].challenger = msg.sender;
        // start a vote
        // poll ID = callVote(voting params);
    }
    
     function initializeSnapshotParam(byte32 _hash) {
        Proposals[domainHash].snapshot[minDeposit] = get("minDeposit");
        Proposals[domainHash].snapshot[challengeLen] = get("challengeLen");
        Proposals[domainHash].snapshot[commitVoteLen] = get("commitVoteLen");
        Proposals[domainHash].snapshot[revealVoteLen] = get("revealVoteLen");
        Proposals[domainHash].snapshot[majority] = get("majority");
        Proposals[domainHash].snapshot[dispensationPct] = get("dispensationPct");
    }

   
}