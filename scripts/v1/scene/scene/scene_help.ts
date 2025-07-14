import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import Helper from "./help";
import { ethers } from "hardhat";
import { bigint } from "hardhat/internal/core/params/argumentTypes";
import { MMFProduct } from "./model";

export default class SceneHelper {
  helper: Helper;
  users: HardhatEthersSigner[];
  constructor(helper: Helper, users: HardhatEthersSigner[]) {
    this.helper = helper;
    this.users = users;
  }

  logState = async (user: HardhatEthersSigner) => {
    await this.helper.logSystemStatus();
    await this.helper.logUserStatus(user.address);
  };

  logAllState = async () => {
    await this.helper.logSystemStatus();
    for (let index = 0; index < this.users.length; index++) {
      const user = this.users[index];
      await this.helper.logUserStatus(user.address);
    }
  };

  exchangeMMFForPacUSD = async (product:MMFProduct, user: HardhatEthersSigner, amount: bigint) => {
    console.log("\n=====  Exchange MMF for PacUSD =====");
    console.log("User Wallet: " + user.address);
    const { txId, timestamp } = await this.helper.generateTx(product,user, amount);
    await this.helper.setMintByTx(txId);
    await this.helper.approveMMFToken(
      product,
      user,
      product.mmfVault.target.toString(),
      amount
    );
    console.log("MMFVault approved to use MMF");
    await this.helper.mintPacUSD(product,user, txId, timestamp, amount);
    console.log(`Exchanged ${ethers.formatUnits(amount, 18)} MMF for PacUSD`);

    await this.logState(user);
  };
  stake = async (user: HardhatEthersSigner, amount: bigint) => {
    console.log("\n=====  Staking =====");
    console.log("User Wallet: " + user.address);
    await this.helper.approvePacUSD(
      user,
      this.helper.staking!!.target.toString(),
      amount
    );
    await this.helper.stake(user, amount);
    console.log("Stake Success");
    await this.logAllState();
  };

  unStake = async (user: HardhatEthersSigner, amount: bigint) => {
    console.log("\n=====  UnStaking =====");
    console.log("User Wallet: " + user.address);

    await this.helper.unstake(user, amount);
    console.log("UnStake Success");
    await this.logAllState();
  };

  updatePriceWithoutReward = async (product:MMFProduct,updateRate: number = 0.1) => {
    console.log("\n=====  Price Update =====");
    // Increase price to trigger rewards
    await this.helper.updatePrice(product,updateRate);

    await this.logAllState();
  };

  mintReward = async (product:MMFProduct) => {
    // Update rewards
    await this.helper.mintReward(product);
    await this.verifyTokenomics();
  };

  printCurrentPrice = async (product:MMFProduct,) => {
    const initialPrice = await product.pricer!!.getLatestPrice();
    console.log(
      `Current MMFToken price: ${ethers.formatUnits(initialPrice, 18)}`
    );
  };

  updatePrice = async (product:MMFProduct,updateRate: number = 0.1) => {
    console.log("\n=====  Price Update and Reward Calculation =====");
    // Increase price to trigger rewards
    await this.helper.updatePrice(product,updateRate);
    // Update rewards
    await this.helper.mintReward(product);

    await this.logAllState();
  };
  setPrice = async (product:MMFProduct,newPrice: bigint) => {
    console.log("\n=====  Price Update and Reward Calculation =====");
    // Increase price to trigger rewards
    await this.helper.setPrice(product,newPrice);
    // Update rewards
    await this.helper.mintReward(product);

    await this.logAllState();
  };

  claimRewards = async (user: HardhatEthersSigner) => {
    console.log("\n=====  Claim Rewards =====");
    console.log("User Wallet: " + user.address);
    const rewardBalanceBefore = await this.helper.staking!!.rewardOf(
      user.address
    );
    console.log(
      `Reward balance: ${ethers.formatUnits(rewardBalanceBefore, 18)}`
    );

    if (rewardBalanceBefore > 0) {
      await this.helper.claim(user, rewardBalanceBefore);
      console.log(
        `Claimed rewards: ${ethers.formatUnits(rewardBalanceBefore, 18)}`
      );
      // Record post-claim state
      await this.logState(user);
    } else {
      console.log("No rewards to claim");
    }
  };

  restake = async (user: HardhatEthersSigner) => {
    console.log("\n===== Restake Rewards =====");
    console.log("User Wallet: " + user.address);
    const currentReward = await this.helper.staking!!.rewardOf(user.address);
    if (currentReward > 0) {
      await this.helper.restake(user, currentReward);
      console.log(`Restaked rewards: ${ethers.formatUnits(currentReward, 18)}`);
      await this.logState(user);
    } else {
      console.log("No rewards to restake");
    }
  };

  exchangePacUSDToMMF = async (product:MMFProduct,user: HardhatEthersSigner, amount: bigint) => {
    console.log("\n=====  Exchange PacUSD  for MMF =====");
    console.log("User Wallet: " + user.address);
    const { txId, timestamp } = await this.helper.generateTx(product,user, amount);
    await this.helper.setBurnByTx(txId);
    await this.helper.approvePacUSD(
      user,
      product.mmfVault!!.target.toString(),
      amount
    );
    await this.helper.redeemMMF(product,user, txId, timestamp, amount);
    console.log(`Exchanged ${ethers.formatUnits(amount, 18)} PacUSD for MMF`);
    await this.logState(user);
  };

