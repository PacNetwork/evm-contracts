// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IPacUSDStaking} from "../v1/staking/interfaces/IPacUSDStaking.sol";

contract MockVault {
    uint256 public total;
    IPacUSDStaking staking;

    constructor() {}

    function init(IPacUSDStaking _staking) external {
        staking = _staking;
    }

    function addToken(uint256 added) external {
        total += added;
    }

    function totalMMFToken() external view returns (uint256) {
        return total;
    }

    function update() external {
        staking.update();
    }
}
