// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IPacUSD} from "./interface/IPacUSD.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/**
 * @title PacUSD
 * @notice A stablecoin contract implementing ERC20 with permit, role-based access control, pausing, blacklisting, and transaction state tracking.
 * @dev Inherits from OpenZeppelin upgradeable contracts for ERC20, permit, reentrancy guard, pausability, access control, and UUPS upgradeability.
 *      Implements IPacUSD interface for minting, burning, and rewarding functionality.
 */
contract PacUSD is
    Initializable,
    ERC20PermitUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable,
    IPacUSD
{
    // Role definitions
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    // Minter addresses
    mapping(address => bool) private _minters;

    // Blacklist mapping to freeze individual accounts
    mapping(address => bool) private _blacklist;
    //Transaction state tracking
    uint256 public constant TransactionState_NOEXIST = 0;
    uint256 public constant TransactionState_EXIST = 1;
    uint256 public constant TransactionState_EXECUTED = 2;
    uint256 public constant TransactionState_CANCELED = 3;
    mapping(bytes32 => uint256) private _mintTxs;
    mapping(bytes32 => uint256) private _burnTxs;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the PacUSD contract with the given admin and minters.
     * @dev Sets up ERC20 token details, permit, reentrancy guard, pausability, access control, and UUPS upgradeability.
     *      Grants all roles to the default admin and configures minters. Only callable once during contract deployment.
     * @param ownerAddress The address to receive all roles (ADMIN, OWNER, PAUSER, BLACKLISTER, APPROVER, RESCUER).
     * @param adminAddress The address to upgrade contract
     * @param minters An array of addresses to be granted minter privileges.
     */
    function initialize(
        address ownerAddress,
        address adminAddress,
        address[] memory minters
    ) public initializer {

        __ERC20_init("PAC USD Stablecoin", "PacUSD");
        __ERC20Permit_init("PAC USD Stablecoin");
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
         __Ownable_init(adminAddress);
        // Set up roles
        _grantRole(DEFAULT_ADMIN_ROLE, ownerAddress);

        // Set minters
        for (uint256 i = 0; i < minters.length; i++) {
            if (minters[i] != address(0)) {
                _minters[minters[i]] = true;
            }
        }
    }

  
    /**
     * @dev Modifier that only minter can call
     */
    modifier onlyMinter() {
        if (!_minters[_msgSender()]) revert NotMinter();
        _;
    }

    /**
     * @notice Authorizes an upgrade to a new contract implementation.
     * @dev Implements UUPS upgradeability, only callable by an account with ADMIN_ROLE.
     * @param newImplementation The address of the new contract implementation.
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    /**
     * @notice Pauses the contract, preventing transfers, minting, burning, and rescuing.
     * @dev Only callable by an account with PAUSER_ROLE. Emits a Paused event.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the contract, allowing transfers, minting, burning, and rescuing.
     * @dev Only callable by an account with PAUSER_ROLE. Emits an Unpaused event.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Adds an account to the blacklist, preventing it from sending or receiving tokens.
     * @dev Only callable by an account with BLACKLISTER_ROLE. Reverts if the account is the zero address.
     *      Emits a Blacklisted event.
     * @param account The address to blacklist.
     */
    function blacklist(address account) external onlyRole(BLACKLISTER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        _blacklist[account] = true;
        emit Blacklisted(account);
    }

    /**
     * @notice Removes an account from the blacklist, allowing it to send and receive tokens.
     * @dev Only callable by an account with BLACKLISTER_ROLE. Reverts if the account is the zero address.
     *      Emits an Unblacklisted event.
     * @param account The address to remove from the blacklist.
     */
    function unblacklist(address account) external onlyRole(BLACKLISTER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        _blacklist[account] = false;
        emit Unblacklisted(account);
    }

    /**
     * @notice Checks if an account is blacklisted.
     * @dev View function to query the blacklist status of an account.
     * @param account The address to check.
     * @return bool True if the account is blacklisted, false otherwise.
     */
    function isBlacklisted(address account) public view returns (bool) {
        return _blacklist[account];
    }

    /**
     * @notice Registers a mint transaction ID for later execution.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId already exists.
     *      Emits a MintTxSet event.
     * @param txId The unique transaction ID to register for minting.
     */
    function setMintByTx(bytes32 txId) external onlyRole(APPROVER_ROLE) {
        if (_mintTxs[txId] != TransactionState_NOEXIST) revert TxIdInvalid();
        _mintTxs[txId] = TransactionState_EXIST;
        emit MintTxSet(txId);
    }

    /**
     * @notice Cancels a previously registered mint transaction ID.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId does not exist or has been executed.
     *      Emits a MintTxCancelled event.
     * @param txId The transaction ID to cancel.
     */
    function cancelMintByTx(bytes32 txId) external onlyRole(APPROVER_ROLE) {
        if (_mintTxs[txId] != TransactionState_EXIST) revert TxIdInvalid();
        _mintTxs[txId] = TransactionState_CANCELED;
        emit MintTxCancelled(txId);
    }

    /**
     * @notice Mints tokens for a registered transaction ID.
     * @dev Only callable by a minter when not paused, with reentrancy protection.
     *      Reverts if the caller is not a minter, the txId is invalid or executed, the recipient is blacklisted,
     *      or the recipient is the zero address. Marks the txId as executed and emits a Mint event.
     * @param txId The transaction ID for the mint operation.
     * @param amount The amount of tokens to mint.
     * @param toAccount The address to receive the minted tokens.
     */
    function mintByTx(
        bytes32 txId,
        uint256 amount,
        address toAccount
    ) external onlyMinter whenNotPaused nonReentrant {
        if (_mintTxs[txId] != TransactionState_EXIST) revert TxIdInvalid();
        if (toAccount == address(0)) revert ZeroAddress();
        if (isBlacklisted(toAccount)) revert BlacklistedRecipient();

        _mintTxs[txId] = TransactionState_EXECUTED;
        _mint(toAccount, amount);
        emit Mint(toAccount, amount);
    }

    /**
     * @notice Registers a burn transaction ID for later execution.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId already exists.
     *      Emits a BurnTxSet event.
     * @param txId The unique transaction ID to register for burning.
     */
    function setBurnByTx(bytes32 txId) external onlyRole(APPROVER_ROLE) {
        if (_burnTxs[txId] != TransactionState_NOEXIST) revert TxIdInvalid();
        _burnTxs[txId] = TransactionState_EXIST;
        emit BurnTxSet(txId);
    }

    /**
     * @notice Cancels a previously registered burn transaction ID.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId does not exist or has been executed.
     *      Emits a BurnTxCancelled event.
     * @param txId The transaction ID to cancel.
     */
    function cancelBurnByTx(bytes32 txId) external onlyRole(APPROVER_ROLE) {
        if (_burnTxs[txId] != TransactionState_EXIST) revert TxIdInvalid();
        _burnTxs[txId] = TransactionState_CANCELED;
        emit BurnTxCancelled(txId);
    }

    /**
     * @notice Burns tokens for a registered transaction ID.
     * @dev Only callable by a minter when not paused, with reentrancy protection.
     *      Reverts if the caller is not a minter, the txId is invalid or executed, the sender is blacklisted,
     *      the sender is the zero address, or the sender has insufficient balance.
     *      Marks the txId as executed and emits a Burn event.
     * @param txId The transaction ID for the burn operation.
     * @param amount The amount of tokens to burn.
     * @param fromAccount The address from which to burn tokens.
     */
    function burnByTx(
        bytes32 txId,
        uint256 amount,
        address fromAccount
    ) external onlyMinter whenNotPaused nonReentrant {
        if (_burnTxs[txId] != TransactionState_EXIST) revert TxIdInvalid();
        if (fromAccount == address(0)) revert ZeroAddress();
        if (isBlacklisted(fromAccount)) revert BlacklistedSender();
        if (balanceOf(fromAccount) < amount) revert InsufficientBalance();

        _burnTxs[txId] = TransactionState_EXECUTED;
        _burn(fromAccount, amount);
        emit Burn(fromAccount, amount);
    }

    /**
     * @notice Mints reward tokens to a specified address.
     * @dev Only callable by an account with APPROVER_ROLE when not paused, with reentrancy protection.
     *      Reverts if the recipient is the zero address or blacklisted. Emits a MintReward event.
     * @param amount The amount of tokens to mint as a reward.
     * @param to The address to receive the reward tokens.
     */
    function mintReward(
        uint256 amount,
        address to
    ) external onlyMinter whenNotPaused nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (isBlacklisted(to)) revert BlacklistedRecipient();
        _mint(to, amount);
        emit MintReward(to, amount);
    }

    /**
     * @notice Rescues tokens from a blacklisted account or the contract itself.
     * @dev Only callable by an account with RESCUER_ROLE, with reentrancy protection.
     *      Reverts if the recipient is the zero address, the amount is zero, the source is not blacklisted
     *      (unless it's the contract itself), or the source has insufficient balance.
     *      Emits a TokensRescued event.
     * @param from The address to rescue tokens from (contract or blacklisted account).
     * @param to The address to receive the rescued tokens.
     * @param amount The amount of tokens to rescue.
     */
    function rescueTokens(
        address from,
        address to,
        uint256 amount
    ) external onlyRole(RESCUER_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InsufficientBalance();
        if (from != address(this) && !isBlacklisted(from))
            revert InvalidRescueSource();
        if (isBlacklisted(to)) revert BlacklistedRecipient();

        if (balanceOf(from) < amount) revert InsufficientBalance();

        if (from == address(this)) {
            _transfer(address(this), to, amount);
        } else {
            _forceTransfer(from, to, amount);
        }

        emit TokensRescued(from, to, amount);
    }

    /**
     * @notice Internal function to forcibly transfer tokens from one account to another.
     * @dev Bypasses standard transfer checks, used for rescuing tokens from blacklisted accounts.
     *      Updates token balances directly via _update.
     * @param from The address to transfer tokens from.
     * @param to The address to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     */
    function _forceTransfer(address from, address to, uint256 amount) internal {
        _update(from, to, amount);
    }

    /**
     * @notice Transfers tokens to a specified address.
     * @dev Overrides ERC20 transfer to include pause and blacklist checks. Reverts if the contract is paused,
     *      the sender or recipient is blacklisted. Emits a Transfer event.
     * @param to The address to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     * @return bool True if the transfer succeeds.
     */
    function transfer(
        address to,
        uint256 amount
    ) public override whenNotPaused returns (bool) {
        if (isBlacklisted(_msgSender())) revert BlacklistedSender();
        if (isBlacklisted(to)) revert BlacklistedRecipient();
        return super.transfer(to, amount);
    }

    /**
     * @notice Transfers tokens from one address to another using an allowance.
     * @dev Overrides ERC20 transferFrom to include pause and blacklist checks. Reverts if the contract is paused,
     *      the sender or recipient is blacklisted. Emits a Transfer event.
     * @param from The address to transfer tokens from.
     * @param to The address to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     * @return bool True if the transfer succeeds.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override whenNotPaused returns (bool) {
        if (isBlacklisted(from)) revert BlacklistedSender();
        if (isBlacklisted(to)) revert BlacklistedRecipient();
        return super.transferFrom(from, to, amount);
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

    /**
     * @notice Checks if an account has minter privileges.
     * @dev View function to query the minter status of an account.
     * @param account The address to check.
     * @return bool True if the account is a minter, false otherwise.
     */
    function isMinter(address account) public view returns (bool) {
        return _minters[account];
    }
}
