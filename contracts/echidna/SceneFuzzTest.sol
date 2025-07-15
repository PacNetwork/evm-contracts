// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import "./BaseFuzz.sol";

/**
 * @title SceneFuzzTest
 * @notice Optimized fuzz test contract for testing various scenarios and invariants
 */
contract SceneFuzzTest is BaseFuzz {
    // ======================================
    // State Variables (Gas Optimized)
    // ======================================

    // Pack small counters together (saves gas)
    uint128 public setupSuccessCount;
    uint128 public setupFailCount;
    uint128 public totalMintAttempts;
    uint128 public totalMintSuccesses;
    uint128 public totalRedeemAttempts;
    uint128 public totalRedeemSuccesses;
    uint128 public totalStakeAttempts;
    uint128 public totalStakeSuccesses;

    // Single slot for flags
    bool public testsInitialized;

    // Operation tracking
    mapping(uint256 => uint256) public operationCounts;
    mapping(uint256 => uint256) public scenarioCounts;

    // Simplified error tracking
    uint256 public lastOperationTimestamp;
    bytes32 public lastErrorHash; // More gas efficient than string

    // Price constants
    uint256 public constant INITIAL_PRICE = 1e18;
    uint256 public constant MIN_PRICE = 5e17;
    uint256 public constant MAX_PRICE = 5e18;

    constructor() {
        deployAndInitialize();
        setupuserList();
        testsInitialized = true;
    }

    /**
     * @notice Sets up the initial user list with MMF and PacUSD balances
     */
    function setupuserList() internal {
        userList.push(address(0x1001));
        userList.push(address(0x1002));
        userList.push(address(0x1003));
        userList.push(address(0x1004));
        userList.push(address(0x1005));

        for (uint i = 0; i < userList.length; i++) {
            address user = userList[i];
            knownUsers[user] = true;

            // Mint initial tokens
            mmfToken.mint(user, 1000e18);
            mmfToken2.mint(user, 1000e18);

            // Setup initial PacUSD balances
            bool success1 = _mintInitialPacUSD(user, 5000e18);
            bool success2 = _mintInitialPacUSDFromVault2(user, 5000e18);

            if (success1 || success2) {
                setupSuccessCount++;
            } else {
                setupFailCount++;
            }
        }
    }

    // ======================================
    // Unified Mint Functions (Remove Duplication)
    // ======================================

    /**
     * @notice Unified mint function for both vaults
     * @param user The user address
     * @param amount Amount of MMF to mint PacUSD
     * @param seed Random seed for transaction ID
     * @param useVault2 Whether to use vault2 (true) or vault1 (false)
     * @return bool Success status of the mint operation
     */
    function _mintPacUSDUnified(
        address user,
        uint256 amount,
        uint256 seed,
        bool useVault2
    ) internal returns (bool) {
        totalMintAttempts++;

        MMFVault targetVault = useVault2 ? vault2 : vault;
        MockERC20 targetToken = useVault2 ? mmfToken2 : mmfToken;

        if (targetToken.balanceOf(user) < amount || amount == 0) {
            _recordErrorHash("Insufficient balance or zero amount");
            return false;
        }

        uint256 timestamp = block.timestamp + seed % 1000;
        bytes32 txId = keccak256(abi.encode(
            block.chainid,
            address(targetVault),
            user,
            amount,
            user,
            timestamp
        ));

        return _executeMintOperation(targetVault, targetToken, user, amount, txId, timestamp);
    }

    /**
     * @notice Unified redeem function for both vaults
     * @param user The user address
     * @param pacUSDAmount Amount of PacUSD to redeem
     * @param seed Random seed for transaction ID
     * @param useVault2 Whether to use vault2 (true) or vault1 (false)
     * @return bool Success status of the redeem operation
     */
    function _redeemMMFUnified(
        address user,
        uint256 pacUSDAmount,
        uint256 seed,
        bool useVault2
    ) internal returns (bool) {
        if (pacUSD.balanceOf(user) < pacUSDAmount || pacUSDAmount == 0) return false;

        MMFVault targetVault = useVault2 ? vault2 : vault;
        uint256 timestamp = block.timestamp + seed % 1000;
        bytes32 txId = keccak256(abi.encode(
            block.chainid,
            address(targetVault),
            user,
            pacUSDAmount,
            user,
            timestamp
        ));

        vm.startPrank(OWNER);
        try pacUSD.setBurnByTx(txId) {
            vm.stopPrank();

            vm.startPrank(user);
            pacUSD.approve(address(targetVault), pacUSDAmount);
            try targetVault.redeemMMF(txId, pacUSDAmount, user, timestamp) {
                userSuccessfulRedeems[user]++;
                successfulOperations++;
                vm.stopPrank();
                return true;
            } catch {
                vm.stopPrank();
                return false;
            }
        } catch {
            vm.stopPrank();
            return false;
        }
    }

    /**
     * @notice Execute mint operation with error handling
     * @param targetVault The vault to mint from
     * @param targetToken The MMF token to use
     * @param user The user address
     * @param amount Amount to mint
     * @param txId Transaction ID
     * @param timestamp Timestamp for the transaction
     * @return bool Success status of the operation
     */
    function _executeMintOperation(
        MMFVault targetVault,
        MockERC20 targetToken,
        address user,
        uint256 amount,
        bytes32 txId,
        uint256 timestamp
    ) internal returns (bool) {
        vm.startPrank(OWNER);
        try pacUSD.setMintByTx(txId) {
            vm.stopPrank();

            vm.startPrank(user);
            targetToken.approve(address(targetVault), amount);
            try targetVault.mintPacUSD(txId, amount, user, timestamp) {
                userSuccessfulMints[user]++;
                successfulOperations++;
                totalMintSuccesses++;
                vm.stopPrank();
                return true;
            } catch {
                vm.stopPrank();
                return false;
            }
        } catch {
            vm.stopPrank();
            return false;
        }
    }

    // ======================================
    // Initial Setup Functions (Optimized)
    // ======================================

    /**
     * @notice Mints initial PacUSD for a user from vault1
     * @param user The user address
     * @param amount The amount of PacUSD to mint
     * @return bool Success status of the mint operation
     */
    function _mintInitialPacUSD(address user, uint256 amount) internal returns (bool) {
        return _mintPacUSDUnified(user, amount, 0, false);
    }

    /**
     * @notice Mints initial PacUSD for a user from vault2
     * @param user The user address
     * @param amount The amount of PacUSD to mint
     * @return bool Success status of the mint operation
     */
    function _mintInitialPacUSDFromVault2(address user, uint256 amount) internal returns (bool) {
        return _mintPacUSDUnified(user, amount, 1, true);
    }

    // ======================================
    // Scenario Functions (Keep Original Names)
    // ======================================

    /**
     * @notice Tests a complete user lifecycle: mint, stake, price increase, restake
     * @param seed Random seed for transaction IDs
     * @param userIndex Index of the user in userList
     * @param amount Amount for mint and stake operations
     */
    function scenario_UserLifecycle(
        uint256 seed,
        uint256 userIndex,
        uint256 amount
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % userList.length;
        address user = userList[userIndex];
        amount = (amount % 10000e18) + 1000e18;

        scenarioCounts[1]++;

        executeMintPacUSD(user, amount, seed);
        executeStake(user, amount / 2);
        _increasePriceAndMintReward(1e16);
        executeRestake(user, amount / 4);

        totalOperations += 4;
    }

    // ======================================
    // Scenario 2: Liquidity Management
    // ======================================
    /**
     * @notice Tests liquidity management: mint/stake, unstake/redeem, or claim/restake
     * @param seed Random seed for transaction IDs
     * @param userIndex Index of the user in userList
     * @param amount Amount for operations
     * @param action Action type (0: mint+stake, 1: unstake+redeem, 2: claim+restake)
     */
    function scenario_LiquidityManagement(
        uint256 seed,
        uint256 userIndex,
        uint256 amount,
        uint256 action
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % userList.length;
        address user = userList[userIndex];
        amount = (amount % 5000e18) + 500e18;
        action = action % 3;

        scenarioCounts[2]++;

        if (action == 0) {
            executeMintPacUSD(user, amount, seed);
            executeStake(user, amount * 80 / 100);
        } else if (action == 1) {
            executeUnstake(user, amount);
            executeRedeemMMF(user, amount / 2, seed);
        } else {
            executeClaimReward(user);
            executeRestake(user, amount / 3);
        }

        totalOperations += 2;
    }

    // ======================================
    // Scenario 3: Price Volatility Response
    // ======================================
    /**
     * @notice Tests user response to price volatility
     * @param seed Random seed for transaction IDs
     * @param userIndex Index of the user in userList
     * @param priceChange Amount of price change
     * @param response User response (0: stake more, 1: unstake)
     */
    function scenario_PriceVolatility(
        uint256 seed,
        uint256 userIndex,
        uint256 priceChange,
        uint256 response
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % userList.length;
        address user = userList[userIndex];
        priceChange = (priceChange % 5e16) + 1e15;
        response = response % 2;

        scenarioCounts[3]++;

        _increasePriceAndMintReward(priceChange);

        if (response == 0) {
            executeStake(user, priceChange * 100);
        } else {
            executeUnstake(user, priceChange * 50);
        }

        totalOperations += 2;
    }

    // ======================================
    // Scenario 4: Admin Operations
    // ======================================
    /**
     * @notice Tests admin operations: pause, unpause, blocklist, or staking period update
     * @param userIndex Index of the user in userList
     * @param operation Operation type (0: pause/unpause, 1: blocklist, 2: staking pause, 3: set staking period)
     */
    function scenario_AdminOperations(
        uint256 userIndex,
        uint256 operation
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % userList.length;
        address user = userList[userIndex];
        operation = operation % 4;

        scenarioCounts[4]++;

        if (operation == 0) {
            executePause();
            executeUnpause();
        } else if (operation == 1) {
            executeAddToBlocklist(user);
            executeRemoveFromBlocklist(user);
        } else if (operation == 2) {
            executePauseStaking();
            executeUnpauseStaking();
        } else {
            executeSetMinStakingPeriod(7 days);
        }

        totalOperations += 2;
    }

    // ======================================
    // Scenario 5: Multi-Vault Operations
    // ======================================
    /**
     * @notice Tests operations across multiple vaults with different MMF tokens
     * @param seed Random seed for transaction IDs
     * @param userIndex Index of the user in userList
     * @param amount1 Amount for vault1 operations
     * @param amount2 Amount for vault2 operations
     * @param operation Operation type (0: mint both, 1: arbitrage, 2: cross-vault redeem)
     */
    function scenario_MultiVaultOperations(
        uint256 seed,
        uint256 userIndex,
        uint256 amount1,
        uint256 amount2,
        uint256 operation
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % userList.length;
        address user = userList[userIndex];
        amount1 = (amount1 % 5000e18) + 100e18;
        amount2 = (amount2 % 5000e18) + 100e18;
        operation = operation % 3;

        scenarioCounts[5]++;

        if (operation == 0) {
            executeMintFromVault1(user, amount1, seed);
            executeMintFromVault2(user, amount2, seed + 1);
        } else if (operation == 1) {
            executeArbitrageOperations(user, amount1, seed);
        } else {
            executeCrossVaultRedeem(user, amount1, amount2, seed);
        }

        totalOperations += 2;
    }

    // ======================================
    // Scenario 6: Multi-Vault Price Divergence
    // ======================================
    /**
     * @notice Tests system behavior when vault prices diverge
     * @param userIndex Index of the user in userList
     * @param priceChange1 Price change for vault1
     * @param priceChange2 Price change for vault2
     * @param userResponse User response strategy
     */
    function scenario_MultiVaultPriceDivergence(
        uint256 userIndex,
        uint256 priceChange1,
        uint256 priceChange2,
        uint256 userResponse
    ) public {
        if (!testsInitialized) return;

        userIndex = userIndex % userList.length;
        address user = userList[userIndex];
        priceChange1 = (priceChange1 % 1e17) + 1e15;
        priceChange2 = (priceChange2 % 1e17) + 1e15;
        userResponse = userResponse % 4;

        scenarioCounts[6]++;

        _setPriceForVault1(pricer.price() + priceChange1);
        _setPriceForVault2(pricer2.price() + priceChange2);

        if (userResponse == 0) {
            if (pricer.price() < pricer2.price()) {
                executeMintFromVault1(user, 1000e18, block.timestamp);
            } else {
                executeMintFromVault2(user, 1000e18, block.timestamp);
            }
        } else if (userResponse == 1) {
            if (pricer.price() > pricer2.price()) {
                executeRedeemFromVault1(user, 500e18, block.timestamp);
            } else {
                executeRedeemFromVault2(user, 500e18, block.timestamp);
            }
        } else if (userResponse == 2) {
            executeStake(user, 200e18);
        } else {
            executeClaimReward(user);
            executeRestake(user, 100e18);
        }

        totalOperations += 2;
    }

    // ======================================
    // Scenario 7: Multi-Vault Liquidity Stress Test
    // ======================================
    /**
     * @notice Stress tests liquidity across multiple vaults
     * @param seed Random seed
     * @param userIndex1 First user index
     * @param userIndex2 Second user index
     * @param amount Large amount for stress testing
     */
    function scenario_MultiVaultLiquidityStress(
        uint256 seed,
        uint256 userIndex1,
        uint256 userIndex2,
        uint256 amount
    ) public {
        if (!testsInitialized) return;

        userIndex1 = userIndex1 % userList.length;
        userIndex2 = userIndex2 % userList.length;
        address user1 = userList[userIndex1];
        address user2 = userList[userIndex2];
        amount = (amount % 10000e18) + 1000e18;

        scenarioCounts[7]++;

        executeMintFromVault1(user1, amount, seed);
        executeMintFromVault2(user1, amount, seed + 1);
        executeRedeemFromVault1(user2, amount / 2, seed + 2);
        executeRedeemFromVault2(user2, amount / 2, seed + 3);
        executeStake(user1, amount / 4);
        executeUnstake(user2, amount / 8);

        totalOperations += 6;
    }

    // ======================================
    // Operation Implementations (Simplified)
    // ======================================

    /**
     * @notice Executes mintPacUSD operation from vault1
     * @param user User address
     * @param mmfAmount Amount of MMF to mint PacUSD
     * @param seed Random seed for transaction ID
     */
    function executeMintPacUSD(address user, uint256 mmfAmount, uint256 seed) internal {
        _mintPacUSDUnified(user, mmfAmount, seed, false);
        userMintAttempts[user]++;
    }

    /**
     * @notice Executes mint operation from vault1 (MMF1 -> PacUSD)
     * @param user User address
     * @param mmfAmount Amount of MMF to mint PacUSD
     * @param seed Random seed for transaction ID
     */
    function executeMintFromVault1(address user, uint256 mmfAmount, uint256 seed) internal {
        _mintPacUSDUnified(user, mmfAmount, seed, false);
    }

    /**
     * @notice Executes mint operation from vault2 (MMF2 -> PacUSD)
     * @param user User address
     * @param mmfAmount Amount of MMF2 to mint PacUSD
     * @param seed Random seed for transaction ID
     */
    function executeMintFromVault2(address user, uint256 mmfAmount, uint256 seed) internal {
        // Ensure user has MMF2 tokens
        if (mmfToken2.balanceOf(user) < mmfAmount) {
            mmfToken2.mint(user, mmfAmount * 2);
        }
        _mintPacUSDUnified(user, mmfAmount, seed, true);
    }

    /**
     * @notice Executes redeemMMF operation from vault1
     * @param user User address
     * @param pacUSDAmount Amount of PacUSD to redeem
     * @param seed Random seed for transaction ID
     */
    function executeRedeemMMF(address user, uint256 pacUSDAmount, uint256 seed) internal {
        _redeemMMFUnified(user, pacUSDAmount, seed, false);
        userRedeemAttempts[user]++;
    }

    /**
     * @notice Executes redeem operation from vault1 (PacUSD -> MMF1)
     * @param user User address
     * @param pacUSDAmount Amount of PacUSD to redeem
     * @param seed Random seed for transaction ID
     */
    function executeRedeemFromVault1(address user, uint256 pacUSDAmount, uint256 seed) internal {
        _redeemMMFUnified(user, pacUSDAmount, seed, false);
    }

    /**
     * @notice Executes redeem operation from vault2 (PacUSD -> MMF2)
     * @param user User address
     * @param pacUSDAmount Amount of PacUSD to redeem
     * @param seed Random seed for transaction ID
     */
    function executeRedeemFromVault2(address user, uint256 pacUSDAmount, uint256 seed) internal {
        _redeemMMFUnified(user, pacUSDAmount, seed, true);
    }

    /**
     * @notice Executes stake operation
     * @param user User address
     * @param amount Amount to stake
     * @return bool Success status of the stake operation
     */
    function executeStake(address user, uint256 amount) internal returns (bool) {
        totalStakeAttempts++;

        if (pacUSD.balanceOf(user) < amount || amount == 0) {
            _recordErrorHash("Insufficient PacUSD or zero amount for staking");
            return false;
        }

        vm.startPrank(user);
        pacUSD.approve(address(staking), amount);
        try staking.stake(amount) {
            userSuccessfulStakes[user]++;
            successfulOperations++;
            totalStakeSuccesses++;
            vm.stopPrank();
            return true;
        } catch {
            vm.stopPrank();
            return false;
        }
        userStakeAttempts[user]++;
    }

    /**
     * @notice Executes unstake operation
     * @param user User address
     * @param amount Amount to unstake
     * @return bool Success status of the unstake operation
     */
    function executeUnstake(address user, uint256 amount) internal returns (bool) {
        if (staking.balanceOf(user) < amount || amount == 0) return false;

        vm.startPrank(user);
        try staking.unstake(amount) {
            successfulOperations++;
            vm.stopPrank();
            return true;
        } catch {
            vm.stopPrank();
            return false;
        }
    }

    /**
     * @notice Executes restake operation
     * @param user User address
     * @param amount Amount to restake
     * @return bool Success status of the restake operation
     */
    function executeRestake(address user, uint256 amount) internal returns (bool) {
        if (staking.rewardOf(user) < amount || amount == 0) return false;

        vm.startPrank(user);
        try staking.restake(amount) {
            successfulOperations++;
            vm.stopPrank();
            return true;
        } catch {
            vm.stopPrank();
            return false;
        }
    }

    /**
     * @notice Executes claimReward operation
     * @param user User address
     * @return bool Success status of the claim operation
     */
    function executeClaimReward(address user) internal returns (bool) {
        uint256 reward = staking.rewardOf(user);
        if (reward == 0) return false;

        vm.startPrank(user);
        try staking.claimReward(reward) {
            successfulOperations++;
            vm.stopPrank();
            return true;
        } catch {
            vm.stopPrank();
            return false;
        }
    }

    /**
     * @notice Executes transfer operation
     * @param user User address
     * @param amount Amount to transfer
     */
    function executeTransfer(address user, uint256 amount) internal {
        if (pacUSD.balanceOf(user) < amount || amount == 0) return;

        address to = userList[(uint256(keccak256(abi.encode(user))) % userList.length)];
        if (to == user) to = userList[0];

        vm.startPrank(user);
        try pacUSD.transfer(to, amount) {
            userSuccessfulTransfers[user]++;
            successfulOperations++;
        } catch {}
        vm.stopPrank();
        userTransferAttempts[user]++;
    }

    /**
     * @notice Executes approve operation
     * @param user User address
     * @param amount Amount to approve
     */
    function executeApprove(address user, uint256 amount) internal {
        vm.startPrank(user);
        try pacUSD.approve(address(vault), amount) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Executes transferFrom operation
     * @param user User address
     * @param amount Amount to transfer
     */
    function executeTransferFrom(address user, uint256 amount) internal {
        address from = userList[0];
        if (pacUSD.allowance(from, user) < amount || amount == 0) return;

        vm.startPrank(user);
        try pacUSD.transferFrom(from, userList[1], amount) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Executes arbitrage operations between vaults
     * @param user User address
     * @param amount Amount for arbitrage
     * @param seed Random seed for transaction IDs
     * @return bool Success status of the arbitrage operation
     */
    function executeArbitrageOperations(address user, uint256 amount, uint256 seed) internal returns (bool) {
        uint256 price1 = pricer.price();
        uint256 price2 = pricer2.price();

        if (price1 != price2) {
            if (price1 < price2) {
                executeMintFromVault1(user, amount, seed);
                executeRedeemFromVault2(user, amount / 2, seed + 1);
            } else {
                executeMintFromVault2(user, amount, seed);
                executeRedeemFromVault1(user, amount / 2, seed + 1);
            }
            return true;
        }
        return false;
    }

    /**
     * @notice Executes cross-vault redeem operations
     * @param user User address
     * @param amount1 Amount for vault1 operation
     * @param amount2 Amount for vault2 operation
     * @param seed Random seed for transaction IDs
     * @return bool Success status of the operation
     */
    function executeCrossVaultRedeem(address user, uint256 amount1, uint256 amount2, uint256 seed) internal returns (bool) {
        executeMintFromVault1(user, amount1, seed);
        executeRedeemFromVault2(user, amount2, seed + 1);
        return true;
    }

    /**
     * @notice Increases price and triggers mintReward
     * @param priceIncrease Amount to increase price by
     */
    function _increasePriceAndMintReward(uint256 priceIncrease) internal {
        uint256 currentPrice = pricer.price();
        uint256 newPrice = currentPrice + priceIncrease;

        if (newPrice > MAX_PRICE) newPrice = MAX_PRICE;

        pricer.setPrice(newPrice);

        try vault.mintReward() {
            successfulOperations++;
            totalOperations++;
        } catch {}
    }

    /**
     * @notice Sets price for vault1's pricer
     * @param newPrice New price to set
     */
    function _setPriceForVault1(uint256 newPrice) internal {
        if (newPrice >= MIN_PRICE && newPrice <= MAX_PRICE) {
            pricer.setPrice(newPrice);
            try vault.mintReward() {
                successfulOperations++;
            } catch {}
        }
    }

    /**
     * @notice Sets price for vault2's pricer
     * @param newPrice New price to set
     */
    function _setPriceForVault2(uint256 newPrice) internal {
        if (newPrice >= MIN_PRICE && newPrice <= MAX_PRICE) {
            pricer2.setPrice(newPrice);
            try vault2.mintReward() {
                successfulOperations++;
            } catch {}
        }
    }

    // ======================================
    // Admin Operations
    // ======================================

    /**
     * @notice Pauses the PacUSD contract
     */
    function executePause() internal {
        vm.startPrank(OWNER);
        try pacUSD.pause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Unpauses the PacUSD contract
     */
    function executeUnpause() internal {
        vm.startPrank(OWNER);
        try pacUSD.unpause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Adds a user to the blocklist
     * @param user User address to blocklist
     */
    function executeAddToBlocklist(address user) internal {
        vm.startPrank(OWNER);
        try pacUSD.addToBlocklist(user) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Removes a user from the blocklist
     * @param user User address to remove from blocklist
     */
    function executeRemoveFromBlocklist(address user) internal {
        vm.startPrank(OWNER);
        try pacUSD.removeFromBlocklist(user) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Pauses the staking contract
     */
    function executePauseStaking() internal {
        vm.startPrank(ADMIN);
        try staking.pause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Unpauses the staking contract
     */
    function executeUnpauseStaking() internal {
        vm.startPrank(ADMIN);
        try staking.unpause() {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Sets the minimum staking period
     * @param period New minimum staking period
     */
    function executeSetMinStakingPeriod(uint256 period) internal {
        vm.startPrank(ADMIN);
        try staking.setMinStakingPeriod(period) {
            successfulOperations++;
        } catch {}
        vm.stopPrank();
    }

    // ======================================
    // Random Operations (Enhanced)
    // ======================================

    /**
     * @notice Executes random operations for comprehensive testing
     * @param op Operation type (0-14)
     * @param amount Amount for operations
     * @param userIndex Index of the user in userList
     * @param seed Random seed for transaction IDs
     */
    function fuzz_RandomOperations(
        uint256 op,
        uint256 amount,
        uint256 userIndex,
        uint256 seed
    ) public {
        if (!testsInitialized) return;

        op = op % 15;
        userIndex = userIndex % userList.length;
        address user = userList[userIndex];
        amount = (amount % 5000e18) + 100e18;

        if (op == 0) {
            executeMintFromVault1(user, amount, seed);
        } else if (op == 1) {
            executeMintFromVault2(user, amount, seed);
        } else if (op == 2) {
            executeRedeemFromVault1(user, amount, seed);
        } else if (op == 3) {
            executeRedeemFromVault2(user, amount, seed);
        } else if (op == 4) {
            executeStake(user, amount);
        } else if (op == 5) {
            executeUnstake(user, amount);
        } else if (op == 6) {
            executeRestake(user, amount);
        } else if (op == 7) {
            executeClaimReward(user);
        } else if (op == 8) {
            executeTransfer(user, amount);
        } else if (op == 9) {
            _setPriceForVault1(pricer.price() + (amount % 1e16));
        } else if (op == 10) {
            _setPriceForVault2(pricer2.price() + (amount % 1e16));
        } else if (op == 11) {
            executeArbitrageOperations(user, amount, seed);
        } else if (op == 12) {
            executeCrossVaultRedeem(user, amount, amount / 2, seed);
        } else if (op == 13) {
            executeApprove(user, amount);
        } else if (op == 14) {
            executeTransferFrom(user, amount);
        }

        totalOperations++;
    }

    // ======================================
    // Invariants (Optimized)
    // ======================================

    /**
     * @notice Checks if operations are functioning (fails to show operation stats)
     * @return bool True if invariant holds, false otherwise
     */
    function echidna_operations_working() public view returns (bool) {
        if (totalOperations > 50) {
            return successfulOperations > 0 && totalMintAttempts > 0;
        }
        return true;
    }

    /**
     * @notice Checks token conservation across the system
     * @return bool True if total PacUSD supply matches system balances
     */
    function echidna_token_conservation() public view returns (bool) {
        uint256 totalUserPacUSD = _calculateTotalUserPacUSD();
        uint256 stakingContractBalance = pacUSD.balanceOf(address(staking));
        uint256 reserveBalance = pacUSD.balanceOf(RESERVE);
        uint256 vaultBalance = pacUSD.balanceOf(address(vault));

        uint256 totalPacUSDInSystem = totalUserPacUSD + stakingContractBalance + reserveBalance + vaultBalance;
        return pacUSD.totalSupply() == totalPacUSDInSystem;
    }

    /**
     * @notice Checks staking balance consistency
     * @return bool True if total staked matches user staking balances
     */
    function echidna_staking_consistency() public view returns (bool) {
        uint256 totalUserStaking = _calculateTotalUserStaking();
        return staking.totalStaked() == totalUserStaking;
    }

    /**
     * @notice Checks vault's MMF balance validity
     * @return bool True if vault's MMF balance is within total supply
     */
    function echidna_vault_mmf_balance() public view returns (bool) {
        uint256 vaultMMF = mmfToken.balanceOf(address(vault));
        uint256 mmfTotalSupply = mmfToken.totalSupply();
        return vaultMMF <= mmfTotalSupply;
    }

    /**
     * @notice Checks price stability within bounds
     * @return bool True if price is within MIN_PRICE and MAX_PRICE
     */
    function echidna_price_stability() public view returns (bool) {
        uint256 currentPrice = pricer.price();
        return currentPrice >= MIN_PRICE && currentPrice <= MAX_PRICE;
    }

    /**
     * @notice Checks if scenarios have been executed
     * @return bool True if at least one scenario has been executed after sufficient operations
     */
    function echidna_scenarios_executed() public view returns (bool) {
        if (totalOperations > 50) {
            uint256 totalScenarios = 0;
            for (uint i = 1; i <= 7; i++) {
                totalScenarios += scenarioCounts[i];
            }
            return totalScenarios > 0;
        }
        return true;
    }

    /**
     * @notice Checks staking contract balance consistency
     * @return bool True if staking contract balance matches expected
     */
    function echidna_staking_balance() public view returns (bool) {
        uint256 totalUserStaking = _calculateTotalUserStaking();
        uint256 totalUserRewards = _calculateTotalUserRewards();

        uint256 reserveStaking = staking.balanceOf(RESERVE);
        uint256 reserveReward = staking.rewardOf(RESERVE);
        uint256 stakingContractBalance = pacUSD.balanceOf(address(staking));

        uint256 expectedBalance = totalUserStaking + totalUserRewards + reserveStaking + reserveReward;

        // Allow up to 100 wei precision error
        uint256 diff = stakingContractBalance > expectedBalance
            ? stakingContractBalance - expectedBalance
            : expectedBalance - stakingContractBalance;

        return diff <= 100;
    }

    /**
     * @notice Checks total value conservation across both vaults
     * @return bool True if total system value is conserved
     */
    function echidna_multi_vault_value_conservation() public view returns (bool) {
        uint256 vault1MMF = mmfToken.balanceOf(address(vault));
        uint256 vault2MMF = mmfToken2.balanceOf(address(vault2));
        uint256 pacUSDTotalSupply = pacUSD.totalSupply();

        uint256 price1 = vault.lastPrice();
        uint256 price2 = vault2.lastPrice();

        uint256 vault1Value = (vault1MMF * price1) / 1e18;
        uint256 vault2Value = (vault2MMF * price2) / 1e18;
        uint256 totalVaultValue = vault1Value + vault2Value;

        uint256 diff = pacUSDTotalSupply > totalVaultValue
            ? pacUSDTotalSupply - totalVaultValue
            : totalVaultValue - pacUSDTotalSupply;

        return diff <= 100;
    }

    /**
     * @notice Checks that both vaults have reasonable MMF balances
     * @return bool True if both vault balances are within supply limits
     */
    function echidna_multi_vault_balance_sanity() public view returns (bool) {
        uint256 vault1MMF = mmfToken.balanceOf(address(vault));
        uint256 vault2MMF = mmfToken2.balanceOf(address(vault2));
        uint256 mmf1TotalSupply = mmfToken.totalSupply();
        uint256 mmf2TotalSupply = mmfToken2.totalSupply();

        return vault1MMF <= mmf1TotalSupply && vault2MMF <= mmf2TotalSupply;
    }

    /**
     * @notice Checks price consistency across vaults
     * @return bool True if both vault prices are within reasonable bounds
     */
    function echidna_multi_vault_price_consistency() public view returns (bool) {
        uint256 price1 = pricer.price();
        uint256 price2 = pricer2.price();

        bool price1Valid = price1 >= MIN_PRICE && price1 <= MAX_PRICE;
        bool price2Valid = price2 >= MIN_PRICE && price2 <= MAX_PRICE;

        return price1Valid && price2Valid;
    }

    /**
     * @notice Checks restrictions for blocklisted users
     * @return bool True if blocklisted user's balance is within limits
     */
    function echidna_blocklist_restrictions() public view returns (bool) {
        if (pacUSD.isBlocklisted(BLOCKLISTED_USER)) {
            uint256 balance = pacUSD.balanceOf(BLOCKLISTED_USER);
            // Blocklisted user's balance should not grow abnormally
            return balance <= 1000000e18;
        }
        return true;
    }

    /**
     * @notice Checks for no overflow in token supplies
     * @return bool True if total supplies are below uint128 max
     */
    function echidna_no_overflow() public view returns (bool) {
        return pacUSD.totalSupply() < type(uint128).max &&
        staking.totalStaked() < type(uint128).max &&
            mmfToken.totalSupply() < type(uint128).max;
    }

    /**
     * @notice Checks exchange rate sanity across both vaults
     * @return bool True if exchange rates are reasonable
     */
    function echidna_exchange_rate_sanity() public view returns (bool) {
        uint256 price1 = pricer.price();
        uint256 price2 = pricer2.price();
        uint256 vault1MMF = mmfToken.balanceOf(address(vault));
        uint256 vault2MMF = mmfToken2.balanceOf(address(vault2));
        uint256 pacUSDSupply = pacUSD.totalSupply();

        // Basic price range check for both prices
        if (price1 < MIN_PRICE || price1 > MAX_PRICE) {
            return false;
        }
        if (price2 < MIN_PRICE || price2 > MAX_PRICE) {
            return false;
        }

        // Skip ratio check if no MMF or PacUSD supply
        if ((vault1MMF == 0 && vault2MMF == 0) || pacUSDSupply == 0) {
            return true;
        }

        // Calculate total value from both vaults
        uint256 vault1Value = (vault1MMF * price1) / 1e18;
        uint256 vault2Value = (vault2MMF * price2) / 1e18;
        uint256 totalValue = vault1Value + vault2Value;

        // Very loose ratio check with total value
        return pacUSDSupply <= totalValue * 100; // Allow 100x difference
    }

    // ======================================
    // Helper Functions
    // ======================================

    /**
     * @notice Calculates total PacUSD held by all users
     * @return total Total PacUSD balance across all users
     */
    function _calculateTotalUserPacUSD() internal view returns (uint256 total) {
        for (uint i = 0; i < userList.length; i++) {
            total += pacUSD.balanceOf(userList[i]);
        }
    }

    /**
     * @notice Calculates total staked amount by all users
     * @return total Total staked balance across all users
     */
    function _calculateTotalUserStaking() internal view returns (uint256 total) {
        for (uint i = 0; i < userList.length; i++) {
            total += staking.balanceOf(userList[i]);
        }
    }

    /**
     * @notice Calculates total rewards owed to all users
     * @return total Total reward balance across all users
     */
    function _calculateTotalUserRewards() internal view returns (uint256 total) {
        for (uint i = 0; i < userList.length; i++) {
            total += staking.rewardOf(userList[i]);
        }
    }

    /**
     * @notice Records error as hash for gas efficiency
     * @param error Error message to record
     */
    function _recordErrorHash(string memory error) internal {
        lastErrorHash = keccak256(bytes(error));
        lastOperationTimestamp = block.timestamp;
    }
}
