// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PacUSDStaking} from "../staking/PacUSDStaking.sol";
import {IDeployFactory} from "./interfaces/IDeployFactory.sol";
import {AddressFactory} from "./AddressFactory.sol";

contract StakingDeployFactory is IDeployFactory {
    AddressFactory immutable addressFactory;
    address immutable owner;

    constructor(AddressFactory _addressFactory) {
        addressFactory = _addressFactory;
        owner = msg.sender;
    }

    /**
     * @notice Deploys PacUSDStaking contracts with UUPS proxies using CREATE2, incorporating msg.sender in salt
     * @param pricerAddresses Address of the pricer contract
     * @param mmfTokenAddresses Address of the mmftoken contract
     * @param admin Address to assign admin roles for PacUSDStaking
     * @param upgrader Address for upgrade administration
     * @param reserveAddress Address to assign Reserve roles for reserve
     * @param salt Base salt for CREATE2 deployment of PacUSD proxy
     * @return pacUsdStakingProxy Address of the deployed PacUSDStaking proxy
     */
    function deployContracts(
        address[] memory pricerAddresses,
        address[] memory mmfTokenAddresses,
        address admin,
        address upgrader,
        address reserveAddress,
        bytes32 salt
    ) external returns (address pacUsdStakingProxy) {
        if (msg.sender != owner) revert NotOwner();
        // Input validation
        if (
            mmfTokenAddresses.length != pricerAddresses.length ||
            mmfTokenAddresses.length == 0 ||
            admin == address(0) ||
            reserveAddress == address(0) ||
            upgrader == address(0)
        ) revert ZeroAddress();
        address pacUSDAddress = addressFactory.pacUSDAddress();

        address[] memory vaultAddresses = addressFactory.getVaultAddresses();

        // Deploy PacUSDStaking implementation
        address pacUsdStakingImpl = Create2.deploy(
            0,
            salt,
            type(PacUSDStaking).creationCode
        );

        // Verify implementation address against AddressFactory expectation
        address expectImpl = addressFactory.stakingImplAddress();
        if (expectImpl != pacUsdStakingImpl) {
            revert ImplAddressError(expectImpl, pacUsdStakingImpl);
        }

        // Deploy  proxy without initialization data
        pacUsdStakingProxy = Create2.deploy(
            0,
            salt,
            abi.encodePacked(
                type(ERC1967Proxy).creationCode,
                abi.encode(pacUsdStakingImpl, "")
            )
        );

        address expect = addressFactory.stakingAddress();

        if (expect != pacUsdStakingProxy) {
            revert ProxyAddressError(expect, pacUsdStakingProxy);
        }

        // Initialize PacUSD proxy
        (bool success, ) = pacUsdStakingProxy.call(
            abi.encodeCall(
                PacUSDStaking.initialize,
                (
                    pacUSDAddress,
                    upgrader,
                    admin,
                    reserveAddress,
                    vaultAddresses
                )
            )
        );
        if (!success) revert InitializationFailed();

        // Emit deployment event
        emit ContractsDeployed(msg.sender, pacUsdStakingProxy);
    }
}
