import { ethers, network } from "hardhat";
import { config } from "dotenv";

import {
  PacUSD,
  PacUSDStaking,
  MMFVault,
  MockERC20,
  MockPricer,
} from "../../../typechain-types";
import Helper from "./scene/help";
import SceneHelper from "./scene/scene_help";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { logRecord } from "../../utils/utils";
import { MMFProduct } from "./scene/model";

config(); // Load environment variables
logRecord("scene.txt");
let staking: PacUSDStaking;
let pacUSD: PacUSD;
let mmfTokens: MockERC20[] = [];
let pricers: MockPricer[] = [];
let mmfVaults: MMFVault[] = [];
// Test amounts
const MMF_AMOUNT = ethers.parseUnits("10", 18);
const PACUSD_AMOUNT = ethers.parseUnits("5", 18);

async function initUsers(
  deploy: HardhatEthersSigner,
  users: HardhatEthersSigner[]
) {
  if (network.name === "localhost") {
    console.log("==== Deploy: Transfer MMFToken to users ====");
    const AMOUNT = ethers.parseUnits("10000", 18);
    for (let index = 0; index < mmfTokens.length; index++) {
      const mmfToken = mmfTokens[index];
      for (let index = 0; index < users.length; index++) {
        const user = users[index];
        if ((await mmfToken.balanceOf(user.address)) === BigInt(0)) {
          await (
            await mmfToken.connect(deploy).transfer(user.address, AMOUNT)
          ).wait();
        }
      }
    }
    console.log("\n==== Transfer completed ====\n");
  }
}

async function main() {
  // Get contract addresses from environment variables
  const mmfTokenAddress = process.env.MMFTOKEN_ADDRESS;
  const pricerAddress = process.env.PRICER_ADDRESS;
  const pacUSDAddress = process.env.PACUSD_ADDRESS;
  const stakingAddress = process.env.STAKING_ADDRESS;
  const mmfVaultAddress = process.env.MMFVAULT_ADDRESS;

  let [deploy, owner, ...users] = await ethers.getSigners();
  users = users.slice(0, 3);
  if (
    !pacUSDAddress ||
    !stakingAddress ||
    !mmfVaultAddress ||
    !mmfTokenAddress ||
    !pricerAddress
  ) {
    console.error(
      "Please configure all necessary environment variables in the .env file"
    );
    return;
  }

  // Connect to deployed contracts
  const mmfTokenAddresses = mmfTokenAddress.split(",");
  const mmfVaultAddresses = mmfVaultAddress.split(",");
  const pricerAddresses = pricerAddress.split(",");
  let products: MMFProduct[] = [];
  for (let index = 0; index < mmfTokenAddresses.length; index++) {
    const tokenAddress = mmfTokenAddresses[index];
    const vaultAddress = mmfVaultAddresses[index];
    const pricerAddress = pricerAddresses[index];
    const mmfToken = (await ethers.getContractAt(
      "MockERC20",
      tokenAddress,
      deploy
    )) as MockERC20;
    mmfTokens.push(mmfToken);

    const mmfVault = (await ethers.getContractAt(
      "MMFVault",
      vaultAddress
    )) as MMFVault;
    mmfVaults.push(mmfVault);

    const pricer = (await ethers.getContractAt(
      "MockPricer",
      pricerAddress,
      deploy
    )) as MockPricer;
    pricers.push(pricer);

    //add product
    products.push({
      mmfVault: mmfVault,
      pricer: pricer,
      mmfToken: mmfToken,
    });
  }

  pacUSD = (await ethers.getContractAt("PacUSD", pacUSDAddress)) as PacUSD;

  staking = (await ethers.getContractAt(
    "PacUSDStaking",
    stakingAddress
  )) as PacUSDStaking;

  console.log("Starting test process...");
  console.log(
    `Connected to network: ${network.name} ${network.config.chainId}`
  );
  console.log(`Deploy wallet address: ${deploy.address}`);
  console.log(`Owner wallet address: ${owner.address}`);

  try {
    const networkId = (await ethers.provider.getNetwork()).chainId;
    const helper = new Helper(pacUSD, staking, owner, networkId);
    const sceneHelper = new SceneHelper(helper, users);
    await initUsers(deploy, users);
    await staking.connect(owner).setMinStakingPeriod(0);
    // await scene_0_test(users, sceneHelper, products);
    // Basic workflow tests
    await scene_1_singleUserWorkflow(users, sceneHelper, products);
    await scene_2_multipleUsersWorkflow(users, sceneHelper, products);

    // Price increase scenario tests
    await scene_3_priceIncreaseAndRewards(users, sceneHelper, products);
    await scene_4_consecutivePriceIncreases(users, sceneHelper, products);

    // edge case tests
    await scene_5_exchangeRateWithPriceIncrease(users, sceneHelper, products);

    // Advanced workflow tests
    await scene_6_complexOperationsWithPriceIncreases(
      users,
      sceneHelper,
      products
    );
    await scene_7_priceUpdateWithoutReward(users, sceneHelper, products);

    console.log("\n===== Test process completed =====");
  } catch (error) {
    console.error("Error occurred during testing:", error);
  }
}