  /**
   * Verify PACUSD token supply and staking reward distribution
   *
   * This function checks:
   * 1. PACUSD total supply consistency across vault, staking, and user balances
   * 2. Staking reward distribution accuracy between reserve and user accounts
   */
  verifyTokenomics = async () => {
    // Fetch PACUSD total supply and balances in protocol contracts
    const pacUSDTotalSupply = await this.helper.pacUSD!!.totalSupply();
    const stakingPacUSDBalance = await this.helper.pacUSD!!.balanceOf(
      this.helper.staking!!.target
    );

    // Initialize aggregators for user balances
    let userPacUSDTotalBalance = BigInt(0);
    let userMMFTokenTotalBalance = BigInt(0);
    let userStakingRewardTotalBalance = BigInt(0);
    let userStakingBalanceTotalBalance = BigInt(0);

    // Iterate over all user accounts to aggregate balances
    console.log("\n=== Collecting User Balances ===");
    for (let i = 0; i < this.users.length; i++) {
      const user = this.users[i];
      console.log(
        `- Analyzing user ${i + 1}/${this.users.length}: ${user.address}`
      );

      // Fetch and aggregate PACUSD balance
      const userPacUSDBalance = await this.helper.pacUSD!!.balanceOf(
        user.address
      );
      userPacUSDTotalBalance += userPacUSDBalance;
      console.log(
        `  PACUSD Balance: ${ethers.formatUnits(userPacUSDBalance, 18)}`
      );

      // Fetch and aggregate staking reward and balance
      const userStakingReward = await this.helper.staking!!.rewardOf(
        user.address
      );
      userStakingRewardTotalBalance += userStakingReward;
      console.log(
        `  Staking Reward: ${ethers.formatUnits(userStakingReward, 18)}`
      );

      const userStakingBalance = await this.helper.staking!!.balanceOf(
        user.address
      );
      userStakingBalanceTotalBalance += userStakingBalance;
      console.log(
        `  Staking Balance: ${ethers.formatUnits(userStakingBalance, 18)}`
      );
    }

    // Verify PACUSD token supply
    console.log("\n=== Verifying PACUSD Supply ===");
    console.log(
      `Total Supply: ${ethers.formatUnits(pacUSDTotalSupply, 18)} PACUSD`
    );

    const calculatedTotal =
      stakingPacUSDBalance + userPacUSDTotalBalance;
    console.log(
      `Calculated Total: ${ethers.formatUnits(calculatedTotal, 18)} PACUSD`
    );

    console.log("\nBreakdown by category:");
    console.log(
      `- Staking Contract: ${ethers.formatUnits(
        stakingPacUSDBalance,
        18
      )} PACUSD`
    );
    console.log(
      `- All Users: ${ethers.formatUnits(userPacUSDTotalBalance, 18)} PACUSD`
    );

    const pacUSDSupplyMatch = pacUSDTotalSupply === calculatedTotal;
    console.log(
      `\nPACUSD Supply Verification: ${
        pacUSDSupplyMatch ? "✅ PASS" : "❌ FAIL"
      }`
    );
    if (!pacUSDSupplyMatch) {
      const supplyDiff =
        pacUSDTotalSupply > calculatedTotal
          ? pacUSDTotalSupply - calculatedTotal
          : calculatedTotal - pacUSDTotalSupply;
      console.log(
        `⚠️  Difference: ${ethers.formatUnits(supplyDiff, 18)} PACUSD`
      );
    }

    // Verify staking rewards
    console.log("\n=== Verifying Staking Rewards ===");
    console.log(
      `Total Staked in Contract: ${ethers.formatUnits(
        stakingPacUSDBalance,
        18
      )} PACUSD`
    );

    // Fetch reserve balances
    const reserveReward = await this.helper.staking!!.rewardOf(
      this.helper.reserveAddress
    );
    const reserveBalance = await this.helper.staking!!.balanceOf(
      this.helper.reserveAddress
    );
    const reserveTotal = reserveReward + reserveBalance;

    console.log("\nReserve Account:");
    console.log(
      `- Staked Balance: ${ethers.formatUnits(reserveBalance, 18)} PACUSD`
    );
    console.log(
      `- Pending Rewards: ${ethers.formatUnits(reserveReward, 18)} PACUSD`
    );
    console.log(`- Total: ${ethers.formatUnits(reserveTotal, 18)} PACUSD`);

    // Calculate user totals
    const usersTotal =
      userStakingBalanceTotalBalance + userStakingRewardTotalBalance;
    console.log("\nAll User Accounts:");
    console.log(
      `- Staked Balance: ${ethers.formatUnits(
        userStakingBalanceTotalBalance,
        18
      )} PACUSD`
    );
    console.log(
      `- Pending Rewards: ${ethers.formatUnits(
        userStakingRewardTotalBalance,
        18
      )} PACUSD`
    );
    console.log(`- Total: ${ethers.formatUnits(usersTotal, 18)} PACUSD`);

    // Verify staking consistency
    const expectedStakingTotal = reserveTotal + usersTotal;
    const stakingMatch = expectedStakingTotal === stakingPacUSDBalance;

    console.log(
      `\nStaking Balance Verification: ${stakingMatch ? "✅ PASS" : "❌ FAIL"}`
    );
    if (!stakingMatch) {
      const stakingDiff =
        expectedStakingTotal > stakingPacUSDBalance
          ? expectedStakingTotal - stakingPacUSDBalance
          : stakingPacUSDBalance - expectedStakingTotal;
      console.log(
        `⚠️  Difference: ${ethers.formatUnits(stakingDiff, 18)} PACUSD`
      );
    }
  };
}
