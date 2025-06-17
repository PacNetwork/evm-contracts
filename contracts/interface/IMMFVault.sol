// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

/**
 * @title IMMFVault Interface
 * @notice Defines external interaction methods for the MMFVault contract
 * @dev Contains declarations for all publicly accessible contract methods, used for interface-based calls and standardization
 */
interface IMMFVault {
    // Custom errors
    error InvalidTxId();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidPrice();

    // Events
    event MintPacUSD(
        bytes32 indexed txId,
        address indexed to,
        uint256 timestamp,
        uint256 mmfAmount,
        uint256 pacUSDAmount
    );
    event RedeemMMF(
        bytes32 indexed txId,
        address indexed to,
        uint256 timestamp,
        uint256 pacUSDAmount,
        uint256 mmfAmount
    );
    event RewardMinted(address indexed to, uint256 amount);
 
    /**
     * @notice Pauses the contract, preventing minting, redeeming, and reward distribution
     * @dev Only callable by accounts with PAUSER_ROLE, emits a Paused event
     */
    function pause() external;

    /**
     * @notice Unpauses the contract, resuming normal operations
     * @dev Only callable by accounts with PAUSER_ROLE, emits an Unpaused event
     */
    function unpause() external;

    /**
     * @notice Swaps MMF tokens for PacUSD
     * @dev Requires contract to be unpaused, with reentrancy protection
     * @param txId Transaction ID (chainId,hash of address(this), sender, amount, toAccount, timestamp)
     * @param amount Amount of MMF tokens to swap
     * @param toAccount Recipient address for PacUSD
     * @param timestamp Timestamp used in txId hash
     */
    function mintPacUSD(
        bytes32 txId,
        uint256 amount,
        address toAccount,
        uint256 timestamp
    ) external;

    /**
     * @notice Swaps PacUSD for MMF tokens
     * @dev Requires contract to be unpaused, with reentrancy protection
     * @param txId Transaction ID (chainId,hash of address(this), sender, amount, toAccount, timestamp)
     * @param amount Amount of PacUSD to swap
     * @param toAccount Recipient address for MMF tokens
     * @param timestamp Timestamp used in txId hash
     */
    function redeemMMF(
        bytes32 txId,
        uint256 amount,
        address toAccount,
        uint256 timestamp
    ) external;

    /**
     * @notice Distributes rewards based on price changes
     * @dev Callable by anyone, mints PacUSD rewards and updates staking
     */
    function mintReward() external;


}