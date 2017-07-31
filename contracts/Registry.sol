pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";

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
        // uint rewardPool;        // pool of tokens distributed amongst winning voters
        address challenger;     // owner of Challenge
        bool resolved;          // indication of if challenge is resolved
        uint stake;             // number of tokens at risk for either party during challenge
    }

    // maps challengeIDs to associated challenge data
    mapping(uint => Challenge) challengeMap; 

    // maps domainHashes to associated listing data
    mapping(bytes32 => Listing) public listingMap;

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

        Listing listing = listingMap[sha3(domain)];
        listing.owner = msg.sender;

        uint minDeposit = canonicalParams.minDeposit;
        require(token.transferFrom(listing.owner, this, minDeposit));
        
        listing.applicationExpiry = block.timestamp + canonicalParams.applyStage;
        listing.currentDeposit = minDeposit;
    }

    function deposit(string domain, uint amount) external {
        Listing listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(token.transferFrom(msg.sender, this, amount));

        listing.currentDeposit += amount;
    }

    function withdraw(string domain, uint amount) external {
        Listing listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(amount <= listing.currentDeposit);
        require(token.transfer(msg.sender, amount));

        listing.currentDeposit -= amount;
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    function challenge(string domain) external returns (uint challengeID) {
        bytes32 domainHash = sha3(domain);
        Listing listing = listingMap[domainHash];

        require(appExists(domain) || listing.whitelisted);       
        require(challengeMap[listing.challengeID].resolved);     // prevent multiple challenges

        if (listing.currentDeposit < canonicalParams.minDeposit) {
            resetListing(domain);
            return 0;               // publisher was auto-delisted
        }

        uint deposit = canonicalParams.minDeposit;
        require(token.transferFrom(msg.sender, this, deposit));

        uint pollID = voting.startPoll(domain, 
            canonicalParams.voteQuorum,
            canonicalParams.commitPeriodLen, 
            canonicalParams.revealPeriodLen
        );

        challengeMap[pollID] = Challenge({
            challenger: msg.sender,
            // rewardPool: ((100 - canonicalParams.dispensationPct) * deposit) / 100 
            stake: deposit,
            resolved: false
        });

        listingMap[domainHash].challengeID = pollID;      // update listing to store most recent challenge
        listingMap[domainHash].currentDeposit -= deposit; // lock tokens for listing during challenge

        return pollID;
    }

    function updateStatus(string domain) public {
        bytes32 domainHash = sha3(domain);
        uint challengeID = listingMap[domainHash].challengeID;
        require(!challengeMap[challengeID].resolved);  // require processed flag to be false      

        // IF NO CHALLENGE AFTER APPLY STAGE
        if (challengeID == 0 && isExpired(listingMap[domainHash].applicationExpiry)) {
            listingMap[domainHash].whitelisted = true;
        } else { 
            uint stake = challengeMap[challengeID].stake;

            if (voting.isPassed(challengeID)) {
                listingMap[domainHash].whitelisted = true;
                listingMap[domainHash].currentDeposit += stake; // give stake back to applicant
            } else {
                resetListing(domain); // whitelisted = false
                require(token.transfer(challengeMap[challengeID].challenger, stake)); // give stake to challenger
            }

            challengeMap[challengeID].resolved = true; // set flag on challenge being processed
        }
    }

    // --------
    // HELPERS:
    // --------

    function isWhitelisted(string domain) constant public returns (bool whitelisted) {
        return listingMap[sha3(domain)].whitelisted;
    } 

    function appExists(string domain) constant public returns (bool exists) {
        return listingMap[sha3(domain)].applicationExpiry > 0;
    }

    function isExpired(uint termDate) constant public returns (bool expired) {
        return termDate > block.timestamp;
    }

    function resetListing(string domain) internal {
        bytes32 domainHash = sha3(domain);
        Listing listing = listingMap[domainHash];

        require(token.transfer(listing.owner, listing.currentDeposit));

        delete listingMap[domainHash];
    }
}
