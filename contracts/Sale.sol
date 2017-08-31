pragma solidity 0.4.11;
import "./HumanStandardToken.sol";
import "./Disbursement.sol";
import "./Filter.sol";

contract Sale {

    /*
     * Events
     */

    event PurchasedTokens(address indexed purchaser, uint amount);
    event TransferredPreBuyersReward(address indexed preBuyer, uint amount);
    event TransferredFoundersTokens(address vault, uint amount);

    /*
     * Storage
     */

    address public owner;
    address public wallet;
    HumanStandardToken public token;
    uint public price;
    uint public startBlock;
    uint public freezeBlock;
    bool public emergencyFlag = false;
    bool public preSaleTokensDisbursed = false;
    bool public foundersTokensDisbursed = false;
    address[] public filters;

    /*
     * Modifiers
     */

    modifier saleStarted {
        require(block.number >= startBlock);
        _;
    }

    modifier onlyOwner {
        require(msg.sender == owner);
        _;
    }

    modifier notFrozen {
        require(block.number < freezeBlock);
        _;
    }

    modifier setupComplete {
        assert(preSaleTokensDisbursed && foundersTokensDisbursed);
        _;
    }

    modifier notInEmergency {
        assert(emergencyFlag == false);
        _;
    }

    /*
     * Public functions
     */

    /// @dev Sale(): constructor for Sale contract
    /// @param _owner the address which owns the sale, can access owner-only functions
    /// @param _wallet the sale's beneficiary address 
    /// @param _tokenSupply the total number of AdToken to mint
    /// @param _tokenName AdToken's human-readable name
    /// @param _tokenDecimals the number of display decimals in AdToken balances
    /// @param _tokenSymbol AdToken's human-readable asset symbol
    /// @param _price price of the token in Wei (ADT/Wei pair price)
    /// @param _startBlock the block at which this contract will begin selling its ADT balance
    function Sale(
        address _owner,
        address _wallet,
        uint256 _tokenSupply,
        string _tokenName,
        uint8 _tokenDecimals,
        string _tokenSymbol,
        uint _price,
        uint _startBlock,
        uint _freezeBlock
    ) {
        owner = _owner;
        wallet = _wallet;
        token = new HumanStandardToken(_tokenSupply, _tokenName, _tokenDecimals, _tokenSymbol);
        price = _price;
        startBlock = _startBlock;
        freezeBlock = _freezeBlock;

        assert(token.transfer(this, token.totalSupply()));
        assert(token.balanceOf(this) == token.totalSupply());
        assert(token.balanceOf(this) == 10**18);
    }

    /// @dev distributeFoundersRewards(): private utility function called by constructor
    /// @param _preBuyers an array of addresses to which awards will be distributed
    /// @param _preBuyersTokens an array of integers specifying preBuyers rewards
    function distributePreBuyersRewards(
        address[] _preBuyers,
        uint[] _preBuyersTokens
    ) 
        public
        onlyOwner
    { 
        assert(!preSaleTokensDisbursed);

        for(uint i = 0; i < _preBuyers.length; i++) {
            require(token.transfer(_preBuyers[i], _preBuyersTokens[i]));
            TransferredPreBuyersReward(_preBuyers[i], _preBuyersTokens[i]);
        }

        preSaleTokensDisbursed = true;
    }

    /// @dev distributeTimelockedRewards(): private utility function called by constructor
    /// @param _founders an array of addresses specifying disbursement beneficiaries
    /// @param _foundersTokens an array of integers specifying disbursement amounts
    /// @param _founderTimelocks an array of UNIX timestamps specifying vesting dates
    function distributeFoundersRewards(
        address[] _founders,
        uint[] _foundersTokens,
        uint[] _founderTimelocks
    ) 
        public
        onlyOwner
    { 
        assert(preSaleTokensDisbursed);
        assert(!foundersTokensDisbursed);

        /* Total number of tokens to be disbursed for a given tranch. Used when
           tokens are transferred to disbursement contracts. */
        uint tokensPerTranch = 0;
        // Alias of founderTimelocks.length for legibility
        uint tranches = _founderTimelocks.length;
        // The number of tokens which may be withdrawn per founder for each tranch
        uint[] memory foundersTokensPerTranch = new uint[](_foundersTokens.length);

        // Compute foundersTokensPerTranch and tokensPerTranch
        for(uint i = 0; i < _foundersTokens.length; i++) {
            foundersTokensPerTranch[i] = _foundersTokens[i]/tranches;
            tokensPerTranch = tokensPerTranch + foundersTokensPerTranch[i];
        }

        /* Deploy disbursement and filter contract pairs, initialize both and store
           filter addresses in filters array. Finally, transfer tokensPerTranch to
           disbursement contracts. */
        for(uint j = 0; j < tranches; j++) {
            Filter filter = new Filter(_founders, foundersTokensPerTranch);
            filters.push(filter);
            Disbursement vault = new Disbursement(filter, 1, _founderTimelocks[j]);
            // Give the disbursement contract the address of the token it disburses.
            vault.setup(token);             
            /* Give the filter contract the address of the disbursement contract
               it access controls */
            filter.setup(vault);             
            // Transfer to the vault the tokens it is to disburse
            assert(token.transfer(vault, tokensPerTranch));
            TransferredFoundersTokens(vault, tokensPerTranch);
        }

        assert(token.balanceOf(this) == 5 * 10**17);
        foundersTokensDisbursed = true;
    }

    /// @dev purchaseToken(): function that exchanges ETH for ADT (main sale function)
    /// @notice You're about to purchase the equivalent of `msg.value` Wei in ADT tokens
    function purchaseTokens()
        saleStarted
        payable
        setupComplete
        notInEmergency
    {
        /* Calculate whether any of the msg.value needs to be returned to
           the sender. The tokenPurchase is the actual number of tokens which
           will be purchased once any excessAmount included in the msg.value
           is removed from the purchaseAmount. */
        uint excessAmount = msg.value % price;
        uint purchaseAmount = msg.value - excessAmount;
        uint tokenPurchase = purchaseAmount / price;

        // Cannot purchase more tokens than this contract has available to sell
        require(tokenPurchase <= token.balanceOf(this));

        // Return any excess msg.value
        if (excessAmount > 0) {
            msg.sender.transfer(excessAmount);
        }

        // Forward received ether minus any excessAmount to the wallet
        wallet.transfer(purchaseAmount);

        // Transfer the sum of tokens tokenPurchase to the msg.sender
        assert(token.transfer(msg.sender, tokenPurchase));

        PurchasedTokens(msg.sender, tokenPurchase);
    }

    /*
     * Owner-only functions
     */

    function changeOwner(address _newOwner)
        onlyOwner
    {
        require(_newOwner != 0);
        owner = _newOwner;
    }

    function changePrice(uint _newPrice)
        onlyOwner
        notFrozen
    {
        require(_newPrice != 0);
        price = _newPrice;
    }

    function changeWallet(address _wallet)
        onlyOwner
        notFrozen
    {
        require(_wallet != 0);
        wallet = _wallet;
    }

    function changeStartBlock(uint _newBlock)
        onlyOwner
        notFrozen
    {
        require(_newBlock != 0);

        freezeBlock = _newBlock - (startBlock - freezeBlock);
        startBlock = _newBlock;
    }

    function emergencyToggle()
        onlyOwner
    {
        emergencyFlag = !emergencyFlag;
    }

}
