// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MMFVault} from "../vault/MMFVault.sol";
import {IDeployFactory} from "./interfaces/IDeployFactory.sol";
import {AddressFactory} from "./AddressFactory.sol";

/**
 * @title MMFVaultDeployFactory Contract
 * @dev Deploys MMFVault contracts with ERC1967 proxies using CREATE2 for deterministic address deployment.
 *      Implements the IDeployFactory interface to standardize deployment processes.
 */
contract MMFVaultDeployFactory is IDeployFactory {
    AddressFactory addressFactory;
    address owner;

    /**
     * @dev Constructor to initialize the factory with a reference to AddressFactory
     * @param _addressFactory Instance of AddressFactory for address validation
     */
    constructor(AddressFactory _addressFactory) {
        addressFactory = _addressFactory;
        owner = msg.sender;
    }

    /**
     * @notice Deploys MMFVault implementation and proxy using CREATE2 with UUPS proxy pattern
     * @dev Uses CREATE2 to ensure deterministic deployment based on salt and bytecode hash
     * @param mmfTokenAddresses Address of the MMF token contract
     * @param pricerAddresses Address of the price oracle contract
     * @param mmfVaultSalts Salt for deterministic address calculation
     * @param admin Address to assign  admin roles
     * @param upgrader Address for upgrade administration
     */
    function deployContracts(
        address[] memory mmfTokenAddresses,
        address[] memory pricerAddresses,
        bytes32[] memory mmfVaultSalts,
        address admin,
        address upgrader
    ) external {
        if (msg.sender != owner) revert NotOwner();
        // --------------------
        // Input parameter validation
        // --------------------
        if (
            mmfTokenAddresses.length != pricerAddresses.length ||
            mmfTokenAddresses.length != mmfVaultSalts.length ||
            mmfTokenAddresses.length == 0 ||
            admin == address(0) ||
            upgrader == address(0)
        ) revert InvaildParams();

        // Retrieve related contract addresses from AddressFactory
        address pacUSDAddress = addressFactory.pacUSDAddress();
        address stakingAddress = addressFactory.stakingAddress();

        uint256 length = mmfTokenAddresses.length;
        address[] memory vaultAddresses = addressFactory.getVaultAddresses();
        address[] memory vaultImplAddresses = addressFactory
            .getVaultImplAddresses();

        for (uint i; i < length; ++i) {
            bytes32 salt = mmfVaultSalts[i];
            uint256 index = addressFactory.saltIndexMap(salt);
            address mmfTokenAddress = mmfTokenAddresses[i];
            address pricerAddress = pricerAddresses[i];
            // --------------------
            // Deploy MMFVault implementation contract
            // --------------------
            address mmfVaultImpl = Create2.deploy(
                0, // Gas value (0 for default)
                salt, // Deployment salt for determinism
                type(MMFVault).creationCode // Bytecode of MMFVault
            );

            // Verify implementation address against AddressFactory expectation
            address expectImpl = vaultImplAddresses[index];
            if (expectImpl != mmfVaultImpl) {
                revert ImplAddressError(expectImpl, mmfVaultImpl);
            }

            // --------------------
            // Deploy ERC1967Proxy for MMFVault
            // --------------------
            address mmfVaultProxy = Create2.deploy(
                0,
                salt,
                abi.encodePacked(
                    type(ERC1967Proxy).creationCode, // Proxy deployment bytecode
                    abi.encode(mmfVaultImpl, "") // Initialize with implementation address
                )
            );

            // --------------------
            // Validate deployed address against AddressFactory expectation
            // --------------------
            address expect = vaultAddresses[index];
            if (expect != mmfVaultProxy) {
                revert ProxyAddressError(expect, mmfVaultProxy);
            }

            // --------------------
            // Initialize MMFVault proxy
            // --------------------
            (bool success, ) = mmfVaultProxy.call(
                abi.encodeCall(
                    MMFVault.initialize,
                    (
                        mmfTokenAddress,
                        pacUSDAddress,
                        pricerAddress,
                        stakingAddress,
                        admin,
                        upgrader
                    )
                )
            );
            if (!success) revert InitializationFailed();

            // --------------------
            // Emit deployment event
            // --------------------
            emit ContractsDeployed(msg.sender, mmfVaultProxy);
        }
    }
}
