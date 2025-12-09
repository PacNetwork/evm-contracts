// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PacUSD} from "../pacusd/PacUSD.sol";
import {IDeployFactory} from "./interfaces/IDeployFactory.sol";
import {AddressFactory} from "./AddressFactory.sol";

/**
 * @title PacUSDDeployFactory Contract
 * @dev Deploys PacUSD contracts with ERC1967 proxies using CREATE2 for deterministic deployment.
 *      Follows the UUPS proxy pattern and validates addresses against AddressFactory.
 */
contract PacUSDDeployFactory is IDeployFactory {
    AddressFactory immutable addressFactory;
    address immutable owner;

    /**
     * @dev Constructor to set reference to AddressFactory for address validation
     * @param _addressFactory Instance of AddressFactory to coordinate deployments
     */
    constructor(AddressFactory _addressFactory) {
        addressFactory = _addressFactory;
        owner = msg.sender;
    }

    /**
     * @notice Deploys PacUSD implementation and proxy with CREATE2 deterministic address
     * @dev Uses salt to ensure address predictability and validates against precomputed hashes
     * @param admin Address to assign admin of PacUSD
     * @param upgrader Address for upgrade administration
     * @param pacUSDSalt Salt for CREATE2 deterministic address calculation
     * @param name Token name for ERC20
     * @param symbol Token symbol for ERC20
     * @return pacUSDProxy Address of the deployed PacUSD proxy contract
     */
    function deployContracts(
        address admin,
        address upgrader,
        bytes32 pacUSDSalt,
        string calldata name,
        string calldata symbol
    ) external returns (address pacUSDProxy) {
        if (msg.sender != owner) revert NotOwner();
        // --------------------
        // Validate input parameters against zero address
        // --------------------
        if (
            admin == address(0) ||
            upgrader == address(0)
        ) revert ZeroAddress();

        // --------------------
        // Deploy PacUSD implementation contract
        // --------------------
        address pacUSDImpl = Create2.deploy(
            0,
            pacUSDSalt, // Deterministic salt
            type(PacUSD).creationCode // Bytecode of PacUSD
        );

        // Verify implementation address against AddressFactory expectation
        address expectImpl = addressFactory.pacUSDImplAddress();
        if (expectImpl != pacUSDImpl) {
            revert ImplAddressError(expectImpl, pacUSDImpl);
        }

        // --------------------
        // Deploy ERC1967Proxy for PacUSD
        // --------------------
        pacUSDProxy = Create2.deploy(
            0,
            pacUSDSalt,
            abi.encodePacked(
                type(ERC1967Proxy).creationCode, // Proxy deployment bytecode
                abi.encode(pacUSDImpl, "") // Initialize with impl address
            )
        );

        // Verify proxy address against AddressFactory expectation
        address expectProxy = addressFactory.pacUSDAddress();
        if (expectProxy != pacUSDProxy) {
            revert ProxyAddressError(expectProxy, pacUSDProxy);
        }

        // --------------------
        // Prepare initialization parameters
        // --------------------
        address[] memory vaultAddresses = addressFactory.getVaultAddresses();
    
        // --------------------
        // Initialize PacUSD proxy
        // --------------------
        (bool success, ) = pacUSDProxy.call(
            abi.encodeCall(
                PacUSD.initialize,
                (admin, upgrader, vaultAddresses, name, symbol)
            )
        );
        if (!success) revert InitializationFailed();

        // --------------------
        // Emit deployment event
        // --------------------
        emit ContractsDeployed(msg.sender, pacUSDProxy,pacUSDImpl);
    }
}
