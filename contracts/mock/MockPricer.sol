// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockPricer {
    uint256 public price;

    constructor(uint256 _price) {
        price = _price;
    }

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getLatestPrice() external view returns (uint256) {
        return price;
    }

    function getPrice(uint256) external view returns (uint256) {
        return price;
    }
}