async function scene_0_test(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const user = users[0];
  const user1 = users[1];
  const user2 = users[2];
  // 1. Exchange MMFToken for PacUSD
  for (let index = 0; index < 2; index++) {
    const product = products[index];
    await sceneHelper.setPrice(product, ethers.parseUnits("2", 18));
    const MMF_AMOUNT = ethers.parseUnits("500", 18);
    const MMF_AMOUNT_2 = ethers.parseUnits("200", 18);
    await sceneHelper.exchangeMMFForPacUSD(product, user, MMF_AMOUNT);
    await sceneHelper.exchangeMMFForPacUSD(product, user1, MMF_AMOUNT);
    await sceneHelper.exchangeMMFForPacUSD(product, user2, MMF_AMOUNT);

    await sceneHelper.stake(user, MMF_AMOUNT_2);
    await sceneHelper.stake(user1, MMF_AMOUNT_2);
    await sceneHelper.stake(user2, MMF_AMOUNT_2);
    await sceneHelper.setPrice(product, ethers.parseUnits("2.1", 18));
  }

  await sceneHelper.verifyTokenomics();
}

async function scene_1_singleUserWorkflow(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const product = products[0];
  // Scene 1: Single user complete workflow with price increase
  console.log(
    "\n===== Scene 1: Single user complete workflow with price increase ====="
  );
  const user = users[0];
  // await sceneHelper.updatePrice(0.1);
  await sceneHelper.mintReward(product); // Mint rewards before test

  console.log("Initial state:");
  await sceneHelper.logState(user);

  // 1. Exchange MMFToken for PacUSD
  console.log("\nStep 1: User exchanges MMFToken for PacUSD");
  await sceneHelper.exchangeMMFForPacUSD(product, user, MMF_AMOUNT);

  // 2. Stake PacUSD
  console.log("\nStep 2: User stakes PacUSD");
  await sceneHelper.stake(user, PACUSD_AMOUNT);

  // 3. Increase price by 20% (automatically calls mintReward)
  console.log(
    "\nStep 3: MMFToken price increases by 20% (mintReward called automatically)"
  );
  await sceneHelper.updatePrice(product, 0.2); // 20%

  // 4. Claim rewards
  console.log("\nStep 4: User claims rewards");
  await sceneHelper.claimRewards(user);

  // 5. Unstake PacUSD
  console.log("\nStep 5: User unstakes PacUSD");
  await sceneHelper.unStake(user, PACUSD_AMOUNT);

  // 6. Exchange PacUSD back to MMFToken
  console.log("\nStep 6: User exchanges PacUSD back to MMFToken");
  const pacUSDBalance = await pacUSD.balanceOf(user.address);
  await sceneHelper.exchangePacUSDToMMF(product, user, pacUSDBalance);

  console.log("\nFinal state:");
  await sceneHelper.logState(user);
  await sceneHelper.verifyTokenomics();

  // Test points: Verify the complete workflow from MMFToken to PacUSD, staking, unstaking, and the impact of price increases on rewards.
}

