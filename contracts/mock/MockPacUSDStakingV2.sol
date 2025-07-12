// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PacUSDStaking} from "../v1/staking/PacUSDStaking.sol";

contract MockPacUSDStakingV2 is PacUSDStaking {
    function initialize(
        address token,
        address upgrader,
        address admin,
        address reserve,
        address[] memory vaults
    ) public override initializer {
        super.initialize(token, upgrader, admin, reserve, vaults);
    }

    function version() external pure override returns (string memory) {
        return "v2";
    }
}
