// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title AddressFactory Contract
 * @dev Manages the computation and storage of contract addresses using CREATE2 for deterministic deployment.
 *      This contract calculates addresses for proxy and implementation contracts based on salts and code hashes.
 */
contract AddressFactory {
    error NotOwner();
    error InvalidParams();
    error SaltAlreadyExists(bytes32 salt);

    address[] public vaultAddresses;
    address[] public vaultImplAddresses;
    bytes32[] public vaultSalts;
    mapping(bytes32 => uint256) public saltIndexMap;
    // @dev Address of the PacUSD proxy contract
    address public pacUSDAddress;
    // @dev Address of the PacUSD implementation contract
    address public pacUSDImplAddress;

    // @dev Address of the Staking proxy contract
    address public stakingAddress;
    // @dev Address of the Staking implementation contract
    address public stakingImplAddress;

    // @dev Hash of the MMFVault contract bytecode
    bytes32 immutable vaultHash;
    // @dev Hash of the PacUSD contract bytecode
    bytes32 immutable pacUSDHash;
    // @dev Salt used for deterministic deployment of PacUSD
    bytes32 immutable pacUSDSalt;
    // @dev Hash of the Staking contract bytecode
    bytes32 immutable stakingHash;
    // @dev Salt used for deterministic deployment of Staking
    bytes32 immutable stakingSalt;

    address immutable owner;

    /**
     * @dev Constructor to initialize the factory with deployment parameters
     * @param _vaultHash Bytecode hash of the MMFVault implementation
     * @param _pacUSDHash Bytecode hash of the PacUSD implementation
     * @param _pacUSDSalt Salt for deterministic deployment of PacUSD
     * @param _stakingHash Bytecode hash of the Staking implementation
     * @param _stakingSalt Salt for deterministic deployment of Staking
     */
    constructor(
        bytes32 _vaultHash,
        bytes32 _pacUSDHash,
        bytes32 _pacUSDSalt,
        bytes32 _stakingHash,
        bytes32 _stakingSalt
    ) {
        owner = msg.sender;
        vaultHash = _vaultHash;
        pacUSDHash = _pacUSDHash;
        pacUSDSalt = _pacUSDSalt;
        stakingHash = _stakingHash;
        stakingSalt = _stakingSalt;
    }

    /**
     * @dev Public function to compute all contract addresses
     * @param pacUSDFactoryAddress Address of the PacUSD deployment factory
     * @param stakingFactoryAddress Address of the Staking deployment factory
     */
    function computeAddress(
        address pacUSDFactoryAddress,
        address stakingFactoryAddress
    ) external {
        if (msg.sender != owner) revert NotOwner();
        (pacUSDAddress, pacUSDImplAddress) = _computeAddress(
            pacUSDSalt,
            pacUSDHash,
            pacUSDFactoryAddress
        );
        (stakingAddress, stakingImplAddress) = _computeAddress(
            stakingSalt,
            stakingHash,
            stakingFactoryAddress
        );
    }

    /**
     * @dev Public function to compute all contract addresses
     * @param vaultFactoryAddress Address of the PacUSD deployment factory
     * @param salts salt of MMFVault
     */
    function computeVaultAddress(
        address vaultFactoryAddress,
        bytes32[] memory salts
    ) external {
        if (msg.sender != owner) revert NotOwner();
        if (salts.length == 0) revert InvalidParams();
        uint256 count = vaultAddresses.length + 1;
        uint256 length = salts.length;
        for (uint i; i < length; ++i) {
            bytes32 salt = salts[i];

            if (saltIndexMap[salt] != 0) {
                revert SaltAlreadyExists(salt);
            }

            (address vaultAddress, address vaultImplAddress) = _computeAddress(
                salt,
                vaultHash,
                vaultFactoryAddress
            );
            vaultAddresses.push(vaultAddress);
            vaultImplAddresses.push(vaultImplAddress);
            vaultSalts.push(salt);
            saltIndexMap[salt] = count;
            ++count;
        }
    }

    /**
     * @dev Internal function to compute addresses for implementation and proxy
     * @param salt Unique salt for deterministic address calculation
     * @param codeHash Bytecode hash of the target implementation contract
     * @param deployer Address that will deploy the contract
     * @return proxy Computed address of the ERC1967 proxy
     * @return impl Computed address of the implementation contract
     */
    function _computeAddress(
        bytes32 salt,
        bytes32 codeHash,
        address deployer
    ) private view returns (address proxy, address impl) {
        // Compute implementation address using CREATE2
        impl = Create2.computeAddress(salt, codeHash, deployer);
        // Compute proxy address by hashing proxy deployment code with implementation address
        proxy = Create2.computeAddress(
            salt,
            keccak256(
                abi.encodePacked(
                    type(ERC1967Proxy).creationCode,
                    abi.encode(impl, "") // No initialization data
                )
            ),
            deployer
        );
    }

    function getVaultAddresses() external view returns (address[] memory) {
        return vaultAddresses;
    }

    function getVaultImplAddresses() external view returns (address[] memory) {
        return vaultImplAddresses;
    }

    function getVaultSalts() external view returns (bytes32[] memory) {
        return vaultSalts;
    }
}
