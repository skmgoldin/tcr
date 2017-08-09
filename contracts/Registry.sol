pragma solidity ^0.4.11;

import "./StandardToken.sol";
import "./PLCRVoting.sol";
import "./Parameterizer.sol";

contract Registry {

    struct Listing {
        uint applicationExpiry; // expiration date of apply stage
        bool whitelisted;       // indicates registry status
        address owner;          // owner of Listing
        uint currentDeposit;    // number of tokens staked
        uint challengeID;       // identifier of canonical challenge
    }

    struct Challenge {
        uint rewardPool;        // (remaining) pool of tokens distributed amongst winning voters
        address challenger;     // owner of Challenge
        bool resolved;          // indication of if challenge is resolved
        uint stake;             // number of tokens at risk for either party during challenge
        uint totalTokens;       // (remaining) amount of tokens used for voting by the winning side
    }

    // maps challengeIDs to associated challenge data
    mapping(uint => Challenge) challengeMap; 
    // maps domainHashes to associated listing data
    mapping(bytes32 => Listing) public listingMap;
    // maps challengeIDs and address to token claim data
    mapping(uint => mapping(address => bool)) public tokenClaims;

    // Global Variables
    StandardToken public token;
    PLCRVoting public voting;
    Parameterizer public parameterizer;

    // Constants
    bytes32 constant private MINDEPOSIT_h = sha3("minDeposit");
    bytes32 constant private MINPARAMDEPOSIT_h = sha3("minParamDeposit");
    bytes32 constant private APPLYSTAGELEN_h = sha3("applyStageLen");
    bytes32 constant private COMMITPERIODLEN_h = sha3("commitPeriodLen");
    bytes32 constant private REVEALPERIODLEN_h = sha3("revealPeriodLen");
    bytes32 constant private DISPENSATIONPCT_h = sha3("dispensationPct");
    bytes32 constant private VOTEQUORUM_h = sha3("voteQuorum"); 

    // ------------
    // CONSTRUCTOR:
    // ------------

    function Registry(
        address _tokenAddr,
        address _paramsAddr
    ) {
        token = StandardToken(_tokenAddr);
        parameterizer = Parameterizer(_paramsAddr);
        voting = new PLCRVoting(_tokenAddr);
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
        Listing storage listing = listingMap[sha3(domain)];
        listing.owner = msg.sender; 

        //transfer tokens
        uint minDeposit = parameterizer.get("minDeposit");
        require(token.transferFrom(listing.owner, this, minDeposit)); 

        //set apply stage end time
        listing.applicationExpiry = block.timestamp + parameterizer.get("applyStageLen"); 
        listing.currentDeposit = minDeposit;
    }

    //Allow the owner of a domain in the listing to increase their deposit
    function deposit(string domain, uint amount) external {
        Listing storage listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(token.transferFrom(msg.sender, this, amount));

        listing.currentDeposit += amount;
    }

    //Allow the owner of a domain in the listing to withdraw
    //tokens not locked in a challenge.
    //The publisher's domain remains whitelisted
    function withdraw(string domain, uint amount) external {
        Listing storage listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(amount <= listing.currentDeposit);
        require(token.transfer(msg.sender, amount));

        listing.currentDeposit -= amount;
    }

    //Allow the owner of a domain to remove the domain from the whitelist
    //Return all tokens to the owner
    function exit(string domain) external {
        Listing storage listing = listingMap[sha3(domain)];

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
        Listing storage listing = listingMap[domainHash];
        //to be challenged, domain must be in apply stage or already on the whitelist
        require(appExists(domain) || listing.whitelisted); 
        // prevent multiple challenges
        require(listing.challengeID == 0 || challengeMap[listing.challengeID].resolved);
        uint deposit = parameterizer.get("minDeposit");
        if (listing.currentDeposit < deposit) {
            // not enough tokens, publisher auto-delisted
            resetListing(domain);
            return 0;               
        }
        //take tokens from challenger
        require(token.transferFrom(msg.sender, this, deposit));
        //start poll
        uint pollID = voting.startPoll(domain,
            parameterizer.get("voteQuorum"),
            parameterizer.get("commitPeriodLen"), 
            parameterizer.get("revealPeriodLen")
        );

        challengeMap[pollID] = Challenge({
            challenger: msg.sender,
            rewardPool: ((100 - parameterizer.get("dispensationPct")) * deposit) / 100, 
            stake: deposit,
            resolved: false,
            totalTokens: 0
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
            // winner gets back their full staked deposit, and dispensationPct*loser's stake
            // (1-dispensationPct)*loser's stake = rewardPool
            uint stake = 2*challengeMap[challengeID].stake - challengeMap[challengeID].rewardPool;
            // if voting is not yet over, isPassed will throw
            if (voting.isPassed(challengeID)) {
                listingMap[domainHash].whitelisted = true;
                listingMap[domainHash].currentDeposit += stake; // give stake back to applicant
            } else {
                resetListing(domain); // whitelisted = false
                require(token.transfer(challengeMap[challengeID].challenger, stake)); // give stake to challenger
            }

            challengeMap[challengeID].resolved = true; // set flag on challenge being processed

            // store the total tokens used for voting by the winning side for reward purposes
            challengeMap[challengeID].totalTokens = voting.getTotalNumberOfTokensForWinningOption(challengeID);
        }
    }

    // ----------------
    // TOKEN FUNCTIONS:
    // ----------------

    // called by voter to claim reward for each completed vote
    // someone must call updateStatus() before this can be called
    function claimReward(uint _challengeID, uint _salt) public {
        // ensure voter has not already claimed tokens and challenge results have been processed
        require(tokenClaims[_challengeID][msg.sender] == false);
        require(challengeMap[_challengeID].resolved = true);

        uint reward = calculateTokens(_challengeID, _salt, msg.sender);
        require(token.transfer(msg.sender, reward));
        
        // ensures a voter cannot claim tokens again

        tokenClaims[_challengeID][msg.sender] = true;
    }

    // helper function to claimReward()
    function calculateTokens(uint _challengeID, uint _salt, address _voter) private returns (uint) {
        uint totalTokens = challengeMap[_challengeID].totalTokens;
        uint rewardPool = challengeMap[_challengeID].rewardPool;
        uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);
        uint reward = (voterTokens * rewardPool) / totalTokens;

        // subtract voter's information to preserve the participation ratios of other voters
        // compared to the remaining pool of rewards
        challengeMap[_challengeID].totalTokens -= voterTokens;
        challengeMap[_challengeID].rewardPool -= reward;

        return reward;
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
        return termDate < block.timestamp;
    }

    //delete listing from whitelist and return tokens to owner
    function resetListing(string domain) internal {
        bytes32 domainHash = sha3(domain);
        Listing storage listing = listingMap[domainHash];
        //transfer any remaining balance back to the owner
        if (listing.currentDeposit > 0)
            require(token.transfer(listing.owner, listing.currentDeposit));
        delete listingMap[domainHash];
    }
}
