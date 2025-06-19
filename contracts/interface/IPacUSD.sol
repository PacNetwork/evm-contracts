// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IPacUSD Interface
 * @notice Defines external interaction methods for the PacUSD stablecoin contract
 * @dev Contains declarations for all publicly accessible contract methods, used for interface-based calls and standardization
 */
interface IPacUSD {
    // Custom errors
    error ZeroAddress();
    error BlacklistedRecipient();
    error BlacklistedSender();
    error InsufficientBalance();
    error InvalidRescueSource();
    error NotMinter();
    error TxIdInvalid();
    error ZeroAmount();

    // Event definitions
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);
    event TokensRescued(address indexed to, uint256 amount);
    event MintTxSet(bytes32 indexed txId);
    event MintTxCancelled(bytes32 indexed txId);
    event BurnTxSet(bytes32 indexed txId);
    event BurnTxCancelled(bytes32 indexed txId);
    event MintReward(address indexed to, uint256 amount);

    /**
     * @notice Pauses the contract, preventing transfers, minting, burning, and rescues
     * @dev Only callable by accounts with PAUSER_ROLE, emits a Paused event
     */
    function pause() external;

    /**
     * @notice Unpauses the contract, resuming normal operations
     * @dev Only callable by accounts with PAUSER_ROLE, emits an Unpaused event
     */
    function unpause() external;

    /**
     * @notice Adds an account to the blacklist, preventing token transfers
     * @dev Only callable by accounts with BLACKLISTER_ROLE, rejects zero addresses
     * @param account The address to blacklist
     */
    function blacklist(address account) external;

    /**
     * @notice Removes an account from the blacklist, restoring token transfer privileges
     * @dev Only callable by accounts with BLACKLISTER_ROLE, rejects zero addresses
     * @param account The address to unblacklist
     */
    function unblacklist(address account) external;

    /**
     * @notice Checks if an account is blacklisted
     * @dev View function returning the blacklist status of an account
     * @param account The address to check
     * @return bool True if the account is blacklisted, false otherwise
     */
    function isBlacklisted(address account) external view returns (bool);

    /**
     * @notice Registers a mint transaction ID for future execution
     * @dev Only callable by accounts with APPROVER_ROLE, requires unique txId
     * @param txId The unique transaction ID to register
     */
    function setMintByTx(bytes32 txId) external;

    /**
     * @notice Cancels a registered mint transaction ID
     * @dev Only callable by accounts with APPROVER_ROLE, only cancels unexecuted IDs
     * @param txId The transaction ID to cancel
     */
    function cancelMintByTx(bytes32 txId) external;

    /**
     * @notice Executes a registered mint transaction
     * @dev Only callable by minters, requires contract unpaused, with reentrancy guard
     * @param txId The unique ID of the mint transaction
     * @param amount The amount of tokens to mint
     * @param toAccount The address to receive minted tokens
     */
    function mintByTx(bytes32 txId, uint256 amount, address toAccount) external;

    /**
     * @notice Registers a burn transaction ID for future execution
     * @dev Only callable by accounts with APPROVER_ROLE, requires unique txId
     * @param txId The unique transaction ID to register
     */
    function setBurnByTx(bytes32 txId) external;

    /**
     * @notice Cancels a registered burn transaction ID
     * @dev Only callable by accounts with APPROVER_ROLE, only cancels unexecuted IDs
     * @param txId The transaction ID to cancel
     */
    function cancelBurnByTx(bytes32 txId) external;

    /**
     * @notice Executes a registered burn transaction
     * @dev Only callable by minters, requires contract unpaused, with reentrancy guard
     * @param txId The unique ID of the burn transaction
     * @param amount The amount of tokens to burn
     * @param fromAccount The address to burn tokens from
     */
    function burnByTx(
        bytes32 txId,
        uint256 amount,
        address fromAccount
    ) external;

    /**
     * @notice Mints reward tokens to a specified address
     * @dev Only callable by minters, requires contract unpaused, with reentrancy guard
     * @param amount The amount of reward tokens to mint
     * @param to The address to receive reward tokens
     */
    function mintReward(uint256 amount, address to) external;

    /**
     * @dev Emergency withdrawal of tokens held by the contract, designed to handle exceptional
     * situations such as tokens being locked or stuck. This method can only be called by
     * addresses with the RESCUER_ROLE and prevents transfers to blacklisted addresses.
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
     * Emits a {TokensRescued} event upon successful execution.
     */
    function rescueTokens(IERC20 tokenContract,address to, uint256 amount) external;

    /**
     * @notice Checks if an account has minter privileges
     * @dev View function returning the minter status of an account
     * @param account The address to check
     * @return bool True if the account is a minter, false otherwise
     */
    function isMinter(address account) external view returns (bool);
}
