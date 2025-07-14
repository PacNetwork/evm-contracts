// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

/**
 * @notice an abstract base contract for staking. It handles the initialization of the inherited Openzeppelin contracts
 */
abstract contract BaseStaking is
    Initializable,
    ContextUpgradeable,
    AccessControlUpgradeable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    error ZeroAddress();

    uint256[50] private __gap; // Reserve space for future variables

    function __BaseStaking_init(
        address upgrader,
        address admin
    ) internal onlyInitializing {
        if (upgrader == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }

        __Context_init();
        __AccessControl_init();
        __Ownable_init(upgrader);
        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