async function scene_2_multipleUsersWorkflow(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const product = products[0];
  // Scene 2: Multiple users parallel workflow with price increase
  console.log(
    "\n===== Scene 2: Multiple users parallel workflow with price increase ====="
  );
  const user1 = users[0];
  const user2 = users[1];
  const user3 = users[2];

  console.log("Initial state:");
  await sceneHelper.mintReward(product); // Mint rewards before test
  await sceneHelper.logState(user1);

  // 1. All users exchange MMFToken for PacUSD
  console.log("\nStep 1: All users exchange MMFToken for PacUSD");
  await Promise.all([
    sceneHelper.exchangeMMFForPacUSD(product, user1, MMF_AMOUNT),
    sceneHelper.exchangeMMFForPacUSD(product, user2, MMF_AMOUNT),
    sceneHelper.exchangeMMFForPacUSD(product, user3, MMF_AMOUNT),
  ]);

  // 2. Users stake different amounts of PacUSD
  console.log("\nStep 2: Users stake different amounts of PacUSD");
  await Promise.all([
    sceneHelper.stake(user1, PACUSD_AMOUNT),
    sceneHelper.stake(user2, PACUSD_AMOUNT * 2n),
    sceneHelper.stake(user3, PACUSD_AMOUNT / 2n),
  ]);

  // 3. Increase price by 15% (automatically calls mintReward)
  console.log(
    "\nStep 3: MMFToken price increases by 15% (mintReward called automatically)"
  );
  await sceneHelper.updatePrice(product, 0.15); // 15%

  // 4. Users perform different operations
  console.log("\nStep 4: Users perform different operations");
  await Promise.all([
    sceneHelper.claimRewards(user1),
    sceneHelper.unStake(user2, PACUSD_AMOUNT),
    sceneHelper.stake(user3, PACUSD_AMOUNT / 2n),
  ]);

  // 5. Increase price by 8% (automatically calls mintReward)
  console.log(
    "\nStep 5: MMFToken price increases by 8% (mintReward called automatically)"
  );
  await sceneHelper.updatePrice(product, 0.08); // 8%

  // 6. Users claim remaining rewards and unstake
  console.log("\nStep 6: Users claim remaining rewards and unstake");
  await Promise.all([
    sceneHelper.claimRewards(user1),
    sceneHelper.claimRewards(user2),
    sceneHelper.claimRewards(user3),
    sceneHelper.unStake(user1, PACUSD_AMOUNT),
    sceneHelper.unStake(user2, PACUSD_AMOUNT),
    sceneHelper.unStake(user3, PACUSD_AMOUNT),
  ]);

  console.log("\nFinal state:");
  await sceneHelper.logState(user1);
  await sceneHelper.verifyTokenomics();

  // Test points: Verify system correctness with multiple users operating in parallel and the impact of different staking amounts on rewards.
}

