import { network, ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { keccak256, toUtf8Bytes, parseEther } from "ethers";
import {
  PacUSD,
  MockERC20,
  MockPricer,
  MockStaking,
  MMFVault,
} from "../../../typechain-types";

describe("MMFVault", () => {
  let MMFVault: MMFVault;
  let MMFToken: MockERC20;
  let PacUSD: PacUSD;
  let Pricer: MockPricer;
  let Staking: MockStaking;
  let upgrader: SignerWithAddress;
  let owner: SignerWithAddress;
  let pauser: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let feeReceiver: SignerWithAddress;
  const ZERO_ADDRESS = ethers.ZeroAddress;
  const INITIAL_PRICE = parseEther("2"); // 2 PacUSD per MMF
  const MMF_AMOUNT = parseEther("100");
  const PACUSD_AMOUNT = parseEther("200"); // 100 MMF * 2
  const TIMESTAMP = Math.floor(Date.now() / 1000);

  const generateTXId = async (
    sender: string,
    amount: bigint,
    toAccount: string
  ) => {
    const chainId = network.config.chainId;
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "address", "uint256", "address", "uint256"],
        [chainId, MMFVault.target, sender, amount, toAccount, TIMESTAMP]
      )
    );
  };

  beforeEach(async () => {
    [owner, upgrader, pauser, user1, user2, feeReceiver] =
      await ethers.getSigners();

    // Deploy mock ERC20 token (MMFToken)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    MMFToken = await MockERC20Factory.deploy("MMF Token", "MMF");
    await MMFToken.mint(owner, parseEther("1000000"));
    // Deploy PacUSD
    const PacUSDFactory = await ethers.getContractFactory("PacUSD");
    PacUSD = (await upgrades.deployProxy(PacUSDFactory, [], {
      initializer: false,
    })) as unknown as PacUSD;

    // Deploy mock IPricer
    const PricerFactory = await ethers.getContractFactory("MockPricer");
    Pricer = await PricerFactory.deploy(INITIAL_PRICE);

    // Deploy mock IStaking
    const StakingFactory = await ethers.getContractFactory("MockStaking");
    Staking = await StakingFactory.deploy();

    // Deploy MMFVault using UUPS proxy
    const MMFVaultFactory = await ethers.getContractFactory("MMFVault");
    MMFVault = (await upgrades.deployProxy(
      MMFVaultFactory,
      [
        MMFToken.target,
        PacUSD.target,
        Pricer.target,
        Staking.target,
        owner.address,
        upgrader.address,
      ],
      { initializer: "initialize", kind: "uups" }
    )) as unknown as MMFVault;

    await MMFVault.waitForDeployment();
    await MMFVault.grantRole(await MMFVault.PAUSER_ROLE(), pauser.address);

    // Initialize PacUSD with MMFVault as minter
    await PacUSD.initialize(owner.address, upgrader.address, [MMFVault.target]);

    await PacUSD.grantRole(await PacUSD.PAUSER_ROLE(), owner.address);
    await PacUSD.grantRole(await PacUSD.BLOCKLISTER_ROLE(), owner.address);
    await PacUSD.grantRole(await PacUSD.APPROVER_ROLE(), owner.address);
    await PacUSD.grantRole(await PacUSD.RESCUER_ROLE(), owner.address);

    // Mint MMF tokens to users
    await MMFToken.mint(user1.address, parseEther("1000"));
    await MMFToken.mint(user2.address, parseEther("1000"));

    // Approve tokens for MMFVault
    await MMFToken.connect(user1).approve(MMFVault.target, ethers.MaxUint256);
    await PacUSD.connect(user1).approve(MMFVault.target, ethers.MaxUint256);
    await MMFToken.connect(user2).approve(MMFVault.target, ethers.MaxUint256);
    await PacUSD.connect(user2).approve(MMFVault.target, ethers.MaxUint256);
  });

  describe("Initialization", () => {
    it("should initialize with correct parameters", async () => {
      expect(await MMFVault.mmfToken()).to.equal(MMFToken.target);
      expect(await MMFVault.pacUSDToken()).to.equal(PacUSD.target);
      expect(await MMFVault.pricer()).to.equal(Pricer.target);
      expect(await MMFVault.version()).to.equal("v1");
      expect(
        await MMFVault.hasRole(
          await MMFVault.DEFAULT_ADMIN_ROLE(),
          owner.address
        )
      ).to.be.true;
      expect(await MMFVault.lastPrice()).to.equal(INITIAL_PRICE);
    });

    it("should revert if initialized with zero addresses", async () => {
      const MMFVaultFactory = await ethers.getContractFactory("MMFVault");
      await expect(
        upgrades.deployProxy(
          MMFVaultFactory,
          [
            ZERO_ADDRESS,
            PacUSD.target,
            Pricer.target,
            Staking.target,
            owner.address,
            upgrader.address,
          ],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");

      await expect(
        upgrades.deployProxy(
          MMFVaultFactory,
          [
            MMFToken.target,
            ZERO_ADDRESS,
            Pricer.target,
            Staking.target,
            owner.address,
            upgrader.address,
          ],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");

      await expect(
        upgrades.deployProxy(
          MMFVaultFactory,
          [
            MMFToken.target,
            PacUSD.target,
            ZERO_ADDRESS,
            Staking.target,
            owner.address,
            upgrader.address,
          ],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");

      await expect(
        upgrades.deployProxy(
          MMFVaultFactory,
          [
            MMFToken.target,
            PacUSD.target,
            Pricer.target,
            ZERO_ADDRESS,
            owner.address,
            upgrader.address,
          ],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");

      await expect(
        upgrades.deployProxy(
          MMFVaultFactory,
          [
            MMFToken.target,
            PacUSD.target,
            Pricer.target,
            Staking.target,
            ZERO_ADDRESS,
            upgrader.address,
          ],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");

      await expect(
        upgrades.deployProxy(
          MMFVaultFactory,
          [
            MMFToken.target,
            PacUSD.target,
            Pricer.target,
            Staking.target,
            owner.address,
            ZERO_ADDRESS,
          ],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");
    });

    it("should revert if price less than 1 usdt", async () => {
      const MMFVaultFactory = await ethers.getContractFactory("MMFVault");
      await Pricer.setPrice(parseEther("0.1"));
      await expect(
        upgrades.deployProxy(
          MMFVaultFactory,
          [
            MMFToken.target,
            PacUSD.target,
            Pricer.target,
            Staking.target,
            owner.address,
            upgrader.address,
          ],
          { initializer: "initialize", kind: "uups" }
        )
      ).to.be.revertedWithCustomError(MMFVault, "InvalidPrice");
    });
  });

  describe("Access Control", () => {
    it("should allow pauser to pause and unpause", async () => {
      await MMFVault.connect(pauser).pause();
      expect(await MMFVault.paused()).to.be.true;

      await MMFVault.connect(pauser).unpause();
      expect(await MMFVault.paused()).to.be.false;
    });

    it("should revert if non-pauser tries to pause or unpause", async () => {
      await expect(
        MMFVault.connect(user1).pause()
      ).to.be.revertedWithCustomError(
        MMFVault,
        "AccessControlUnauthorizedAccount"
      );
      await expect(
        MMFVault.connect(user1).unpause()
      ).to.be.revertedWithCustomError(
        MMFVault,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("mintPacUSD", () => {
    it("should mint PacUSD successfully", async () => {
      const txId = await generateTXId(user1.address, MMF_AMOUNT, user2.address);
      // Register mint transaction
      await PacUSD.connect(owner).setMintByTx(txId);
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          txId,
          MMF_AMOUNT,
          user2.address,
          TIMESTAMP
        )
      )
        .to.emit(MMFVault, "MintPacUSD")
        .withArgs(
          user1.address,
          txId,
          user2.address,
          TIMESTAMP,
          MMF_AMOUNT,
          PACUSD_AMOUNT
        );

      expect(await MMFToken.balanceOf(MMFVault.target)).to.equal(MMF_AMOUNT);
      expect(await PacUSD.balanceOf(user2.address)).to.equal(PACUSD_AMOUNT);
    });

    it("should revert if paused", async () => {
      await MMFVault.connect(pauser).pause();
      const txId = await generateTXId(user1.address, MMF_AMOUNT, user2.address);
      await PacUSD.connect(owner).setMintByTx(txId);
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          txId,
          MMF_AMOUNT,
          user2.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "EnforcedPause");
    });

    it("should revert if toAccount is zero address", async () => {
      const txId = await generateTXId(user1.address, MMF_AMOUNT, ZERO_ADDRESS);

      await PacUSD.connect(owner).setMintByTx(txId);
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          txId,
          MMF_AMOUNT,
          ZERO_ADDRESS,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");
    });

    it("should revert before minting", async () => {
      await Pricer.setPrice(parseEther("3")); // New price > lastPrice
      const txId = await generateTXId(user1.address, MMF_AMOUNT, user2.address);

      await PacUSD.connect(owner).setMintByTx(txId);
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          txId,
          MMF_AMOUNT,
          user2.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "RewardNotMinted");
    });

    it("should revert if amount is zero", async () => {
      const txId = await generateTXId(user1.address, BigInt(0), user2.address);

      await PacUSD.connect(owner).setMintByTx(txId);
      await expect(
        MMFVault.connect(user1).mintPacUSD(txId, 0, user2.address, TIMESTAMP)
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAmount");
    });

    it("should revert if txId is invalid", async () => {
      const invalidTxId = keccak256(toUtf8Bytes("invalid"));
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          invalidTxId,
          MMF_AMOUNT,
          user2.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "InvalidTxId");
    });

    it("should revert if price is zero", async () => {
      await Pricer.setPrice(0);
      const txId = await generateTXId(user1.address, MMF_AMOUNT, user2.address);

      await PacUSD.connect(owner).setMintByTx(txId);
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          txId,
          MMF_AMOUNT,
          user2.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "InvalidPrice");
    });
  });

  describe("redeemMMF", () => {
    beforeEach(async () => {
      const txId = await generateTXId(user1.address, MMF_AMOUNT, user2.address);
      await PacUSD.connect(owner).setMintByTx(txId);
      await MMFVault.connect(user1).mintPacUSD(
        txId,
        MMF_AMOUNT,
        user2.address,
        TIMESTAMP
      );
    });

    it("should redeem MMF successfully", async () => {
      const txId = await generateTXId(
        user2.address,
        PACUSD_AMOUNT,
        user1.address
      );
      await PacUSD.connect(owner).setBurnByTx(txId);
      await expect(
        MMFVault.connect(user2).redeemMMF(
          txId,
          PACUSD_AMOUNT,
          user1.address,
          TIMESTAMP
        )
      )
        .to.emit(MMFVault, "RedeemMMF")
        .withArgs(
          user2.address,
          txId,
          user1.address,
          TIMESTAMP,
          PACUSD_AMOUNT,
          MMF_AMOUNT
        );

      expect(await MMFToken.balanceOf(user1.address)).to.equal(
        parseEther("1000")
      ); // Initial 1000
      expect(await PacUSD.balanceOf(user2.address)).to.equal(0); // 200 - 200
    });

    it("should revert if paused", async () => {
      await MMFVault.connect(pauser).pause();
      const txId = await generateTXId(
        user2.address,
        PACUSD_AMOUNT,
        user1.address
      );
      await PacUSD.connect(owner).setBurnByTx(txId);
      await expect(
        MMFVault.connect(user2).redeemMMF(
          txId,
          PACUSD_AMOUNT,
          user1.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "EnforcedPause");
    });

    it("should revert if toAccount is zero address", async () => {
      const txId = await generateTXId(
        user2.address,
        PACUSD_AMOUNT,
        ZERO_ADDRESS
      );
      await PacUSD.connect(owner).setBurnByTx(txId);
      await expect(
        MMFVault.connect(user2).redeemMMF(
          txId,
          PACUSD_AMOUNT,
          ZERO_ADDRESS,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");
    });

    it("should revert before redeeming", async () => {
      await Pricer.setPrice(parseEther("3")); // New price > lastPrice
      const txId = await generateTXId(
        user2.address,
        PACUSD_AMOUNT,
        user1.address
      );
      await PacUSD.connect(owner).setBurnByTx(txId);
      await expect(
        MMFVault.connect(user2).redeemMMF(
          txId,
          PACUSD_AMOUNT,
          user1.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "RewardNotMinted");
    });

    it("should revert if amount is zero", async () => {
      const txId = await generateTXId(user2.address, BigInt(0), user1.address);
      await PacUSD.connect(owner).setBurnByTx(txId);
      await expect(
        MMFVault.connect(user2).redeemMMF(txId, 0, user1.address, TIMESTAMP)
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAmount");
    });

    it("should revert if txId is invalid", async () => {
      const invalidTxId = keccak256(toUtf8Bytes("invalid"));
      await expect(
        MMFVault.connect(user2).redeemMMF(
          invalidTxId,
          PACUSD_AMOUNT,
          user1.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "InvalidTxId");
    });

    it("should revert if price is zero", async () => {
      await Pricer.setPrice(0);
      const txId = await generateTXId(
        user2.address,
        PACUSD_AMOUNT,
        user1.address
      );
      await PacUSD.connect(owner).setBurnByTx(txId);
      await expect(
        MMFVault.connect(user2).redeemMMF(
          txId,
          PACUSD_AMOUNT,
          user1.address,
          TIMESTAMP
        )
      ).to.be.revertedWithCustomError(MMFVault, "InvalidPrice");
    });
  });

  describe("mintReward", () => {
    it("should mint rewards when price increases", async () => {
      const txId = await generateTXId(user1.address, MMF_AMOUNT, user2.address);
      await PacUSD.connect(owner).setMintByTx(txId);
      await MMFVault.connect(user1).mintPacUSD(
        txId,
        MMF_AMOUNT,
        user2.address,
        TIMESTAMP
      );

      await Pricer.setPrice(parseEther("3")); // lastPrice = 2, currentPrice = 3
      await expect(MMFVault.mintReward())
        .to.emit(MMFVault, "RewardMinted")
        .withArgs(
          Staking.target,
          parseEther("100"),
          parseEther("2"),
          parseEther("3"),
          MMF_AMOUNT
        ); // (3-2) * 100 MMF
      expect(await MMFVault.lastPrice()).to.equal(parseEther("3"));
      expect(await Staking.updateCalled()).to.be.true;
    });

    it("should not mint rewards if price does not increase", async () => {
      await Pricer.setPrice(parseEther("2")); // lastPrice = 2, currentPrice = 2
      await expect(MMFVault.mintReward()).to.not.emit(MMFVault, "RewardMinted");
      expect(await MMFVault.lastPrice()).to.equal(parseEther("2"));
      expect(await Staking.updateCalled()).to.be.false;
    });

    it("should revert if price is zero", async () => {
      await Pricer.setPrice(parseEther("0"));
      await expect(MMFVault.mintReward()).to.be.revertedWithCustomError(
        MMFVault,
        "InvalidPrice"
      );
    });

    it("should update price if mmfVault balance is zero", async () => {
      await Pricer.setPrice(parseEther("3"));
      await MMFVault.mintReward();
      expect(await MMFVault.lastPrice()).to.equal(parseEther("3"));
    });

    it("should revert on share calculation overflow", async () => {
      const txId = await generateTXId(user1.address, MMF_AMOUNT, user2.address);
      await PacUSD.connect(owner).setMintByTx(txId);
      await MMFVault.connect(user1).mintPacUSD(
        txId,
        MMF_AMOUNT,
        user2.address,
        TIMESTAMP
      );

      await Pricer.setPrice(ethers.MaxUint256);
      await expect(MMFVault.mintReward()).to.be.revertedWithPanic("0x11");
    });

    it("should revert if paused", async () => {
      await MMFVault.connect(pauser).pause();
      await expect(MMFVault.mintReward()).to.be.revertedWithCustomError(
        MMFVault,
        "EnforcedPause"
      );
    });

    /**
     * 11. Fee Rate Update with Unset Receiver Test: Should revert when updating mint/redeem fee rates
     * if fee receiver address hasn't been set
     * Expected Result: Triggers the FeeReceiverNotSet custom error for both operations
     */
    it("should revert when updating mint or redeem fee rates if fee receiver address is not set", async function () {
      // Attempt to update mint fee rate without setting fee receiver first
      await expect(
        MMFVault.connect(owner).updateMintFeeRate(parseEther("0.01"))
      ).to.be.revertedWithCustomError(MMFVault, "FeeReceiverRequired");

      // Attempt to update redeem fee rate without setting fee receiver first
      await expect(
        MMFVault.connect(owner).updateRedeemFeeRate(parseEther("0.01"))
      ).to.be.revertedWithCustomError(MMFVault, "FeeReceiverRequired");
    });
  });
  describe("Fee Management", function () {
    // Test Setup: Initialize base parameters required for testing (reuse contract instances and signers from global setup)
    beforeEach(async function () {
      // Initialize default fee receiver (used only in specific test scenarios)
      await MMFVault.connect(owner).updateFeeReceiver(feeReceiver.address);
      // Initialize default fee rates (1% = 1e16, based on FEE_PRECISION = 1e18)
      await MMFVault.connect(owner).updateMintFeeRate(parseEther("0.01"));
      await MMFVault.connect(owner).updateRedeemFeeRate(parseEther("0.01"));
    });

    /**
     * 1. Fee Receiver Management Test: Admin should be able to update the fee receiver address
     * Expected Results:
     * - Triggers the FeeReceiverUpdated event with the old and new addresses
     * - The feeReceiver field in the contract is updated to the new address
     */
    it("should allow admin to update fee receiver address", async function () {
      const oldFeeReceiver = await MMFVault.feeReceiver();
      const newFeeReceiver = user2.address;

      // Execute update operation and verify event emission
      await expect(MMFVault.connect(owner).updateFeeReceiver(newFeeReceiver))
        .to.emit(MMFVault, "FeeReceiverUpdated")
        .withArgs(oldFeeReceiver, newFeeReceiver);

      // Verify fee receiver has been updated
      expect(await MMFVault.feeReceiver()).to.equal(newFeeReceiver);
    });

    /**
     * 2. Fee Receiver Exception Test: Should revert when updating to zero address
     * Expected Result: Triggers the ZeroAddress custom error
     */
    it("should revert if updating fee receiver to zero address", async function () {
      await expect(
        MMFVault.connect(owner).updateFeeReceiver(ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(MMFVault, "ZeroAddress");
    });

    /**
     * 3. Fee Receiver Permission Test: Should revert if non-admin tries to update fee receiver
     * Expected Result: Triggers the AccessControlUnauthorizedAccount custom error
     */
    it("should revert if non-admin tries to update fee receiver", async function () {
      await expect(
        MMFVault.connect(user1).updateFeeReceiver(user2.address)
      ).to.be.revertedWithCustomError(
        MMFVault,
        "AccessControlUnauthorizedAccount"
      );
    });

    /**
     * 4. Mint Fee Rate Management Test: Admin should be able to update Mint fee rate (MMF→PacUSD)
     * Expected Results:
     * - Triggers the MintFeeRateUpdated event with the old and new fee rates
     * - The mintFeeRate field in the contract is updated to the new rate
     */
    it("should allow admin to update mint fee rate (MMF → PacUSD)", async function () {
      const oldMintFeeRate = await MMFVault.mintFeeRate();
      const newMintFeeRate = parseEther("0.02"); // 2% fee rate

      // Execute update operation and verify event emission
      await expect(MMFVault.connect(owner).updateMintFeeRate(newMintFeeRate))
        .to.emit(MMFVault, "MintFeeRateUpdated")
        .withArgs(oldMintFeeRate, newMintFeeRate);

      // Verify Mint fee rate has been updated
      expect(await MMFVault.mintFeeRate()).to.equal(newMintFeeRate);
    });

    /**
     * 5. Mint Fee Rate Exception Test: Should revert if mint fee rate exceeds 100%
     * Expected Result: Triggers the FeeRateExceedsMax custom error
     */
    it("should revert if mint fee rate exceeds 100%", async function () {
      const invalidFeeRate = parseEther("1.01"); // 101% fee rate (exceeds maximum 100%)
      await expect(
        MMFVault.connect(owner).updateMintFeeRate(invalidFeeRate)
      ).to.be.revertedWithCustomError(MMFVault, "FeeRateExceedsMax");
    });

    /**
     * 6. Redeem Fee Rate Management Test: Admin should be able to update Redeem fee rate (PacUSD→MMF)
     * Expected Results:
     * - Triggers the RedeemFeeRateUpdated event with the old and new fee rates
     * - The redeemFeeRate field in the contract is updated to the new rate
     */
    it("should allow admin to update redeem fee rate (PacUSD → MMF)", async function () {
      const oldRedeemFeeRate = await MMFVault.redeemFeeRate();
      const newRedeemFeeRate = parseEther("0.03"); // 3% fee rate

      // Execute update operation and verify event emission
      await expect(
        MMFVault.connect(owner).updateRedeemFeeRate(newRedeemFeeRate)
      )
        .to.emit(MMFVault, "RedeemFeeRateUpdated")
        .withArgs(oldRedeemFeeRate, newRedeemFeeRate);

      // Verify Redeem fee rate has been updated
      expect(await MMFVault.redeemFeeRate()).to.equal(newRedeemFeeRate);
    });

    /**
     * 7. Redeem Fee Rate Exception Test: Should revert if redeem fee rate exceeds 100%
     * Expected Result: Triggers the FeeRateExceedsMax custom error
     */
    it("should revert if redeem fee rate exceeds 100%", async function () {
      const invalidFeeRate = parseEther("1.5"); // 150% fee rate (exceeds maximum 100%)
      await expect(
        MMFVault.connect(owner).updateRedeemFeeRate(invalidFeeRate)
      ).to.be.revertedWithCustomError(MMFVault, "FeeRateExceedsMax");
    });

    /**
     * 8. Core Mint Fee Test: Should collect mint fee and mint to receiver when minting PacUSD
     * Expected Results:
     * - Triggers the MintFeeCollected event with payer, txId, fee amount, and fee receiver
     * - Fee receiver gets the corresponding PacUSD fee (minted via pacUSD.mintFee)
     * - End user receives PacUSD after fee deduction
     */
    it("should collect mint fee and mint to fee receiver when minting PacUSD", async function () {
      const mintFeeRate = await MMFVault.mintFeeRate(); // 1% fee rate
      const mmfAmount = parseEther("100"); // 100 MMF
      const price = await Pricer.getLatestPrice(); // 2 PacUSD per MMF
      const expectedPacUSDAmount = (mmfAmount * price) / parseEther("1"); // 100 * 2 = 200 PacUSD
      const expectedMintFee =
        (expectedPacUSDAmount * mintFeeRate) / parseEther("1"); // 200 * 1% = 2 PacUSD
      const expectedFinalPacUSD = expectedPacUSDAmount - expectedMintFee; // 198 PacUSD

      // 1. Generate and register Mint transaction ID
      const txId = await generateTXId(user1.address, mmfAmount, user2.address);
      await PacUSD.connect(owner).setMintByTx(txId);

      // 2. Execute Mint operation and verify events
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          txId,
          mmfAmount,
          user2.address,
          TIMESTAMP
        )
      )
        .to.emit(MMFVault, "MintFeeCollected")
        .withArgs(user1.address, txId, expectedMintFee, feeReceiver.address)
        .and.to.emit(MMFVault, "MintPacUSD")
        .withArgs(
          user1.address,
          txId,
          user2.address,
          TIMESTAMP,
          mmfAmount,
          expectedPacUSDAmount
        );

      // 3. Verify fee receiver's balance (receives 2 PacUSD fee)
      expect(await PacUSD.balanceOf(feeReceiver.address)).to.equal(
        expectedMintFee
      );
      // 4. Verify end user's balance (receives 198 PacUSD after fee deduction)
      expect(await PacUSD.balanceOf(user2.address)).to.equal(
        expectedFinalPacUSD
      );
    });

    /**
     * 9. Mint Fee Exception Test: Should revert if mint fee calculation overflows
     * Expected Result: Triggers panic code 0x11 (integer overflow/underflow)
     */
    it("should revert if mint fee calculation overflows", async function () {
      // 1. Set extreme fee rate (close to 100%)
      await MMFVault.connect(owner).updateMintFeeRate(
        parseEther("0.9999999999")
      );
      // 2. Use extremely large amount to trigger overflow risk
      const hugeMMFAmount = ethers.MaxUint256 / parseEther("2"); // Avoid initial value overflow
      const txId = await generateTXId(
        user1.address,
        hugeMMFAmount,
        user2.address
      );
      await PacUSD.connect(owner).setMintByTx(txId);

      // 3. Execute Mint operation, expect revert due to fee calculation overflow
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          txId,
          hugeMMFAmount,
          user2.address,
          TIMESTAMP
        )
      ).to.be.revertedWithPanic("0x11");
    });

    /**
     * 10. Redeem Fee Exception Test: Should revert if redeem fee calculation overflows
     * Expected Result: Triggers panic code 0x11 (integer overflow/underflow)
     */
    it("should revert if redeem fee calculation overflows", async function () {
      // 1. First execute Mint operation to deposit base MMF
      const mintTxId = await generateTXId(
        user1.address,
        MMF_AMOUNT,
        user2.address
      );
      await PacUSD.connect(owner).setMintByTx(mintTxId);
      await MMFVault.connect(user1).mintPacUSD(
        mintTxId,
        MMF_AMOUNT,
        user2.address,
        TIMESTAMP
      );

      // 2. Set extreme fee rate (close to 100%)
      await MMFVault.connect(owner).updateRedeemFeeRate(
        parseEther("0.9999999999")
      );
      // 3. Use extremely large amount to trigger overflow risk
      const hugePacUSDAmount = ethers.MaxUint256 / parseEther("2");
      const burnTxId = await generateTXId(
        user2.address,
        hugePacUSDAmount,
        user1.address
      );
      await PacUSD.connect(owner).setBurnByTx(burnTxId);

      // 4. Execute Redeem operation, expect revert due to fee calculation overflow
      await expect(
        MMFVault.connect(user2).redeemMMF(
          burnTxId,
          hugePacUSDAmount,
          user1.address,
          TIMESTAMP
        )
      ).to.be.revertedWithPanic("0x11");
    });
    /**
     * 11. Core Redeem Fee Test: Should collect redeem fee and transfer it to the fee receiver when redeeming MMF
     * Expected Results:
     * - Mint Phase: Triggers the MintFeeCollected event, and user2 receives PacUSD after mint fee deduction
     * - Redeem Phase: Triggers the RedeemFeeCollected event, and the fee receiver gets the redeem fee (via direct transfer)
     * - Final State: user1 receives MMF corresponding to the amount after redeem fee deduction, and user2's PacUSD balance is zero
     */
    it("should collect redeem fee and transfer to fee receiver when redeeming MMF (with mint fee deducted first)", async function () {
      // --------------------------
      // 1. Initialize base parameters (including mint fee and redeem fee)
      // --------------------------
      const mintFeeRate = await MMFVault.mintFeeRate(); // 1% mint fee rate (deducted in MMF→PacUSD phase)
      const redeemFeeRate = await MMFVault.redeemFeeRate(); // 1% redeem fee rate (deducted in PacUSD→MMF phase)
      const initialMMFAmount = parseEther("100"); // Initial MMF amount deposited by user1
      const mmfPrice = await Pricer.getLatestPrice(); // MMF price (2 PacUSD/MMF, fetched from Pricer contract in real time instead of hardcoding)

      // --------------------------
      // 2. Calculate actual amount in Mint Phase (after mint fee deduction)
      // --------------------------
      const theoreticalPacUSDAfterMint =
        (initialMMFAmount * mmfPrice) / parseEther("1"); // 100 * 2 = 200 PacUSD (theoretical value)
      const mintFee =
        (theoreticalPacUSDAfterMint * mintFeeRate) / parseEther("1"); // 200 * 1% = 2 PacUSD (mint fee)
      const actualPacUSDUser2Gets = theoreticalPacUSDAfterMint - mintFee; // 198 PacUSD (actual PacUSD held by user2 for subsequent redemption)

      // --------------------------
      // 3. Execute Mint operation (deposit MMF, generate PacUSD after mint fee deduction)
      // --------------------------
      const mintTxId = await generateTXId(
        user1.address,
        initialMMFAmount,
        user2.address
      );
      await PacUSD.connect(owner).setMintByTx(mintTxId); // Register mint transaction ID
      // Execute mint and verify fee-related events in Mint Phase
      await expect(
        MMFVault.connect(user1).mintPacUSD(
          mintTxId,
          initialMMFAmount,
          user2.address,
          TIMESTAMP
        )
      )
        .to.emit(MMFVault, "MintFeeCollected")
        .withArgs(user1.address, mintTxId, mintFee, feeReceiver.address) // Verify mint fee collection
        .and.to.emit(MMFVault, "MintPacUSD")
        .withArgs(
          user1.address,
          mintTxId,
          user2.address,
          TIMESTAMP,
          initialMMFAmount,
          theoreticalPacUSDAfterMint
        ); // Theoretical total amount (including fee)
      // Verify user2 actually holds 198 PacUSD after Mint (post mint fee deduction)
      expect(await PacUSD.balanceOf(user2.address)).to.equal(
        actualPacUSDUser2Gets
      );

      // --------------------------
      // 4. Calculate actual amount in Redeem Phase (based on user2's actual PacUSD holdings, after redeem fee deduction)
      // --------------------------
      const pacUSDToRedeem = actualPacUSDUser2Gets; // user2 redeems all their actual holdings (198 PacUSD)
      const redeemFee = (pacUSDToRedeem * redeemFeeRate) / parseEther("1"); // 198 * 1% = 1.98 PacUSD (redeem fee)
      const pacUSDAfterRedeemFee = pacUSDToRedeem - redeemFee; // 196.02 PacUSD (amount used for MMF exchange after redeem fee deduction)
      // Calculate actual MMF amount receivable (based on PacUSD after redeem fee deduction and current price)
      const expectedMMFAmount =
        (pacUSDAfterRedeemFee * parseEther("1") * parseEther("1")) /
        (mmfPrice * parseEther("1"));
      // Simplified calculation: 196.02 * 1 / 2 = 98.01 MMF (actual value is 98.01 * 1e18 wei due to precision)

      // --------------------------
      // 5. Execute Redeem operation (exchange actual PacUSD for MMF, with redeem fee deducted)
      // --------------------------
      const burnTxId = await generateTXId(
        user2.address,
        pacUSDToRedeem,
        user1.address
      );
      await PacUSD.connect(owner).setBurnByTx(burnTxId); // Register burn transaction ID
      // Record user1's initial MMF balance (for subsequent verification)
      const initialMMFUser1Has = await MMFToken.balanceOf(user1.address); // 1000 MMF (initial minted amount from global setup)

      // Execute redeem and verify events
      await expect(
        MMFVault.connect(user2).redeemMMF(
          burnTxId,
          pacUSDToRedeem,
          user1.address,
          TIMESTAMP
        )
      )
        .to.emit(MMFVault, "RedeemFeeCollected")
        .withArgs(user2.address, burnTxId, redeemFee, feeReceiver.address) // Verify redeem fee collection
        .and.to.emit(MMFVault, "RedeemMMF")
        .withArgs(
          user2.address,
          burnTxId,
          user1.address,
          TIMESTAMP,
          pacUSDToRedeem,
          expectedMMFAmount
        ); // Verify the amount of MMF exchanged

      // --------------------------
      // 6. Verify final state after Redeem
      // --------------------------
      // ① Fee Receiver: Receives both mint fee (2) and redeem fee (1.98), total 3.98 PacUSD
      const totalFeeReceived = mintFee + redeemFee;
      expect(await PacUSD.balanceOf(feeReceiver.address)).to.equal(
        totalFeeReceived
      );
      // ② user1: Initial 1000 MMF + redeemed 98.01 MMF, total 1098.01 MMF
      expect(await MMFToken.balanceOf(user1.address)).to.equal(
        initialMMFUser1Has + expectedMMFAmount
      );
      // ③ user2: PacUSD balance is zero after redemption (198 fully used for exchange; remaining amount after 1.98 fee deduction used for MMF exchange)
      expect(await PacUSD.balanceOf(user2.address)).to.equal(0);
      // ④ Contract's total MMF balance: Initial deposited 100 MMF - redeemed 98.01 MMF = 1.99 MMF (retained as fee-related balance)
      expect(await MMFToken.balanceOf(MMFVault.target)).to.equal(
        initialMMFAmount - expectedMMFAmount
      );
    });
  });
  describe("UUPS Upgradeability", function () {
    it("should allow admin to authorize upgrade", async function () {
      const MMFVaultV2 = await ethers.getContractFactory("MMFVault", upgrader);
      await expect(
        upgrades.upgradeProxy(MMFVault.target, MMFVaultV2, { kind: "uups" })
      ).to.not.be.reverted;
    });

    it("should revert if non-upgrader tries to upgrade", async function () {
      const MMFVaultV2 = await ethers.getContractFactory("MMFVault", user1);
      await expect(
        upgrades.upgradeProxy(MMFVault.target, MMFVaultV2, { kind: "uups" })
      ).to.be.revertedWithCustomError(MMFVault, "OwnableUnauthorizedAccount");
    });
  });
});
