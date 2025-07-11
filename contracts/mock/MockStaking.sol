// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;
contract MockStaking {
    bool public updateCalled;

    function update() external {
        updateCalled = true;
    }
}