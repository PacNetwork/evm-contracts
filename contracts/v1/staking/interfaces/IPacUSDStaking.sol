// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPacUSDStaking {
    error ZeroAmount();
    error InvalidArrayLength();
    error InvalidPrice(uint256 attested, uint256 ref); // attested price must not be larger than the reference price
    error InvalidRewardRate(uint256 attested, uint256 ref); // attested reward rate must not be larger than the reference reward rate
    error InvalidTokenSupply(uint256 totalSupply, uint256 totalStaked);
    error InsufficientStakingBalance(
        address user,
        uint256 amount,
        uint256 balance
    );
    error InsufficientTokenBalance(
        address user,
        uint256 amount,
        uint256 balance
    );
    error InsufficientRewardBalance(
        address user,
        uint256 amount,
        uint256 balance
    );
    error InsufficientStakingPeriod(
        address user,
        uint256 unstakeAt,
        uint256 unlockedAt
    );
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
     * @notice Returns the version of the staking contract.
     * @return The version string.
     */
    function version() external pure returns (string memory);
}
