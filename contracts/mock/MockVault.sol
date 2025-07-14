// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;
import {IPacUSDStaking} from "../v1/staking/interfaces/IPacUSDStaking.sol";
import {IPricer} from "../interfaces/IPricer.sol";

interface IMockPacUSD {
    function mint(address to, uint256 amount) external;

    function decimals() external pure returns (uint8);
}

contract MockVault {
    uint256 public total;
    uint256 public lastPrice;

    IPacUSDStaking staking;
    IMockPacUSD public pacUSD;
    IPricer public pricer;

    uint256 public precision;

    constructor() {}

    function init(address _staking, address _pacUSD, address _pricer) external {
        staking = IPacUSDStaking(_staking);
        pacUSD = IMockPacUSD(_pacUSD);
        pricer = IPricer(_pricer);
        precision = 10 ** pacUSD.decimals();

        lastPrice = pricer.getLatestPrice();
    }

    function addToken(uint256 added) external {
        total += added;
    }

    function totalMMFToken() external view returns (uint256) {
        return total;
    }

    function update() external {
        uint256 price = pricer.getLatestPrice();

        if (price == lastPrice) return;
        if (price < lastPrice) revert("PriceDecreased");

        if (total > 0) {
            uint256 newReward = (total * (price - lastPrice)) / precision;
            staking.distributeReward(newReward);
            pacUSD.mint(address(staking), newReward);
        }

        lastPrice = price;
    }
}
