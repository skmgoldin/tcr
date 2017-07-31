pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";

/*
=======
 TO DO
=======
A challenger's challenge deposit should match the *current* deposit parameter 
at the time the challenge is made.
If when a challenge is made the listing's deposit is less than the current 
deposit parameter, the listing owner must top-up their deposit or they will automatically lose the challenge at the end of the reveal period.
*/



contract Registry {
    
    struct Params {
        uint minDeposit;        // minimum deposit for listing to be whitelisted  
        uint applyStage;        // length of period in which applicants wait to be whitelisted
        uint dispensationPct;   // percentage of losing party's deposit distributed to winning party
        uint commitPeriodLen;   // length of commit period for voting
        uint revealPeriodLen;   // length of reveal period for voting
        uint voteQuorum;        // type of majority out of 100 necessary for vote success
    }

    struct Listing {
        uint applicationExpiry; // expiration date of apply stage
        bool whitelisted;       // indicates registry status
        address owner;          // owner of Listing
        uint currentDeposit;    // number of tokens staked
        uint challengeID;       // identifier of canonical challenge
    }

    struct Challenge {
        uint rewardPool;    // pool of tokens distributed amongst winning voters
        address challenger; // owner of Challenge
    }

    // maps challengeIDs to associated challenge data
    mapping(uint => Challenge) challengeMap; 

    // maps domainHashes to associated listing data
    mapping(bytes32 => Listing) public domainMap;

    // ------------
    // CONSTRUCTOR:
    // ------------

    Params canonicalParams;
    StandardToken token;
    PLCRVoting voting;

    function Registry(
        address _tokenAddr,
        uint _minDeposit,
        uint _applyStageLength,
        uint _commitPeriodLength,
        uint _revealPeriodLength,
        uint _dispensationPct,
        uint _voteQuorum
    ) {
        token = StandardToken(_tokenAddr);
        voting = new PLCRVoting(_tokenAddr);

        canonicalParams = Params({
            minDeposit: _minDeposit,
            applyStage: _applyStageLength,
            dispensationPct: _dispensationPct,
            commitPeriodLen: _commitPeriodLength,
            revealPeriodLen: _revealPeriodLength,
            voteQuorum: _voteQuorum
        });
    }

    // --------------------
    // PUBLISHER INTERFACE:
    // --------------------

    function apply(string domain) external {
        require(!isWhitelisted(domain));
        require(!appExists(domain));

        bytes32 domainHash = sha3(domain);
        Listing listing = domainMap[domainHash];
        listing.owner = msg.sender;

        uint minDeposit = canonicalParams.minDeposit;
        require(token.transferFrom(listing.owner, this, minDeposit));
        
        listing.applicationExpiry = block.timestamp + canonicalParams.applyStage;
        listing.currentDeposit = minDeposit;
    }

    function deposit(string domain, uint amount) external {
        bytes32 domainHash = sha3(domain);
        Listing listing = domainMap[domainHash];

        require(listing.owner == msg.sender);
        listing.currentDeposit += amount;   
    }

    function withdraw(string domain, uint amount) external {
        bytes32 domainHash = sha3(domain);
        Listing listing = domainMap[domainHash];

        require(listing.owner == msg.sender);
        listing.currentDeposit -= amount;   
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    function challenge(string domain) external returns (uint challengeID) {
        bytes32 domainHash = sha3(domain);
        Listing listing = domainMap[domainHash];

        require(appExists(domain) || listing.whitelisted);

        uint deposit = listing.currentDeposit;
        require(token.transferFrom(msg.sender, this, deposit));

        uint pollID = voting.startPoll(
            domain, 
            canonicalParams.voteQuorum,
            canonicalParams.commitPeriodLen, 
            canonicalParams.revealPeriodLen
        );

        challengeMap[pollID].challenger = msg.sender;
        challengeMap[pollID].rewardPool = ((100 - canonicalParams.dispensationPct) * deposit) / 100;
        
        return pollID;
    }

    function updateStatus(string domain) public {}

    // --------
    // HELPERS:
    // --------

    function isWhitelisted(string domain) constant public returns (bool whitelisted) {
        return domainMap[sha3(domain)].whitelisted;
    } 

    function appExists(string domain) constant public returns (bool exists) {
        return domainMap[sha3(domain)].applicationExpiry > 0;
    }

    // function updateDeposit(string domain, int amount) internal {
    //     bytes32 domainHash = sha3(domain);
    //     Listing listing = domainMap[domainHash];

    //     require(listing.owner == msg.sender);
    //     domainMap[domain] += amount;
    // }
}
