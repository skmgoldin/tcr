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

    //Global Variables
    Params canonicalParams;
    StandardToken token;
    PLCRVoting voting;

    // ------------
    // CONSTRUCTOR:
    // ------------

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

    //Allow a user to start an application
    //take tokens from user and set apply stage end time
    function apply(string domain) external {
        require(!isWhitelisted(domain));
        require(!appExists(domain));

        //set owner
        Listing listing = listingMap[sha3(domain)];
        listing.owner = msg.sender; 

        //transfer tokens
        uint minDeposit = canonicalParams.minDeposit;
        require(token.transferFrom(listing.owner, this, minDeposit)); 

        //set apply stage end time
        listing.applicationExpiry = block.timestamp + canonicalParams.applyStage; 
        listing.currentDeposit = minDeposit;
    }

    //Allow the owner of a domain in the listing to increase their deposit
    function deposit(string domain, uint amount) external {
        Listing listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(token.transferFrom(msg.sender, this, amount));

        listing.currentDeposit += amount;
    }

    //Allow the owner of a domain in the listing to withdraw
    //tokens not locked in a challenge.
    //The publisher's domain remains whitelisted
    function withdraw(string domain, uint amount) external {
        Listing listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(amount <= listing.currentDeposit);
        require(token.transfer(msg.sender, amount));

        listing.currentDeposit -= amount;
    }

    //Allow the owner of a domain to remove the domain from the whitelist
    //Return all tokens to the owner
    function exit(string domain) external {
        Listing listing = listingMap[sha3(domain)];

        require(isWhitelisted(domain));
        // cannot exit during ongoing challenge
        require(challengeMap[listing.challengeID].resolved); 

        //remove domain & return tokens
        resetListing(domain);
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    //start a poll for a domain in the apply stage or already on the whitelist
    //tokens are taken from the challenger and the publisher's tokens are locked
    function challenge(string domain) external returns (uint challengeID) {
        bytes32 domainHash = sha3(domain);
        Listing listing = listingMap[domainHash];

        //to be challenged, domain must be in apply stage or already on the whitelist
        require(appExists(domain) || listing.whitelisted);       
        require(challengeMap[listing.challengeID].resolved); // prevent multiple challenges

        if (listing.currentDeposit < canonicalParams.minDeposit) {
            // not enough tokens, publisher auto-delisted
            resetListing(domain);
            return 0;               
        }
        //take tokens from challenger
        uint deposit = canonicalParams.minDeposit;
        require(token.transferFrom(msg.sender, this, deposit));
        //start poll
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

    // whitelist domain if apply stage ended without a challenge
    function updateStatus(string domain) public {
        bytes32 domainHash = sha3(domain);
        uint challengeID = listingMap[domainHash].challengeID;
        require(!challengeMap[challengeID].resolved);  // require processed flag to be false      

        // IF NO CHALLENGE AFTER APPLY STAGE
        if (challengeID == 0 && isExpired(listingMap[domainHash].applicationExpiry)) {
            listingMap[domainHash].whitelisted = true;
        } else { 
        // PROCESS THE RESULT OF THE POLL
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

    //return true if domain is whitelisted
    function isWhitelisted(string domain) constant public returns (bool whitelisted) {
        return listingMap[sha3(domain)].whitelisted;
    } 

    //return true if apply(domain) was called for this domain
    function appExists(string domain) constant public returns (bool exists) {
        return listingMap[sha3(domain)].applicationExpiry > 0;
    }

    //return true if termDate has passed
    function isExpired(uint termDate) constant public returns (bool expired) {
        return termDate > block.timestamp;
    }

    //delete listing from whitelist and return tokens to owner
    function resetListing(string domain) internal {
        bytes32 domainHash = sha3(domain);
        Listing listing = listingMap[domainHash];

        require(token.transfer(listing.owner, listing.currentDeposit));

        delete listingMap[domainHash];
    }
}
