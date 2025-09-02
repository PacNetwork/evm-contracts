// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IMMFVault} from "./interfaces/IMMFVault.sol";
import {IPricer} from "../../interfaces/IPricer.sol";
import {IPacUSD} from "../pacusd/interfaces/IPacUSD.sol";
import {IPacUSDStaking} from "../staking/interfaces/IPacUSDStaking.sol";

/**
 * @title MMFVault
 * @notice Contract for swapping MMF tokens for PacUSD and vice versa, with reward distribution
 * @dev Uses UUPS upgrade pattern, OpenZeppelin SafeERC20, and IPricer for price data
 */
contract MMFVault is
    IMMFVault,
    Initializable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 private constant PRICER_PRECISION = 10 ** 18;
    uint256 private constant FEE_PRECISION = 10 ** 18; // 1e18 = 100% fee, 1e16 = 1% fee
    uint256 private constant MAX_FEE_RATE = 25 * 10 ** 16; //25% fee

    // Token and pricer contracts
    IERC20 public mmfToken;
    IERC20 public pacUSDToken;

    IPacUSD public pacUSD;
    IPricer public pricer;
    IPacUSDStaking public staking;

    address public feeReceiver; // Address to receive collected fees
    uint256 public mintFeeRate; // Fee rate for mintPacUSD (MMF → PacUSD), in FEE_PRECISION
    uint256 public redeemFeeRate; // Fee rate for redeemMMF (PacUSD → MMF), in FEE_PRECISION

    // Last recorded price for reward calculation
    uint256 public lastPrice;
    uint256 mmfTokenPrecision;
    uint256 pacUSDPrecision;
    uint256 _totalMMFToken;
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with MMF, PacUSD, and pricer addresses
     * @param mmfTokenAddress Address of the MMF token contract
     * @param pacUSDTokenAddress Address of the PacUSD token contract
     * @param pricerAddress Address of the pricer contract
     * @param admin Address to assign admin
     * @param upgrader The address to upgrade contract
     */
    function initialize(
        address mmfTokenAddress,
        address pacUSDTokenAddress,
        address pricerAddress,
        address stakingAddress,
        address admin,
        address upgrader
    ) public initializer {
        if (
            mmfTokenAddress == address(0) ||
            pacUSDTokenAddress == address(0) ||
            pricerAddress == address(0) ||
            stakingAddress == address(0) ||
            admin == address(0) ||
            upgrader == address(0)
        ) revert ZeroAddress();
        __Ownable_init(upgrader);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        mmfToken = IERC20(mmfTokenAddress);
        mmfTokenPrecision = 10 ** ERC20(mmfTokenAddress).decimals();
        pacUSDToken = IERC20(pacUSDTokenAddress);
        pacUSD = IPacUSD(pacUSDTokenAddress);
        pacUSDPrecision = 10 ** ERC20(pacUSDTokenAddress).decimals();
        pricer = IPricer(pricerAddress);
        staking = IPacUSDStaking(stakingAddress);
        lastPrice = pricer.getLatestPrice();
        if (lastPrice < PRICER_PRECISION) {
            revert InvalidPrice();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice Authorizes contract upgrades (UUPS pattern)
     * @dev Only callable by admin role
     */
    function _authorizeUpgrade(address newImpl) internal override onlyOwner {
        if (newImpl == address(0)) revert ZeroAddress();
    }

    /**
     * @notice Pauses the contract
     * @dev Only callable by pauser role
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the contract
     * @dev Only callable by pauser role
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Updates the fee receiver address
     * @dev Only callable by  DEFAULT_ADMIN_ROLE
     * @param newFeeReceiver New address to receive fees (cannot be zero)
     */
    function updateFeeReceiver(
        address newFeeReceiver
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeReceiver == address(0)) revert ZeroAddress();
        emit FeeReceiverUpdated(feeReceiver, newFeeReceiver);
        feeReceiver = newFeeReceiver;
    }

    /**
     * @notice Updates the fee rate for mintPacUSD (MMF → PacUSD)
     * @dev Only callable by  DEFAULT_ADMIN_ROLE
     * @param newMintFeeRate New fee rate (1e18 = 100%, use FEE_PRECISION for scaling)
     */
    function updateMintFeeRate(
        uint256 newMintFeeRate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeReceiver == address(0)) revert FeeReceiverRequired();
        if (newMintFeeRate > MAX_FEE_RATE) revert FeeRateExceedsMax();
        emit MintFeeRateUpdated(mintFeeRate, newMintFeeRate);
        mintFeeRate = newMintFeeRate;
    }

    /**
     * @notice Updates the fee rate for redeemMMF (PacUSD → MMF)
     * @dev Only callable by  DEFAULT_ADMIN_ROLE
     * @param newRedeemFeeRate New fee rate (1e18 = 100%, use FEE_PRECISION for scaling)
     */
    function updateRedeemFeeRate(
        uint256 newRedeemFeeRate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeReceiver == address(0)) revert FeeReceiverRequired();
        if (newRedeemFeeRate > MAX_FEE_RATE) revert FeeRateExceedsMax();
        emit RedeemFeeRateUpdated(redeemFeeRate, newRedeemFeeRate);
        redeemFeeRate = newRedeemFeeRate;
    }

    /**
     * @notice Swaps MMF tokens for PacUSD
     * @param txId Transaction ID (block.chainid, hash of address(this), sender, amount, toAccount, timestamp)
     * @param amount Amount of MMF tokens to swap
     * @param to Recipient address for PacUSD
     * @param timestamp Timestamp used in txId hash
     */
    function mintPacUSD(
        bytes32 txId,
        uint256 amount,
        address to,
        uint256 timestamp
    ) external whenNotPaused nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (
            txId !=
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    _msgSender(),
                    amount,
                    to,
                    timestamp
                )
            )
        ) revert InvalidTxId();
        _totalMMFToken += amount;
        uint256 price = pricer.getLatestPrice();
        if (price < lastPrice) revert InvalidPrice();
        if (price > lastPrice) revert RewardNotMinted();

        // Calculate PacUSD amount (1 MMF = price PacUSD)
        uint256 pacUSDAmount = (amount * price * pacUSDPrecision) /
            mmfTokenPrecision /
            PRICER_PRECISION;

        uint256 mintFee = (pacUSDAmount * mintFeeRate) / FEE_PRECISION;
        if (mintFee > pacUSDAmount) revert FeeCalculationFailed();
        uint256 finalPacUSDAmount = pacUSDAmount - mintFee;

        mmfToken.safeTransferFrom(_msgSender(), address(this), amount);
        pacUSD.mintByTx(txId, finalPacUSDAmount, to);

        if (mintFee > 0) {
            pacUSD.mintFee(mintFee, feeReceiver);
            emit MintFeeCollected(_msgSender(), txId, mintFee, feeReceiver);
        }

        emit MintPacUSD(
            _msgSender(),
            txId,
            to,
            timestamp,
            amount,
            pacUSDAmount
        );
    }

    /**
     * @notice Swaps PacUSD for MMF tokens
     * @param txId Transaction ID (chainid,hash of address(this),sender,hash of sender, amount, to, timestamp)
     * @param amount Amount of PacUSD to swap
     * @param to Recipient address for MMF tokens
     * @param timestamp Timestamp used in txId hash
     */
    function redeemMMF(
        bytes32 txId,
        uint256 amount,
        address to,
        uint256 timestamp
    ) external whenNotPaused nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (
            txId !=
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    _msgSender(),
                    amount,
                    to,
                    timestamp
                )
            )
        ) revert InvalidTxId();

        uint256 price = pricer.getLatestPrice();
        if (price < lastPrice) revert InvalidPrice();
        if (price > lastPrice) revert RewardNotMinted();

        uint256 redeemFee = (amount * redeemFeeRate) / FEE_PRECISION;
        if (redeemFee > amount) revert FeeCalculationFailed();

        // Calculate MMF amount (1 MMF = price PacUSD)
        uint256 finalAmount = amount - redeemFee;

        uint256 mmfAmount = (finalAmount *
            mmfTokenPrecision *
            PRICER_PRECISION) /
            price /
            pacUSDPrecision;
        if (mmfAmount > _totalMMFToken) {
            revert InsufficientBalance();
        }
        _totalMMFToken -= mmfAmount;

        pacUSDToken.safeTransferFrom(_msgSender(), address(this), amount);

        pacUSD.burnByTx(txId, finalAmount, address(this));

        if (redeemFee > 0) {
            pacUSDToken.safeTransfer(feeReceiver, redeemFee);
            emit RedeemFeeCollected(_msgSender(), txId, redeemFee, feeReceiver);
        }

        mmfToken.safeTransfer(to, mmfAmount);

        emit RedeemMMF(_msgSender(), txId, to, timestamp, amount, mmfAmount);
    }

    /**
     * @dev Mints rewards for stakers based on price increases
     *
     * This function is called by an administrator to calculate and distribute rewards
     * to the staking contract when the latest price is higher than the last recorded price.
     * The reward amount is calculated based on the price difference, total staked MMF tokens,
     * and precision conversion factors.
     *
     * Restrictions:
     * - Contract must not be paused (whenNotPaused)
     * - Protected against reentrancy attacks (nonReentrant)
     * - Only callable by addresses with DEFAULT_ADMIN_ROLE (onlyRole)
     *
     * @param rewardPrice The price provided by the caller, which must match the latest price
     *                    to ensure accuracy
     *
     */
    function mintReward(
        uint256 rewardPrice
    ) public whenNotPaused nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 currentPrice = pricer.getLatestPrice();
        if (rewardPrice != currentPrice) revert MismatchPrice();
        if (currentPrice < lastPrice) revert InvalidPrice();
        if (currentPrice == lastPrice) return; // No price change, no reward
        if (currentPrice > lastPrice) {
            if (_totalMMFToken > uint256(0)) {
                uint256 priceDifference = currentPrice - lastPrice;
                uint256 rewardAmount = (priceDifference *
                    _totalMMFToken *
                    pacUSDPrecision) /
                    mmfTokenPrecision /
                    PRICER_PRECISION;
                uint256 tempLastPrice = lastPrice;
                lastPrice = currentPrice;
                staking.distributeReward(rewardAmount);
                pacUSD.mintReward(rewardAmount, address(staking));
                emit RewardMinted(
                    address(staking),
                    rewardAmount,
                    tempLastPrice,
                    currentPrice,
                    _totalMMFToken
                );
            } else {
                lastPrice = currentPrice; //need update price
            }
        }
    }

    /**
     * @notice Retrieve the total amount of MMF tokens stored in the Vault through swaps by all users
     * @dev This function queries and returns the cumulative balance of MMF tokens that all users have deposited into the designated Vault contract via token swaps
     * @return A uint256 value representing the total quantity of MMF tokens currently held in the Vault
     */
    function totalMMFToken() external view returns (uint256) {
        return _totalMMFToken;
    }

    /**
     * @notice implementation version.
     */
    function version() external pure virtual returns (string memory) {
        return "v1";
    }
}
