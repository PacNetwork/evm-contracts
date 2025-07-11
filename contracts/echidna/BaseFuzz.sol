// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../v1/vault/MMFVault.sol";
import "../v1/pacusd/PacUSD.sol";
import "../v1/staking/PacUSDStaking.sol";
import "../mock/MockERC20.sol";
import "../mock/MockPricer.sol";

/**
 * @title BaseFuzz
 * @notice Base Echidna fuzz test contract for deployment and initialization
 * @dev All Echidna test contracts should inherit from this base contract
 */
interface evm {
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
}

abstract contract BaseFuzz {
    evm constant vm = evm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Implementation contracts
    MMFVault public vaultImpl;
    PacUSD public pacUSDImpl;
    PacUSDStaking public stakingImpl;

    // Proxy contracts
    ERC1967Proxy public vaultProxy;
    ERC1967Proxy public pacUSDProxy;
    ERC1967Proxy public stakingProxy;

    // Contract interfaces accessed via proxies
    MMFVault public vault;
    PacUSD public pacUSD;
    PacUSDStaking public staking;

    // Mock contracts
    MockERC20 public mmfToken;
    MockPricer public pricer;

    // System roles
    address OWNER = address(0x0000000000000000000000000000000000010000);
    address ADMIN = address(0x0000000000000000000000000000000000020000);
    address UPGRADER = address(0x3000);
    address RESERVE = address(0x9000);
    address BLACKLISTED_USER = address(0x5000);

    // Test user management
    mapping(address => bool) public knownUsers;
    mapping(address => bool) public hasInitialBalance;
    address[] public userList;

    // State tracking
    uint256 public txCounter;
    mapping(address => uint256) public userMintAttempts;
    mapping(address => uint256) public userSuccessfulMints;
    mapping(address => uint256) public userRedeemAttempts;
    mapping(address => uint256) public userSuccessfulRedeems;
    mapping(address => uint256) public userStakeAttempts;
    mapping(address => uint256) public userSuccessfulStakes;
    mapping(address => uint256) public userTransferAttempts;
    mapping(address => uint256) public userSuccessfulTransfers;

    // Operation counters
    uint256 public totalOperations;
    uint256 public successfulOperations;

    /**
     * @notice Executes the full deployment and initialization process
     * @dev Deploys mock contracts, implementation contracts, proxies, and sets up initial state
     */
    function deployAndInitialize() internal {
        // 1. Deploy mock contracts
        _deployMockContracts();

        // 2. Deploy implementation contracts
        _deployImplementations();

        // 3. Deploy and initialize proxy contracts
        _deployAndInitializeProxies();

        // 4. Set up initial state
        _setupInitialState();
    }

    /**
     * @notice Deploys mock contracts for testing
     * @dev Initializes the MMF token and pricer mock contracts
     */
    function _deployMockContracts() internal {
        mmfToken = new MockERC20("MMF Token", "MMF");
        pricer = new MockPricer(1e18);
    }

    /**
     * @notice Deploys implementation contracts
     * @dev Deploys the MMFVault, PacUSD, and PacUSDStaking implementation contracts
     */
    function _deployImplementations() internal {
        vaultImpl = new MMFVault();
        pacUSDImpl = new PacUSD();
        stakingImpl = new PacUSDStaking();
    }

    /**
     * @notice Deploys and initializes proxy contracts
     * @dev Calls functions to deploy proxies and initialize contracts
     */
    function _deployAndInitializeProxies() internal {
        _deployProxies();
        _initializeContracts();
    }

    /**
     * @notice Deploys proxy contracts
     * @dev Creates ERC1967 proxy contracts for PacUSD, MMFVault, and PacUSDStaking
     */
    function _deployProxies() internal {
        pacUSDProxy = new ERC1967Proxy(address(pacUSDImpl), "");
        vaultProxy = new ERC1967Proxy(address(vaultImpl), "");
        stakingProxy = new ERC1967Proxy(address(stakingImpl), "");

        pacUSD = PacUSD(address(pacUSDProxy));
        vault = MMFVault(address(vaultProxy));
        staking = PacUSDStaking(address(stakingProxy));
    }

    /**
     * @notice Initializes deployed contracts
     * @dev Initializes PacUSD, MMFVault, and PacUSDStaking with appropriate parameters
     */
    function _initializeContracts() internal {
        address[] memory minters = new address[](1);
        minters[0] = address(vaultProxy);
        pacUSD.initialize(OWNER, UPGRADER, minters);

        vault.initialize(
            address(mmfToken),
            address(pacUSDProxy),
            address(pricer),
            address(stakingProxy),
            OWNER,
            UPGRADER
        );

        address[] memory vaults = new address[](1);
        address[] memory pricers = new address[](1);
        address[] memory mmfTokens = new address[](1);

        vaults[0] = address(vaultProxy);
        pricers[0] = address(pricer);
        mmfTokens[0] = address(mmfToken);

        staking.initialize(
            address(pacUSDProxy),
            UPGRADER,
            ADMIN,  // Admin role
            RESERVE,
            vaults,
            pricers,
            mmfTokens
        );
    }

    /**
     * @notice Sets up the initial state of the system
     * @dev Assigns roles, blacklists a user, and mints initial MMF tokens to the vault
     */
    function _setupInitialState() internal {
        vm.startPrank(OWNER);
        vault.grantRole(vault.PAUSER_ROLE(), OWNER);
        pacUSD.grantRole(pacUSD.PAUSER_ROLE(), OWNER);
        pacUSD.grantRole(pacUSD.BLOCKLISTER_ROLE(), OWNER);
        pacUSD.grantRole(pacUSD.APPROVER_ROLE(), OWNER);
        pacUSD.grantRole(pacUSD.RESCUER_ROLE(), OWNER);
        pacUSD.addToBlocklist(BLACKLISTED_USER);
        vm.stopPrank();

        vm.startPrank(ADMIN);
        staking.grantRole(staking.PAUSER_ROLE(), ADMIN);
        staking.grantRole(staking.RESERVE_SET_ROLE(), ADMIN);
        staking.grantRole(staking.REWARD_SCHEME_ROLE(), ADMIN);
        vm.stopPrank();

        // Mint initial MMF tokens to the vault
        mmfToken.mint(address(vault), 1000000e18);
    }

    /**
     * @notice Mints MMF tokens for a user and approves the vault
     * @dev Mints specified amount of MMF tokens and approves the vault to spend them
     * @param user The user receiving the tokens
     * @param amount The amount of MMF tokens to mint and approve
     */
    function mintAndApproveMMF(address user, uint256 amount) internal {
        mmfToken.mint(user, amount);
        vm.startPrank(user);
        mmfToken.approve(address(vault), amount);
        vm.stopPrank();
    }
}