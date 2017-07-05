pragma solidity 0.4.11;
import "./StandardToken.sol";
// import "./PartialLockVoting.sol";
// import "./Parametrizer.sol";

// to do:
// implement events
// update domain name functionality (?)
// check on delete in solidity
// keep deposit if never challenged (?) if win (?)
// implement param - MAKE SURE ALL PARAM ARE STATIC FOR A SINGLE APP, including voting times
// do we need owner in publisher struct?

contract Registry {

    address public wallet;
    // this will later be the parameters from the parametrizer
    uint public expDuration;
    uint public applyCost;
    uint public challengeDuration;
    uint public distributionScale;
    StandardToken public token;

    struct Publisher {
        address owner;
        uint expTime;
        // keep deposit and implement that
    }

    struct Application {
        address owner;
        bool challenged;
        address challenger;
        struct Param snapshot;
    }

    struct Param {
    	uint minDeposit;
        uint challengeLen;
        uint registryLen;
        uint commitVoteLen;
        uint revealVoteLen;
        uint dispensationPct;
        uint proposalThresh;
        uint majority;
    }

    mapping(bytes32 => Publisher) public whitelist;
    mapping(bytes32 => Application) public appPool;
    mapping(uint => bool) public voteProcessed;
    mapping(address => mapping(uint => bool)) public voterInfo;

    function Registry(address _token, address _wallet) {
        token = StandardToken(_token);
        wallet = _wallet;
        // placeholder values, will be instantiated by application
        expDuration = 2000;  
        applyCost = 50;         
        challengeDuration = 2000; 
        distributionScale = 0; 
    }

    function add(string _domain)  {
        bytes32 domainHash = sha3(_domain);
        // exp from state
        whitelist[domainHash].expTime = now + expDuration;
        whitelist[domainHash].owner = appPool[domainHash].owner;  // pass in owner for clarity/remove owner
        // whitelist[domainHash].owner = 0x804;
    }

    // for testing purposes
    function toHash(string _domain) returns (bytes32){
        return sha3(_domain);
    }
    function getCurrentTime() returns (uint){
        return now;
    }


    function isVerified(string _domain) returns (bool) {
        bytes32 domainHash = sha3(_domain);
        if (whitelist[domainHash].expTime > now) {
            return true;
        }
        else {
            return false;
        }
    }

    function apply(string _domain) {
        // applyCost = get("minDeposit");
        // prevent repeat applications
        bytes32 domainHash = sha3(_domain);
        require(appPool[domainHash].owner == 0);
        require(token.allowance(msg.sender, this) >= applyCost);
        token.transferFrom(msg.sender, wallet, applyCost);
        appPool[domainHash].challengeTime = now + challengeDuration;
        appPool[domainHash].owner = msg.sender;
        // instantiate snapshot
    }

    function challenge(string _domain) {
        // from snapshot
        require(token.allowance(msg.sender, this) >= applyCost);
        token.transferFrom(msg.sender, wallet, applyCost);
        bytes32 domainHash = sha3(_domain);
        // prevent someone from challenging an unintialized application
        require(appPool[domainHash].owner != 0);
        require(appPool[domainHash].challenged == false);
        require(appPool[domainHash].challengeTime > now);
        appPool[domainHash].challenged = true;
        appPool[domainHash].challenger = msg.sender;
        // callVote();
    }

    function moveToRegistry(string _domain) {
        bytes32 domainHash = sha3(_domain);
        require(appPool[domainHash].challengeTime < now); 
        require(appPool[domainHash].challenged == false);
        // prevents moving a domain to the registry without ever applying
        require(appPool[domainHash].owner != 0);
        // prevent applicant from moving to registry multiple times
        add(_domain);
        appPool[domainHash].owner = 0; // use delete or write a deleter
    }

    //separate move to registry
    function claimReward(uint _pollID) {
    //check if the person claiming has alread claimed
    require(voterInfo[msg.sender][_pollID] == false);
    //check if poll has been moved to registry. 
    if (voteProcessed[_pollID] == false) {
        // string domain = ??;
        bytes32 domainHash = sha3(domain);
        if (didProposalPass(_pollID)) {
            // add to registry
            add(domain);
            appPool[domainHash].owner = 0;
        }
        else {
            appPool[domainHash].owner = 0;
            // give tokens to challenger based on dist and total tokens
        }
        voteProcessed[_pollID] == true;
        giveTokens(_pollID, msg.sender);
    }
    else {
        giveTokens(_pollID, msg.sender);
    }
        // if winning vote transfer tokens based on distribution scale, else do nothing
        voterInfo[msg.sender][_pollID] = true;
    }

    function giveTokens(uint _pollID, address _voter) {
     // number of tokens person used to vote / total number of tokens for winning side
     // scale using distribution number
     // give the tokens
    }

    function callVote(bytes32 _domainHash) private returns (bool) {
     // event that vote has started
     // ??
    }
    
}