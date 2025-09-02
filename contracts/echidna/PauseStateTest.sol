// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import "./BaseFuzz.sol";

/**
 * @title PauseStateEchidnaTest
 * @notice Echidna test suite for pause state scenarios
 * @dev Tests all 8 pause state combinations for Vault, PacUSD, and Staking contracts
 */
contract PauseStateTest is BaseFuzz {
    constructor() {
        deployAndInitialize();
        setupUserList();
    }

    /**
     * @notice Sets up initial user list with MMF and PacUSD balances
     */
    function setupUserList() internal {
        userList.push(address(0x1001));
        userList.push(address(0x1002));
        userList.push(address(0x1003));
        userList.push(address(0x1004));
        userList.push(address(0x1005));

        for (uint256 i = 0; i < userList.length; i++) {
            address user = userList[i];
            knownUsers[user] = true;

            // Mint MMF tokens for user
            mmfToken.mint(user, 100000000e18);

            // Setup initial PacUSD balance
            _setupUserPacUSD(user, 5000000e18);
        }
    }

    /**
     * @notice Sets up initial PacUSD balance for a user by minting through the vault
     * @param user User address
     * @param amount Amount of MMF tokens to mint PacUSD
     */
    function _setupUserPacUSD(address user, uint256 amount) internal {
        uint256 timestamp = block.timestamp + (txCounter++ * 1000); // Avoid txId conflicts
        bytes32 txId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp));

        vm.startPrank(OWNER);
        pacUSD.setMintByTx(txId);
        vm.stopPrank();

        vm.startPrank(user);
        mmfToken.approve(address(vault), amount);
        try vault.mintPacUSD(txId, amount, user, timestamp) {
            hasInitialBalance[user] = true;
        } catch {}
        vm.stopPrank();
    }

    /**
     * @notice Tests all 8 pause state scenarios
     * @param userIndex1 First user index
     * @param userIndex2 Second user index
     * @param amount1 Amount for mint/stake operations
     * @param amount2 Amount for transfer operations
     * @param scenarioIndex Scenario index (0-7)
     */
    function allScenariosCompleteTest(
        uint256 userIndex1,
        uint256 userIndex2,
        uint256 amount1,
        uint256 amount2,
        uint8 scenarioIndex
    ) public {
        // Bound parameters
        userIndex1 = userIndex1 % userList.length;
        userIndex2 = userIndex2 % userList.length;
        amount1 = (amount1 % 100000e18) + 1; // Ensure non-zero
        amount2 = (amount2 % 50000e18) + 1;
        scenarioIndex = scenarioIndex % 8;

        // Select users
        address user1 = userList[userIndex1];
        address user2 = userList[userIndex2];
        if (user1 == user2) {
            user2 = userList[(userIndex2 + 1) % userList.length];
        }

        // Define 8 pause state scenarios
        bool[3][8] memory scenarios = [
                [true, true, true],   // Scenario 1: Vault paused, PacUSD paused, Staking paused
                [true, true, false],  // Scenario 2: Vault paused, PacUSD paused, Staking running
                [true, false, true],  // Scenario 3: Vault paused, PacUSD running, Staking paused
                [true, false, false], // Scenario 4: Vault paused, PacUSD running, Staking running
                [false, true, true],  // Scenario 5: Vault running, PacUSD paused, Staking paused
                [false, true, false], // Scenario 6: Vault running, PacUSD paused, Staking running
                [false, false, true], // Scenario 7: Vault running, PacUSD running, Staking paused
                [false, false, false] // Scenario 8: Vault running, PacUSD running, Staking running
            ];

        // Set contract states
        _setContractStates(
            scenarios[scenarioIndex][0], // Vault
            scenarios[scenarioIndex][1], // PacUSD
            scenarios[scenarioIndex][2]  // Staking
        );

        // Get current states
        bool vaultPaused = vault.paused();
        bool pacUSDPaused = pacUSD.paused();
        bool stakingPaused = staking.paused();

        // Execute tests for the scenario
        _executeScenarioTests(
            user1,
            user2,
            amount1,
            amount2,
            vaultPaused,
            pacUSDPaused,
            stakingPaused,
            scenarioIndex + 1
        );
    }

    /**
     * @notice Sets the pause states of the contracts
     */
    function _setContractStates(
        bool vaultShouldPause,
        bool pacUSDShouldPause,
        bool stakingShouldPause
    ) internal {
        vm.startPrank(OWNER);
        if (vaultShouldPause && !vault.paused()) {
            vault.pause();
        } else if (!vaultShouldPause && vault.paused()) {
            vault.unpause();
        }
        if (pacUSDShouldPause && !pacUSD.paused()) {
            pacUSD.pause();
        } else if (!pacUSDShouldPause && pacUSD.paused()) {
            pacUSD.unpause();
        }
        vm.stopPrank();

        vm.startPrank(ADMIN);
        if (stakingShouldPause && !staking.paused()) {
            staking.pause();
        } else if (!stakingShouldPause && staking.paused()) {
            staking.unpause();
        }
        vm.stopPrank();
    }

    /**
     * @notice Executes all tests for a given scenario
     */
    function _executeScenarioTests(
        address user1,
        address user2,
        uint256 amount1,
        uint256 amount2,
        bool vaultPaused,
        bool pacUSDPaused,
        bool stakingPaused,
        uint256 scenarioNum
    ) internal {
        // Test 1: Mint operation
        bool mintShouldSucceed = _shouldMintSucceed(vaultPaused, pacUSDPaused, user1, scenarioNum);
        _testMintOperation(user1, amount1, mintShouldSucceed);

        // Test 2: Redeem operation
        bool redeemShouldSucceed = _shouldRedeemSucceed(vaultPaused, pacUSDPaused, user1, scenarioNum);
        _testRedeemOperation(user1, amount1, redeemShouldSucceed);

        // Test 3: Mint reward operation
        bool rewardShouldSucceed = _shouldMintRewardSucceed(vaultPaused, pacUSDPaused, scenarioNum);
        _testMintRewardOperation(rewardShouldSucceed);

        // Test 4: Staking operations
        bool stakingShouldSucceed = _shouldStakingSucceed(stakingPaused, pacUSDPaused, user1, scenarioNum);
        _testStakingOperations(user1, amount1, stakingShouldSucceed);

        // Test 5: Set mint/burn transaction operations
        bool setTxShouldSucceed = _shouldSetTxSucceed(pacUSDPaused, scenarioNum);
        _testSetTxOperations(user1, amount1, setTxShouldSucceed);

        // Test 6: Cancel mint/burn transaction operations
        bool cancelTxShouldSucceed = _shouldCancelTxSucceed(pacUSDPaused, scenarioNum);
        _testCancelTxOperations(user1, amount1, cancelTxShouldSucceed);

        // Test 7: Blocklist operations
        bool blocklistShouldSucceed = _shouldBlocklistSucceed(pacUSDPaused, scenarioNum);
        _testBlocklistOperations(user2, blocklistShouldSucceed);

        // Test 8: Transfer operation
        bool transferShouldSucceed = _shouldTransferSucceed(pacUSDPaused, user1, user2, scenarioNum);
        _testTransferOperation(user1, user2, amount2, transferShouldSucceed);
    }

    // ============ Success Condition Functions ============

    /**
     * @notice Determines if mint operation should succeed
     */
    function _shouldMintSucceed(
        bool vaultPaused,
        bool pacUSDPaused,
        address user,
        uint256 scenarioNum
    ) internal view returns (bool) {
        // Scenario 1-4: Vault paused, mint fails
        if (scenarioNum <= 4) {
            return false;
        }
        // Scenario 5-6: PacUSD paused, mint fails (due to mintByTx whenNotPaused)
        if (scenarioNum == 5 || scenarioNum == 6) {
            return false;
        }
        // Scenario 7-8: Vault and PacUSD running, check blocklist
        return !pacUSD.isBlocklisted(user);
    }

    /**
     * @notice Determines if redeem operation should succeed
     */
    function _shouldRedeemSucceed(
        bool vaultPaused,
        bool pacUSDPaused,
        address user,
        uint256 scenarioNum
    ) internal view returns (bool) {
        // Redeem has the same conditions as mint
        return _shouldMintSucceed(vaultPaused, pacUSDPaused, user, scenarioNum);
    }

    /**
     * @notice Determines if mintReward operation should succeed
     */
    function _shouldMintRewardSucceed(
        bool vaultPaused,
        bool pacUSDPaused,
        uint256 scenarioNum
    ) internal pure returns (bool) {
        // Scenario 1-4: Vault paused, mintReward fails
        if (scenarioNum <= 4) {
            return false;
        }
        // Scenario 5-6: PacUSD paused, mintReward fails
        if (scenarioNum == 5 || scenarioNum == 6) {
            return false;
        }
        // Scenario 7-8: Vault and PacUSD running
        return true;
    }

    /**
     * @notice Determines if staking operations should succeed
     */
    function _shouldStakingSucceed(
        bool stakingPaused,
        bool pacUSDPaused,
        address user,
        uint256 scenarioNum
    ) internal view returns (bool) {
        // Scenario 1,3,5,7: Staking paused, staking fails
        if (scenarioNum == 1 || scenarioNum == 3 || scenarioNum == 5 || scenarioNum == 7) {
            return false;
        }
        // Scenario 2,6: PacUSD paused, staking fails (due to transferFrom)
        if (scenarioNum == 2 || scenarioNum == 6) {
            return false;
        }
        // Scenario 4,8: Staking and PacUSD running, check blocklist
        return !pacUSD.isBlocklisted(user);
    }

    /**
     * @notice Determines if setMintByTx/setBurnByTx should succeed
     */
    function _shouldSetTxSucceed(bool pacUSDPaused, uint256 scenarioNum) internal pure returns (bool) {
        // Scenario 1,2,5,6: PacUSD paused, setTx fails
        if (pacUSDPaused) {
            return false;
        }
        // Scenario 3,4,7,8: PacUSD running
        return true;
    }

    /**
     * @notice Determines if cancelMintByTx/cancelBurnByTx should succeed
     */
    function _shouldCancelTxSucceed(bool pacUSDPaused, uint256 scenarioNum) internal pure returns (bool) {
        return _shouldSetTxSucceed(pacUSDPaused, scenarioNum);
    }

    /**
     * @notice Determines if blocklist operations should succeed
     */
    function _shouldBlocklistSucceed(bool pacUSDPaused, uint256 scenarioNum) internal pure returns (bool) {
        // Blocklist operations are not affected by pause state
        return true;
    }

    /**
     * @notice Determines if transfer operation should succeed
     */
    function _shouldTransferSucceed(
        bool pacUSDPaused,
        address user1,
        address user2,
        uint256 scenarioNum
    ) internal view returns (bool) {
        // Scenario 1,2,5,6: PacUSD paused, transfer fails
        if (pacUSDPaused) {
            return false;
        }
        // Scenario 3,4,7,8: PacUSD running, check blocklist
        return !pacUSD.isBlocklisted(user1) && !pacUSD.isBlocklisted(user2);
    }

    // ============ Test Functions ============

    /**
     * @notice Tests mintPacUSD operation
     */
    function _testMintOperation(address user, uint256 amount, bool shouldSucceed) internal {
        uint256 timestamp = block.timestamp + (txCounter++ * 1000);
        bytes32 txId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp));

        userMintAttempts[user]++;
        totalOperations++;

        bool mintSuccess = false;

        if (shouldSucceed && !pacUSD.paused() && !pacUSD.isBlocklisted(user)) {
            vm.startPrank(OWNER);
            try pacUSD.setMintByTx(txId) {} catch { return; } // Skip if setMintByTx fails
            vm.stopPrank();

            vm.startPrank(user);
            mmfToken.mint(user, amount);
            mmfToken.approve(address(vault), amount);
            try vault.mintPacUSD(txId, amount, user, timestamp) {
                mintSuccess = true;
                userSuccessfulMints[user]++;
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        } else {
            vm.startPrank(user);
            try vault.mintPacUSD(txId, amount, user, timestamp) {
                mintSuccess = true;
            } catch {}
            vm.stopPrank();
        }

        assert(mintSuccess == shouldSucceed);
    }

    /**
     * @notice Tests redeemMMF operation
     */
    function _testRedeemOperation(address user, uint256 amount, bool shouldSucceed) internal {
        uint256 timestamp = block.timestamp + (txCounter++ * 1000);
        bytes32 txId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp));

        userRedeemAttempts[user]++;
        totalOperations++;

        bool redeemSuccess = false;

        if (shouldSucceed && !pacUSD.paused() && !pacUSD.isBlocklisted(user)) {
            // Setup PacUSD balance for redeem
            uint256 mintTimestamp = block.timestamp + (txCounter++ * 1000);
            bytes32 mintTxId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, mintTimestamp));

            vm.startPrank(OWNER);
            try pacUSD.setMintByTx(mintTxId) {} catch { return; }
            vm.stopPrank();

            vm.startPrank(user);
            mmfToken.mint(user, amount);
            mmfToken.approve(address(vault), amount);
            try vault.mintPacUSD(mintTxId, amount, user, mintTimestamp) {} catch { return; }
            pacUSD.approve(address(vault), amount);
            vm.stopPrank();

            // Setup burn transaction
            vm.startPrank(OWNER);
            try pacUSD.setBurnByTx(txId) {} catch { return; }
            vm.stopPrank();

            // Execute redeem
            vm.startPrank(user);
            try vault.redeemMMF(txId, amount, user, timestamp) {
                redeemSuccess = true;
                userSuccessfulRedeems[user]++;
                successfulOperations++;
            } catch {}
            vm.stopPrank();
        } else {
            vm.startPrank(user);
            try vault.redeemMMF(txId, amount, user, timestamp) {
                redeemSuccess = true;
            } catch {}
            vm.stopPrank();
        }

        assert(redeemSuccess == shouldSucceed);
    }

    /**
     * @notice Tests mintReward operation
     */
    function _testMintRewardOperation(bool shouldSucceed) internal {
        // Setup price increase
        uint256 newPrice = pricer.getLatestPrice() + 1e17;
        pricer.setPrice(newPrice);

        // Ensure non-zero total supply and MMF tokens
        if (pacUSD.totalSupply() == 0 || vault.totalMMFToken() == 0) {
            // Mint some tokens to the vault
            uint256 amount = 1000e18;
            address user = userList[0];
            uint256 timestamp = block.timestamp + (txCounter++ * 1000);
            bytes32 txId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp));

            if (!pacUSD.paused() && !pacUSD.isBlocklisted(user)) {
                vm.startPrank(OWNER);
                try pacUSD.setMintByTx(txId) {} catch {}
                vm.stopPrank();

                vm.startPrank(user);
                mmfToken.mint(user, amount);
                mmfToken.approve(address(vault), amount);
                try vault.mintPacUSD(txId, amount, user, timestamp) {} catch {}
                vm.stopPrank();
            }
        }

        bool rewardSuccess = false;
        try vault.mintReward(newPrice) {
            rewardSuccess = true;
        } catch {}

        assert(rewardSuccess == shouldSucceed);
    }

    /**
     * @notice Tests staking operations
     */
    function _testStakingOperations(address user, uint256 amount, bool shouldSucceed) internal {
        userStakeAttempts[user]++;
        totalOperations++;

        // Bound amount to user's balance
        uint256 userBalance = pacUSD.balanceOf(user);
        if (amount > userBalance && userBalance > 0) {
            amount = userBalance;
        } else if (amount == 0 || userBalance == 0) {
            amount = 1e18; // Minimum 1 token
        }

        // Setup PacUSD balance for staking
        if (shouldSucceed && !pacUSD.paused() && !pacUSD.isBlocklisted(user)) {
            uint256 timestamp = block.timestamp + (txCounter++ * 1000);
            bytes32 mintTxId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp));

            vm.startPrank(OWNER);
            try pacUSD.setMintByTx(mintTxId) {} catch {}
            vm.stopPrank();

            vm.startPrank(user);
            mmfToken.mint(user, amount);
            mmfToken.approve(address(vault), amount);
            try vault.mintPacUSD(mintTxId, amount, user, timestamp) {} catch {}
            pacUSD.approve(address(staking), amount);
            vm.stopPrank();
        }

        // Execute stake
        vm.startPrank(user);
        bool stakeSuccess = false;
        try staking.stake(amount) {
            stakeSuccess = true;
            userSuccessfulStakes[user]++;
            successfulOperations++;
        } catch {}
        vm.stopPrank();

        assert(stakeSuccess == shouldSucceed);

        // Test unstake, restake, and claimReward if stake succeeded
        if (stakeSuccess) {
            // Advance time to satisfy minStakingPeriod
            vm.warp(block.timestamp + staking.minStakingPeriod() + 1);

            vm.startPrank(user);
            try staking.unstake(amount / 2) {} catch {}
            try staking.restake(amount / 4) {} catch {}
            try staking.claimReward(1) {} catch {}
            vm.stopPrank();
        }
    }

    /**
     * @notice Tests setMintByTx and setBurnByTx operations
     */
    function _testSetTxOperations(address user, uint256 amount, bool shouldSucceed) internal {
        uint256 timestamp = block.timestamp + (txCounter++ * 1000);
        bytes32 mintTxId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp));
        bytes32 burnTxId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp + 100));

        // Test setMintByTx
        vm.startPrank(OWNER);
        bool setMintSuccess = false;
        try pacUSD.setMintByTx(mintTxId) {
            setMintSuccess = true;
        } catch {}
        vm.stopPrank();

        assert(setMintSuccess == shouldSucceed);

        // Test setBurnByTx
        vm.startPrank(OWNER);
        bool setBurnSuccess = false;
        try pacUSD.setBurnByTx(burnTxId) {
            setBurnSuccess = true;
        } catch {}
        vm.stopPrank();

        assert(setBurnSuccess == shouldSucceed);
    }

    /**
     * @notice Tests cancelMintByTx and cancelBurnByTx operations
     */
    function _testCancelTxOperations(address user, uint256 amount, bool shouldSucceed) internal {
        uint256 timestamp = block.timestamp + (txCounter++ * 1000);
        bytes32 mintTxId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp));
        bytes32 burnTxId = keccak256(abi.encode(block.chainid, address(vault), user, amount, user, timestamp + 100));

        // Setup transactions if PacUSD is not paused
        if (!pacUSD.paused()) {
            vm.startPrank(OWNER);
            try pacUSD.setMintByTx(mintTxId) {} catch {}
            try pacUSD.setBurnByTx(burnTxId) {} catch {}
            vm.stopPrank();
        }

        // Test cancelMintByTx
        vm.startPrank(OWNER);
        bool cancelMintSuccess = false;
        try pacUSD.cancelMintByTx(mintTxId) {
            cancelMintSuccess = true;
        } catch {}
        vm.stopPrank();

        assert(cancelMintSuccess == shouldSucceed);

        // Test cancelBurnByTx
        vm.startPrank(OWNER);
        bool cancelBurnSuccess = false;
        try pacUSD.cancelBurnByTx(burnTxId) {
            cancelBurnSuccess = true;
        } catch {}
        vm.stopPrank();

        assert(cancelBurnSuccess == shouldSucceed);
    }

    /**
     * @notice Tests blocklist operations
     */
    function _testBlocklistOperations(address user, bool shouldSucceed) internal {
        // Test addToBlocklist
        vm.startPrank(OWNER);
        bool addBlocklistSuccess = false;
        try pacUSD.addToBlocklist(user) {
            addBlocklistSuccess = true;
        } catch {}
        vm.stopPrank();

        assert(addBlocklistSuccess == shouldSucceed);

        // Test removeFromBlocklist
        vm.startPrank(OWNER);
        bool removeBlocklistSuccess = false;
        try pacUSD.removeFromBlocklist(user) {
            removeBlocklistSuccess = true;
        } catch {}
        vm.stopPrank();

        assert(removeBlocklistSuccess == shouldSucceed);
    }

    /**
     * @notice Tests transfer operation
     */
    function _testTransferOperation(address from, address to, uint256 amount, bool shouldSucceed) internal {
        userTransferAttempts[from]++;
        totalOperations++;

        // Setup PacUSD balance for transfer
        if (!pacUSD.paused() && !pacUSD.isBlocklisted(from)) {
            uint256 timestamp = block.timestamp + (txCounter++ * 1000);
            bytes32 mintTxId = keccak256(abi.encode(block.chainid, address(vault), from, amount, from, timestamp));

            vm.startPrank(OWNER);
            try pacUSD.setMintByTx(mintTxId) {} catch {}
            vm.stopPrank();

            vm.startPrank(from);
            mmfToken.mint(from, amount);
            mmfToken.approve(address(vault), amount);
            try vault.mintPacUSD(mintTxId, amount, from, timestamp) {} catch {}
            vm.stopPrank();
        }

        // Execute transfer
        vm.startPrank(from);
        bool transferSuccess = false;
        try pacUSD.transfer(to, amount) {
            transferSuccess = true;
            userSuccessfulTransfers[from]++;
            successfulOperations++;
        } catch {}
        vm.stopPrank();

        assert(transferSuccess == shouldSucceed);
    }
}