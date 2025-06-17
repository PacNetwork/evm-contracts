import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, toUtf8Bytes, parseEther } from "ethers";
import {
  DeployFactory,
  DeployFactory__factory,
  PacUSD,
  PacUSD__factory,
  MMFVault,
  MMFVault__factory,
  MockERC20,
  MockERC20__factory,
  MockPricer,
  MockPricer__factory,
  MockStaking,
  MockStaking__factory,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { upgrades } from "hardhat";

describe("DeployFactory", () => {
  let deployFactory: DeployFactory;
  let pacUSD: PacUSD;
  let mmfVault: MMFVault;
  let mmfToken: MockERC20;
  let pricer: MockPricer;
  let staking: MockStaking;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let minter: SignerWithAddress;
  let pauser: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let pacUSDSalt: string;
  let mmfVaultSalt: string;

  const ZERO_ADDRESS = ethers.ZeroAddress;
  const INITIAL_PRICE = parseEther("1"); // 1:1 price for MMF:PacUSD

  beforeEach(async () => {
    [owner, admin, user1, user2, minter, pauser, blacklister, rescuer] =
      await ethers.getSigners();

    const MockERC20Factory = (await ethers.getContractFactory(
      "MockERC20"
    )) as MockERC20__factory;
    mmfToken = await MockERC20Factory.deploy("MMF Token", "MMF");
    await mmfToken.waitForDeployment();

    const MockPricerFactory = (await ethers.getContractFactory(
      "MockPricer"
    )) as MockPricer__factory;
    pricer = await MockPricerFactory.deploy(INITIAL_PRICE);
    await pricer.waitForDeployment();

    const MockStakingFactory = (await ethers.getContractFactory(
      "MockStaking"
    )) as MockStaking__factory;
    staking = await MockStakingFactory.deploy();
    await staking.waitForDeployment();

    const DeployFactoryFactory = (await ethers.getContractFactory(
      "DeployFactory"
    )) as DeployFactory__factory;
    deployFactory = await DeployFactoryFactory.deploy();
    await deployFactory.waitForDeployment();

    pacUSDSalt = keccak256(toUtf8Bytes("pacUSD_salt"));
    mmfVaultSalt = keccak256(toUtf8Bytes("mmfVault_salt"));
  });

  async function deployContractsAndAttach(
    sender: SignerWithAddress
  ): Promise<{ pacUSDAddress: string; mmfVaultAddress: string }> {
    const expectedPacUSDAddress = await deployFactory.computePacUSDAddress(
      sender.address,
      pacUSDSalt
    );
    const expectedMMFVaultAddress = await deployFactory.computeMMFVaultAddress(
      sender.address,
      mmfVaultSalt
    );

    const tx = await deployFactory
      .connect(sender)
      .deployContracts(
        mmfToken.target,
        pricer.target,
        staking.target,
        owner.address,
        admin.address,
        [minter.address],
        pacUSDSalt,
        mmfVaultSalt
      );
    const receipt = await tx.wait();
    const eventLog = receipt!!.logs.find(
      (log) =>
        log.address === deployFactory.target &&
        deployFactory.interface.parseLog({ ...log })!!.name ===
          "ContractsDeployed"
    );
    if (!eventLog) throw new Error("ContractsDeployed event not found");

    const parsedLog = deployFactory.interface.parseLog({ ...eventLog });
    const {
      sender: eventSender,
      pacUSDProxy: pacUSDAddress,
      mmfVaultProxy: mmfVaultAddress,
    } = parsedLog!!.args;

    expect(eventSender).to.equal(sender.address);
    expect(pacUSDAddress).to.equal(expectedPacUSDAddress);
    expect(mmfVaultAddress).to.equal(expectedMMFVaultAddress);

    const PacUSDFactory = (await ethers.getContractFactory(
      "PacUSD"
    )) as PacUSD__factory;
    const MMFVaultFactory = (await ethers.getContractFactory(
      "MMFVault"
    )) as MMFVault__factory;
    pacUSD = PacUSDFactory.attach(pacUSDAddress) as PacUSD;
    mmfVault = MMFVaultFactory.attach(mmfVaultAddress) as MMFVault;

    return { pacUSDAddress, mmfVaultAddress };
  }

  describe("Deployment", () => {
    it("should deploy PacUSD and MMFVault with correct addresses using CREATE2 and msg.sender", async () => {
      await deployContractsAndAttach(user1);
    });

    it("should generate different addresses for different senders with same salt", async () => {
      const user1PacUSDAddress = await deployFactory.computePacUSDAddress(
        user1.address,
        pacUSDSalt
      );
      const user2PacUSDAddress = await deployFactory.computePacUSDAddress(
        user2.address,
        pacUSDSalt
      );

      expect(user1PacUSDAddress).to.not.equal(user2PacUSDAddress);

      await deployContractsAndAttach(user1);
      await deployContractsAndAttach(user2);

      expect(await ethers.provider.getCode(user1PacUSDAddress)).to.not.equal(
        "0x"
      );
      expect(await ethers.provider.getCode(user2PacUSDAddress)).to.not.equal(
        "0x"
      );
    });

    it("should revert if any input address is zero", async () => {
      await expect(
        deployFactory
          .connect(user1)
          .deployContracts(
            ZERO_ADDRESS,
            pricer.target,
            staking.target,
            owner.address,
            admin.address,
            [minter.address],
            pacUSDSalt,
            mmfVaultSalt
          )
      ).to.be.revertedWithCustomError(deployFactory, "ZeroAddress");

      await expect(
        deployFactory
          .connect(user1)
          .deployContracts(
            mmfToken.target,
            pricer.target,
            staking.target,
            ZERO_ADDRESS,
            admin.address,
            [minter.address],
            pacUSDSalt,
            mmfVaultSalt
          )
      ).to.be.revertedWithCustomError(deployFactory, "ZeroAddress");
    });

  });

  describe("UUPS Upgradeability", () => {
    let pacUSDAddress: string;
    let mmfVaultAddress: string;

    beforeEach(async () => {
      const addresses = await deployContractsAndAttach(user1);
      pacUSDAddress = addresses.pacUSDAddress;
      mmfVaultAddress = addresses.mmfVaultAddress;
    });

    it("should allow admin to authorize upgrade for PacUSD", async () => {
      //Force the import of the deployed proxy contract
      await upgrades.forceImport(pacUSDAddress, await ethers.getContractFactory("PacUSD"));
      
      const PacUSDV2Factory = await ethers.getContractFactory("PacUSD", admin);
      await upgrades.upgradeProxy(pacUSDAddress, PacUSDV2Factory, { kind: "uups" });
      

    });

    it("should revert if non-admin tries to upgrade PacUSD", async () => {
      //Force the import of the deployed proxy contract
      await upgrades.forceImport(pacUSDAddress, await ethers.getContractFactory("PacUSD"));
      
      const PacUSDV2Factory = await ethers.getContractFactory("PacUSD", user1);
      await expect(
        upgrades.upgradeProxy(pacUSDAddress, PacUSDV2Factory, { kind: "uups" })
      ).to.be.revertedWithCustomError(pacUSD, "OwnableUnauthorizedAccount");
    });

    it("should allow admin to authorize upgrade for MMFVault", async () => {
      //Force the import of the deployed proxy contract
      await upgrades.forceImport(mmfVaultAddress, await ethers.getContractFactory("MMFVault"));
      
      const MMFVaultV2Factory = await ethers.getContractFactory("MMFVault", admin);
      await upgrades.upgradeProxy(mmfVaultAddress, MMFVaultV2Factory, { kind: "uups" });
      

    });

    it("should revert if non-admin tries to upgrade MMFVault", async () => {
      //Force the import of the deployed proxy contract
      await upgrades.forceImport(mmfVaultAddress, await ethers.getContractFactory("MMFVault"));
      
      const MMFVaultV2Factory = await ethers.getContractFactory("MMFVault", user1);
      await expect(
        upgrades.upgradeProxy(mmfVaultAddress, MMFVaultV2Factory, { kind: "uups" })
      ).to.be.revertedWithCustomError(mmfVault, "OwnableUnauthorizedAccount");
    });
  });

  describe("Contract Initialization", () => {
    beforeEach(async () => {
      await deployContractsAndAttach(user1);
    });

    it("should initialize PacUSD with correct settings", async () => {
      expect(
        await pacUSD.hasRole(await pacUSD.DEFAULT_ADMIN_ROLE(), owner.address)
      ).to.be.true;
      expect(await pacUSD.isMinter(minter.address)).to.be.true;
    });

    it("should initialize MMFVault with correct settings", async () => {
      expect(
        await mmfVault.hasRole(
          await mmfVault.DEFAULT_ADMIN_ROLE(),
          owner.address
        )
      ).to.be.true;
      expect(await mmfVault.mmfToken()).to.equal(mmfToken.target);
      expect(await mmfVault.pacUSDToken()).to.equal(pacUSD.target);
      expect(await mmfVault.pricer()).to.equal(pricer.target);
      expect(await mmfVault.staking()).to.equal(staking.target);
    });
  });
});