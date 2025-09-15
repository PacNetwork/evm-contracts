// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

interface IBaseStaking {
    error ZeroAddress();
    error NewReserveAlreadyHasRole(address newReserve);
    error NewReserveHasRewards(address newReserve);
}