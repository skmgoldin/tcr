pragma solidity ^0.4.11;

import "tokens/eip20/EIP20Interface.sol";
import "./Parameterizer.sol";
import "./Challenge/ChallengeFactoryInterface.sol";
import "./Challenge/ChallengeInterface.sol";
import "zeppelin/math/SafeMath.sol";

contract Registry {

    // ------
    // EVENTS
    // ------

    event _Application(bytes32 indexed listingHash, uint deposit, uint appEndDate, string data, address indexed applicant);
    event _Challenge(bytes32 indexed listingHash, uint challengeID, address challengeAddress, string data, address indexed challenger);
    event _ChallengeStarted(bytes32 indexed listingHash, uint challengeID);
    event _Deposit(bytes32 indexed listingHash, uint added, uint newTotal, address indexed owner);
    event _Withdrawal(bytes32 indexed listingHash, uint withdrew, uint newTotal, address indexed owner);
    event _ApplicationWhitelisted(bytes32 indexed listingHash);
    event _ApplicationRemoved(bytes32 indexed listingHash);
    event _ListingRemoved(bytes32 indexed listingHash);
    event _ListingWithdrawn(bytes32 indexed listingHash, address indexed owner);
    event _TouchAndRemoved(bytes32 indexed listingHash);
    event _ChallengeFailed(bytes32 indexed listingHash, uint indexed challengeID, uint rewardPool, uint totalTokens);
    event _ChallengeSucceeded(bytes32 indexed listingHash, uint indexed challengeID, uint rewardPool, uint totalTokens);
    event _RewardClaimed(uint indexed challengeID, uint reward, address indexed voter);
    event _ExitInitialized(bytes32 indexed listingHash, uint exitTime, uint exitDelayEndDate, address indexed owner);

    using SafeMath for uint;

    struct Listing {
        uint applicationExpiry; // Expiration date of apply stage
        bool whitelisted;       // Indicates registry status
        address owner;          // Owner of Listing
        uint unstakedDeposit;   // Number of tokens in the listing not locked in a challenge
        uint challengeID;       // Corresponds to challenge contract in the challenges mapping
	      uint exitTime;		      // Time the listing may leave the registry
        uint exitTimeExpiry;    // Expiration date of exit period
        address challenger;     // Address of the challenger

    }

    struct Challenge {
      ChallengeInterface challengeAddress;
      bool resolved;
    }

    // Maps challengeID to challenge contract address
    mapping(uint => Challenge) public challenges;

    // Maps listingHashes to associated listingHash data
    mapping(bytes32 => Listing) public listings;

    // Global Variables
    EIP20Interface public token;
    ChallengeFactoryInterface public challengeFactory;
    Parameterizer public parameterizer;
    string public name;
    uint constant public INITIAL_CHALLENGE_NONCE = 0;
    uint public challengeNonce;

    /**
    @dev Initializer. Can only be called once.
    @param _token The address where the ERC20 token contract is deployed
    */
    function init(address _token, address _parameterizer, string _name) public {
        require(_token != 0 && address(token) == 0);
        require(_parameterizer != 0 && address(parameterizer) == 0);

        token = EIP20Interface(_token);
        parameterizer = Parameterizer(_parameterizer);
        name = _name;
        challengeNonce = INITIAL_CHALLENGE_NONCE;
    }

    // --------------------
    // PUBLISHER INTERFACE:
    // --------------------

    /**
    @dev                Allows a user to start an application. Takes tokens from user and sets
                        apply stage end time.
    @param _listingHash The hash of a potential listing a user is applying to add to the registry
    @param _amount      The number of ERC20 tokens a user is willing to potentially stake
    @param _data        Extra data relevant to the application. Think IPFS hashes.
    */
    function apply(bytes32 _listingHash, uint _amount, string _data) external {
        require(!isWhitelisted(_listingHash));
        require(!appWasMade(_listingHash));
        require(_amount >= parameterizer.get("minDeposit"));

        // Sets owner
        Listing storage listing = listings[_listingHash];
        listing.owner = msg.sender;

        // Sets apply stage end time
        listing.applicationExpiry = block.timestamp.add(parameterizer.get("applyStageLen"));
        listing.unstakedDeposit = _amount;

        // Transfers tokens from user to Registry contract
        require(token.transferFrom(listing.owner, this, _amount));

        emit _Application(_listingHash, _amount, listing.applicationExpiry, _data, msg.sender);
    }

    /**
    @dev                Allows the owner of a listingHash to increase their unstaked deposit.
    @param _listingHash A listingHash msg.sender is the owner of
    @param _amount      The number of ERC20 tokens to increase a user's unstaked deposit
    */
    function deposit(bytes32 _listingHash, uint _amount) external {
        Listing storage listing = listings[_listingHash];

        require(listing.owner == msg.sender);

        listing.unstakedDeposit += _amount;
        require(token.transferFrom(msg.sender, this, _amount));

        emit _Deposit(_listingHash, _amount, listing.unstakedDeposit, msg.sender);
    }

    /**
    @dev                Allows the owner of a listingHash to decrease their unstaked deposit.
    @param _listingHash A listingHash msg.sender is the owner of.
    @param _amount      The number of ERC20 tokens to withdraw from the unstaked deposit.
    */
    function withdraw(bytes32 _listingHash, uint _amount) external {
        Listing storage listing = listings[_listingHash];

        require(listing.owner == msg.sender);
        require(_amount <= listing.unstakedDeposit);
        require(listing.unstakedDeposit - _amount >= parameterizer.get("minDeposit"));

        listing.unstakedDeposit -= _amount;
        require(token.transfer(msg.sender, _amount));

        emit _Withdrawal(_listingHash, _amount, listing.unstakedDeposit, msg.sender);
    }

    /**
    @dev		Initialize an exit timer for a listing to leave the whitelist
    @param _listingHash	A listing hash msg.sender is the owner of
    */
    function initExit(bytes32 _listingHash) external {
        Listing storage listing = listings[_listingHash];

        require(msg.sender == listing.owner);
        require(isWhitelisted(_listingHash));
        // Cannot exit during ongoing challenge
        require(listing.challengeID == 0 || challenges[listing.challengeID].resolved);

        // Ensure user never initializedExit or exitPeriodLen passed
        require(listing.exitTime == 0 || now > listing.exitTimeExpiry);

        // Set when the listing may be removed from the whitelist
        listing.exitTime = now.add(parameterizer.get("exitTimeDelay"));
	       // Set exit period end time
	      listing.exitTimeExpiry = listing.exitTime.add(parameterizer.get("exitPeriodLen"));
        emit _ExitInitialized(_listingHash, listing.exitTime,
            listing.exitTimeExpiry, msg.sender);
    }

    /**
    @dev		Allow a listing to leave the whitelist
    @param _listingHash A listing hash msg.sender is the owner of
    */
    function finalizeExit(bytes32 _listingHash) external {
        Listing storage listing = listings[_listingHash];

        require(msg.sender == listing.owner);
        require(isWhitelisted(_listingHash));
        // Cannot exit during ongoing challenge
        ChallengeInterface challenge = challengeForListingHash(_listingHash);
        require(listing.challengeID == 0 || challenge.ended());

        // Make sure the exit was initialized
        require(listing.exitTime > 0);
        // Time to exit has to be after exit delay but before the exitPeriodLen is over
	require(listing.exitTime < now && now < listing.exitTimeExpiry);

        resetListing(_listingHash);
        emit _ListingWithdrawn(_listingHash, msg.sender);
    }

    // -----------------------
    // TOKEN HOLDER INTERFACE:
    // -----------------------

    /**
    @dev                Creates a new challenge for a listingHash which is either in the apply stage or
                        already in the whitelist.
    @param _listingHash The listingHash being challenged, whether listed or in application
    @param _data        Extra data relevant to the challenge. Think IPFS hashes.
    */
    function challenge(bytes32 _listingHash, string _data) external returns (uint challengeID) {
        Listing storage listing = listings[_listingHash];
        uint minDeposit = parameterizer.get("minDeposit");

        // Listing must be in apply stage or already on the whitelist
        require(appWasMade(_listingHash) || listing.whitelisted);

        // Prevent multiple challenges
        require(listing.challengeID == 0 || challenges[listing.challengeID].resolved);

        if (listing.unstakedDeposit < minDeposit) {
            // Not enough tokens, listingHash auto-delisted
            resetListing(_listingHash);
            emit _TouchAndRemoved(_listingHash);
            return 0;
        }

        // Locks tokens for listingHash during challenge
        listing.unstakedDeposit -= minDeposit;

        // Takes tokens from challenger
        require(token.transferFrom(msg.sender, this, minDeposit));

        challengeNonce = challengeNonce + 1;
        ChallengeInterface challengeAddress = challengeFactory.createChallenge(msg.sender, listing.owner, this);
        challenges[challengeNonce].challengeAddress = challengeAddress;
        listing.challengeID = challengeNonce;
        listing.challenger = msg.sender;

        uint requiredTokenDeposit = challengeAddress.requiredTokenDeposit();
        require(token.approve(challengeAddress, requiredTokenDeposit));

        _Challenge(_listingHash, challengeNonce, challenges[challengeNonce].challengeAddress, _data, msg.sender);
        return challengeNonce;
    }

    function updateStatus(bytes32 _listingHash) public {
        if (canBeWhitelisted(_listingHash)) {
          whitelistApplication(_listingHash);
        } else if (challengeCanBeResolved(_listingHash)) {
          resolveChallenge(_listingHash);
        } else {
          revert();
        }
    }

    /**
    @dev                  Updates an array of listingHashes' status from 'application' to 'listing' or resolves
                          a challenge if one exists.
    @param _listingHashes The listingHashes whose status are being updated
    */
    function updateStatuses(bytes32[] _listingHashes) public {
        // loop through arrays, revealing each individual vote values
        for (uint i = 0; i < _listingHashes.length; i++) {
            updateStatus(_listingHashes[i]);
        }
    }

<<<<<<< HEAD
    // ----------------
    // TOKEN FUNCTIONS:
    // ----------------

    /**
    @dev                Called by a voter to claim their reward for each completed vote. Someone
                        must call updateStatus() before this can be called.
    @param _challengeID The PLCR pollID of the challenge a reward is being claimed for
    */
    function claimReward(uint _challengeID) public {
        Challenge storage challengeInstance = challenges[_challengeID];
        // Ensures the voter has not already claimed tokens and challengeInstance results have
        // been processed
        require(challengeInstance.tokenClaims[msg.sender] == false);
        require(challengeInstance.resolved == true);

        uint voterTokens = voting.getNumPassingTokens(msg.sender, _challengeID);
        uint reward = voterTokens.mul(challengeInstance.rewardPool)
                      .div(challengeInstance.totalTokens);

        // Subtracts the voter's information to preserve the participation ratios
        // of other voters compared to the remaining pool of rewards
        challengeInstance.totalTokens -= voterTokens;
        challengeInstance.rewardPool -= reward;

        // Ensures a voter cannot claim tokens again
        challengeInstance.tokenClaims[msg.sender] = true;

        require(token.transfer(msg.sender, reward));

        emit _RewardClaimed(_challengeID, reward, msg.sender);
    }

    /**
    @dev                 Called by a voter to claim their rewards for each completed vote. Someone
                         must call updateStatus() before this can be called.
    @param _challengeIDs The PLCR pollIDs of the challenges rewards are being claimed for
    */
    function claimRewards(uint[] _challengeIDs) public {
        // loop through arrays, claiming each individual vote reward
        for (uint i = 0; i < _challengeIDs.length; i++) {
            claimReward(_challengeIDs[i]);
        }
=======
    function resolveChallenge(bytes32 _listingHash) private {
      Listing storage listing      = listings[_listingHash];
      ChallengeInterface challenge = challengeForListingHash(_listingHash);
      uint challengeID  = listings[_listingHash].challengeID;

      // get the winner's reward
      uint reward = challenge.tokenRewardAmount();

      if (!challenge.passed()) {
          whitelistApplication(_listingHash);
          listing.unstakedDeposit += reward;
          _ChallengeFailed(_listingHash, challengeID);
      } else {
          // Transfer the reward to the challenger
          require(token.transfer(listing.challenger, reward));
          resetListing(_listingHash);
          _ChallengeSucceeded(_listingHash, challengeID);
      }
      challenges[challengeID].resolved = true;
>>>>>>> Refactor Registry to use Abstracted Challenge Contracts
    }

    // --------
    // GETTERS:
    // --------

    /**
<<<<<<< HEAD
    @dev                Calculates the provided voter's token reward for the given poll.
    @param _voter       The address of the voter whose reward balance is to be returned
    @param _challengeID The pollID of the challenge a reward balance is being queried for
    @return             The uint indicating the voter's reward
    */
    function voterReward(address _voter, uint _challengeID)
    public view returns (uint) {
        uint totalTokens = challenges[_challengeID].totalTokens;
        uint rewardPool = challenges[_challengeID].rewardPool;
        uint voterTokens = voting.getNumPassingTokens(_voter, _challengeID);
        return voterTokens.mul(rewardPool).div(totalTokens);
    }

    /**
=======
>>>>>>> Refactor Registry to use Abstracted Challenge Contracts
    @dev                Determines whether the given listingHash be whitelisted.
    @param _listingHash The listingHash whose status is to be examined
    */
    function canBeWhitelisted(bytes32 _listingHash) view public returns (bool) {
        uint challengeID = listings[_listingHash].challengeID;

        // Ensures that the application was made,
        // the application period has ended,
        // the listingHash can be whitelisted,
        // and either: the challengeID == 0, or the challenge has been resolved.
        if (
            appWasMade(_listingHash) &&
            listings[_listingHash].applicationExpiry < now &&
            !isWhitelisted(_listingHash) &&
            (challengeID == 0 || challenges[challengeID].resolved == true)
        ) { return true; }

        return false;
    }

    /**
    @dev                Returns true if the provided listingHash is whitelisted
    @param _listingHash The listingHash whose status is to be examined
    */
    function isWhitelisted(bytes32 _listingHash) view public returns (bool whitelisted) {
        return listings[_listingHash].whitelisted;
    }

    /**
    @dev                Returns true if apply was called for this listingHash
    @param _listingHash The listingHash whose status is to be examined
    */
    function appWasMade(bytes32 _listingHash) view public returns (bool exists) {
        return listings[_listingHash].applicationExpiry > 0;
    }

    /**
    @dev                Returns true if the application/listingHash has an unresolved challenge
    @param _listingHash The listingHash whose status is to be examined
    */
    function challengeExists(bytes32 _listingHash) view public returns (bool) {
        uint challengeID = listings[_listingHash].challengeID;

        return (challengeID > 0 && !challenges[challengeID].resolved);
    }

    /**
    @dev                Determines whether voting has concluded in a challenge for a given
                        listingHash. Throws if no challenge exists.
    @param _listingHash A listingHash with an unresolved challenge
    */
    function challengeCanBeResolved(bytes32 _listingHash) view public returns (bool) {
        uint challengeID = listings[_listingHash].challengeID;

        require(challengeExists(_listingHash));
        return challengeForListingHash(_listingHash).ended();
    }

    // ----------------
    // PRIVATE FUNCTIONS:
    // ----------------

    /**
    @dev                Called by updateStatus() if the applicationExpiry date passed without a
                        challenge being made. Called by resolveChallenge() if an
                        application/listing beat a challenge.
    @param _listingHash The listingHash of an application/listingHash to be whitelisted
    */
    function whitelistApplication(bytes32 _listingHash) private {
        if (!listings[_listingHash].whitelisted) { emit _ApplicationWhitelisted(_listingHash); }
        listings[_listingHash].whitelisted = true;
    }

    /**
    @dev                Deletes a listingHash from the whitelist and transfers tokens back to owner
    @param _listingHash The listing hash to delete
    */
    function resetListing(bytes32 _listingHash) private {
        Listing storage listing = listings[_listingHash];

        // Emit events before deleting listing to check whether is whitelisted
        if (listing.whitelisted) {
            emit _ListingRemoved(_listingHash);
        } else {
            emit _ApplicationRemoved(_listingHash);
        }

        // Deleting listing to prevent reentry
        address owner = listing.owner;
        uint unstakedDeposit = listing.unstakedDeposit;
        delete listings[_listingHash];

        // Transfers any remaining balance back to the owner
        if (unstakedDeposit > 0) {
            require(token.transfer(owner, unstakedDeposit));
        }
    }

    /**
    @dev                gets a challenge for the given listingHash
    @param _listingHash The listing hash get the challenge for
    */
    function challengeForListingHash(bytes32 _listingHash) private view returns (ChallengeInterface) {
      Listing storage listing = listings[_listingHash];
      return challenges[listing.challengeID].challengeAddress;
    }
}
