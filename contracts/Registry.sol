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
    event _ListingWithdrawn(bytes32 indexed listingHash);
    event _TouchAndRemoved(bytes32 indexed listingHash);
    event _ChallengeFailed(bytes32 indexed listingHash, uint indexed challengeID);
    event _ChallengeSucceeded(bytes32 indexed listingHash, uint indexed challengeID);

    using SafeMath for uint;

    struct Listing {
        uint applicationExpiry; // Expiration date of apply stage
        bool whitelisted;       // Indicates registry status
        address owner;          // Owner of Listing
        uint deposit;           // Number of tokens in the listing not locked in a challenge
        uint challengeID;       // Corresponds to challenge contract in the challenges mapping
        address challenger;     // Address of the challenger
    }

    // Maps challengeID to challenge contract address
    mapping(uint => ChallengeInterface) public challenges;

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
    @dev Contructor                 Sets the addresses for token, voting, and parameterizer
    @param _tokenAddr               Address of the TCR's intrinsic ERC20 token
    @param _challengeFactoryAddr    Address of a contract that will create challenges
    @param _paramsAddr              Address of a Parameterizer contract
    */
    function Registry(
        address _tokenAddr,
        address _challengeFactoryAddr,
        address _paramsAddr,
        string _name
    ) public {
        token = EIP20Interface(_tokenAddr);
        challengeFactory = ChallengeFactoryInterface(_challengeFactoryAddr);
        parameterizer = Parameterizer(_paramsAddr);
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
        listing.deposit = _amount;

        // Transfers tokens from user to Registry contract
        require(token.transferFrom(listing.owner, this, _amount));

        _Application(_listingHash, _amount, listing.applicationExpiry, _data, msg.sender);
    }

    /**
    @dev                Allows the owner of a listingHash to increase their unstaked deposit.
    @param _listingHash A listingHash msg.sender is the owner of
    @param _amount      The number of ERC20 tokens to increase a user's unstaked deposit
    */
    function deposit(bytes32 _listingHash, uint _amount) external {
        Listing storage listing = listings[_listingHash];

        require(listing.owner == msg.sender);

        listing.deposit += _amount;
        require(token.transferFrom(msg.sender, this, _amount));

        _Deposit(_listingHash, _amount, listing.deposit, msg.sender);
    }

    /**
    @dev                Allows the owner of a listingHash to decrease their unstaked deposit.
    @param _listingHash A listingHash msg.sender is the owner of.
    @param _amount      The number of ERC20 tokens to withdraw from the unstaked deposit.
    */
    function withdraw(bytes32 _listingHash, uint _amount) external {
        Listing storage listing = listings[_listingHash];

        // TODO: test that this tokenLockAmount logic works
        uint tokenLockAmount;
        if (listing.challengeID > 0) {
            tokenLockAmount = challenges[listing.challengeID].tokenLockAmount();
        }

        require(listing.owner == msg.sender);
        require(_amount <= listing.deposit);
        require(listing.deposit - _amount >= parameterizer.get("minDeposit") + tokenLockAmount);

        listing.deposit -= _amount;
        require(token.transfer(msg.sender, _amount));

        _Withdrawal(_listingHash, _amount, listing.deposit, msg.sender);
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
        require(listing.challengeID == 0 || challenges[listing.challengeID].ended());

        // Remove listingHash & return tokens
        resetListing(_listingHash);
        _ListingWithdrawn(_listingHash);
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
        uint deposit = parameterizer.get("minDeposit");

        // Listing must be in apply stage or already on the whitelist
        require(appWasMade(_listingHash) || listing.whitelisted);
        // Prevent multiple challenges
        require(listing.challengeID == 0 || challenges[listing.challengeID].ended());

        if (listing.deposit < deposit) {
            // Not enough tokens, listingHash auto-delisted
            resetListing(_listingHash);
            _TouchAndRemoved(_listingHash);
            return 0;
        }

        challengeNonce = challengeNonce + 1;
        challenges[challengeNonce] = challengeFactory.createChallenge(msg.sender, listing.owner);
        listing.challengeID = challengeNonce;
        listing.challenger = msg.sender;

        _Challenge(_listingHash, challengeNonce, challenges[challengeNonce], _data, msg.sender);

        return challengeNonce;
    }

    function updateStatus(bytes32 _listingHash) public {
        Listing storage listing = listings[_listingHash];
        uint challengeID = listings[_listingHash].challengeID;

        require(challenges[challengeID].ended());

        if (!challenges[challengeID].passed()) {
            whitelistApplication(_listingHash);
            _ChallengeFailed(_listingHash, challengeID);
        } else {
            // Transfer the reward to the challenger
            require(token.transfer(listing.challenger, challenges[challengeID].tokenLockAmount()));

            resetListing(_listingHash);

            _ChallengeSucceeded(_listingHash, challengeID);
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
            (challengeID == 0 || challenges[challengeID].ended() == true)
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
        if (!listings[_listingHash].whitelisted) { _ApplicationWhitelisted(_listingHash); }
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
            _ListingRemoved(_listingHash);
        } else {
            _ApplicationRemoved(_listingHash);
        }

        // Deleting listing to prevent reentry
        address owner = listing.owner;
        uint unstakedDeposit;
        if (listing.challengeID > 0 && challenges[listing.challengeID].passed()) {
            unstakedDeposit = listing.deposit - challenges[listing.challengeID].tokenLockAmount();
        } else {
            unstakedDeposit = listing.deposit;
        }
        delete listings[_listingHash];

        // Transfers any remaining balance back to the owner
        if (unstakedDeposit > 0) {
            require(token.transfer(owner, unstakedDeposit));
        }
    }
}
