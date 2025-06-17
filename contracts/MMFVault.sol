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
import {IPacUSD} from "./interface/IPacUSD.sol";
import {IPricer} from "./interface/IPricer.sol";
import {IStaking} from "./interface/IStaking.sol";
import {IMMFVault} from "./interface/IMMFVault.sol";

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

    // Role definitions
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Token and pricer contracts
    IERC20 public mmfToken;
    IERC20 public pacUSDToken;

    IPacUSD public pacUSD;
    IPricer public pricer;
    IStaking public staking;

    // Last recorded price for reward calculation
    uint256 public lastPrice;
    uint256 mmfTokenDecimals;

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
     * @param adminAddress Address to assign admin and pauser roles
     */
    function initialize(
        address mmfTokenAddress,
        address pacUSDTokenAddress,
        address pricerAddress,
        address stakingAddress,
        address ownerAddress,
        address adminAddress
    ) public initializer {
        if (
            mmfTokenAddress == address(0) ||
            pacUSDTokenAddress == address(0) ||
            pricerAddress == address(0) ||
            stakingAddress == address(0) ||
            ownerAddress == address(0) ||
            adminAddress == address(0)
        ) revert ZeroAddress();
        __Ownable_init(adminAddress);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        mmfToken = IERC20(mmfTokenAddress);
        mmfTokenDecimals = 10 ** ERC20(mmfTokenAddress).decimals();
        pacUSDToken = IERC20(pacUSDTokenAddress);
        pacUSD = IPacUSD(pacUSDTokenAddress);

        pricer = IPricer(pricerAddress);
        staking = IStaking(stakingAddress);
        lastPrice = pricer.getLatestPrice();
        _grantRole(DEFAULT_ADMIN_ROLE, ownerAddress);
    }

    /**
     * @notice Authorizes contract upgrades (UUPS pattern)
     * @dev Only callable by admin role
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

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
     * @notice Swaps MMF tokens for PacUSD
     * @param txId Transaction ID (block.chainid, hash of address(this), sender, amount, toAccount, timestamp)
     * @param amount Amount of MMF tokens to swap
     * @param toAccount Recipient address for PacUSD
     * @param timestamp Timestamp used in txId hash
     */
    function mintPacUSD(
        bytes32 txId,
        uint256 amount,
        address toAccount,
        uint256 timestamp
    ) external whenNotPaused nonReentrant {
        if (toAccount == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (
            txId !=
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    _msgSender(),
                    amount,
                    toAccount,
                    timestamp
                )
            )
        ) revert InvalidTxId();

        uint256 price = pricer.getLatestPrice();
        if (price == 0) revert InvalidPrice();
        if (price != lastPrice) revert InvalidPrice();

        // Calculate PacUSD amount (1 MMF = price PacUSD)
        uint256 pacUSDAmount = (amount * price) / mmfTokenDecimals;

        mmfToken.safeTransferFrom(_msgSender(), address(this), amount);
        pacUSD.mintByTx(txId, pacUSDAmount, toAccount);

        emit MintPacUSD(txId, toAccount, timestamp, amount, pacUSDAmount);
    }

    /**
     * @notice Swaps PacUSD for MMF tokens
     * @param txId Transaction ID (chainid,hash of address(this),sender,hash of sender, amount, toAccount, timestamp)
     * @param amount Amount of PacUSD to swap
     * @param toAccount Recipient address for MMF tokens
     * @param timestamp Timestamp used in txId hash
     */
    function redeemMMF(
        bytes32 txId,
        uint256 amount,
        address toAccount,
        uint256 timestamp
    ) external whenNotPaused nonReentrant {
        if (toAccount == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (
            txId !=
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    _msgSender(),
                    amount,
                    toAccount,
                    timestamp
                )
            )
        ) revert InvalidTxId();

        uint256 price = pricer.getLatestPrice();
        if (price == 0) revert InvalidPrice();
        if (price != lastPrice) revert InvalidPrice();
        // Calculate MMF amount (1 MMF = price PacUSD)
        uint256 mmfAmount = ((amount * mmfTokenDecimals) / price);

        pacUSDToken.transferFrom(_msgSender(), address(this), amount);
        pacUSD.burnByTx(txId, amount, address(this));
        mmfToken.safeTransfer(toAccount, mmfAmount);

        emit RedeemMMF(txId, toAccount, timestamp, amount, mmfAmount);
    }

    /**
     * @notice Distributes rewards based on price changes
     * @dev Callable by anyone, mints PacUSD rewards and updates staking
     */
    function mintReward() public whenNotPaused nonReentrant {
        uint256 currentPrice = pricer.getLatestPrice();
        if (currentPrice == 0) revert InvalidPrice();
        if (currentPrice > lastPrice) {
            uint256 balance = mmfToken.balanceOf(address(this));
            uint256 priceDifference = currentPrice - lastPrice;
            uint256 rewardAmount = (priceDifference * balance) /
                mmfTokenDecimals;
            pacUSD.mintReward(rewardAmount, address(staking));
            staking.update();
            lastPrice = currentPrice;
            emit RewardMinted(address(staking), rewardAmount);
        }
    }

    /**
     * @notice Grants a role to an account.
     * @dev Overrides AccessControl grantRole to include a zero address check. Only callable by the role admin.
     *      Emits a RoleGranted event.
     * @param role The role to grant.
     * @param account The address to receive the role.
     */
    function grantRole(
        bytes32 role,
        address account
    ) public override onlyRole(getRoleAdmin(role)) {
        if (account == address(0)) revert ZeroAddress();
        _grantRole(role, account);
    }

    /**
     * @notice Revokes a role from an account.
     * @dev Overrides AccessControl revokeRole to include a zero address check. Only callable by the role admin.
     *      Emits a RoleRevoked event.
     * @param role The role to revoke.
     * @param account The address to remove the role from.
     */
    function revokeRole(
        bytes32 role,
        address account
    ) public override onlyRole(getRoleAdmin(role)) {
        if (account == address(0)) revert ZeroAddress();
        _revokeRole(role, account);
    }
}
