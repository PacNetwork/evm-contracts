// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

interface IPacUSDStaking {
    error ZeroAmount();
    error InvalidArrayLength();

    /// @notice revert when the attested is less than the reference
    error InvalidTokenSupply(uint256 totalSupply, uint256 totalStaked);

    /// @notice revert when the attested is less than the reference
    error InvalidRewardRate(uint256 attested, uint256 ref);
    
    /// @notice revert when the amount is larger than the staking balance
    error InsufficientStakingBalance(
        address user,
        uint256 amount,
        uint256 balance
    );
    
    /// @notice revert when the amount is larger than the reward balance
    error InsufficientTokenBalance(
        address user,
        uint256 amount,
        uint256 balance
    );

    /// @notice revert when the amount is larger than the reward balance
    error InsufficientRewardBalance(
        address user,
        uint256 amount,
        uint256 balance
    );

    /// @notice revert when the unstake time is ealier than the unlocked time
    error InsufficientStakingPeriod(
        address user,
        uint256 unstakeAt,
        uint256 unlockedAt
    );

    error RewardSchemeArrayTooLong();
    error RewardSchemeAlreadyAdded(address scheme);
    error RewardSchemeNotFound(address scheme);
    error NotUpdater();

    /**
     * @notice Stake a specified amount of tokens.
     * @param amount The amount of tokens to stake.
     */
    function stake(uint256 amount) external;

    /**
     * @notice Unstake a specified amount of tokens.
     * @param amount The amount of tokens to unstake.
     */
    function unstake(uint256 amount) external;

    /**
     * @notice Restake a specified amount of tokens (claim and stake rewards).
     * @param amount The amount of tokens to restake.
     */
    function restake(uint256 amount) external;

    /**
     * @notice Claim staking rewards.pwd
     * @param amount The amount of rewards to claim.
     */
    function claimReward(uint256 amount) external;

    /**
     * @notice Returns the staked balance of a user.
     * @param user The address of the user.
     * @return The staked balance of the user.
     */
    function balanceOf(address user) external view returns (uint256);

    /**
     * @notice Returns the claimable reward of a user.
     * @param user The address of the user.
     * @return The claimable reward of the user.
     */
    function rewardOf(address user) external view returns (uint256);

    
    /**
     * @notice distribute new reward to stakers.
     * @param newReward the amount of new reward to distribute.
     */
    function distributeReward(uint256 newReward) external;

      /**
     * @dev Updates updater permissions
     *
     * This function grants updating permissions to a new address, and can only be called by the contract upgrader.
     * When the new updater address is not the zero address, it will be added to the UPDATERS mapping with permissions enabled.
     *
     */
    function updateUpdater(address newUpdater) external;

    /**
     * @notice Returns the version of the staking contract.
     * @return The version string.
     */
    function version() external pure returns (string memory);
}
