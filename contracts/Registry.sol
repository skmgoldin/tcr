pragma solidity ^0.4.11;

import "./historical/StandardToken.sol";
import "./PLCRVoting.sol";
import "./Parameterizer.sol";

contract Registry {

    // ------
    // EVENTS
    // ------

    event _Application(string domain, uint deposit);
    event _Challenge(string domain, uint deposit, uint pollID);
    event _Deposit(string domain, uint added, uint newTotal);
    event _Withdrawal(string domain, uint withdrew, uint newTotal);
    event _NewDomainWhitelisted(string domain);
    event _ApplicationRemoved(string domain);
    event _ListingRemoved(string domain);
    event _ChallengeFailed(uint challengeID);
    event _ChallengeSucceeded(uint challengeID);
    event _RewardClaimed(address voter, uint challengeID, uint reward);

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
    mapping(uint => Challenge) public challengeMap;
    // maps domainHashes to associated listing data
    mapping(bytes32 => Listing) public listingMap;
    // maps challengeIDs and address to token claim data
    mapping(uint => mapping(address => bool)) public tokenClaims;

    // Global Variables
    StandardToken public token;
    PLCRVoting public voting;
    Parameterizer public parameterizer;

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
    function apply(string domain, uint amount) external {
        require(!isWhitelisted(domain));
        require(!appExists(domain));
        require(amount >= parameterizer.get("minDeposit"));

        //set owner
        Listing storage listing = listingMap[sha3(domain)];
        listing.owner = msg.sender; 

        //transfer tokens
        require(token.transferFrom(listing.owner, this, amount)); 

        //set apply stage end time
        listing.applicationExpiry = block.timestamp + parameterizer.get("applyStageLen"); 
        listing.currentDeposit = amount;

        _Application(domain, amount);
    }

    //Allow the owner of a domain in the listing to increase their deposit
    function deposit(string domain, uint amount) external {
        Listing storage listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(token.transferFrom(msg.sender, this, amount));

        listing.currentDeposit += amount;

        _Deposit(domain, amount, listing.currentDeposit);
    }

    //Allow the owner of a domain in the listing to withdraw
    //tokens not locked in a challenge.
    //The publisher's domain remains whitelisted
    function withdraw(string domain, uint amount) external {
        Listing storage listing = listingMap[sha3(domain)];

        require(listing.owner == msg.sender);
        require(amount <= listing.currentDeposit);
        require(listing.currentDeposit - amount >= parameterizer.get("minDeposit"));

        require(token.transfer(msg.sender, amount));

        listing.currentDeposit -= amount;

        _Withdrawal(domain, amount, listing.currentDeposit);
    }

    //Allow the owner of a domain to remove the domain from the whitelist
    //Return all tokens to the owner
    function exit(string domain) external {
        Listing storage listing = listingMap[sha3(domain)];

        require(msg.sender == listing.owner);
        require(isWhitelisted(domain));
        // cannot exit during ongoing challenge
        require(listing.challengeID == 0 || challengeMap[listing.challengeID].resolved);

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
        uint pollID = voting.startPoll(
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

        _Challenge(domain, deposit, pollID);
        return pollID;
    }

    /**
    @notice updates a domain's status from application to listing, or resolves a challenge if one exists
    @param domain The domain whose status is being updated
    */
    function updateStatus(string domain) public {
        bytes32 domainHash = sha3(domain);
        uint challengeID = listingMap[domainHash].challengeID;

        // To update a domain's status it needs an unresolved challenge, or to be an application
        require(!challengeMap[challengeID].resolved || appExists(domain));

        if (appExists(domain) &&
            isExpired(listingMap[domainHash].applicationExpiry) &&
            !isWhitelisted(domain) &&
            challengeID == 0
           ) {
            // The applicationExpiry date passed without a challenge being made
            listingMap[domainHash].whitelisted = true;
            _NewDomainWhitelisted(domain);
        } else {
            // A challenge exists on the domain
            // winner gets back their full staked deposit, and dispensationPct*loser's stake
            uint stake = 
              (2 * challengeMap[challengeID].stake) - challengeMap[challengeID].rewardPool;
            bool wasWhitelisted = isWhitelisted(domain);

            if (voting.isPassed(challengeID)) { // if voting is not yet over, isPassed will throw
                // The challenge failed
                listingMap[domainHash].whitelisted = true;
                listingMap[domainHash].currentDeposit += stake; // give stake back to applicant

                _ChallengeFailed(challengeID);
                if (!wasWhitelisted) { _NewDomainWhitelisted(domain); }
            } else {
                // The challenge succeeded
                resetListing(domain);
                require(token.transfer(challengeMap[challengeID].challenger, stake));

                _ChallengeSucceeded(challengeID);
                if (wasWhitelisted) { _ListingRemoved(domain); }
                else { _ApplicationRemoved(domain); }
            }

            // set flag on challenge being processed
            challengeMap[challengeID].resolved = true;

            // store the total tokens used for voting by the winning side for reward purposes
            challengeMap[challengeID].totalTokens =
              voting.getTotalNumberOfTokensForWinningOption(challengeID);
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

        uint voterTokens = voting.getNumPassingTokens(msg.sender, _challengeID, _salt);
        uint reward = calculateVoterReward(msg.sender, _challengeID, _salt);

        // subtract voter's information to preserve the participation ratios of other voters
        // compared to the remaining pool of rewards
        challengeMap[_challengeID].totalTokens -= voterTokens;
        challengeMap[_challengeID].rewardPool -= reward;

        require(token.transfer(msg.sender, reward));
        
        // ensures a voter cannot claim tokens again

        tokenClaims[_challengeID][msg.sender] = true;

        _RewardClaimed(msg.sender, _challengeID, reward);
    }

    /**
    @dev Calculate the provided voter's token reward for the given poll
    @param _voter Address of the voter whose reward balance is to be returned
    @param _challengeID pollID of the challenge a reward balance is being queried for
    @param _salt the salt for the voter's commit hash in the given poll
    @return a uint indicating the voter's reward in nano-adToken
    */
    function calculateVoterReward(address _voter, uint _challengeID, uint _salt)
    public constant returns (uint) {
        uint totalTokens = challengeMap[_challengeID].totalTokens;
        uint rewardPool = challengeMap[_challengeID].rewardPool;
        uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID, _salt);
        return (voterTokens * rewardPool) / totalTokens;
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
