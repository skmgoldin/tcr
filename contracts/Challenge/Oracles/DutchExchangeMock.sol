pragma solidity ^0.4.19;

import '@gnosis.pm/dx-contracts/contracts/Tokens/TokenFRT.sol';
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import '@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol';

/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Alex Herrmann - <alex@gnosis.pm>
/// @author Dominik Teiml - <dominik@gnosis.pm>

contract DutchExchangeMock {

    // The price is a rational number, so we need a concept of a fraction
    struct fraction {
        uint num;
        uint den;
    }

    uint constant WAITING_PERIOD_NEW_TOKEN_PAIR = 6 hours;
    uint constant WAITING_PERIOD_NEW_AUCTION = 10 minutes;
    uint constant WAITING_PERIOD_CHANGE_MASTERCOPY_OR_ORACLE = 30 days;
    uint constant AUCTION_START_WAITING_FOR_FUNDING = 1;

    // variables for Proxy Construction
    //
    address masterCopy;
    address public newMasterCopy;
    // Time when new masterCopy is updatabale
    uint public masterCopyCountdown;

    // > Storage
    // auctioneer has the power to manage some variables
    address public auctioneer;
    // Ether ERC-20 token
    address public ethToken;
    // Price Oracle interface
    PriceOracleInterface public ethUSDOracle;
    // Price Oracle interface proposals during update process
    PriceOracleInterface public newProposalEthUSDOracle;
    uint public oracleInterfaceCountdown;
    // Minimum required sell funding for adding a new token pair, in USD
    uint public thresholdNewTokenPair;
    // Minimum required sell funding for starting antoher auction, in USD
    uint public thresholdNewAuction;
    // Fee reduction token (magnolia, ERC-20 token)
    TokenFRT public frtToken;
    // Token for paying fees
    TokenOWL public owlToken;

    // mapping that stores the tokens, which are approved
    // Token => approved
    // Only tokens approved by auctioneer generate frtToken tokens
    mapping (address => bool) public approvedTokens;

    // For the following two mappings, there is one mapping for each token pair
    // The order which the tokens should be called is smaller, larger
    // These variables should never be called directly! They have getters below
    // Token => Token => index
    mapping (address => mapping (address => uint)) public latestAuctionIndices;
    // Token => Token => time
    mapping (address => mapping (address => uint)) public auctionStarts;

    // Token => Token => auctionIndex => price
    mapping (address => mapping (address => mapping (uint => fraction))) public closingPrices;

    // Token => Token => amount
    mapping (address => mapping (address => uint)) public sellVolumesCurrent;
    // Token => Token => amount
    mapping (address => mapping (address => uint)) public sellVolumesNext;
    // Token => Token => amount
    mapping (address => mapping (address => uint)) public buyVolumes;

    // Token => user => amount
    // balances stores a user's balance in the DutchX
    mapping (address => mapping (address => uint)) public balances;

    // Token => Token => auctionIndex => amount
    mapping (address => mapping (address => mapping (uint => uint))) public extraTokens;

    // Token => Token =>  auctionIndex => user => amount
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public sellerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public buyerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public claimedAmounts;

    // > Modifiers
    modifier onlyAuctioneer() {
        // Only allows auctioneer to proceed
        // R1
        require(msg.sender == auctioneer);
        _;
    }

    /// @dev Constructor-Function creates exchange
    /// @param _frtToken - address of frtToken ERC-20 token
    /// @param _owlToken - address of owlToken ERC-20 token
    /// @param _auctioneer - auctioneer for managing interfaces
    /// @param _ethToken - address of ETH ERC-20 token
    /// @param _ethUSDOracle - address of the oracle contract for fetching feeds
    /// @param _thresholdNewTokenPair - Minimum required sell funding for adding a new token pair, in USD
    function setupDutchExchange(
        TokenFRT _frtToken,
        TokenOWL _owlToken,
        address _auctioneer,
        address _ethToken,
        PriceOracleInterface _ethUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
        public
    {
        // Make sure contract hasn't been initialised
        require(ethToken == 0);

        // Validates inputs
        require(address(_owlToken) != address(0));
        require(address(_frtToken) != address(0));
        require(_auctioneer != 0);
        require(_ethToken != 0);
        require(address(_ethUSDOracle) != address(0));

        frtToken = _frtToken;
        owlToken = _owlToken;
        auctioneer = _auctioneer;
        ethToken = _ethToken;
        ethUSDOracle = _ethUSDOracle;
        thresholdNewTokenPair = _thresholdNewTokenPair;
        thresholdNewAuction = _thresholdNewAuction;
    }

    //@ dev returns price in units [token2]/[token1]
    //@ param token1 first token for price calculation
    //@ param token2 second token for price calculation
    //@ param auctionIndex index for the auction to get the averaged price from
    function getPriceInPastAuction(
        address token1,
        address token2,
        uint auctionIndex
    )
        public
        view
        // price < 10^31
        returns (uint num, uint den)
    {
       if (token1 == token2) {
            // C1
            num = 1;
            den = 1;
        } else {
            // C2
            // R2.1
            require(auctionIndex >= 0);


            // C3
            // R3.1
            require(auctionIndex <= getAuctionIndex(token1, token2));
            // auction still running

            uint i = 0;
            bool correctPair = false;
            fraction memory closingPriceToken1;
            fraction memory closingPriceToken2;

            while (!correctPair) {
                closingPriceToken2 = closingPrices[token2][token1][auctionIndex - i];
                closingPriceToken1 = closingPrices[token1][token2][auctionIndex - i];

                if (closingPriceToken1.num > 0 && closingPriceToken1.den > 0 ||
                    closingPriceToken2.num > 0 && closingPriceToken2.den > 0)
                {
                    correctPair = true;
                }
                i++;
            }

            // At this point at least one closing price is strictly positive
            // If only one is positive, we want to output that
            if (closingPriceToken1.num == 0 || closingPriceToken1.den == 0) {
                num = closingPriceToken2.den;
                den = closingPriceToken2.num;
            } else if (closingPriceToken2.num == 0 || closingPriceToken2.den == 0) {
                num = closingPriceToken1.num;
                den = closingPriceToken1.den;
            } else {
                // If both prices are positive, output weighted average
                num = closingPriceToken2.den + closingPriceToken1.num;
                den = closingPriceToken2.num + closingPriceToken1.den;
            }
        }
    }

    // > Helper fns
    function getTokenOrder(
        address token1,
        address token2
    )
        public
        pure
        returns (address, address)
    {
        if (token2 < token1) {
            (token1, token2) = (token2, token1);
        }

        return (token1, token2);
    }



    function getAuctionIndex(
        address token1,
        address token2
    )
        public
        view
        returns (uint auctionIndex)
    {
        (token1, token2) = getTokenOrder(token1, token2);
        auctionIndex = latestAuctionIndices[token1][token2];
    }

}
