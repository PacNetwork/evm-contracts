import { ethers, run, network } from "hardhat";
import { Addressable, keccak256, toUtf8Bytes } from "ethers";
import { PacUSD, PacUSDStaking } from "../../../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { config } from "dotenv";
import { MMFProduct } from "./model";
config(); // Load environment variables

export default class Helper {
  reserveAddress = process.env.STAKING_RESERVE_ADDRESS ?? "";
  pacUSD: PacUSD;
  staking: PacUSDStaking;
  owner: HardhatEthersSigner;
  networkId: bigint;
  constructor(
    pacUSD: PacUSD,
    staking: PacUSDStaking,
    owner: HardhatEthersSigner,
    networkId: bigint
  ) {
    this.pacUSD = pacUSD;
    this.staking = staking;
    this.owner = owner;
    this.networkId = networkId;
  }

  generateTx = async (
    product: MMFProduct,
    user: HardhatEthersSigner,
    mintAmount: bigint
  ): Promise<{ txId: string; timestamp: number }> => {
    const timestamp =
      Math.floor(Date.now() / 1000) +
      Math.floor(Math.random() * (100000 - 1 + 1)) +
      1;

    const txId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "address", "uint256", "address", "uint256"],
        [
          this.networkId,
          product.mmfVault.target,
          user.address,
          mintAmount,
          user.address,
          timestamp,
        ]
      )
    );
    return { txId, timestamp };
  };

  approveMMFToken = async (
    product: MMFProduct,
    user: HardhatEthersSigner,
    address: string,
    approveAmount: bigint
  ) => {
    const approveTx = await product.mmfToken
      .connect(user)
      .approve(address, approveAmount);
    await approveTx.wait();
    console.log(
      `${user.address} Approved ${address} to use MMF(${approveAmount})`
    );
  };
  approvePacUSD = async (
    user: HardhatEthersSigner,
    address: string,
    approveAmount: bigint
  ) => {
    const approveTx = await this.pacUSD!!.connect(user).approve(
      address,
      approveAmount
    );
    await approveTx.wait();
    console.log(
      `${user.address} Approved ${address} to use PacUSD(${approveAmount})`
    );
  };
  mintPacUSD = async (
    product: MMFProduct,
    user: HardhatEthersSigner,
    txId: string,
    timestamp: number,
    mintAmount: bigint
  ) => {
    const mintTx = await product.mmfVault
      .connect(user)
      .mintPacUSD(txId, mintAmount, user.address, timestamp);
    await mintTx.wait();
  };

  setMintByTx = async (txId: string) => {
    await (await this.pacUSD!!.connect(this.owner).setMintByTx(txId)).wait();
    console.log(`Mint transaction ID set in PacUSD: ${txId}`);
  };

  setBurnByTx = async (txId: string) => {
    await (await this.pacUSD!!.connect(this.owner).setBurnByTx(txId)).wait();
    console.log(`Burn transaction ID set in PacUSD: ${txId}`);
  };

  redeemMMF = async (
    product: MMFProduct,
    user: HardhatEthersSigner,
    txId: string,
    timestamp: number,
    amount: bigint
  ) => {
    const mintTx = await product.mmfVault
      .connect(user)
      .redeemMMF(txId, amount, user.address, timestamp);
    await mintTx.wait();
  };

  updatePrice = async (product: MMFProduct, updateRate: number) => {
    let latestPrice = await product.pricer.getLatestPrice();
    console.log(`Current price: ${ethers.formatUnits(latestPrice, 18)}`);
    let newPrice =
      (latestPrice * BigInt(updateRate * 100)) / BigInt(100) + latestPrice;

    await (await product.pricer.connect(this.owner).setPrice(newPrice)).wait();
    console.log(`Price updated to: ${ethers.formatUnits(newPrice, 18)}`);
  };

  setPrice = async (product: MMFProduct, newPrice: bigint) => {
    await (await product.pricer.connect(this.owner).setPrice(newPrice)).wait();
    console.log(`Price updated to: ${ethers.formatUnits(newPrice, 18)}`);
  };

  mintReward = async (product: MMFProduct) => {
    try {
      const before = await this.pacUSD.balanceOf(this.staking);
      await (await product.mmfVault.mintReward()).wait();
      const after = await this.pacUSD.balanceOf(this.staking);
      console.log(`Mint Reward  ${ethers.formatUnits(after-before, 18)} PacUSD to Staking`)
    } catch (e) {
      console.log(e);
    }
    console.log("Rewards Completed");
  };

  restake = async (user: HardhatEthersSigner, currentReward: bigint) => {
    const restakeTx = await this.staking!!.connect(user).restake(currentReward);
    await restakeTx.wait();
  };

  stake = async (user: HardhatEthersSigner, amount: bigint) => {
    await (await this.staking!!.connect(user).stake(amount)).wait();
  };
  unstake = async (user: HardhatEthersSigner, amount: bigint) => {
    await (await this.staking!!.connect(user).unstake(amount)).wait();
  };

  claim = async (user: HardhatEthersSigner, rewardBalanceBefore: bigint) => {
    const claimTx = await this.staking!!.connect(user).claimReward(
      rewardBalanceBefore
    );
    await claimTx.wait();
  };

  /**
   * Log detailed staking and balance information for a specific user
   *
   * @param userAddress - Ethereum address of the user to analyze
   */
  logUserStatus = async (userAddress: string) => {
    // Fetch all user balances concurrently
    const [stakedBalance, rewardBalance, pacUSDBalance] = await Promise.all([
      this.staking!!.balanceOf(userAddress),
      this.staking!!.rewardOf(userAddress),
      this.pacUSD!!.balanceOf(userAddress),
    ]);

    console.log(`\n=== User Account: ${userAddress} ===`);
    console.log(
      `• Staked Balance:  ${ethers.formatUnits(stakedBalance, 18)} PACUSD`
    );
    console.log(
      `• Reward Balance:  ${ethers.formatUnits(rewardBalance, 18)} PACUSD`
    );
    console.log(
      `• PacUSD Balance:  ${ethers.formatUnits(pacUSDBalance, 18)} PACUSD`
    );
  };

  /**
   * Log critical system-level metrics and protocol state
   *
   * Includes pricing, reserve balances, and contract holdings
   */
  logSystemStatus = async () => {
    // Fetch all system metrics concurrently
    const [
      reserveRewardBalance,
      stakingPacUSDBalance,
      pacUSTotalSupply,
      stakingTotalStaked,
    ] = await Promise.all([
      this.staking.rewardOf(this.reserveAddress),
      this.pacUSD.balanceOf(this.staking!!.target),
      this.pacUSD.totalSupply(),
      this.staking.totalStaked(),
    ]);

    console.log("\n=== System Status Summary ===");
    console.log("\n--- Reserve Info---");
    console.log(
      `• Reserve Reward Balance: ${ethers.formatUnits(
        reserveRewardBalance,
        18
      )} PACUSD`
    );

    console.log("\n--- Contract Balances ---");
    console.log(`• Staking Contract:`);
    console.log(
      `  - PACUSD Held:        ${ethers.formatUnits(
        stakingPacUSDBalance,
        18
      )} PACUSD`
    );
    console.log(
      `  - Total Staked:       ${ethers.formatUnits(
        stakingTotalStaked,
        18
      )} PACUSD`
    );

    console.log("\n--- Token Supply ---");
    console.log(
      `• PACUSD Total Supply:  ${ethers.formatUnits(
        pacUSTotalSupply,
        18
      )} PACUSD`
    );
  };
}
