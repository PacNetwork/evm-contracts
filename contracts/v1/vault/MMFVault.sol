// SPDX-License-Identifier: MIT
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
    uint256 private constant PRICER_DECIMALS = 18;

    // Token and pricer contracts
    IERC20 public mmfToken;
    IERC20 public pacUSDToken;

    IPacUSD public pacUSD;
    IPricer public pricer;
    IPacUSDStaking public staking;

    // Last recorded price for reward calculation
    uint256 public lastPrice;
    uint256 mmfTokenDecimals;
    uint256 pacUSDDecimals;
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
     * @param ownerAddress Address to assign owner
     * @param upgrader The address to upgrade contract
     */
    function initialize(
        address mmfTokenAddress,
        address pacUSDTokenAddress,
        address pricerAddress,
        address stakingAddress,
        address ownerAddress,
        address upgrader
    ) public initializer {
        if (
            mmfTokenAddress == address(0) ||
            pacUSDTokenAddress == address(0) ||
            pricerAddress == address(0) ||
            stakingAddress == address(0) ||
            ownerAddress == address(0) ||
            upgrader == address(0)
        ) revert ZeroAddress();
        __Ownable_init(upgrader);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        mmfToken = IERC20(mmfTokenAddress);
        mmfTokenDecimals = ERC20(mmfTokenAddress).decimals();
        pacUSDToken = IERC20(pacUSDTokenAddress);
        pacUSD = IPacUSD(pacUSDTokenAddress);
        pacUSDDecimals = ERC20(pacUSDTokenAddress).decimals();
        pricer = IPricer(pricerAddress);
        staking = IPacUSDStaking(stakingAddress);
        lastPrice = pricer.getLatestPrice();
        if (lastPrice < 1 * 10 ** PRICER_DECIMALS) {
            revert InvalidPrice();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, ownerAddress);
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
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the contract
     * @dev Only callable by pauser role
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
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
        if (price < 1 * 10 ** mmfTokenDecimals) revert InvalidPrice();
        if (price != lastPrice) revert InvalidPrice();

        // Calculate PacUSD amount (1 MMF = price PacUSD)
        uint256 pacUSDAmount = (amount * price * 10 ** pacUSDDecimals) /
            (10 ** mmfTokenDecimals * 10 ** PRICER_DECIMALS);

        mmfToken.safeTransferFrom(_msgSender(), address(this), amount);
        pacUSD.mintByTx(txId, pacUSDAmount, to);

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
        if (price < 1 * 10 ** mmfTokenDecimals) revert InvalidPrice();
        if (price != lastPrice) revert InvalidPrice();

        // Calculate MMF amount (1 MMF = price PacUSD)
        uint256 mmfAmount = (amount *
            10 ** mmfTokenDecimals *
            10 ** PRICER_DECIMALS) / (price * 10 ** pacUSDDecimals);
        _totalMMFToken -= mmfAmount;
        pacUSDToken.safeTransferFrom(_msgSender(), address(this), amount);
        pacUSD.burnByTx(txId, amount, address(this));
        mmfToken.safeTransfer(to, mmfAmount);

        emit RedeemMMF(_msgSender(), txId, to, timestamp, amount, mmfAmount);
    }

    /**
     * @notice Distributes rewards based on price changes
     * @dev Callable by anyone, mints PacUSD rewards and updates staking
     */
    function mintReward() public whenNotPaused nonReentrant {
        uint256 currentPrice = pricer.getLatestPrice();
        if (currentPrice < 1 * 10 ** mmfTokenDecimals) revert InvalidPrice();
        if (currentPrice > lastPrice) {
            uint256 balance = mmfToken.balanceOf(address(this));
            if (balance > uint256(0)) {
                uint256 priceDifference = currentPrice - lastPrice;
                uint256 rewardAmount = (priceDifference *
                    balance *
                    10 ** pacUSDDecimals) /
                    (10 ** mmfTokenDecimals * 10 ** PRICER_DECIMALS);
                uint256 tempLastPrice = lastPrice;
                lastPrice = currentPrice;
                staking.update();
                pacUSD.mintReward(rewardAmount, address(staking));
                emit RewardMinted(
                    address(staking),
                    rewardAmount,
                    tempLastPrice,
                    currentPrice,
                    balance
                );
            } else {
                lastPrice = currentPrice; //need update price
                staking.update(); //need invoke update
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
