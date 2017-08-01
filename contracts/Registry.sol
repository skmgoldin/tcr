pragma solidity ^0.4.11;
import "./StandardToken.sol";
import "./PLCRVoting.sol";

contract Registry {

    struct Listing {
        uint applicationExpiry; // expiration date of apply stage
        bool whitelisted;       // indicates registry status
        address owner;          // owner of Listing
        uint currentDeposit;    // number of tokens staked
        uint challengeID;       // identifier of canonical challenge
    }

    struct Challenge {
        uint rewardPool;        // pool of tokens distributed amongst winning voters
        address challenger;     // owner of Challenge
        bool resolved;          // indication of if challenge is resolved
        uint stake;             // number of tokens at risk for either party during challenge
        uint remainder;         // remainder tokens from flooring rewards to be claimed by the winner
    }

    // maps challengeIDs to associated challenge data
    mapping(uint => Challenge) challengeMap; 
    // maps domainHashes to associated listing data
    mapping(bytes32 => Listing) public listingMap;
    // maps challengeIDs and address to token claim data
    mapping(uint => mapping(address => bool)) public tokenClaims;
    // maps hash of parameter name to parameter value
    mapping(bytes32 => uint) public Parameters;

    // Global Variables
    StandardToken token;
    PLCRVoting voting;

    // Constants
    bytes32 constant private MINDEPOSIT_h = sha3("minDeposit");
    bytes32 constant private MINPARAMDEPOSIT_h = sha3("minParamDeposit");
    bytes32 constant private APPLYSTAGELEN_h = sha3("applyStageLen");
    bytes32 constant private COMMITPERIODLEN_h = sha3("commitPeriodLen");
    bytes32 constant private REVEALPERIODLEN_h = sha3("revealPeriodLen");
    bytes32 constant private DISPENSATIONPCT_h = sha3("dispensationPct");
    bytes32 constant private VOTEQUORUM_h = sha3("voteQuorum"); 
    uint256 constant private MULTIPLIER = 10 ** 18;  // used to help represent doubles as ints in token rewards

    // ------------
    // CONSTRUCTOR:
    // ------------

    function Registry(
        address _tokenAddr,
        uint _minDeposit,
        uint _minParamDeposit,
        uint _applyStageLen,
        uint _commitPeriodLen,
        uint _revealPeriodLen,
        uint _dispensationPct,
        uint _voteQuorum
    ) {
        token = StandardToken(_tokenAddr);
        voting = new PLCRVoting(_tokenAddr);
        Parameters[MINDEPOSIT_h] = _minDeposit;
        Parameters[MINPARAMDEPOSIT_h] = _minParamDeposit;
        Parameters[APPLYSTAGELEN_h] = _applyStageLen;
        Parameters[DISPENSATIONPCT_h] = _dispensationPct;
        Parameters[COMMITPERIODLEN_h] = _commitPeriodLen;
        Parameters[REVEALPERIODLEN_h] = _revealPeriodLen;
        Parameters[VOTEQUORUM_h] = _voteQuorum;
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
        uint minDeposit = Parameters[MINDEPOSIT_h];
        require(token.transferFrom(listing.owner, this, minDeposit)); 

        //set apply stage end time
        listing.applicationExpiry = block.timestamp + Parameters[APPLYSTAGELEN_h]; 
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
        require(challengeMap[listing.challengeID].resolved); // prevent multiple challenges

        if (listing.currentDeposit < Parameters[MINDEPOSIT_h]) {
            // not enough tokens, publisher auto-delisted
            resetListing(domain);
            return 0;               
        }
        //take tokens from challenger
        uint deposit = Parameters[MINDEPOSIT_h];
        require(token.transferFrom(msg.sender, this, deposit));
        //start poll
        uint pollID = voting.startPoll(domain, 
            Parameters[VOTEQUORUM_h],
            Parameters[COMMITPERIODLEN_h], 
            Parameters[REVEALPERIODLEN_h]
        );

        challengeMap[pollID] = Challenge({
            challenger: msg.sender,
            rewardPool: ((100 - Parameters[DISPENSATIONPCT_h]) * deposit) / 100, 
            stake: deposit,
            resolved: false,
            remainder: 0
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

    // called by voter to claim reward for each completed vote
    function claimReward(uint _challengeID, uint _salt) public {
        // ensure voter has not already claimed tokens
        require(tokenClaims[_challengeID][msg.sender] == false);
        uint reward = calculateTokens(_challengeID, _salt, msg.sender);
        // ensures a voter cannot claim tokens again
        token.transfer(msg.sender, reward);
        tokenClaims[_challengeID][msg.sender] = true;
    }

    // helper function to claimReward()
    // number of tokens person used to vote / total number of tokens for winning side
    // scale using distribution number, give the tokens
    function calculateTokens(uint _challengeID, uint _salt, address _voter) private returns(uint) {
        uint256 totalTokens = voting.getTotalNumberOfTokensForWinningOption(_challengeID);
        uint256 voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);

        uint256 rewardPool = challengeMap[_challengeID].rewardPool * MULTIPLIER;
        uint256 numerator = voterTokens * rewardPool; 
        uint256 denominator = totalTokens * MULTIPLIER;
        uint256 remainder = numerator % denominator;

        // save remainder tokens in the form of decimal numbers with 18 places represented
        // as a uint256
        challengeMap[_challengeID].remainder += remainder;
        
        return numerator / denominator;
    }

    // gives reminder tokens from poll to a designated claimer
    // the claimer is the winner of the challenge
    // for every poll there will be ~0.5 nano AdTokens burned,
    // since the winner cannot withdraw a decimal amount of nano AdToken 
    function claimExtraReward(uint _challengeID, string _domain) public {
        // uint256 totalTokens = voting.getTotalNumberOfTokensForWinningOption(_challengeID);
        uint256 reward = challengeMap[_challengeID].remainder / (MULTIPLIER);
        // reward = reward / totalTokens; // should this be here?
        challengeMap[_challengeID].remainder -= (reward * MULTIPLIER);
        if (voting.isPassed(_challengeID)) {
            // if challenger won, transfer tokens to challenger
            token.transfer(challengeMap[_challengeID].challenger, reward);
        } else {
            // if publisher won, give tokens to the domain's deposit
            listingMap[sha3(_domain)].currentDeposit += reward;
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
        Listing storage listing = listingMap[domainHash];

        require(token.transfer(listing.owner, listing.currentDeposit));

        delete listingMap[domainHash];
    }
}
