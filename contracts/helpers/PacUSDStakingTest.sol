// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PacUSDStaking} from "../v1/staking/PacUSDStaking.sol";

contract PacUSDStakingTest is PacUSDStaking {
    function initialize(
        address token,
        address upgrader,
        address admin,
        address reserve,
        address[] memory vaults,
        address[] memory pricers,
        address[] memory mmfTokens
    ) public override initializer {
        super.initialize(
            token,
            upgrader,
            admin,
            reserve,
            vaults,
            pricers,
            mmfTokens
        );
    }

    function version() external pure override returns (string memory) {
        return "test_v1";
    }

    function addReward(address user, uint256 inc) external {
        rewardBalances[user] += inc;
    }

    function addStakedAmount(address user, uint256 inc) external {
        stakingBalances[user] += inc;
        totalStaked_ += inc;
    }

    function setLastPrice(address vault, uint256 price) external {
        lastPrices[vault] = price;
    }

    function getLastPrice(address vault) external view returns (uint256) {
        return lastPrices[vault];
    }

    function setAccumulatedRewardRate(uint256 rate) external {
        accumulatedRewardRate = rate;
    }

    function getAccumulatedRewardRate() external view returns (uint256) {
        return accumulatedRewardRate;
    }

    function setEntryRewardRate(address user, uint256 rate) external {
        entryRewardRates[user] = rate;
    }

    function getEntryRewardRate(address user) external view returns (uint256) {
        return entryRewardRates[user];
    }

    function getStakingTimestamp(address user) external view returns (uint256) {
        return stakingTimestamps[user];
    }
}