async function scene_3_priceIncreaseAndRewards(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const product = products[0];
  // Scene 3: Price increase and reward calculation test
  console.log(
    "\n===== Scene 3: Price increase and reward calculation test ====="
  );
  const user1 = users[0];
  const user2 = users[1];

  console.log("Initial state:");
  await sceneHelper.mintReward(product); // Mint rewards before test
  await sceneHelper.logState(user1);

  // 1. Two users stake different amounts of PacUSD
  console.log("\nStep 1: Two users stake different amounts of PacUSD");
  await sceneHelper.exchangeMMFForPacUSD(product, user1, MMF_AMOUNT);
  await sceneHelper.exchangeMMFForPacUSD(product, user2, MMF_AMOUNT);
  await sceneHelper.stake(user1, PACUSD_AMOUNT);
  await sceneHelper.stake(user2, PACUSD_AMOUNT * 3n);

  // 2. Increase price by 25% (automatically calls mintReward), user1 claims rewards
  console.log(
    "\nStep 2: MMFToken price increases by 25% (mintReward called automatically), user1 claims rewards"
  );
  await sceneHelper.updatePrice(product, 0.25); // 25%
  await sceneHelper.claimRewards(user1);

  // 3. Increase price by 10% (automatically calls mintReward), user2 claims rewards
  console.log(
    "\nStep 3: MMFToken price increases by 10% (mintReward called automatically), user2 claims rewards"
  );
  await sceneHelper.updatePrice(product, 0.1); // 10%
  await sceneHelper.claimRewards(user2);

  // 4. Increase price by 5% (automatically calls mintReward), both users claim rewards
  console.log(
    "\nStep 4: MMFToken price increases by 5% (mintReward called automatically), both users claim rewards"
  );
  await sceneHelper.updatePrice(product, 0.05); // 5%
  await sceneHelper.claimRewards(user1);
  await sceneHelper.claimRewards(user2);

  console.log("\nFinal state:");
  await sceneHelper.logState(user1);
  await sceneHelper.verifyTokenomics();

  // Test points: Verify the impact of MMFToken price increases on rewards and the correctness of reward distribution for users with different staking amounts.
}

async function scene_4_consecutivePriceIncreases(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const product = products[0];
  // Scene 4: Consecutive price increases test
  console.log("\n===== Scene 4: Consecutive price increases test =====");
  const user = users[0];

  console.log("Initial state:");
  await sceneHelper.mintReward(product); // Mint rewards before test
  await sceneHelper.logState(user);

  // 1. Exchange and stake PacUSD
  console.log("\nStep 1: Exchange and stake PacUSD");
  await sceneHelper.exchangeMMFForPacUSD(product, user, MMF_AMOUNT);
  await sceneHelper.stake(user, PACUSD_AMOUNT);

  // 2. Consecutive price increases (each automatically calls mintReward)
  console.log(
    "\nStep 2: Consecutive price increases (each calls mintReward automatically)"
  );
  await sceneHelper.updatePrice(product, 0.03); // 3%
  await sceneHelper.updatePrice(product, 0.02); // 2%
  await sceneHelper.updatePrice(product, 0.05); // 5%
  await sceneHelper.updatePrice(product, 0.01); // 1%

  // 3. Claim accumulated rewards
  console.log("\nStep 3: Claim accumulated rewards");
  await sceneHelper.claimRewards(user);

  // 4. Unstake and exchange back to MMFToken
  console.log("\nStep 4: Unstake and exchange back to MMFToken");
  await sceneHelper.unStake(user, PACUSD_AMOUNT);
  const pacUSDBalance = await pacUSD.balanceOf(user.address);
  await sceneHelper.exchangePacUSDToMMF(product, user, pacUSDBalance);

  console.log("\nFinal state:");
  await sceneHelper.logState(user);
  await sceneHelper.verifyTokenomics();

  // Test points: Verify the impact of consecutive price increases on accumulated rewards.
}

