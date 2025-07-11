// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MMFVault} from "./MMFVault.sol";
import {PacUSD} from "./PacUSD.sol";

contract DeployFactory {
    // Event emitted upon successful deployment
    event ContractsDeployed(address indexed sender, address pacUSDProxy, address mmfVaultProxy);

    // Errors
    error DeploymentFailed();
    error ZeroAddress();
    error InitializationFailed();

    /**
     * @notice Deploys PacUSD and MMFVault contracts with UUPS proxies using CREATE2, incorporating msg.sender in salt
     * @param mmfTokenAddress Address of the MMF token contract
     * @param pricerAddress Address of the pricer contract
     * @param stakingAddress Address of the staking contract
     * @param ownerAddress Address to assign ownership and admin roles
     * @param adminAddress Address to assign admin roles for upgrades
     * @param minters Array of addresses to be granted minter privileges for PacUSD
     * @param pacUSDSalt Base salt for CREATE2 deployment of PacUSD proxy
     * @param mmfVaultSalt Base salt for CREATE2 deployment of MMFVault proxy
     * @return pacUSDProxy Address of the deployed PacUSD proxy
     * @return mmfVaultProxy Address of the deployed MMFVault proxy
     */
    function deployContracts(
        address mmfTokenAddress,
        address pricerAddress,
        address stakingAddress,
        address ownerAddress,
        address adminAddress,
        address[] memory minters,
        bytes32 pacUSDSalt,
        bytes32 mmfVaultSalt
    ) external returns (address pacUSDProxy, address mmfVaultProxy) {
        // Input validation
        if (
            mmfTokenAddress == address(0) ||
            pricerAddress == address(0) ||
            stakingAddress == address(0) ||
            ownerAddress == address(0) ||
            adminAddress == address(0)
        ) revert ZeroAddress();

        // Generate salts incorporating msg.sender
        bytes32 pacUSDFinalSalt = keccak256(abi.encode(msg.sender, pacUSDSalt));
        bytes32 mmfVaultFinalSalt = keccak256(abi.encode(msg.sender, mmfVaultSalt));

        // Deploy PacUSD implementation
        address pacUSDImpl = Create2.deploy(
            0,
            keccak256(abi.encode(pacUSDFinalSalt, "impl")),
            type(PacUSD).creationCode
        );

        // Deploy PacUSD proxy without initialization data
        pacUSDProxy = Create2.deploy(
            0,
            pacUSDFinalSalt,
            abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(pacUSDImpl, ""))
        );

        // Initialize PacUSD proxy
        (bool success, ) = pacUSDProxy.call(
            abi.encodeCall(PacUSD.initialize, (ownerAddress, adminAddress, minters))
        );
        if (!success) revert InitializationFailed();

        // Deploy MMFVault implementation
        address mmfVaultImpl = Create2.deploy(
            0,
            keccak256(abi.encode(mmfVaultFinalSalt, "impl")),
            type(MMFVault).creationCode
        );

        // Deploy MMFVault proxy without initialization data
        mmfVaultProxy = Create2.deploy(
            0,
            mmfVaultFinalSalt,
            abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(mmfVaultImpl, ""))
        );

        // Initialize MMFVault proxy
        (success, ) = mmfVaultProxy.call(
            abi.encodeCall(
                MMFVault.initialize,
                (mmfTokenAddress, pacUSDProxy, pricerAddress, stakingAddress, ownerAddress, adminAddress)
            )
        );
        if (!success) revert InitializationFailed();

        // Emit deployment event
        emit ContractsDeployed(msg.sender, pacUSDProxy, mmfVaultProxy);
    }

    /**
     * @notice Computes the address where PacUSD proxy will be deployed for a given sender and salt
     * @param sender Address of the caller deploying the contract
     * @param pacUSDSalt Base salt for CREATE2 deployment
     * @return Address of the future PacUSD proxy
     */
    function computePacUSDAddress(address sender, bytes32 pacUSDSalt) external view returns (address) {
        bytes32 finalSalt = keccak256(abi.encode(sender, pacUSDSalt));
        return
            Create2.computeAddress(
                finalSalt,
                keccak256(
                    abi.encodePacked(
                        type(ERC1967Proxy).creationCode,
                        abi.encode(
                            Create2.computeAddress(
                                keccak256(abi.encode(finalSalt, "impl")),
                                keccak256(type(PacUSD).creationCode)
                            ),
                            "" // No initialization data
                        )
                    )
                )
            );
    }

    /**
     * @notice Computes the address where MMFVault proxy will be deployed for a given sender and salt
     * @param sender Address of the caller deploying the contract
     * @param mmfVaultSalt Base salt for CREATE2 deployment
     * @return Address of the future MMFVault proxy
     */
    function computeMMFVaultAddress(address sender, bytes32 mmfVaultSalt) external view returns (address) {
        bytes32 finalSalt = keccak256(abi.encode(sender, mmfVaultSalt));
        return
            Create2.computeAddress(
                finalSalt,
                keccak256(
                    abi.encodePacked(
                        type(ERC1967Proxy).creationCode,
                        abi.encode(
                            Create2.computeAddress(
                                keccak256(abi.encode(finalSalt, "impl")),
                                keccak256(type(MMFVault).creationCode)
                            ),
                            "" // No initialization data
                        )
                    )
                )
            );
    }
}