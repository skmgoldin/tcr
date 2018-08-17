pragma solidity ^0.4.24;

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
    event _ListingWithdrawn(bytes32 indexed listingHash);
    event _TouchAndRemoved(bytes32 indexed listingHash);
    event _ChallengeFailed(bytes32 indexed listingHash, uint indexed challengeID);
    event _ChallengeSucceeded(bytes32 indexed listingHash, uint indexed challengeID);
    using SafeMath for uint;

    struct Listing {
        uint applicationExpiry; // Expiration date of apply stage
        bool whitelisted;       // Indicates registry status
        address owner;          // Owner of Listing
        uint unstakedDeposit;   // Number of tokens in the listing not locked in a challenge
        uint challengeID;       // Corresponds to most current challenge in the challenges mapping
    }

    struct Challenge {
        ChallengeInterface challengeAddress; // Address of the Challenge contract
        bytes32 listingHash;                 // listingHash of the associated listing
        address challenger;                  // challenger address
        uint deposit;                        // deposit amounts staked by challenge parties
        bool resolved;                       // Indicates whether challenge has been resolved
    }

    // Maps challengeID to challenge struct
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

    // ------------
    // CONSTRUCTOR:
    // ------------

    /**
    @dev Initializer. Can only be called once.
    @param _token The address where the ERC20 token contract is deployed
    */
    function init(address _token, address _parameterizer, address _challengeFactory, string _name) public {
        require(_token != 0 && address(token) == 0);
        require(_parameterizer != 0 && address(parameterizer) == 0);

        token = EIP20Interface(_token);
        parameterizer = Parameterizer(_parameterizer);
        challengeFactory = ChallengeFactoryInterface(_challengeFactory);
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
    @dev                Allows the owner of a listingHash to remove the listingHash from the whitelist
                        Returns all tokens to the owner of the listingHash
    @param _listingHash A listingHash msg.sender is the owner of.
    */
    function exit(bytes32 _listingHash) external {
        Listing storage listing = listings[_listingHash];

        require(msg.sender == listing.owner);
        require(isWhitelisted(_listingHash));

        // Cannot exit during ongoing challenge
        require(listing.challengeID == 0 || challenges[listing.challengeID].resolved);

        // Remove listingHash & return tokens
        resetListing(_listingHash);
        emit _ListingWithdrawn(_listingHash);
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
    function createChallenge(bytes32 _listingHash, string _data) external returns (uint challengeID) {
        Listing storage listing = listings[_listingHash];
        uint minDeposit = parameterizer.get("minDeposit");

        // Listing must be in apply stage or already on the whitelist
        require(appWasMade(_listingHash) || listing.whitelisted);
        // Prevent multiple challenges
        require(listing.challengeID == 0 || challengeAddr(_listingHash).ended());

        if (listing.unstakedDeposit < minDeposit) {
            // Not enough tokens, listingHash auto-delisted
            resetListing(_listingHash);
            _TouchAndRemoved(_listingHash);
            return 0;
        }

        listing.unstakedDeposit = listing.unstakedDeposit - minDeposit;
        challengeNonce = challengeNonce + 1;
        ChallengeInterface challengeAddress = challengeFactory.createChallenge(this, msg.sender, listing.owner);
        challenges[challengeNonce].challengeAddress = challengeAddress;
        challenges[challengeNonce].challenger = msg.sender;
        challenges[challengeNonce].deposit = minDeposit;
        challenges[challengeNonce].listingHash = _listingHash;
        listing.challengeID = challengeNonce;

        emit _Challenge(_listingHash, challengeNonce, challengeAddress, _data, msg.sender);

        return challengeNonce;
    }

    /**
    @dev                Updates a listingHash's status from 'application' to 'listing' or resolves
                        a challenge if one exists.
    @param _listingHash The listingHash whose status is being updated
    */
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
    @dev                Determines the winner in a challenge. Rewards the winner tokens and
                        either whitelists or de-whitelists the listingHash.
    @param _listingHash A listingHash with a challenge that is to be resolved
    */
    function resolveChallenge(bytes32 _listingHash) private {
      Listing storage listing      = listings[_listingHash];
      ChallengeInterface challenge = challengeAddr(_listingHash);
      uint challengeID             = listings[_listingHash].challengeID;
      Challenge challengeStruct    = challenges[challengeID];

      if (!challenge.passed()) {
          whitelistApplication(_listingHash);
          listing.unstakedDeposit += challengeStruct.deposit;
          _ChallengeFailed(_listingHash, challengeID);
      } else {
          resetListing(_listingHash);
          require(token.transfer(challengeStruct.challenger, challengeStruct.deposit));
          _ChallengeSucceeded(_listingHash, challengeID);
      }
      challenges[challengeID].resolved = true;
    }

    /**
    @dev                Allocates reward from challenge deposit back to challenge
                        winner. Will revert if Futarchy markets are still trading
    @param challengeID  challengeID of the affiliated challenge
    */
    function allocateWinnerReward(uint challengeID) public {
        Challenge storage challengeStruct = challenges[challengeID];
        require(challengeStruct.resolved);

        Listing storage listing = listings[challengeStruct.listingHash];
        ChallengeInterface challengeContract = challengeStruct.challengeAddress;
        uint reward = challengeContract.winnerRewardAmount();

        require(token.transferFrom(challengeContract, this, reward));

       if (!challengeContract.passed()) {
            listing.unstakedDeposit += reward;
        } else {
            require(token.transfer(challengeStruct.challenger, reward));
        }
    }

    // --------
    // GETTERS:
    // --------

    /**
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
        return challengeAddr(_listingHash).ended();
    }

    function challengeAddr(bytes32 _listingHash) public returns (ChallengeInterface) {
      Listing storage listing = listings[_listingHash];
      return challenges[listing.challengeID].challengeAddress;
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
        Challenge storage challengeStruct = challenges[listing.challengeID];
        address challenger = challengeStruct.challenger;

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
}