async function scene_5_exchangeRateWithPriceIncrease(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const product = products[0];
  // Scene 6: Impact of price increase on exchange rates
  console.log(
    "\n===== Scene 5: Impact of price increase on exchange rates ====="
  );
  const user = users[0];

  console.log("Initial state:");
  await sceneHelper.mintReward(product); // Mint rewards before test
  await sceneHelper.logState(user);

  // 1. Exchange part of MMFToken for PacUSD
  console.log("\nStep 1: Exchange part of MMFToken for PacUSD");
  await sceneHelper.exchangeMMFForPacUSD(product, user, MMF_AMOUNT);

  // 2. Record current price
  await sceneHelper.printCurrentPrice(product);

  // 3. Increase price by 30%
  console.log("\nStep 3: MMFToken price increases by 30%");
  await sceneHelper.updatePrice(product, 0.3); // 30%

  // 4. Record new price
  await sceneHelper.printCurrentPrice(product);

  // 5. Exchange MMFToken for PacUSD again (should get fewer PacUSD)
  console.log(
    "\nStep 5: Exchange MMFToken for PacUSD again (should get fewer PacUSD)"
  );
  const initialPacUSDBalance = await pacUSD.balanceOf(user.address);
  await sceneHelper.exchangeMMFForPacUSD(product, user, MMF_AMOUNT);
  const newPacUSDBalance = await pacUSD.balanceOf(user.address);
  const pacUSDAcquired = newPacUSDBalance - initialPacUSDBalance;
  console.log(
    `PacUSD acquired in second exchange: ${ethers.formatUnits(
      pacUSDAcquired,
      18
    )}`
  );

  // 6. Stake part of PacUSD
  console.log("\nStep 6: Stake part of PacUSD");
  await sceneHelper.stake(user, PACUSD_AMOUNT);

  // 7. Increase price by 15% again
  console.log("\nStep 7: MMFToken price increases by 15% again");
  await sceneHelper.updatePrice(product, 0.15); // 15%

  // 8. Exchange remaining PacUSD back to MMFToken (should get more MMFToken)
  console.log(
    "\nStep 8: Exchange remaining PacUSD back to MMFToken (should get more MMFToken)"
  );
  const remainingPacUSD = await pacUSD.balanceOf(user.address);
  await sceneHelper.exchangePacUSDToMMF(product, user, remainingPacUSD);

  // 9. Unstake and exchange back to MMFToken
  console.log("\nStep 9: Unstake and exchange back to MMFToken");
  await sceneHelper.unStake(user, PACUSD_AMOUNT);
  const finalPacUSDBalance = await pacUSD.balanceOf(user.address);
  await sceneHelper.exchangePacUSDToMMF(product, user, finalPacUSDBalance);

  console.log("\nFinal state:");
  await sceneHelper.logState(user);
  await sceneHelper.verifyTokenomics();

  // Test points: Verify the impact of MMFToken price increases on exchange rates for both MMFToken to PacUSD and PacUSD to MMFToken.
}

async function scene_6_complexOperationsWithPriceIncreases(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const product = products[0];
  // Scene 7: Complex operations combined with price increases
  console.log(
    "\n===== Scene 6: Complex operations combined with price increases ====="
  );
  const user1 = users[0];
  const user2 = users[1];
  const user3 = users[2];

  console.log("Initial state:");
  await sceneHelper.mintReward(product); // Mint rewards before test
  await sceneHelper.logState(user1);

  // 1. User1 and User2 exchange PacUSD and stake
  console.log("\nStep 1: User1 and User2 exchange PacUSD and stake");
  await Promise.all([
    sceneHelper.exchangeMMFForPacUSD(product, user1, MMF_AMOUNT),
    sceneHelper.exchangeMMFForPacUSD(product, user2, MMF_AMOUNT),
  ]);
  await Promise.all([
    sceneHelper.stake(user1, PACUSD_AMOUNT),
    sceneHelper.stake(user2, PACUSD_AMOUNT * 2n),
  ]);

  // 2. Increase price by 12%
  console.log("\nStep 2: MMFToken price increases by 12%");
  await sceneHelper.updatePrice(product, 0.12); // 12%

  // 3. User3 joins, exchanges, and stakes PacUSD
  console.log("\nStep 3: User3 joins, exchanges, and stakes PacUSD");
  await sceneHelper.exchangeMMFForPacUSD(product, user3, MMF_AMOUNT);
  await sceneHelper.stake(user3, PACUSD_AMOUNT + ethers.parseUnits("25", 18));

  // 4. Increase price by 8% again
  console.log("\nStep 4: MMFToken price increases by 8% again");
  await sceneHelper.updatePrice(product, 0.08); // 8%

  // 5. Users perform mixed operations
  console.log("\nStep 5: Users perform mixed operations");
  await Promise.all([
    sceneHelper.claimRewards(user1),
    sceneHelper.unStake(user2, PACUSD_AMOUNT),
    sceneHelper.stake(user3, PACUSD_AMOUNT / 2n),
  ]);

  // 6. Increase price by 5% for the third time
  console.log("\nStep 6: MMFToken price increases by 5% for the third time");
  await sceneHelper.updatePrice(product, 0.05); // 5%

  // 7. All users unstake and exchange back to MMFToken
  console.log("\nStep 7: All users unstake and exchange back to MMFToken");
  await Promise.all([
    sceneHelper.unStake(user1, PACUSD_AMOUNT),
    sceneHelper.unStake(user2, PACUSD_AMOUNT),
    sceneHelper.unStake(user3, PACUSD_AMOUNT * 2n),
  ]);

  const user1PacUSDBalance = await pacUSD.balanceOf(user1.address);
  const user2PacUSDBalance = await pacUSD.balanceOf(user2.address);
  const user3PacUSDBalance = await pacUSD.balanceOf(user3.address);

  await Promise.all([
    sceneHelper.exchangePacUSDToMMF(product, user1, user1PacUSDBalance),
    sceneHelper.exchangePacUSDToMMF(product, user2, user2PacUSDBalance),
    sceneHelper.exchangePacUSDToMMF(product, user3, user3PacUSDBalance),
  ]);

  console.log("\nFinal state:");
  await sceneHelper.logState(user1);
  await sceneHelper.verifyTokenomics();

  // Test points: Verify system correctness when multiple users perform different operations under consecutive price increases.
}

