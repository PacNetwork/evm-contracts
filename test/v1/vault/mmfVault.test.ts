import { network, ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { keccak256, toUtf8Bytes, parseEther } from "ethers";
import {
  PacUSD,
  PacUSD__factory,
  MockERC20,
  MockERC20__factory,
  MockPricer,
  MockPricer__factory,
  MockStaking,
  MockStaking__factory,
  MMFVault,
  MMFVault__factory,
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
    const chainId = await network.config.chainId;
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "address", "uint256", "address", "uint256"],
        [chainId, MMFVault.target, sender, amount, toAccount, TIMESTAMP]
      )
    );
  };

  beforeEach(async () => {
    [owner, upgrader, pauser, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 token (MMFToken)
    const MockERC20Factory = (await ethers.getContractFactory(
      "MockERC20"
    )) as MockERC20__factory;
    MMFToken = await MockERC20Factory.deploy("MMF Token", "MMF");
    await MMFToken.mint(owner, parseEther("1000000"));
    // Deploy PacUSD
    const PacUSDFactory = (await ethers.getContractFactory(
      "PacUSD"
    )) as PacUSD__factory;
    // PacUSD = await PacUSDFactory.deploy();
    PacUSD = (await upgrades.deployProxy(PacUSDFactory, [], {
      initializer: false,
    })) as unknown as PacUSD;

    // Deploy mock IPricer
    const PricerFactory = (await ethers.getContractFactory(
      "MockPricer"
    )) as MockPricer__factory;
    Pricer = await PricerFactory.deploy(INITIAL_PRICE);

    // Deploy mock IStaking
    const StakingFactory = (await ethers.getContractFactory(
      "MockStaking"
    )) as MockStaking__factory;
    Staking = await StakingFactory.deploy();

    // Deploy MMFVault using UUPS proxy
    const MMFVaultFactory = (await ethers.getContractFactory(
      "MMFVault"
    )) as MMFVault__factory;
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
      const MMFVaultFactory = (await ethers.getContractFactory(
        "MMFVault"
      )) as MMFVault__factory;
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
      const MMFVaultFactory = (await ethers.getContractFactory(
        "MMFVault"
      )) as MMFVault__factory;
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
    it("should allow admin to pause and unpause", async () => {
      await MMFVault.connect(owner).pause();
      expect(await MMFVault.paused()).to.be.true;

      await MMFVault.connect(owner).unpause();
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
      await MMFVault.connect(owner).pause();
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
      ).to.be.revertedWithCustomError(MMFVault, "InvalidPrice");
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
      await MMFVault.connect(owner).pause();
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
      ).to.be.revertedWithCustomError(MMFVault, "InvalidPrice");
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
      await MMFVault.connect(owner).pause();
      await expect(MMFVault.mintReward()).to.be.revertedWithCustomError(
        MMFVault,
        "EnforcedPause"
      );
    });
  });

  describe("UUPS Upgradeability", function () {
    it("should allow admin to authorize upgrade", async function () {
      const MMFVaultV2 = await ethers.getContractFactory(
        "MMFVault",
        upgrader
      );
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
