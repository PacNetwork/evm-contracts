// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPacUSDStaking {
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
     * @notice update the accumulated rewward rate based on the latest price.
     * @dev the price assumed to be monotonically increasing.
     */
    function update() external;

    /**
     * @notice Returns the version of the staking contract.
     * @return The version string.
     */
    function version() external pure returns (string memory);
}