async function scene_7_priceUpdateWithoutReward(
  users: HardhatEthersSigner[],
  sceneHelper: SceneHelper,
  products: MMFProduct[]
) {
  const product = products[0];
  // Scene 8: Price update without triggering rewards test
  console.log(
    "\n===== Scene 7: Price update without triggering rewards test ====="
  );
  const user = users[0];

  console.log("Initial state:");
  await sceneHelper.mintReward(product); // Mint rewards before test
  await sceneHelper.logState(user);

  // 1. Exchange and stake PacUSD
  console.log("\nStep 1: Exchange and stake PacUSD");
  await sceneHelper.exchangeMMFForPacUSD(product, user, MMF_AMOUNT);
  await sceneHelper.stake(user, PACUSD_AMOUNT);

  // 2. Increase price by 10% (does not trigger reward minting)
  console.log(
    "\nStep 2: MMFToken price increases by 10% (does not trigger reward minting)"
  );
  await sceneHelper.updatePriceWithoutReward(product, 0.1); // 10%

  // 3. Manually trigger reward minting
  console.log("\nStep 4: Manually trigger reward minting");
  await sceneHelper.mintReward(product);

  // 6. Claim rewards
  console.log("\nStep 6: Claim rewards");
  await sceneHelper.claimRewards(user);

  // 7. Increase price by 5% (automatically triggers reward minting)
  console.log(
    "\nStep 7: MMFToken price increases by 5% (automatically triggers reward minting)"
  );
  await sceneHelper.updatePrice(product, 0.05); // 5%

  // 8. Claim rewards
  console.log("\nStep 8: Claim rewards");
  await sceneHelper.claimRewards(user);

  // 9. Unstake and exchange back to MMFToken
  console.log("\nStep 9: Unstake and exchange back to MMFToken");
  await sceneHelper.unStake(user, PACUSD_AMOUNT);
  const pacUSDBalance = await pacUSD.balanceOf(user.address);
  await sceneHelper.exchangePacUSDToMMF(
    product,
    user,
    pacUSDBalance / BigInt(2)
  );

  console.log("\nFinal state:");
  await sceneHelper.logState(user);
  await sceneHelper.verifyTokenomics();

  // Test points: Verify the functionality of price updates without triggering rewards and manual reward minting.
}

// Execute script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
