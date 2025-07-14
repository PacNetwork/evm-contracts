import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  MockScheme,
  MockPricer,
  MockERC20,
  MockPacUSD,
  PacUSDStaking,
  MockPacUSDStakingV2,
  MockVault,
} from "../../../typechain-types";

describe("PacUSDStaking", function () {
  // Contract instances and role addresses
  let staking: PacUSDStaking;
  let v1Staking: PacUSDStaking;
  let v2Staking: MockPacUSDStakingV2;

  let mockPacUSD: MockPacUSD;
  let mockMMFToken1: MockERC20, mockMMFToken2: MockERC20;
  let mockPricer1: MockPricer, mockPricer2: MockPricer;
  let mockScheme1: MockScheme, mockScheme2: MockScheme, mockScheme3: MockScheme;
  let owner: Signer,
    user1: Signer,
    user2: Signer,
    vault1: MockVault,
    vault2: MockVault,
    nonUpdater: Signer,
    admin: Signer,
    reserve: Signer,
    pauser: Signer,
    rewardManager: Signer,
    upgrader: Signer;

  // Constant definitions
  const ONE_DAY = 86400;
  const PRECISION = ethers.parseEther("1");
  const INITIAL_PRICE = PRECISION;

  // Helper function: Generate PacUSD
  async function generatePacUSD(
    user: Signer,
    mmfAmount: bigint,
    vault: MockVault
  ): Promise<bigint> {
    const userAddr = await user.getAddress();
    const vaultAddr = await vault.getAddress();
    const mmfToken = vault === vault1 ? mockMMFToken1 : mockMMFToken2;
    const pricer = vault === vault1 ? mockPricer1 : mockPricer2;
    await vault.addToken(mmfAmount);
    await mmfToken.connect(user).approve(vaultAddr, mmfAmount);
    await mmfToken.connect(user).transfer(vaultAddr, mmfAmount);
    const currentPrice = await pricer.getLatestPrice();
    const pacAmount = (mmfAmount * currentPrice) / PRECISION;
    await mockPacUSD.mint(userAddr, pacAmount);
    return pacAmount;
  }

  // Initialize environment
  beforeEach(async function () {
    [owner, user1, user2, nonUpdater, admin, reserve, pauser, rewardManager] =
      await ethers.getSigners();

    // Deploy Mock contracts
    const MockPacUSDFactory = await ethers.getContractFactory("MockPacUSD");
    mockPacUSD = (await MockPacUSDFactory.deploy()) as MockPacUSD;
    await mockPacUSD.waitForDeployment();

    const MockMMFFactory = await ethers.getContractFactory("MockERC20");
    mockMMFToken1 = (await MockMMFFactory.deploy(
      "MockMMF1",
      "mMMF1"
    )) as MockERC20;
    mockMMFToken2 = (await MockMMFFactory.deploy(
      "MockMMF2",
      "mMMF2"
    )) as MockERC20;
    await mockMMFToken1.waitForDeployment();
    await mockMMFToken2.waitForDeployment();

    const MockPricerFactory = await ethers.getContractFactory("MockPricer");
    mockPricer1 = (await MockPricerFactory.deploy(INITIAL_PRICE)) as MockPricer;
    mockPricer2 = (await MockPricerFactory.deploy(INITIAL_PRICE)) as MockPricer;
    await mockPricer1.waitForDeployment();
    await mockPricer2.waitForDeployment();

    const MockSchemeFactory = await ethers.getContractFactory("MockScheme");
    mockScheme1 = (await MockSchemeFactory.deploy("Scheme1")) as MockScheme;
    mockScheme2 = (await MockSchemeFactory.deploy("Scheme2")) as MockScheme;
    mockScheme3 = (await MockSchemeFactory.deploy("Scheme3")) as MockScheme;
    await mockScheme1.waitForDeployment();
    await mockScheme2.waitForDeployment();
    await mockScheme3.waitForDeployment();
    await mockScheme1.activate();
    // Deploy and initialize staking contract
    const StakingFactory = await ethers.getContractFactory("PacUSDStaking");
    staking = (await StakingFactory.deploy()) as PacUSDStaking;
    await staking.waitForDeployment();

    const MockVaultFactory = await ethers.getContractFactory("MockVault");
    vault1 = (await MockVaultFactory.deploy()) as MockVault;
    vault2 = (await MockVaultFactory.deploy()) as MockVault;
    await vault1.waitForDeployment();
    await vault2.waitForDeployment();

    await vault1.init(staking, mockPacUSD, mockPricer1);
    await vault2.init(staking, mockPacUSD, mockPricer2);
    const vaults = [await vault1.getAddress(), await vault2.getAddress()];
    
    await (
      await staking.initialize(
        await mockPacUSD.getAddress(),
        await owner.getAddress(),
        await admin.getAddress(),
        await reserve.getAddress(),
        vaults
      )
    ).wait();
    // Default add scheme1
    // Authorize roles
    const PAUSER_ROLE = await staking.PAUSER_ROLE();
    const REWARD_SCHEME_ROLE = await staking.REWARD_SCHEME_ROLE();
    const RESERVE_SET_ROLE = await staking.RESERVE_SET_ROLE();
    await (
      await staking
        .connect(admin)
        .grantRole(PAUSER_ROLE, await pauser.getAddress())
    ).wait();
    await (
      await staking
        .connect(admin)
        .grantRole(REWARD_SCHEME_ROLE, await rewardManager.getAddress())
    ).wait();
    await (
      await staking
        .connect(admin)
        .grantRole(RESERVE_SET_ROLE, await admin.getAddress())
    ).wait();
    await staking.connect(rewardManager).addRewardScheme(mockScheme1.target);

    // Initialize user assets
    await mockMMFToken1.mint(
      await user1.getAddress(),
      ethers.parseEther("1000")
    );
    await generatePacUSD(user1, ethers.parseEther("1000"), vault1);
    await mockMMFToken2.mint(
      await user2.getAddress(),
      ethers.parseEther("2000")
    );
    await generatePacUSD(user2, ethers.parseEther("2000"), vault2);
  });

  // 1. initialize method tests
  describe("initialize", function () {
    // Normal scenario: Verify correct state after initialization
    it("should correctly initialize with valid parameters", async function () {
      // Deploy a new Staking contract for testing (avoid reusing beforeEach instance)
      const StakingFactory = await ethers.getContractFactory("PacUSDStaking");
      const newStaking = (await StakingFactory.deploy()) as PacUSDStaking;
      await newStaking.waitForDeployment();
      console.log(vault1, vault2);
      const vaults = [await vault1.getAddress(), await vault2.getAddress()];
      const tokenAddr = await mockPacUSD.getAddress();
      const upgraderAddr = await owner.getAddress();
      const adminAddr = await admin.getAddress();
      const reserveAddr = await reserve.getAddress();

      // Execute initialization
      await expect(
        newStaking.initialize(
          tokenAddr,
          upgraderAddr,
          adminAddr,
          reserveAddr,
          vaults
        )
      ).not.to.be.reverted;

      // Verify core parameters
      expect(await newStaking.STAKED_TOKEN()).to.equal(tokenAddr);
      expect(await newStaking.RESERVE()).to.equal(reserveAddr);
      expect(await newStaking.minStakingPeriod()).to.equal(ONE_DAY); // Default 1 day

      // Verify updater role
      expect(await newStaking.UPDATERS(vaults[0])).to.be.true;
      expect(await newStaking.UPDATERS(vaults[1])).to.be.true;
    });

    // Exception case 1: Empty vaults array
    it("should revert when vaults array is empty", async function () {
      const StakingFactory = await ethers.getContractFactory("PacUSDStaking");
      const newStaking = (await StakingFactory.deploy()) as PacUSDStaking;
      await newStaking.waitForDeployment();

      const vaults: string[] = []; // Empty vaults array
      const tokenAddr = await mockPacUSD.getAddress();

      await expect(
        newStaking.initialize(
          tokenAddr,
          await owner.getAddress(),
          await admin.getAddress(),
          await reserve.getAddress(),
          vaults
        )
      ).to.be.revertedWithCustomError(newStaking, "InvalidArrayLength");
    });

    // Exception case 4: Staked token address is zero address
    it("should revert when staked token is zero address", async function () {
      const StakingFactory = await ethers.getContractFactory("PacUSDStaking");
      const newStaking = (await StakingFactory.deploy()) as PacUSDStaking;
      await newStaking.waitForDeployment();

      const vaults = [await vault1.getAddress()];

      await expect(
        newStaking.initialize(
          ethers.ZeroAddress, // Zero address token
          await owner.getAddress(),
          await admin.getAddress(),
          await reserve.getAddress(),
          vaults
        )
      ).to.be.revertedWithCustomError(newStaking, "ZeroAddress");
    });

    // Exception case 5: Reserve address is zero address
    it("should revert when reserve is zero address", async function () {
      const StakingFactory = await ethers.getContractFactory("PacUSDStaking");
      const newStaking = (await StakingFactory.deploy()) as PacUSDStaking;
      await newStaking.waitForDeployment();

      const vaults = [await vault1.getAddress()];
      const tokenAddr = await mockPacUSD.getAddress();

      await expect(
        newStaking.initialize(
          tokenAddr,
          await owner.getAddress(),
          await admin.getAddress(),
          ethers.ZeroAddress, // Zero address reserve
          vaults
        )
      ).to.be.revertedWithCustomError(newStaking, "ZeroAddress");
    });

    // Exception case 6: Vaults contain zero address
    it("should revert when vaults contain zero address", async function () {
      const StakingFactory = await ethers.getContractFactory("PacUSDStaking");
      const newStaking = (await StakingFactory.deploy()) as PacUSDStaking;
      await newStaking.waitForDeployment();

      const vaults = [ethers.ZeroAddress]; // Vaults containing zero address
      const tokenAddr = await mockPacUSD.getAddress();

      await expect(
        newStaking.initialize(
          tokenAddr,
          await owner.getAddress(),
          await admin.getAddress(),
          await reserve.getAddress(),
          vaults
        )
      ).to.be.revertedWithCustomError(newStaking, "ZeroAddress");
    });

    // Exception case 10: Re-initialization (calling initialize again after contract is initialized)
    it("should revert when initializing twice", async function () {
      // Use the staking contract already initialized in beforeEach
      const vaults = [await vault1.getAddress()];

      await expect(
        staking.initialize(
          await mockPacUSD.getAddress(),
          await owner.getAddress(),
          await admin.getAddress(),
          await reserve.getAddress(),
          vaults
        )
      ).to.be.reverted; // Depends on OpenZeppelin's initializer modifier, re-initialization will revert
    });
  });

  // 2. stake method tests
  describe("stake", function () {
    // Normal scenario: Basic staking process
    it("should update staking balance and totalStaked on successful stake", async function () {
      const stakeAmount = ethers.parseEther("500");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);
      const initialUserBalance = await staking.balanceOf(
        await user1.getAddress()
      );
      const initialTotalStaked = await staking.totalStaked();

      await expect(staking.connect(user1).stake(stakeAmount))
        .to.emit(staking, "Staked")
        .withArgs(await user1.getAddress(), stakeAmount);

      // Verify user staked balance increase
      expect(await staking.balanceOf(await user1.getAddress())).to.equal(
        initialUserBalance + stakeAmount
      );
      // Verify total staked amount increase
      expect(await staking.totalStaked()).to.equal(
        initialTotalStaked + stakeAmount
      );
    });

    // Normal scenario: Accumulative staking (multiple stakes)
    it("should accumulate staked balance on multiple stakes", async function () {
      const firstStake = ethers.parseEther("300");
      const secondStake = ethers.parseEther("200");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), firstStake + secondStake);

      await staking.connect(user1).stake(firstStake);
      await staking.connect(user1).stake(secondStake);

      expect(await staking.balanceOf(await user1.getAddress())).to.equal(
        firstStake + secondStake
      );
    });

    // Exception case 1: Stake amount is zero
    it("should revert when staking zero amount", async function () {
      await expect(
        staking.connect(user1).stake(0n)
      ).to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    // Exception case 2: Insufficient allowance
    it("should revert when allowance is insufficient", async function () {
      const stakeAmount = ethers.parseEther("500");
      // Approve only partial allowance (less than stake amount)
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount - 100n);

      await expect(staking.connect(user1).stake(stakeAmount)).to.be.reverted; // Underlying ERC20 transferFrom will fail due to insufficient allowance
    });

    // Exception case 3: Insufficient user balance (balance < stake amount)
    it("should revert when user balance is insufficient", async function () {
      const stakeAmount = ethers.parseEther("10000"); // Far exceeds user's actual PacUSD balance
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);

      await expect(
        staking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWithCustomError(staking, "InsufficientTokenBalance");
    });

    // Exception case 4: Contract is paused
    it("should revert when staking during paused state", async function () {
      await staking.connect(pauser).pause();
      const stakeAmount = ethers.parseEther("100");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);

      await expect(
        staking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    // Exception case 5: Total staked amount exceeds token total supply (edge case)
    it("should revert when totalStaked exceeds token total supply", async function () {
      // 1. Deploy a new Staking contract and a limited PacUSD
      const MockPacUSDFactory = await ethers.getContractFactory("MockPacUSD");
      const limitedPacUSD = (await MockPacUSDFactory.deploy()) as MockPacUSD;
      await limitedPacUSD.waitForDeployment();
      const totalSupply = ethers.parseEther("1000"); // Fixed total supply of 1000
      await limitedPacUSD.mint(await user1.getAddress(), totalSupply);

      const StakingFactory = await ethers.getContractFactory("PacUSDStaking");
      const newStaking = (await StakingFactory.deploy()) as PacUSDStaking;
      await newStaking.waitForDeployment();
      // Initialize new contract (single vault configuration)
      await newStaking.initialize(
        await limitedPacUSD.getAddress(),
        await owner.getAddress(),
        await admin.getAddress(),
        await reserve.getAddress(),
        [await vault1.getAddress()]
      );
      // Authorize roles
      const PAUSER_ROLE = await newStaking.PAUSER_ROLE();
      await newStaking
        .connect(admin)
        .grantRole(PAUSER_ROLE, await pauser.getAddress());

      // 2. Stake all tokens (total staked = total supply)
      await limitedPacUSD
        .connect(user1)
        .approve(await newStaking.getAddress(), totalSupply);
      await newStaking.connect(user1).stake(totalSupply);
      expect(await newStaking.totalStaked()).to.equal(totalSupply);

      // 3. Attempt to stake again (total staked would exceed total supply)
      const extraStake = ethers.parseEther("1");
      await limitedPacUSD
        .connect(user1)
        .approve(await newStaking.getAddress(), extraStake);
      await expect(
        newStaking.connect(user1).stake(extraStake)
      ).to.be.revertedWithCustomError(newStaking, "InsufficientTokenBalance");
    });

    // Exception case 6: Reward scheme addition failure causes stake failure (e.g., invalid scheme address)
    it("should revert if reward scheme update fails", async function () {
      // Add an invalid reward scheme (e.g., non-contract address)
      const invalidScheme = await nonUpdater.getAddress(); // Regular address, not a contract
      await staking.connect(rewardManager).addRewardScheme(invalidScheme);

      const stakeAmount = ethers.parseEther("100");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);

      await expect(staking.connect(user1).stake(stakeAmount)).to.be.reverted; // Calling updateUserInternalState on invalidScheme will fail (non-contract)
    });
  });

  // 3. unstake method tests
  describe("unstake", function () {
    // Setup: Pre-stake assets for testing
    beforeEach(async function () {
      const stakeAmount = ethers.parseEther("1000");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stake(stakeAmount);
    });

    // Normal scenario: Full unstake (entire staked amount)
    it("should fully unstake after minStakingPeriod", async function () {
      const unstakeAmount = ethers.parseEther("1000");
      await time.increase(ONE_DAY); // Meet minimum staking period

      const initialTotal = await staking.totalStaked();
      const initialUserBalance = await mockPacUSD.balanceOf(
        await user1.getAddress()
      );

      await expect(staking.connect(user1).unstake(unstakeAmount))
        .to.emit(staking, "Unstaked")
        .withArgs(await user1.getAddress(), unstakeAmount);

      // Verify user staked balance is cleared
      expect(await staking.balanceOf(await user1.getAddress())).to.equal(0n);
      // Verify total staked amount decreases
      expect(await staking.totalStaked()).to.equal(
        initialTotal - unstakeAmount
      );
      // Verify user wallet balance increases
      expect(await mockPacUSD.balanceOf(await user1.getAddress())).to.equal(
        initialUserBalance + unstakeAmount
      );
    });

    // Normal scenario: Partial unstake (retain some staked amount)
    it("should partially unstake and update timestamp", async function () {
      const initialStake = ethers.parseEther("1000");
      const unstakeAmount = ethers.parseEther("400");
      await time.increase(ONE_DAY);

      await staking.connect(user1).unstake(unstakeAmount);

      // Verify remaining staked amount
      expect(await staking.balanceOf(await user1.getAddress())).to.equal(
        initialStake - unstakeAmount
      );
    });

    // Exception case 1: Unstake amount is zero
    it("should revert when unstaking zero amount", async function () {
      await expect(
        staking.connect(user1).unstake(0n)
      ).to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    // Exception case 2: Unstake amount exceeds staked balance
    it("should revert when unstake amount exceeds staked balance", async function () {
      const excessAmount = ethers.parseEther("1500"); // Exceeds 1000 staked amount
      await time.increase(ONE_DAY);

      await expect(
        staking.connect(user1).unstake(excessAmount)
      ).to.be.revertedWithCustomError(staking, "InsufficientStakingBalance");
    });

    // Exception case 3: Unstaking before minimum staking period (cooldown restriction)
    it("should revert when unstaking before minStakingPeriod", async function () {
      const unstakeAmount = ethers.parseEther("500");
      // Wait only 11 hours (less than 1 day)
      await time.increase(ONE_DAY - 3600);

      await expect(
        staking.connect(user1).unstake(unstakeAmount)
      ).to.be.revertedWithCustomError(staking, "InsufficientStakingPeriod");
    });

    // Exception case 4: Contract is paused
    it("should revert when unstaking during paused state", async function () {
      const unstakeAmount = ethers.parseEther("500");
      await time.increase(ONE_DAY);
      await staking.connect(pauser).pause();

      await expect(
        staking.connect(user1).unstake(unstakeAmount)
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    // Exception case 5: User has no staked assets but attempts to unstake
    it("should revert when user has no staked balance", async function () {
      // User2 has not staked any assets
      const unstakeAmount = ethers.parseEther("100");
      await time.increase(ONE_DAY);

      await expect(
        staking.connect(user2).unstake(unstakeAmount)
      ).to.be.revertedWithCustomError(staking, "InsufficientStakingBalance");
    });

    // Exception case 6: Reward scheme update failure causes unstake failure
    it("should revert if reward scheme update fails during unstake", async function () {
      // Add an invalid reward scheme (non-contract address)
      const invalidScheme = await nonUpdater.getAddress();
      await staking.connect(rewardManager).addRewardScheme(invalidScheme);
      await time.increase(ONE_DAY);

      const unstakeAmount = ethers.parseEther("500");
      await expect(staking.connect(user1).unstake(unstakeAmount)).to.be
        .reverted; // Calling updateUserInternalState on invalidScheme will fail
    });
  });

  // 4. restake method tests
  describe("restake", function () {
    // Setup: Pre-stake assets and generate rewards
    beforeEach(async function () {
      // Stake initial assets
      const stakeAmount = ethers.parseEther("1000");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stake(stakeAmount);
      // Trigger price update to generate rewards
      await mockPricer1.setPrice(INITIAL_PRICE * 3n); // Price increases significantly

      const newReward = (INITIAL_PRICE * 3n - INITIAL_PRICE) *  (await vault1.total()) / PRECISION;
      const rate = newReward * (await staking.RATE_PRECISION()) / (await mockPacUSD.totalSupply());
      await expect(vault1.update()).to.emit(staking, "RewardDistributed")
        .withArgs(vault1.target, newReward, rate);
    });

    // Normal scenario: Fully restake rewards
    it("should fully restake rewards into staked balance", async function () {
      const reward = await staking.rewardOf(await user1.getAddress());
      const initialStaked = await staking.balanceOf(await user1.getAddress());
      const initialTotalStaked = await staking.totalStaked();

      await expect(staking.connect(user1).restake(reward))
        .to.emit(staking, "Restaked")
        .withArgs(await user1.getAddress(), reward);

      // Verify staked balance increases (initial stake + rewards)
      expect(await staking.balanceOf(await user1.getAddress())).to.equal(
        initialStaked + reward
      );
      // Verify total staked amount increases accordingly
      expect(await staking.totalStaked()).to.equal(initialTotalStaked + reward);
      // Verify reward balance is cleared
      expect(await staking.rewardOf(await user1.getAddress())).to.equal(0n);
    });

    // Normal scenario: Partially restake rewards
    it("should partially restake rewards", async function () {
      const totalReward = await staking.rewardOf(await user1.getAddress());
      const partialReward = totalReward / 2n; // Restake half
      const initialStaked = await staking.balanceOf(await user1.getAddress());

      await staking.connect(user1).restake(partialReward);

      // Verify staked balance increases by partial reward
      expect(await staking.balanceOf(await user1.getAddress())).to.equal(
        initialStaked + partialReward
      );
      // Verify remaining rewards are correct
      expect(await staking.rewardOf(await user1.getAddress())).to.equal(
        totalReward - partialReward
      );
    });

    // Exception case 1: Restake amount is zero
    it("should revert when restaking zero amount", async function () {
      await expect(
        staking.connect(user1).restake(0n)
      ).to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    // Exception case 2: Restake amount exceeds available rewards (reward balance + increment)
    it("should revert when amount exceeds available rewards (balance + increment)", async function () {
      const totalReward = await staking.rewardOf(await user1.getAddress());
      const excessAmount = totalReward + 100n; // Exceeds total available rewards

      await expect(
        staking.connect(user1).restake(excessAmount)
      ).to.be.revertedWithCustomError(staking, "InsufficientRewardBalance");
    });

    // Exception case 3: User has no rewards but attempts to restake
    it("should revert when user has no rewards", async function () {
      // Claim all rewards to make reward balance zero
      const totalReward = await staking.rewardOf(await user1.getAddress());
      await staking.connect(user1).claimReward(totalReward);

      await expect(staking.connect(user1).restake(1n)) // Attempt to restake 1 unit
        .to.be.revertedWithCustomError(staking, "InsufficientRewardBalance");
    });

    // Exception case 4: Contract is paused
    it("should revert when restaking during paused state", async function () {
      const reward = await staking.rewardOf(await user1.getAddress());
      await staking.connect(pauser).pause();

      await expect(
        staking.connect(user1).restake(reward)
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    // Exception case 5: Reward scheme update failure causes restake failure
    it("should revert if reward scheme update fails during restake", async function () {
      // Add an invalid reward scheme (non-contract address)
      const invalidScheme = await nonUpdater.getAddress(); // Regular address, not a contract
      await staking.connect(rewardManager).addRewardScheme(invalidScheme);

      const reward = await staking.rewardOf(await user1.getAddress());
      await expect(staking.connect(user1).restake(reward)).to.be.reverted; // Calling updateUserInternalState on invalidScheme will fail
    });
  });

  // 5. claimReward method tests
  describe("claimReward", function () {
    // Setup: Pre-stake assets and generate rewards
    beforeEach(async function () {
      // Stake initial assets
      const stakeAmount = ethers.parseEther("1000");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stake(stakeAmount);
      // Trigger price update to generate rewards
      await mockPricer1.setPrice(INITIAL_PRICE * 3n);
      await vault1.update();
    });

    // Normal scenario: Fully claim all available rewards
    it("should fully claim all available rewards", async function () {
      const reward = await staking.rewardOf(await user1.getAddress());
      const initialUserBalance = await mockPacUSD.balanceOf(
        await user1.getAddress()
      );

      await expect(staking.connect(user1).claimReward(reward))
        .to.emit(staking, "RewardClaimed")
        .withArgs(await user1.getAddress(), reward);

      // Verify user wallet balance increases
      expect(await mockPacUSD.balanceOf(await user1.getAddress())).to.equal(
        initialUserBalance + reward
      );
      // Verify reward balance is cleared
      expect(await staking.rewardOf(await user1.getAddress())).to.equal(0n);
    });

    // Normal scenario: Partially claim rewards
    it("should partially claim rewards", async function () {
      const totalReward = await staking.rewardOf(await user1.getAddress());
      const partialReward = totalReward / 2n;
      const initialUserBalance = await mockPacUSD.balanceOf(
        await user1.getAddress()
      );

      await staking.connect(user1).claimReward(partialReward);

      // Verify user balance increases by partial reward
      expect(await mockPacUSD.balanceOf(await user1.getAddress())).to.equal(
        initialUserBalance + partialReward
      );
      // Verify remaining rewards are correct
      expect(await staking.rewardOf(await user1.getAddress())).to.equal(
        totalReward - partialReward
      );
    });

    // Exception case 1: Claim amount is zero
    it("should revert when claiming zero amount", async function () {
      await expect(
        staking.connect(user1).claimReward(0n)
      ).to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    // Exception case 2: Claim amount exceeds available rewards
    it("should revert when amount exceeds available rewards", async function () {
      const totalReward = await staking.rewardOf(await user1.getAddress());
      const excessAmount = totalReward + 100n; // Exceeds actual available rewards

      await expect(
        staking.connect(user1).claimReward(excessAmount)
      ).to.be.revertedWithCustomError(staking, "InsufficientRewardBalance");
    });

    // Exception case 3: User has no rewards but attempts to claim
    it("should revert when user has no rewards", async function () {
      // Claim all rewards first
      const totalReward = await staking.rewardOf(await user1.getAddress());
      await staking.connect(user1).claimReward(totalReward);

      await expect(staking.connect(user1).claimReward(1n)) // Attempt to claim 1 unit reward
        .to.be.revertedWithCustomError(staking, "InsufficientRewardBalance");
    });

    // Exception case 4: Contract is paused
    it("should revert when claiming during paused state", async function () {
      const reward = await staking.rewardOf(await user1.getAddress());
      await staking.connect(pauser).pause();

      await expect(
        staking.connect(user1).claimReward(reward)
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // 6. update method tests
  describe("update", function () {
    // Setup: Initialize basic state (ensure vault has MMF token balance for reward calculation)
    beforeEach(async function () {
      // Ensure vault1 has MMF tokens (used for reward increment calculation)
      await mockMMFToken1.mint(
        await vault1.getAddress(),
        ethers.parseEther("1000")
      );
    });

    // Normal scenario: Updater updates price (increase), reward rate accumulates
    it("should update reward rate and accumulate rewards when price increases", async function () {
      const initialVault1Price = await mockPricer1.getLatestPrice();
      const newPrice = initialVault1Price * 2n; // Price doubles

      // Execute update
      await mockPricer1.setPrice(newPrice);
      await expect(vault1.update()).to.emit(staking, "RewardDistributed");

      // Verify reserve rewards increase
      expect(await staking.rewardOf(await reserve.getAddress())).to.be.gt(0n);
    });

    // Normal scenario: Multiple vaults update sequentially, reward rate accumulates
    it("should accumulate rewards from multiple vaults", async function () {
      // Stake assets (ensure user can receive rewards)
      const stakeAmount = ethers.parseEther("1000");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stake(stakeAmount);

      // Vault1 update (price doubles)
      await mockPricer1.setPrice(INITIAL_PRICE * 2n);
      await vault1.update();
      const rewardAfterVault1 = await staking.rewardOf(
        await user1.getAddress()
      );

      // Vault2 update (price doubles)
      await mockMMFToken2.mint(
        await vault2.getAddress(),
        ethers.parseEther("2000")
      ); // Add MMF to vault2
      await mockPricer2.setPrice(INITIAL_PRICE * 2n);
      await vault2.update();
      const rewardAfterVault2 = await staking.rewardOf(
        await user1.getAddress()
      );

      // Verify total rewards accumulate
      expect(rewardAfterVault2).to.be.gt(rewardAfterVault1);
    });

    // Exception case 1: Non-updater calls (permission check)
    it("should revert when called by non-updater", async function () {
      // Regular user calls
      await expect(
        staking.connect(user1).distributeReward(1n)
      ).to.be.revertedWithCustomError(staking, "NotUpdater");
      // Admin calls (non-vault role)
      await expect(
        staking.connect(admin).distributeReward(1n)
      ).to.be.revertedWithCustomError(staking, "NotUpdater");
      // Unauthorized vault calls
      await expect(
        staking.connect(user2).distributeReward(1n)
      ).to.be.revertedWithCustomError(staking, "NotUpdater");
    });

    // Exception case 3: Contract is paused
    it("should revert when called during paused state", async function () {
      await staking.connect(pauser).pause(); // Pause contract
      await mockPricer1.setPrice(INITIAL_PRICE * 2n);

      await expect(vault1.update()).to.be.revertedWithCustomError(
        staking,
        "EnforcedPause"
      );
    });

    // Exception case 4: Price unchanged (no update operation)
    it("should do nothing when price is unchanged", async function () {
      // Call update with unchanged price
      await vault1.update();
      // Verify no event emitted
      await expect(vault1.update()).not.to.emit(staking, "RewardDistributed");
    });

    // Exception case 6: Invalid reward scheme causes update failure
    it("should revert if reward scheme update fails", async function () {
      // Add an invalid reward scheme (non-contract address)
      const invalidScheme = await nonUpdater.getAddress(); // Regular address, not a contract
      await staking.connect(rewardManager).addRewardScheme(invalidScheme);
      await mockPricer1.setPrice(INITIAL_PRICE * 2n);

      // Calling update will attempt to update the invalid scheme, causing failure
      await expect(vault1.update()).to.be.reverted;
    });
  });

  // 7. Reward scheme management tests (addRewardScheme/removeRewardScheme)
  describe("reward scheme management", function () {
    // Normal scenario: Add a single reward scheme
    it("should add a new reward scheme successfully", async function () {
      const schemeAddr = await mockScheme2.getAddress();
      await expect(staking.connect(rewardManager).addRewardScheme(schemeAddr))
        .to.emit(staking, "RewardSchemeAdded")
        .withArgs(schemeAddr);

      // Verify scheme is added
      expect(await staking.schemeIndexMap(schemeAddr)).to.equal(2); // Index starts from 1, default add scheme1
      expect(await staking.getAllSchemes()).to.include(schemeAddr);
    });

    // Normal scenario: Add multiple reward schemes sequentially
    it("should add multiple reward schemes in sequence", async function () {
      const scheme1 = await mockScheme1.getAddress();
      const scheme2 = await mockScheme2.getAddress();
      const scheme3 = await mockScheme3.getAddress();

      await staking.connect(rewardManager).addRewardScheme(scheme2);
      await staking.connect(rewardManager).addRewardScheme(scheme3);

      // Verify order and indices
      const schemes = await staking.getAllSchemes();
      expect(schemes).to.deep.equal([scheme1, scheme2, scheme3]);
      expect(await staking.schemeIndexMap(scheme1)).to.equal(1);
      expect(await staking.schemeIndexMap(scheme2)).to.equal(2);
      expect(await staking.schemeIndexMap(scheme3)).to.equal(3);
    });

    // Normal scenario: Remove a reward scheme from the middle position
    it("should remove a scheme from middle position and reindex", async function () {
      const scheme1 = await mockScheme1.getAddress();
      const scheme2 = await mockScheme2.getAddress();
      const scheme3 = await mockScheme3.getAddress();

      // Add three schemes
      // await staking.connect(rewardManager).addRewardScheme(scheme1);
      await staking.connect(rewardManager).addRewardScheme(scheme2);
      await staking.connect(rewardManager).addRewardScheme(scheme3);

      // Remove the middle scheme2
      await expect(staking.connect(rewardManager).removeRewardScheme(scheme2))
        .to.emit(staking, "RewardSchemeRemoved")
        .withArgs(scheme2);

      // Verify remaining schemes and indices (scheme3 moves to scheme2's position)
      const schemes = await staking.getAllSchemes();
      expect(schemes).to.deep.equal([scheme1, scheme3]);
      expect(await staking.schemeIndexMap(scheme1)).to.equal(1);
      expect(await staking.schemeIndexMap(scheme3)).to.equal(2); // Index updated
      expect(await staking.schemeIndexMap(scheme2)).to.equal(0); // Removed
    });

    // Normal scenario: Remove the last reward scheme
    it("should remove the last scheme without reindex", async function () {
      const scheme1 = await mockScheme1.getAddress();
      const scheme2 = await mockScheme2.getAddress();

      // await staking.connect(rewardManager).addRewardScheme(scheme1);
      await staking.connect(rewardManager).addRewardScheme(scheme2);

      // Remove the last scheme
      await staking.connect(rewardManager).removeRewardScheme(scheme2);

      expect(await staking.getAllSchemes()).to.deep.equal([scheme1]);
      expect(await staking.schemeIndexMap(scheme2)).to.equal(0);
    });

    // Exception case 1: Add zero address scheme
    it("should revert when adding zero address as scheme", async function () {
      await expect(
        staking.connect(rewardManager).addRewardScheme(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(staking, "ZeroAddress");
    });

    // Exception case 2: Add an existing scheme
    it("should revert when adding an existing scheme", async function () {
      const schemeAddr = await mockScheme1.getAddress();

      await expect(
        staking.connect(rewardManager).addRewardScheme(schemeAddr)
      ).to.be.revertedWithCustomError(staking, "RewardSchemeAlreadyAdded");
    });

    // Exception case 3: Remove a non-existent scheme
    it("should revert when removing a non-existent scheme", async function () {
      const fakeScheme = await nonUpdater.getAddress(); // Non-added address
      await expect(
        staking.connect(rewardManager).removeRewardScheme(fakeScheme)
      ).to.be.revertedWithCustomError(staking, "RewardSchemeNotFound");
    });

    // Exception case 4: Remove zero address scheme
    it("should revert when removing zero address", async function () {
      await expect(
        staking.connect(rewardManager).removeRewardScheme(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(staking, "ZeroAddress");
    });

    // Exception case 5: Add scheme without REWARD_SCHEME_ROLE
    it("should revert when adding scheme without REWARD_SCHEME_ROLE", async function () {
      const schemeAddr = await mockScheme2.getAddress();
      // Regular user attempts to add
      await expect(staking.connect(user1).addRewardScheme(schemeAddr)).to.be
        .reverted; // Insufficient role permissions
    });

    // Exception case 6: Remove scheme without REWARD_SCHEME_ROLE
    it("should revert when removing scheme without REWARD_SCHEME_ROLE", async function () {
      const schemeAddr = await mockScheme2.getAddress();
      await staking.connect(rewardManager).addRewardScheme(schemeAddr);

      // Regular user attempts to remove
      await expect(staking.connect(user1).removeRewardScheme(schemeAddr)).to.be
        .reverted; // Insufficient role permissions
    });
  });

  // 8. setReserve method tests
  describe("setReserve", function () {
    it("should transfer reserve rewards to new address", async function () {
      // Generate reserve rewards
      await mockPricer1.setPrice(INITIAL_PRICE * 2n);
      await (await vault1.update()).wait();
      const initialReward = await staking.rewardOf(await reserve.getAddress());

      // Update reserve address
      await (
        await staking.connect(admin).setReserve(await user1.getAddress())
      ).wait();

      expect(await staking.rewardOf(await user1.getAddress())).to.equal(
        initialReward
      );
      expect(await staking.rewardOf(await reserve.getAddress())).to.equal(0n);
    });
  });

  // 9. Pause/unpause tests
  describe("pause/unpause", function () {
    it("should block update when paused", async function () {
      await (await staking.connect(pauser).pause()).wait();
      await mockPricer1.setPrice(INITIAL_PRICE * 2n);
      await expect(vault1.update()).to.be.revertedWithCustomError(
        staking,
        "EnforcedPause"
      );
    });

    it("should resume after unpause", async function () {
      await (await staking.connect(pauser).pause()).wait();
      await (await staking.connect(pauser).unpause()).wait();

      const stakeAmount = ethers.parseEther("100");
      await (
        await mockPacUSD
          .connect(user1)
          .approve(await staking.getAddress(), stakeAmount)
      ).wait();
      await expect(staking.connect(user1).stake(stakeAmount)).not.to.be
        .reverted;
    });
  });

  // 10. setMinStakingPeriod method tests
  describe("setMinStakingPeriod", function () {
    // Normal scenario: Admin updates minimum staking period
    it("should update minStakingPeriod successfully by admin", async function () {
      const initialPeriod = await staking.minStakingPeriod();
      const newPeriod = ONE_DAY * 2; // Change to 2 days

      await expect(staking.connect(admin).setMinStakingPeriod(newPeriod))
        .to.emit(staking, "MinStakingPeriodSet")
        .withArgs(newPeriod);

      // Verify period updated
      expect(await staking.minStakingPeriod()).to.equal(newPeriod);
      expect(await staking.minStakingPeriod()).not.to.equal(initialPeriod);
    });

    // Exception case 1: Non-admin attempts to update
    it("should revert when called by non-admin", async function () {
      const newPeriod = ONE_DAY * 2;
      // Regular user attempts to update
      await expect(staking.connect(user1).setMinStakingPeriod(newPeriod)).to.be
        .reverted; // Missing DEFAULT_ADMIN_ROLE permission
      // Staker attempts to update
      await expect(staking.connect(user2).setMinStakingPeriod(newPeriod)).to.be
        .reverted;
    });

    // Functionality verification: Unstaking must meet new period after update
    it("should enforce new minStakingPeriod for unstake", async function () {
      // 1. Stake assets
      const stakeAmount = ethers.parseEther("100");
      await mockPacUSD
        .connect(user1)
        .approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stake(stakeAmount);

      // 2. Admin changes period to 2 days
      const newPeriod = ONE_DAY * 2;
      await staking.connect(admin).setMinStakingPeriod(newPeriod);

      // 3. Wait only 1 day (below new period)
      await time.increase(ONE_DAY);
      await expect(
        staking.connect(user1).unstake(stakeAmount)
      ).to.be.revertedWithCustomError(staking, "InsufficientStakingPeriod");

      // 4. Wait full 2 days (meets new period)
      await time.increase(ONE_DAY);
      await expect(staking.connect(user1).unstake(stakeAmount)).not.to.be
        .reverted;
    });
  });

  // 11. View function tests
  describe("view functions", function () {
    it("should return correct version", async function () {
      expect(await staking.version()).to.equal("v1");
    });

    it("should return correct rewardOf and balanceOf", async function () {
      const stakeAmount = ethers.parseEther("500");
      await (
        await mockPacUSD
          .connect(user1)
          .approve(await staking.getAddress(), stakeAmount)
      ).wait();
      await (await staking.connect(user1).stake(stakeAmount)).wait();

      expect(await staking.balanceOf(await user1.getAddress())).to.equal(
        stakeAmount
      );
      expect(await staking.rewardOf(await user1.getAddress())).to.equal(0n); // Initially no rewards

      // Verify after generating rewards
      await mockPricer1.setPrice(INITIAL_PRICE * 2n);
      await (await vault1.update()).wait();
      expect(await staking.rewardOf(await user1.getAddress())).to.be.gt(0n);
    });
  });

  // 12. Upgrade test module
  describe("Upgrade to MockPacUSDStakingV2", function () {
    // Setup: Deploy V1 and initialize state (for verifying continuity after upgrade)
    beforeEach(async function () {
      // 1. Deploy V1 contract (using proxy mode for upgradability)
      const V1Factory = await ethers.getContractFactory("PacUSDStaking");
      const proxy = await upgrades.deployProxy(V1Factory, [], {
        initializer: false,
      });
      await proxy.waitForDeployment();
      v1Staking = (await ethers.getContractAt(
        "PacUSDStaking",
        await proxy.getAddress()
      )) as PacUSDStaking;

      // 2. Initialize V1 contract (consistent with base tests)
      [owner, user1, admin, reserve, upgrader, rewardManager] =
        await ethers.getSigners();
      const MockPacUSDFactory = await ethers.getContractFactory("MockPacUSD");
      mockPacUSD = (await MockPacUSDFactory.deploy()) as MockPacUSD;
      await mockPacUSD.waitForDeployment();

      const MockMMFFactory = await ethers.getContractFactory("MockERC20");
      mockMMFToken1 = (await MockMMFFactory.deploy(
        "MockMMF1",
        "mMMF1"
      )) as MockERC20;
      mockMMFToken2 = (await MockMMFFactory.deploy(
        "MockMMF2",
        "mMMF2"
      )) as MockERC20;
      await mockMMFToken1.waitForDeployment();
      await mockMMFToken2.waitForDeployment();

      const MockPricerFactory = await ethers.getContractFactory("MockPricer");
      mockPricer1 = (await MockPricerFactory.deploy(PRECISION)) as MockPricer;
      mockPricer2 = (await MockPricerFactory.deploy(PRECISION)) as MockPricer;
      await mockPricer1.waitForDeployment();
      await mockPricer2.waitForDeployment();
      const MockVaultFactory = await ethers.getContractFactory("MockVault");
      vault1 = (await MockVaultFactory.deploy()) as MockVault;
      vault2 = (await MockVaultFactory.deploy()) as MockVault;
      await vault1.waitForDeployment();
      await vault2.waitForDeployment();
      await vault1.init(v1Staking, mockPacUSD, mockPricer1);
      await vault2.init(v1Staking, mockPacUSD, mockPricer2);

      const vaults = [await vault1.getAddress(), await vault2.getAddress()];
      await v1Staking.initialize(
        await mockPacUSD.getAddress(),
        await upgrader.getAddress(), // Upgrader role
        await admin.getAddress(),
        await reserve.getAddress(),
        vaults
      );

      // 3. Simulate V1 state data (staking, rewards, etc.)
      const stakeAmount = ethers.parseEther("1000");
      await vault1.addToken(stakeAmount)
      await mockPacUSD.mint(await user1.getAddress(), stakeAmount);
      await mockPacUSD
        .connect(user1)
        .approve(await v1Staking.getAddress(), stakeAmount);
      await v1Staking.connect(user1).stake(stakeAmount);
      await mockPricer1.setPrice(PRECISION * 2n);
      await vault1.update(); // Generate rewards
    });

    it("should upgrade to V2 and preserve state", async function () {
      // 1. Record V1 state data (for post-upgrade verification)
      const v1Address = await v1Staking.getAddress();
      const user1StakeV1 = await v1Staking.balanceOf(await user1.getAddress());
      const user1RewardV1 = await v1Staking.rewardOf(await user1.getAddress());
      const totalStakedV1 = await v1Staking.totalStaked();
      
      // 2. Perform upgrade to V2
      const V2Factory = await ethers.getContractFactory(
        "MockPacUSDStakingV2",
        upgrader
      );
      const upgraded = await upgrades.upgradeProxy(v1Address, V2Factory);
      await upgraded.waitForDeployment();
      v2Staking = (await ethers.getContractAt(
        "MockPacUSDStakingV2",
        await upgraded.getAddress()
      )) as MockPacUSDStakingV2;

      // 3. Verify state continuity after upgrade
      // 3.1 Core state data remains consistent
      expect(await v2Staking.balanceOf(await user1.getAddress())).to.equal(
        user1StakeV1
      );
      expect(await v2Staking.rewardOf(await user1.getAddress())).to.equal(
        user1RewardV1
      );
      expect(await v2Staking.totalStaked()).to.equal(totalStakedV1);

      // 3.2 Roles and permissions preserved
      expect(await v2Staking.UPDATERS(await vault1.getAddress())).to.be.true;
      expect(
        await v2Staking.hasRole(
          await v2Staking.DEFAULT_ADMIN_ROLE(),
          await admin.getAddress()
        )
      ).to.be.true;

      // 4. Verify V2 new feature (version number)
      expect(await v2Staking.version()).to.equal("v2");

      // 5. Verify V2 can perform existing functions normally
      const additionalStake = ethers.parseEther("500");
      await mockPacUSD.mint(await user1.getAddress(), additionalStake);
      await mockPacUSD
        .connect(user1)
        .approve(await v2Staking.getAddress(), additionalStake);
      await expect(v2Staking.connect(user1).stake(additionalStake))
        .to.emit(v2Staking, "Staked")
        .withArgs(await user1.getAddress(), additionalStake);
      expect(await v2Staking.balanceOf(await user1.getAddress())).to.equal(
        user1StakeV1 + additionalStake
      );
    });

    it("should reject upgrade by non-upgrader", async function () {
      // Non-upgrader role attempts upgrade (expected to fail)
      const v1Address = await v1Staking.getAddress();
      const V2Factory = await ethers.getContractFactory(
        "MockPacUSDStakingV2",
        user1
      );

      // Perform upgrade with regular user signer (no permission)
      await expect(upgrades.upgradeProxy(v1Address, V2Factory)).to.be.reverted; // Insufficient permissions
    });
  });
});
