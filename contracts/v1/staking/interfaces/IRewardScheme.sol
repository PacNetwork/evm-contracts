// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

interface IRewardScheme {
    /**
     * @notice Updates the internal state of a user in the reward scheme
     * @dev This function should be called whenever a user's staked amount changes
     * @param user The address of the user whose state is being updated
     * @param stakedAmount The new staked amount for the user 
     */
    function updateUserInternalState(
        address user,
        uint256 stakedAmount
    ) external;

    /**
     * @notice Updates the state due to the price change
     */
    function update() external;

    /**
     * @notice Checks if the reward scheme is active
     */
    function isActive() external view returns (bool);
}
