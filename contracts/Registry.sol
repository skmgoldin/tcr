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
    }
    struct Application {
        address owner;
        uint deposit;
        uint challengeTime;
        bool challenged;
        address challenger;
    }
    mapping(bytes32 => Publisher) public whitelist;
    mapping(bytes32 => Application) public appPool;
    mapping(uint => bool) public voteProcessed;
    mapping(address => mapping(uint => bool)) public voterInfo;
    function Registry(address _token, address _wallet) {
        token = StandardToken(_token);
        wallet = _wallet;
        // wallet =
        // placeholder values
        expDuration = 2000;  // = get("registryLen");
        applyCost = 50;         // = get("minDeposit");
        challengeDuration = 2000; // = get("challengeLen");
        distributionScale = 0;  // = get("dispensationPct");
    }
    function add(string _domain)  {
        bytes32 domainHash = sha3(_domain);
        // expDuration = get("registryLen");
        whitelist[domainHash].expTime = now + expDuration;
        // whitelist[domainHash].owner = appPool[domainHash].owner;
        whitelist[domainHash].owner = 0x804;
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
        // challengeDuration = get("challengeLen");
        // prevent repeat applications
        bytes32 domainHash = sha3(_domain);
        require(appPool[domainHash].owner == 0);
        require(token.allowance(msg.sender, this) >= applyCost);
        token.transferFrom(msg.sender, wallet, applyCost);
        appPool[domainHash].challengeTime = now + challengeDuration;
        appPool[domainHash].owner = msg.sender; 
        appPool[domainHash].deposit = applyCost;
        // trigger an event
    }
    function challenge(string _domain) {
        // applyCost = get("minDeposit");
        require(token.allowance(msg.sender, this) >= applyCost);
        token.transferFrom(msg.sender, wallet, applyCost);
        bytes32 domainHash = sha3(_domain);
        // prevent someone from challenging an unintialized application
        require(appPool[domainHash].owner != 0);
        require(appPool[domainHash].challenged == false);
        require(appPool[domainHash].challengeTime > now);
        appPool[domainHash].challenged = true;
        appPool[domainHash].challenger = msg.sender;
        //callVote()
    }
    function moveToRegistry(string _domain) {
        bytes32 domainHash = sha3(_domain);
        require(appPool[domainHash].challengeTime < now);  // challenge time may not be over (fix) for vote case
        require(appPool[domainHash].challenged == false);
        // prevents moving a domain to the registry without ever applying
        require(appPool[domainHash].owner != 0);
        // prevent applicant from moving to registry multiple times
        appPool[domainHash].owner = 0;
        add(_domain);
    }
    // function claimReward(uint _pollID) {
    //  //check if the person claiming has alread claimed
    //  require(voterInfo[msg.sender][_pollID] == false);
    //  //check if poll has been processed. 
    //  if (voteProcessed[_pollID] == false) {
    //      // string domain = ??;
    //      bytes32 domainHash = sha3(domain);
    //      appPool[domainHash].challenged = false;
    //      if (didProposalPass(_pollID)) {
    //          moveToRegistry(domain);
    //      }
    //      else {
    //          appPool[domainHash].owner = 0;
    //          // give tokens to challenger based on dist and total tokens
    //      }
    //      voteProcessed[_pollID] == true;
    //      giveTokens(_pollID, msg.sender);
    //  }
    //  else {
    //      giveTokens(_pollID, msg.sender);
    //  }
    //      // if winning vote transfer tokens based on distribution scale, else do nothing
    //      voterInfo[msg.sender][_pollID] == true;
    // }
    // function giveTokens(uint _pollID, address _voter) {
    //  // number of tokens person used to vote / total number of tokens for winning side
    //  // scale using distribution number
    //  // give the tokens
    // }
    // function callVote(bytes32 _domainHash) private returns (bool) {
    //  // event that vote has started
    //  // ??
    // }
    
}