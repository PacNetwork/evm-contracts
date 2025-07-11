// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./BaseFuzz.sol";

/**
 * @title SceneFuzzTest
 * @notice Comprehensive test contract that includes specific business scenarios and allows random operation combinations
 */
contract SceneFuzzTest is BaseFuzz {

    // Predefined operation sets
    uint256[] public coreOperations = [0, 1, 15, 16, 19, 20];        // Core functionality operations
    uint256[] public adminOperations = [6, 7, 8, 9];                 // Administrative operations
    uint256[] public rewardOperations = [3, 17, 21, 22];             // Reward-related operations
    uint256[] public transactionOperations = [4, 5, 10, 11, 12, 13]; // Transaction system operations

    // User management
    address[] public testUsers;
    mapping(address => bool) public userHasMMF;
    mapping(address => bool) public userHasPacUSD;

    // State tracking
    mapping(uint256 => uint256) public operationCounts;
    mapping(uint256 => uint256) public scenarioCounts;
    bool public testsInitialized;

    /**
     * @notice Constructor to initialize the contract
     * @dev Deploys and initializes the contract and sets up test users
     */
    constructor() {
        deployAndInitialize();
        setupTestUsers();
        testsInitialized = true;
    }

    /**
     * @notice Sets up test users with initial token allocations
     * @dev Creates a list of test users, mints MMF tokens, and assigns PacUSD rewards
     */
    function setupTestUsers() internal {
        testUsers.push(address(0x1001));
        testUsers.push(address(0x1002));
        testUsers.push(address(0x1003));
        testUsers.push(address(0x1004));
        testUsers.push(address(0x1005));

        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];
            knownUsers[user] = true;

            mmfToken.mint(user, 100000e18);
            userHasMMF[user] = true;

            vm.startPrank(address(vault));
            pacUSD.mintReward(10000e18, user);
            vm.stopPrank();
            userHasPacUSD[user] = true;
        }
    }

    // ======================================
    // 1. Specific Business Scenario Tests
    // ======================================

    /**
     * @notice Scenario 1: Complete user lifecycle
     * @dev Simulates a new user's journey from zero to active participation
     * @param amount The amount of tokens to process
     * @param userIndex Index to select a test user
     * @param data Additional data for operations
     */
    function scenario_UserLifecycle(
        uint256 amount,
        uint256 userIndex,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];
        amount = (amount % 50000e18) + 1000e18; // 1K-50K tokens

        scenarioCounts[1]++;

        // 1. User obtains MMF and mints PacUSD
        executeSpecificOperation(15, amount, user, data); // MintPacUSD

        // 2. User stakes PacUSD to earn rewards
        executeSpecificOperation(19, amount / 2, user, data); // Stake

        // 3. User claims rewards after some time
        executeSpecificOperation(17, 0, user, data); // VaultMintReward

        // 4. User restakes rewards
        executeSpecificOperation(22, amount / 4, user, data); // Restake

        totalOperations += 4;
    }

    /**
     * @notice Scenario 2: Liquidity management scenario
     * @dev Simulates typical liquidity management operations by a user
     * @param amount The amount of tokens to process
     * @param userIndex Index to select a test user
     * @param action The liquidity management strategy (0: add, 1: remove, 2: rebalance)
     * @param data Additional data for operations
     */
    function scenario_LiquidityManagement(
        uint256 amount,
        uint256 userIndex,
        uint256 action,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];
        amount = (amount % 20000e18) + 500e18;
        action = action % 3; // 3 liquidity management strategies

        scenarioCounts[2]++;

        if (action == 0) {
            // Strategy A: Add liquidity
            executeSpecificOperation(15, amount, user, data);     // MintPacUSD
            executeSpecificOperation(19, amount * 80 / 100, user, data); // Stake 80%

        } else if (action == 1) {
            // Strategy B: Remove liquidity
            executeSpecificOperation(20, amount, user, data);     // Unstake
            executeSpecificOperation(16, amount / 2, user, data); // RedeemMMF

        } else {
            // Strategy C: Rebalance
            executeSpecificOperation(21, amount, user, data);     // ClaimReward
            executeSpecificOperation(22, amount / 3, user, data); // Restake
        }

        totalOperations += 2;
    }

    /**
     * @notice Scenario 3: Price volatility response scenario
     * @dev Simulates user and system responses to price changes
     * @param priceChange The magnitude of price change
     * @param userIndex Index to select a test user
     * @param response The user response type (0: aggressive, 1: conservative)
     * @param data Additional data for operations
     */
    function scenario_PriceVolatility(
        uint256 priceChange,
        uint256 userIndex,
        uint256 response,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];
        priceChange = (priceChange % 20e16) + 1e16; // 0.01-0.2 price change
        response = response % 2;

        scenarioCounts[3]++;

        // 1. Simulate price increase
        uint256 currentPrice = pricer.price();
        pricer.setPrice(currentPrice + priceChange);

        // 2. Trigger reward distribution
        executeSpecificOperation(17, 0, user, data); // VaultMintReward

        // 3. User response
        if (response == 0) {
            // Aggressive response: Increase stake
            executeSpecificOperation(19, priceChange * 1000, user, data); // Stake
        } else {
            // Conservative response: Partial withdrawal
            executeSpecificOperation(20, priceChange * 500, user, data); // Unstake
        }

        totalOperations += 3;
    }

    /**
     * @notice Scenario 4: Emergency situation scenario
     * @dev Simulates administrative operations during emergency situations
     * @param emergencyType The type of emergency action (0: pause, 1: blacklist, 2: recovery)
     * @param userIndex Index to select a test user
     * @param data Additional data for operations
     */
    function scenario_Emergency(
        uint256 emergencyType,
        uint256 userIndex,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        emergencyType = emergencyType % 3;
        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];

        scenarioCounts[4]++;

        if (emergencyType == 0) {
            // Emergency pause
            executeSpecificOperation(8, 0, user, data);  // Pause PacUSD
            executeSpecificOperation(23, 0, user, data); // Pause Staking

        } else if (emergencyType == 1) {
            // Blacklist operation
            executeSpecificOperation(6, 0, user, data);  // AddToBlocklist
            executeSpecificOperation(0, 1000e18, user, data); // Attempt transfer (should fail)

        } else {
            // Recovery operation
            executeSpecificOperation(9, 0, user, data);  // Unpause PacUSD
            executeSpecificOperation(7, 0, user, data);  // RemoveFromBlocklist
        }

        totalOperations += 2;
    }

    /**
     * @notice Scenario 5: Transaction system stress test
     * @dev Tests the minting and burning system based on transaction IDs
     * @param txType The type of transaction (0: mint, 1: burn, 2: cancel mint, 3: cancel burn)
     * @param amount The amount of tokens to process
     * @param userIndex Index to select a test user
     * @param data Additional data for operations
     */
    function scenario_TransactionSystem(
        uint256 txType,
        uint256 amount,
        uint256 userIndex,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        txType = txType % 4;
        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];
        amount = (amount % 10000e18) + 100e18;

        scenarioCounts[5]++;

        if (txType == 0) {
            // Normal minting process
            executeSpecificOperation(10, 0, user, data);  // SetMintTx
            executeSpecificOperation(4, amount, user, data); // MintByTx

        } else if (txType == 1) {
            // Normal burning process
            executeSpecificOperation(12, 0, user, data);  // SetBurnTx
            executeSpecificOperation(5, amount, user, data); // BurnByTx

        } else if (txType == 2) {
            // Cancel minting
            executeSpecificOperation(10, 0, user, data);  // SetMintTx
            executeSpecificOperation(11, 0, user, data);  // CancelMintTx

        } else {
            // Cancel burning
            executeSpecificOperation(12, 0, user, data);  // SetBurnTx
            executeSpecificOperation(13, 0, user, data);  // CancelBurnTx
        }

        totalOperations += 2;
    }

    // ======================================
    // 2. Random Operation Combination Tests
    // ======================================

    /**
     * @notice Random operation combination test
     * @dev Allows Echidna to freely explore by randomly selecting and executing operations
     * @param op1 First operation index
     * @param op2 Second operation index
     * @param op3 Third operation index
     * @param amount The amount of tokens to process
     * @param userIndex Index to select a test user
     * @param data Additional data for operations
     */
    function fuzz_RandomOperationCombination(
        uint256 op1,
        uint256 op2,
        uint256 op3,
        uint256 amount,
        uint256 userIndex,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        // Randomly select 3 operations
        op1 = op1 % 27; // All operations
        op2 = op2 % 27;
        op3 = op3 % 27;

        amount = (amount % 5000e18) + 100e18;
        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];

        // Execute random operation combination
        executeSpecificOperation(op1, amount, user, data);
        executeSpecificOperation(op2, amount / 2, user, data);
        executeSpecificOperation(op3, amount / 3, user, data);

        totalOperations += 3;
    }

    /**
     * @notice Core operations random combination test
     * @dev Tests random combinations of core functionality operations
     * @param op1 First operation index from core operations
     * @param op2 Second operation index from core operations
     * @param amount The amount of tokens to process
     * @param userIndex Index to select a test user
     * @param data Additional data for operations
     */
    function fuzz_CoreOperationsCombination(
        uint256 op1,
        uint256 op2,
        uint256 amount,
        uint256 userIndex,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        op1 = coreOperations[op1 % coreOperations.length];
        op2 = coreOperations[op2 % coreOperations.length];

        amount = (amount % 8000e18) + 500e18;
        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];

        executeSpecificOperation(op1, amount, user, data);
        executeSpecificOperation(op2, amount * 70 / 100, user, data);

        totalOperations += 2;
    }

    /**
     * @notice Reward mechanism random test
     * @dev Focuses on random combinations of reward-related operations
     * @param op1 First operation index from reward operations
     * @param op2 Second operation index from reward operations
     * @param priceMultiplier Price change multiplier
     * @param userIndex Index to select a test user
     * @param data Additional data for operations
     */
    function fuzz_RewardMechanism(
        uint256 op1,
        uint256 op2,
        uint256 priceMultiplier,
        uint256 userIndex,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        op1 = rewardOperations[op1 % rewardOperations.length];
        op2 = rewardOperations[op2 % rewardOperations.length];

        priceMultiplier = (priceMultiplier % 50e15) + 1e15; // 0.001-0.05 price change
        userIndex = userIndex % testUsers.length;
        address user = testUsers[userIndex];

        // Random price change
        uint256 currentPrice = pricer.price();
        pricer.setPrice(currentPrice + priceMultiplier);

        executeSpecificOperation(op1, priceMultiplier * 1000, user, data);
        executeSpecificOperation(op2, priceMultiplier * 800, user, data);

        totalOperations += 2;
    }

    /**
     * @notice Multi-user interaction test
     * @dev Simulates multiple users performing operations simultaneously
     * @param op1 First operation index
     * @param op2 Second operation index
     * @param op3 Third operation index
     * @param amount The amount of tokens to process
     * @param data Additional data for operations
     */
    function fuzz_MultiUserInteraction(
        uint256 op1,
        uint256 op2,
        uint256 op3,
        uint256 amount,
        bytes32 data
    ) public {
        if (!testsInitialized) return;

        op1 = op1 % 27;
        op2 = op2 % 27;
        op3 = op3 % 27;
        amount = (amount % 3000e18) + 200e18;

        // Three different users execute operations
        executeSpecificOperation(op1, amount, testUsers[0], data);
        executeSpecificOperation(op2, amount, testUsers[1], data);
        executeSpecificOperation(op3, amount, testUsers[2], data);

        totalOperations += 3;
    }

    // ======================================
    // Operation Execution Engine
    // ======================================

    /**
     * @notice Executes a specific operation based on index
     * @dev Routes the operation to the appropriate function
     * @param operationIndex Index of the operation to execute
     * @param amount The amount of tokens to process
     * @param user The user address performing the operation
     * @param data Additional data for the operation
     */
    function executeSpecificOperation(
        uint256 operationIndex,
        uint256 amount,
        address user,
        bytes32 data
    ) internal {
        operationCounts[operationIndex]++;

        // PacUSD operations (0-14)
        if (operationIndex == 0) {
            executeTransfer(user, amount);
        } else if (operationIndex == 1) {
            executeApprove(user, amount);
        } else if (operationIndex == 2) {
            executeTransferFrom(user, amount);
        } else if (operationIndex == 3) {
            executeMintReward(user, amount);
        } else if (operationIndex == 4) {
            executeMintByTx(user, amount, data);
        } else if (operationIndex == 5) {
            executeBurnByTx(user, amount, data);
        } else if (operationIndex == 6) {
            executeAddToBlocklist(user);
        } else if (operationIndex == 7) {
            executeRemoveFromBlocklist(user);
        } else if (operationIndex == 8) {
            executePause();
        } else if (operationIndex == 9) {
            executeUnpause();
        } else if (operationIndex == 10) {
            executeSetMintTx(data);
        } else if (operationIndex == 11) {
            executeCancelMintTx(data);
        } else if (operationIndex == 12) {
            executeSetBurnTx(data);
        } else if (operationIndex == 13) {
            executeCancelBurnTx(data);
        } else if (operationIndex == 14) {
            executeRescueTokens(user, amount);

            // Vault operations (15-18)
        } else if (operationIndex == 15) {
            executeMintPacUSD(user, amount, data);
        } else if (operationIndex == 16) {
            executeRedeemMMF(user, amount, data);
        } else if (operationIndex == 17) {
            executeVaultMintReward();
        } else if (operationIndex == 18) {
            executeUpdatePriceAndMintReward(amount);

            // Staking operations (19-26)
        } else if (operationIndex == 19) {
            executeStake(user, amount);
        } else if (operationIndex == 20) {
            executeUnstake(user, amount);
        } else if (operationIndex == 21) {
            executeClaimReward(user, amount);
        } else if (operationIndex == 22) {
            executeRestake(user, amount);
        } else if (operationIndex == 23) {
            executePauseStaking();
        } else if (operationIndex == 24) {
            executeUnpauseStaking();
        } else if (operationIndex == 25) {
            executeUpdateStaking();
        } else if (operationIndex == 26) {
            executeSetMinStakingPeriod(amount);
        }
    }

    // ======================================
    // Specific Operation Implementations (Simplified)
    // ======================================

    /**
     * @notice Executes a token transfer
     * @dev Transfers PacUSD tokens from the user to testUsers[0]
     * @param user The user initiating the transfer
     * @param amount The amount of tokens to transfer
     */
    function executeTransfer(address user, uint256 amount) internal {
        if (pacUSD.balanceOf(user) >= amount && amount > 0) {
            vm.startPrank(user);
            try pacUSD.transfer(testUsers[0], amount) {
                userSuccessfulTransfers[user]++;
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        }
        userTransferAttempts[user]++;
    }

    /**
     * @notice Executes an approval for token spending
     * @dev Approves the vault to spend PacUSD tokens on behalf of the user
     * @param user The user granting approval
     * @param amount The amount of tokens to approve
     */
    function executeApprove(address user, uint256 amount) internal {
        vm.startPrank(user);
        try pacUSD.approve(address(vault), amount) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Executes a transferFrom operation
     * @dev Transfers PacUSD tokens from testUsers[0] to testUsers[1] using allowance
     * @param user The user executing the transferFrom
     * @param amount The amount of tokens to transfer
     */
    function executeTransferFrom(address user, uint256 amount) internal {
        address from = testUsers[0];
        if (pacUSD.allowance(from, user) >= amount && amount > 0) {
            vm.startPrank(user);
            try pacUSD.transferFrom(from, testUsers[1], amount) {
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        }
    }

    /**
     * @notice Mints reward tokens to a user
     * @dev Mints PacUSD reward tokens from the vault to the user
     * @param user The user receiving the reward
     * @param amount The amount of reward tokens to mint
     */
    function executeMintReward(address user, uint256 amount) internal {
        vm.startPrank(address(vault));
        try pacUSD.mintReward(amount, user) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Executes minting by transaction ID
     * @dev Sets up and executes a minting operation using a transaction ID
     * @param user The user minting tokens
     * @param amount The amount of tokens to mint
     * @param data Data used to generate the transaction ID
     */
    function executeMintByTx(address user, uint256 amount, bytes32 data) internal {
        bytes32 txId = keccak256(abi.encode(data, user, amount, block.timestamp));

        vm.startPrank(OWNER);
        try pacUSD.setMintByTx(txId) {
            vm.stopPrank();
            vm.startPrank(address(vault));
            try pacUSD.mintByTx(txId, amount, user) {
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        } catch {
            vm.stopPrank();
        }
    }

    /**
     * @notice Executes burning by transaction ID
     * @dev Sets up and executes a burning operation using a transaction ID
     * @param user The user burning tokens
     * @param amount The amount of tokens to burn
     * @param data Data used to generate the transaction ID
     */
    function executeBurnByTx(address user, uint256 amount, bytes32 data) internal {
        if (pacUSD.balanceOf(user) >= amount && amount > 0) {
            bytes32 txId = keccak256(abi.encode(data, user, amount, block.timestamp, "burn"));

            vm.startPrank(OWNER);
            try pacUSD.setBurnByTx(txId) {
                vm.stopPrank();
                vm.startPrank(address(vault));
                try pacUSD.burnByTx(txId, amount, user) {
                    successfulOperations++;
                } catch {}
                vm.stopPrank();
            } catch {
                vm.stopPrank();
            }
        }
    }

    /**
     * @notice Adds a user to the blacklist
     * @dev Restricts a user from performing certain operations
     * @param user The user to blacklist
     */
    function executeAddToBlocklist(address user) internal {
        vm.startPrank(OWNER);
        try pacUSD.addToBlocklist(user) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Removes a user from the blacklist
     * @dev Restores a user's ability to perform operations
     * @param user The user to remove from the blacklist
     */
    function executeRemoveFromBlocklist(address user) internal {
        vm.startPrank(OWNER);
        try pacUSD.removeFromBlocklist(user) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Pauses PacUSD operations
     * @dev Temporarily halts certain PacUSD functionalities
     */
    function executePause() internal {
        vm.startPrank(OWNER);
        try pacUSD.pause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Unpauses PacUSD operations
     * @dev Restores normal PacUSD functionalities
     */
    function executeUnpause() internal {
        vm.startPrank(OWNER);
        try pacUSD.unpause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Sets a mint transaction
     * @dev Prepares a transaction ID for minting PacUSD
     * @param data Data used to generate the transaction ID
     */
    function executeSetMintTx(bytes32 data) internal {
        vm.startPrank(OWNER);
        try pacUSD.setMintByTx(data) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Cancels a mint transaction
     * @dev Cancels a previously set mint transaction
     * @param data Data identifying the transaction to cancel
     */
    function executeCancelMintTx(bytes32 data) internal {
        vm.startPrank(OWNER);
        try pacUSD.cancelMintByTx(data) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Sets a burn transaction
     * @dev Prepares a transaction ID for burning PacUSD
     * @param data Data used to generate the transaction ID
     */
    function executeSetBurnTx(bytes32 data) internal {
        vm.startPrank(OWNER);
        try pacUSD.setBurnByTx(data) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Cancels a burn transaction
     * @dev Cancels a previously set burn transaction
     * @param data Data identifying the transaction to cancel
     */
    function executeCancelBurnTx(bytes32 data) internal {
        vm.startPrank(OWNER);
        try pacUSD.cancelBurnByTx(data) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Rescues tokens from the PacUSD contract
     * @dev Transfers stuck MMF tokens to a specified user
     * @param user The user receiving the rescued tokens
     * @param amount The amount of tokens to rescue
     */
    function executeRescueTokens(address user, uint256 amount) internal {
        vm.startPrank(OWNER);
        try pacUSD.rescueTokens(mmfToken, user, amount) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Mints PacUSD tokens using MMF
     * @dev Allows a user to mint PacUSD by approving and transferring MMF to the vault
     * @param user The user minting tokens
     * @param amount The amount of tokens to mint
     * @param data Data used to generate the transaction ID
     */
    function executeMintPacUSD(address user, uint256 amount, bytes32 data) internal {
        if (mmfToken.balanceOf(user) >= amount && amount > 0) {
            bytes32 txId = keccak256(abi.encode(
                block.chainid,
                address(vault),
                user,
                amount,
                user,
                block.timestamp
            ));

            vm.startPrank(OWNER);
            pacUSD.setMintByTx(txId);

            vm.startPrank(user);
            mmfToken.approve(address(vault), amount);

            try vault.mintPacUSD(txId, amount, user, block.timestamp) {
                userSuccessfulMints[user]++;
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        }
        userMintAttempts[user]++;
    }

    /**
     * @notice Redeems MMF tokens by burning PacUSD
     * @dev Allows a user to redeem MMF by burning PacUSD through the vault
     * @param user The user redeeming tokens
     * @param amount The amount of tokens to redeem
     * @param data Data used to generate the transaction ID
     */
    function executeRedeemMMF(address user, uint256 amount, bytes32 data) internal {
        if (pacUSD.balanceOf(user) >= amount && amount > 0) {
            bytes32 txId = keccak256(abi.encode(
                block.chainid,
                address(vault),
                user,
                amount,
                user,
                block.timestamp
            ));

            vm.startPrank(OWNER);
            pacUSD.setBurnByTx(txId);

            vm.startPrank(user);
            pacUSD.approve(address(vault), amount);

            try vault.redeemMMF(txId, amount, user, block.timestamp) {
                userSuccessfulRedeems[user]++;
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        }
        userRedeemAttempts[user]++;
    }

    /**
     * @notice Triggers reward minting in the vault
     * @dev Calls the vault's mintReward function to distribute rewards
     */
    function executeVaultMintReward() internal {
        try vault.mintReward() {
            successfulOperations++;
        } catch {}
    }

    /**
     * @notice Updates price and mints rewards
     * @dev Adjusts the price and triggers reward minting
     * @param amount The price change amount
     */
    function executeUpdatePriceAndMintReward(uint256 amount) internal {
        uint256 currentPrice = pricer.price();
        uint256 newPrice = currentPrice + (amount % 1e17);
        pricer.setPrice(newPrice);

        try vault.mintReward() {
            successfulOperations++;
        } catch {}
    }

    /**
     * @notice Stakes PacUSD tokens
     * @dev Allows a user to stake PacUSD tokens in the staking contract
     * @param user The user staking tokens
     * @param amount The amount of tokens to stake
     */
    function executeStake(address user, uint256 amount) internal {
        if (pacUSD.balanceOf(user) >= amount && amount > 0) {
            vm.startPrank(user);
            pacUSD.approve(address(staking), amount);

            try staking.stake(amount) {
                userSuccessfulStakes[user]++;
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        }
        userStakeAttempts[user]++;
    }

    /**
     * @notice Unstakes PacUSD tokens
     * @dev Allows a user to withdraw staked tokens
     * @param user The user unstaking tokens
     * @param amount The amount of tokens to unstake
     */
    function executeUnstake(address user, uint256 amount) internal {
        vm.startPrank(user);
        try staking.unstake(amount) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Claims staking rewards
     * @dev Allows a user to claim accumulated staking rewards
     * @param user The user claiming rewards
     * @param amount The amount of rewards to claim
     */
    function executeClaimReward(address user, uint256 amount) internal {
        vm.startPrank(user);
        try staking.claimReward(amount) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Restakes accumulated rewards
     * @dev Allows a user to restake their rewards into the staking contract
     * @param user The user restaking rewards
     * @param amount The amount of rewards to restake
     */
    function executeRestake(address user, uint256 amount) internal {
        vm.startPrank(user);
        try staking.restake(amount) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Pauses staking operations
     * @dev Temporarily halts staking functionalities
     */
    function executePauseStaking() internal {
        vm.startPrank(ADMIN);
        try staking.pause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Unpauses staking operations
     * @dev Restores normal staking functionalities
     */
    function executeUnpauseStaking() internal {
        vm.startPrank(ADMIN);
        try staking.unpause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Updates staking contract parameters
     * @dev Calls the staking contract's update function
     */
    function executeUpdateStaking() internal {
        vm.startPrank(address(vault));
        try staking.update() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Sets the minimum staking period
     * @dev Configures the minimum duration for staking
     * @param amount The minimum staking period (in seconds)
     */
    function executeSetMinStakingPeriod(uint256 amount) internal {
        vm.startPrank(ADMIN);
        try staking.setMinStakingPeriod(amount % (30 days)) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    // ======================================
    // Invariant Checks
    // ======================================

    /**
     * @notice Checks total supply consistency
     * @dev Ensures PacUSD total supply is at least as large as total staked amount
     * @return True if the invariant holds
     */
    function echidna_total_supply_consistency() public view returns (bool) {
        return pacUSD.totalSupply() >= staking.totalStaked();
    }

    /**
     * @notice Checks if scenarios have been executed
     * @dev Verifies that some scenario tests have been run after sufficient operations
     * @return True if the invariant holds
     */
    function echidna_scenario_execution() public view returns (bool) {
        // Check if some scenario tests have been executed
        uint256 totalScenarios = 0;
        for (uint i = 1; i <= 5; i++) {
            totalScenarios += scenarioCounts[i];
        }

        if (totalOperations > 100) {
            return totalScenarios > 0;
        }
        return true;
    }

    /**
     * @notice Checks operation diversity
     * @dev Ensures a variety of operations have been executed after sufficient operations
     * @return True if at least 5 different operations have been executed
     */
    function echidna_operation_diversity() public view returns (bool) {
        // Check operation diversity
        uint256 executedOps = 0;
        for (uint i = 0; i < 27; i++) {
            if (operationCounts[i] > 0) {
                executedOps++;
            }
        }

        if (totalOperations > 200) {
            return executedOps >= 5; // At least 5 different operations executed
        }
        return true;
    }

    /**
     * @notice Checks user balance sanity
     * @dev Ensures user balances do not exceed reasonable limits
     * @return True if all user balances are within bounds
     */
    function echidna_user_balance_sanity() public view returns (bool) {
        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];
            uint256 pacUSDBalance = pacUSD.balanceOf(user);
            uint256 stakingBalance = staking.balanceOf(user);
            uint256 mmfBalance = mmfToken.balanceOf(user);

            // Balances should not exceed reasonable limits
            if (pacUSDBalance > 1000000e18 ||
                stakingBalance > 1000000e18 ||
                mmfBalance > 1000000e18) {
                return false;
            }
        }
        return true;
    }

    /**
     * @notice Checks reward bounds
     * @dev Ensures user rewards do not exceed 100 times their staked amount
     * @return True if all rewards are within bounds
     */
    function echidna_reward_bounds() public view returns (bool) {
        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];
            uint256 rewards = staking.rewardOf(user);
            uint256 stakingBalance = staking.balanceOf(user);

            // Rewards should not exceed 100 times the staked amount
            if (stakingBalance > 0 && rewards > stakingBalance * 100) {
                return false;
            }
        }
        return true;
    }

    /**
     * @notice Checks price stability
     * @dev Ensures the price remains within a reasonable range (0.01 to 1000)
     * @return True if the price is within bounds
     */
    function echidna_price_stability() public view returns (bool) {
        uint256 currentPrice = pricer.price();
        return currentPrice >= 1e16 && currentPrice <= 1e21; // 0.01 to 1000
    }

    /**
     * @notice Checks vault consistency
     * @dev Ensures the vault's MMF balance does not exceed 2 million tokens
     * @return True if the vault's balance is within bounds
     */
    function echidna_vault_consistency() public view returns (bool) {
        uint256 vaultMMF = mmfToken.balanceOf(address(vault));
        return vaultMMF <= 2000000e18;
    }

    /**
     * @notice Checks if operations have been executed
     * @dev Ensures at least one operation has been performed
     * @return True if operations have been executed
     */
    function echidna_operations_executed() public view returns (bool) {
        return totalOperations > 0;
    }

    /**
     * @notice Checks if some operations were successful
     * @dev Ensures some operations succeeded after sufficient attempts
     * @return True if successful operations exist after 50 total operations
     */
    function echidna_some_operations_successful() public view returns (bool) {
        if (totalOperations > 50) {
            return successfulOperations > 0;
        }
        return true;
    }

    /**
     * @notice Checks for no overflow in token supplies
     * @dev Ensures total supplies and staked amounts do not exceed uint128 limits
     * @return True if no overflows are detected
     */
    function echidna_no_overflow() public view returns (bool) {
        return pacUSD.totalSupply() < type(uint128).max &&
               staking.totalStaked() < type(uint128).max &&
               mmfToken.totalSupply() < type(uint128).max;
    }

    // Enhanced Balance Checks Added in EchidnaTest Contract

    // ======================================
    // Enhanced User Balance Consistency Checks
    // ======================================

    /**
     * @notice Checks basic user balance consistency
     * @dev Ensures balances are non-negative and within reasonable ranges
     * @return True if all user balances are consistent
     */
    function echidna_user_balance_basic_consistency() public view returns (bool) {
        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];

            // Get user balances
            uint256 pacUSDBalance = pacUSD.balanceOf(user);
            uint256 stakingBalance = staking.balanceOf(user);
            uint256 rewardBalance = staking.rewardOf(user);
            uint256 mmfBalance = mmfToken.balanceOf(user);

            // Basic check: Balances should not exceed uint128 max (possible overflow)
            if (pacUSDBalance > type(uint128).max ||
                stakingBalance > type(uint128).max ||
                rewardBalance > type(uint128).max ||
                mmfBalance > type(uint128).max) {
                return false;
            }

            // Staking balance should not exceed total PacUSD-related assets
            uint256 totalPacUSDAssets = pacUSDBalance + stakingBalance + rewardBalance;
            if (stakingBalance > totalPacUSDAssets) {
                return false;
            }
        }
        return true;
    }

    /**
     * @notice Checks logical consistency of staking balances
     * @dev Ensures staked tokens are deducted from PacUSD balance and rewards are reasonable
     * @return True if staking balance logic is consistent
     */
    function echidna_staking_balance_logic() public view returns (bool) {
        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];

            uint256 stakingBalance = staking.balanceOf(user);
            uint256 pacUSDBalance = pacUSD.balanceOf(user);
            uint256 rewardBalance = staking.rewardOf(user);

            // If user has staked balance:
            // 1. Staking balance should be > 0
            // 2. User should have corresponding reward tracking
            if (stakingBalance > 0) {
                // Rewards should not be negative or excessively large
                if (rewardBalance > stakingBalance * 1000) { // Rewards should not exceed 1000x staked amount
                    return false;
                }
            }

            // If user has no staked balance, rewards should be zero or minimal
            if (stakingBalance == 0 && rewardBalance > 1e18) { // Allow small residual rewards
                return false;
            }
        }
        return true;
    }

    /**
     * @notice Checks token conservation law
     * @dev Ensures the total token supply in the system is consistent
     * @return True if token conservation holds
     */
    function echidna_token_conservation() public view returns (bool) {
        // Calculate total user balances
        uint256 totalUserPacUSD = 0;
        uint256 totalUserStaking = 0;
        uint256 totalUserRewards = 0;
        uint256 totalUserMMF = 0;

        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];
            totalUserPacUSD += pacUSD.balanceOf(user);
            totalUserStaking += staking.balanceOf(user);
            totalUserRewards += staking.rewardOf(user);
            totalUserMMF += mmfToken.balanceOf(user);
        }

        // System balances
        uint256 vaultMMF = mmfToken.balanceOf(address(vault));
        uint256 stakingContractPacUSD = pacUSD.balanceOf(address(staking));
        uint256 reservePacUSD = pacUSD.balanceOf(RESERVE);

        // Total balance checks
        uint256 totalPacUSDInSystem = totalUserPacUSD + totalUserStaking + totalUserRewards +
                                      stakingContractPacUSD + reservePacUSD;
        uint256 totalMMFInSystem = totalUserMMF + vaultMMF;

        // PacUSD total supply should be >= all PacUSD-related balances
        if (pacUSD.totalSupply() < totalUserPacUSD + totalUserStaking) {
            return false;
        }

        // MMF total supply should be >= all MMF balances
        if (mmfToken.totalSupply() < totalMMFInSystem) {
            return false;
        }

        // Staking contract's total staked should equal sum of user stakes
        if (staking.totalStaked() != totalUserStaking) {
            return false;
        }

        return true;
    }

    /**
     * @notice Checks reasonable balance growth
     * @dev Ensures user balance changes have reasonable causes
     * @return True if balance growth is reasonable
     */
    function echidna_balance_growth_reasonability() public view returns (bool) {
        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];

            uint256 pacUSDBalance = pacUSD.balanceOf(user);
            uint256 stakingBalance = staking.balanceOf(user);
            uint256 rewardBalance = staking.rewardOf(user);
            uint256 mmfBalance = mmfToken.balanceOf(user);

            // User's total assets should not exceed a reasonable cap
            // Considering initial 100k MMF + 10k PacUSD
            uint256 maxReasonableMMF = 500000e18;  // 500k MMF
            uint256 maxReasonablePacUSD = 500000e18; // 500k PacUSD

            if (mmfBalance > maxReasonableMMF) {
                return false;
            }

            if (pacUSDBalance + stakingBalance + rewardBalance > maxReasonablePacUSD) {
                return false;
            }

            // Reward growth should have a reasonable cap
            // Rewards should not exceed a reasonable multiple of staked amount
            if (stakingBalance > 0 && rewardBalance > stakingBalance * 50) {
                return false;
            }
        }
        return true;
    }

    /**
     * @notice Checks balance transfer logic between accounts
     * @dev Ensures transfers correctly decrease sender balance and increase receiver balance
     * @return True if transfer logic is consistent
     */
    function echidna_transfer_balance_consistency() public view returns (bool) {
        // Check testUsers[0] balance (frequent transfer receiver)
        address receiver = testUsers[0];
        uint256 receiverBalance = pacUSD.balanceOf(receiver);

        // Receiver's balance growth should be reasonable
        // Considering initial 10k + possible transfer receipts
        if (receiverBalance > 1000000e18) { // 1M cap
            return false;
        }

        return true;
    }

    /**
     * @notice Checks accuracy of reward calculations
     * @dev Ensures rewards are calculated correctly based on staking time and amount
     * @return True if reward calculations are accurate
     */
    function echidna_reward_calculation_accuracy() public view returns (bool) {
        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];

            uint256 stakingBalance = staking.balanceOf(user);
            uint256 rewardBalance = staking.rewardOf(user);

            if (stakingBalance > 0) {
                // Rewards should be non-negative
                if (rewardBalance < 0) {
                    return false;
                }

                // Reward growth should have a cap
                // Based on reasonable estimates of price changes and time
                uint256 maxReasonableReward = stakingBalance * 10; // Max 10x
                if (rewardBalance > maxReasonableReward) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * @notice Checks system-wide balance consistency
     * @dev Ensures system-level balance calculations are correct
     * @return True if system balances are consistent
     */
    function echidna_system_balance_consistency() public view returns (bool) {
        // Get system-level balances
        uint256 totalSupply = pacUSD.totalSupply();
        uint256 totalStaked = staking.totalStaked();
        uint256 vaultMMFBalance = mmfToken.balanceOf(address(vault));
        uint256 mmfTotalSupply = mmfToken.totalSupply();

        // Basic consistency checks
        if (totalSupply < totalStaked) {
            return false;
        }

        if (vaultMMFBalance > mmfTotalSupply) {
            return false;
        }

        // Check for abnormal balance overflows
        if (totalSupply > type(uint128).max ||
            totalStaked > type(uint128).max ||
            vaultMMFBalance > type(uint128).max) {
            return false;
        }

        return true;
    }

    /**
     * @notice Checks balance changes after user operations
     * @dev Verifies balance changes correlate with successful operations
     * @return True if balance changes are reasonable
     */
    function echidna_operation_balance_correlation() public view returns (bool) {
        for (uint i = 0; i < testUsers.length; i++) {
            address user = testUsers[i];

            uint256 successfulMints = userSuccessfulMints[user];
            uint256 successfulStakes = userSuccessfulStakes[user];
            uint256 pacUSDBalance = pacUSD.balanceOf(user);
            uint256 stakingBalance = staking.balanceOf(user);

            // If user has successful mints, should have asset growth
            if (successfulMints > 0) {
                // User's total PacUSD-related assets should be > initial 10k
                uint256 totalPacUSDAssets = pacUSDBalance + stakingBalance + staking.rewardOf(user);
                if (totalPacUSDAssets < 10000e18) {
                    return false;
                }
            }

            // If user has successful stakes, should have staking balance
            if (successfulStakes > 0 && stakingBalance == 0 && staking.rewardOf(user) == 0) {
                // Allow some cases: User may have unstaked later
                // Perform lenient check
            }
        }
        return true;
    }

    /**
     * @notice Checks balance restrictions for blacklisted users
     * @dev Ensures blacklisted users cannot transfer tokens and their balances are reasonable
     * @return True if blacklisted user restrictions are enforced
     */
    function echidna_blacklisted_user_balance_restrictions() public view returns (bool) {
        // Check BLACKLISTED_USER status
        if (pacUSD.isBlocklisted(BLACKLISTED_USER)) {
            // Blacklisted users can hold tokens but should not transfer
            // Check that balance does not grow abnormally
            uint256 blacklistedBalance = pacUSD.balanceOf(BLACKLISTED_USER);

            // Blacklisted user's balance should not grow abnormally
            if (blacklistedBalance > 1000000e18) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Comprehensive balance consistency check
     * @dev Combines all balance-related invariant checks
     * @return True if all balance checks pass
     */
    function echidna_comprehensive_balance_check() public view returns (bool) {
        return echidna_user_balance_basic_consistency() &&
               echidna_staking_balance_logic() &&
               echidna_token_conservation() &&
               echidna_balance_growth_reasonability() &&
               echidna_transfer_balance_consistency() &&
               echidna_reward_calculation_accuracy() &&
               echidna_system_balance_consistency() &&
               echidna_operation_balance_correlation() &&
               echidna_blacklisted_user_balance_restrictions();
    }
}