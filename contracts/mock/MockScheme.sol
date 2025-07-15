// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import "hardhat/console.sol";

contract MockScheme {
    bool public active = true;
    string public name;

    event UserStateUpdated(address indexed user, uint256 stakedAmount);
    event Updated();

    constructor(string memory _name) {
        name = _name;
    }

    // Mock function to simulate updating user internal state
    function updateUserInternalState(
        address user,
        uint256 stakedAmount
    ) external {
        console.log("name=%s, user=%s, stakedAmount=%s", name, user, stakedAmount);
        emit UserStateUpdated(user, stakedAmount);
    }

    // Mock function to check if the reward scheme is active
    function isActive() external view returns (bool) {
        return active; // Always returns true for the mock
    }

    function update() external {
        console.log("name=%s, update called", name);
        emit Updated();
    }

    function deactivate() external {
        console.log("name=%s, deactivated", name);
        active = false;
    }

    function activate() external {
        console.log("name=%s, activated", name);
        active = true;
    }
}
