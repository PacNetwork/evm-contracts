// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IPacUSD} from "./interfaces/IPacUSD.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/**
 * @title PacUSD
 * @notice A stablecoin contract implementing ERC20 with permit, role-based access control, pausing, blocklisting, and transaction state tracking.
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
    using SafeERC20 for IERC20;
    // Role definitions
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLOCKLISTER_ROLE = keccak256("BLOCKLISTER_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    // Minter addresses
    mapping(address => bool) private _minters;

    // Blocklist mapping to freeze individual accounts
    mapping(address => bool) private _blocklist;
    //Transaction state tracking
    uint256 private constant TX_STATE_DEFAULT = 0;
    uint256 private constant TX_STATE_AVAILABLE = 1;
    uint256 private constant TX_STATE_EXECUTED = 2;
    uint256 private constant TX_STATE_CANCELED = 3;
    mapping(bytes32 => uint256) private _mintTxs;
    mapping(bytes32 => uint256) private _burnTxs;
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the PacUSD contract with the given admin and minters.
     * @dev Sets up ERC20 token details, permit, reentrancy guard, pausability, access control, and UUPS upgradeability.
     *      Grants all roles to the default admin and configures minters. Only callable once during contract deployment.
     * @param admin Address to assign admin
     * @param upgrader The address to upgrade contract
     * @param minters An array of addresses to be granted minter privileges.
     */
    function initialize(
        address admin,
        address upgrader,
        address[] memory minters
    ) public initializer {
        if (
            admin == address(0) || upgrader == address(0) || minters.length == 0
        ) revert ZeroAddress();
        __ERC20_init("PAC USD Stablecoin", "PacUSD");
        __ERC20Permit_init("PAC USD Stablecoin");
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __Ownable_init(upgrader);
        // Set up roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        uint256 length = minters.length;
        // Set minters
        for (uint256 i; i < length; ++i) {
            if (minters[i] != address(0)) {
                _minters[minters[i]] = true;
            }
        }
    }

    /**
     * @dev Updates minter permissions
     * This function is used to grant minting permissions to a new address, and can only be called by the contract upgrader
     * When the new minter address is not the zero address, it will be added to the minters mapping with permissions granted
     *
     */
    function updateMinter(address newMinter) external onlyOwner {
        if (newMinter != address(0)) {
            _minters[newMinter] = true;
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
     * @dev Throws if argument account is blocklisted.
     * @param _account The address to check.
     */
    modifier notBlocklisted(address _account) {
        if (isBlocklisted(_account)) revert BlocklistedAccount();
        _;
    }

    /**
     * @notice Authorizes an upgrade to a new contract implementation.
     * @dev Implements UUPS upgradeability, only callable by an account with ADMIN_ROLE.
     * @param newImpl The address of the new contract implementation.
     */
    function _authorizeUpgrade(address newImpl) internal override onlyOwner {
        if (newImpl == address(0)) revert ZeroAddress();
    }

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
     * @notice Adds an account to the blocklist, preventing it from sending or receiving tokens.
     * @dev Only callable by an account with BLOCKLISTER_ROLE. Reverts if the account is the zero address.
     *      Emits a Blocklisted event.
     * @param account The address to blocklist.
     */
    //Blocklister
    function addToBlocklist(
        address account
    ) external onlyRole(BLOCKLISTER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        _blocklist[account] = true;
        emit AddToBlocklist(account);
    }

    /**
     * @notice Removes an account from the blocklist, allowing it to send and receive tokens.
     * @dev Only callable by an account with BLOCKLISTER_ROLE. Reverts if the account is the zero address.
     *      Emits an Unblocklisted event.
     * @param account The address to remove from the blocklist.
     */
    function removeFromBlocklist(
        address account
    ) external onlyRole(BLOCKLISTER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        _blocklist[account] = false;
        emit RemoveFromBlocklist(account);
    }

    /**
     * @notice Checks if an account is blocklisted.
     * @dev View function to query the blocklist status of an account.
     * @param account The address to check.
     * @return bool True if the account is blocklisted, false otherwise.
     */
    function isBlocklisted(address account) public view returns (bool) {
        return _blocklist[account];
    }

    /**
     * @notice Registers a mint transaction ID for later execution.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId already exists.
     *      Emits a MintTxSet event.
     * @param txId The unique transaction ID to register for minting.
     */
    function setMintByTx(
        bytes32 txId
    ) external whenNotPaused onlyRole(APPROVER_ROLE) {
        uint256 status = _mintTxs[txId];
        if (status != TX_STATE_DEFAULT) revert TxIdInvalid(txId, status);
        _mintTxs[txId] = TX_STATE_AVAILABLE;
        emit MintTxSet(txId);
    }

    /**
     * @notice Cancels a previously registered mint transaction ID.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId does not exist or has been executed.
     *      Emits a MintTxCancelled event.
     * @param txId The transaction ID to cancel.
     */
    function cancelMintByTx(
        bytes32 txId
    ) external whenNotPaused onlyRole(APPROVER_ROLE) {
        uint256 status = _mintTxs[txId];
        if (status != TX_STATE_AVAILABLE) revert TxIdInvalid(txId, status);
        _mintTxs[txId] = TX_STATE_CANCELED;
        emit MintTxCancelled(txId);
    }

    /**
     * @notice Mints tokens for a registered transaction ID.
     * @dev Only callable by a minter when not paused, with reentrancy protection.
     *      Reverts if the caller is not a minter, the txId is invalid or executed, the recipient is blocklisted,
     *      or the recipient is the zero address. Marks the txId as executed and emits a Mint event.
     * @param txId The transaction ID for the mint operation.
     * @param amount The amount of tokens to mint.
     * @param to The address to receive the minted tokens.
     */
    function mintByTx(
        bytes32 txId,
        uint256 amount,
        address to
    ) external onlyMinter whenNotPaused nonReentrant notBlocklisted(to) {
        uint256 status = _mintTxs[txId];
        if (status != TX_STATE_AVAILABLE) revert TxIdInvalid(txId, status);
        if (to == address(0)) revert ZeroAddress();

        _mintTxs[txId] = TX_STATE_EXECUTED;
        _mint(to, amount);
        emit Mint(to, amount);
    }

    /**
     * @notice Registers a burn transaction ID for later execution.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId already exists.
     *      Emits a BurnTxSet event.
     * @param txId The unique transaction ID to register for burning.
     */
    function setBurnByTx(
        bytes32 txId
    ) external whenNotPaused onlyRole(APPROVER_ROLE) {
        uint256 status = _burnTxs[txId];
        if (status != TX_STATE_DEFAULT) revert TxIdInvalid(txId, status);
        _burnTxs[txId] = TX_STATE_AVAILABLE;
        emit BurnTxSet(txId);
    }

    /**
     * @notice Cancels a previously registered burn transaction ID.
     * @dev Only callable by an account with APPROVER_ROLE. Reverts if the txId does not exist or has been executed.
     *      Emits a BurnTxCancelled event.
     * @param txId The transaction ID to cancel.
     */
    function cancelBurnByTx(
        bytes32 txId
    ) external whenNotPaused onlyRole(APPROVER_ROLE) {
        uint256 status = _burnTxs[txId];
        if (status != TX_STATE_AVAILABLE) revert TxIdInvalid(txId, status);
        _burnTxs[txId] = TX_STATE_CANCELED;
        emit BurnTxCancelled(txId);
    }

    /**
     * @notice Burns tokens for a registered transaction ID.
     * @dev Only callable by a minter when not paused, with reentrancy protection.
     *      Reverts if the caller is not a minter, the txId is invalid or executed, the sender is blocklisted,
     *      the sender is the zero address, or the sender has insufficient balance.
     *      Marks the txId as executed and emits a Burn event.
     * @param txId The transaction ID for the burn operation.
     * @param amount The amount of tokens to burn.
     * @param from The address from which to burn tokens.
     */
    function burnByTx(
        bytes32 txId,
        uint256 amount,
        address from
    ) external onlyMinter notBlocklisted(from) whenNotPaused nonReentrant {
        uint256 status = _burnTxs[txId];
        if (status != TX_STATE_AVAILABLE) revert TxIdInvalid(txId, status);
        if (from == address(0)) revert ZeroAddress();
        if (balanceOf(from) < amount) revert InsufficientBalance();

        _burnTxs[txId] = TX_STATE_EXECUTED;
        _burn(from, amount);
        emit Burn(from, amount);
    }

    /**
     * @notice Mints reward tokens to a specified address.
     * @dev Only callable by an account with APPROVER_ROLE when not paused, with reentrancy protection.
     *      Reverts if the recipient is the zero address or blocklisted. Emits a MintReward event.
     * @param amount The amount of tokens to mint as a reward.
     * @param to The address to receive the reward tokens.
     */
    function mintReward(
        uint256 amount,
        address to
    ) external onlyMinter whenNotPaused notBlocklisted(to) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
        emit MintReward(to, amount);
    }

    /**
     * @notice Mints PacUSD tokens specifically for fee distribution purposes
     * @dev This function is restricted to accounts with the `onlyMinter` role, ensuring only authorized contracts (e.g., MMFVault)
     *      can mint tokens for fee-related use cases. It includes core security checks (zero-address prevention, pause state,
     *      blocklist validation) and follows non-reentrant design to avoid reentrancy attacks.
     * @param amount The quantity of PacUSD tokens to mint (must be non-zero, though zero check may be handled by underlying `_mint` logic)
     * @param to The recipient address that will receive the minted PacUSD tokens (fee receiver, typically a designated account)
     */
    function mintFee(
        uint256 amount,
        address to
    ) external onlyMinter whenNotPaused notBlocklisted(to) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
        emit MintFee(to, amount);
    }

    /**
     * @dev Emergency withdrawal of tokens held by the contract, designed to handle exceptional
     * situations such as tokens being locked or stuck. This method can only be called by
     * addresses with the RESCUER_ROLE and prevents transfers to blocklisted addresses.
     *
     * @param tokenContract The address of the token contract to be rescued
     * @param to The recipient address for the tokens
     * @param amount The amount of tokens to rescue
     *
     * @notice This function is for emergency use only and may result in funds being transferred
     * from the contract to the specified address. Exercise caution when invoking.
     *
     * @custom:security This method is protected by role-based access control and reentrancy guards.
     * Callers must ensure transfers comply with the project's governance policies.
     *
     * Requirements:
     * - Caller must have the RESCUER_ROLE.
     * - Recipient address cannot be the zero address.
     * - Amount must be greater than zero.
     * - Recipient address must not be blocklisted.
     *
     * Emits a {TokensRescued} event upon successful execution.
     */
    function rescueTokens(
        IERC20 tokenContract,
        address to,
        uint256 amount
    ) external onlyRole(RESCUER_ROLE) notBlocklisted(to) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (tokenContract.balanceOf(address(this)) < amount)
            revert InsufficientBalance();
        tokenContract.safeTransfer(to, amount);
        emit TokensRescued(tokenContract, to, amount);
    }

    /**
     * @notice Transfers tokens to a specified address.
     * @dev Overrides ERC20 transfer to include pause and blocklist checks. Reverts if the contract is paused,
     *      the sender or recipient is blocklisted. Emits a Transfer event.
     * @param to The address to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     * @return bool True if the transfer succeeds.
     */
    function transfer(
        address to,
        uint256 amount
    )
        public
        override
        whenNotPaused
        notBlocklisted(_msgSender())
        notBlocklisted(to)
        returns (bool)
    {
        return super.transfer(to, amount);
    }

    /**
     * @notice Transfers tokens from one address to another using an allowance.
     * @dev Overrides ERC20 transferFrom to include pause and blocklist checks. Reverts if the contract is paused,
     *      the sender or recipient is blocklisted. Emits a Transfer event.
     * @param from The address to transfer tokens from.
     * @param to The address to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     * @return bool True if the transfer succeeds.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    )
        public
        override
        whenNotPaused
        notBlocklisted(from)
        notBlocklisted(to)
        returns (bool)
    {
        return super.transferFrom(from, to, amount);
    }

    /**
     * @dev Sets `value` as the allowance of `spender` over the caller's tokens.
     * This override includes pause and blocklist checks before delegating to the parent implementation.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     * - The caller and `spender` must not be blocklisted.
     *
     * @param spender The address authorized to spend the tokens.
     * @param value The maximum amount of tokens that can be spent.
     * @return Always returns `true` as specified by the ERC20 standard.
     */
    function approve(
        address spender,
        uint256 value
    )
        public
        override
        whenNotPaused
        notBlocklisted(msg.sender)
        notBlocklisted(spender)
        returns (bool)
    {
        return super.approve(spender, value);
    }

    /**
     * @dev Performs EIP-2612 signature validation to approve `spender` to transfer `value` tokens
     * from `owner`'s account, using the provided signature components.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     * - `owner` and `spender` must not be blocklisted.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r`, and `s` must be a valid ECDSA signature from `owner`.
     *
     * @param owner The address that owns the tokens.
     * @param spender The address authorized to spend the tokens.
     * @param value The maximum amount of tokens that can be spent.
     * @param deadline The time by which the signature must be used (unix timestamp).
     * @param v The recovery id of the ECDSA signature.
     * @param r The first 32 bytes of the ECDSA signature.
     * @param s The second 32 bytes of the ECDSA signature.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        public
        override
        whenNotPaused
        notBlocklisted(owner)
        notBlocklisted(spender)
    {
        super.permit(owner, spender, value, deadline, v, r, s);
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

    /**
     * @notice implementation version.
     */
    function version() external pure virtual returns (string memory) {
        return "v1";
    }
}
