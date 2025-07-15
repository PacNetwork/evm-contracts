// test/AddressFactory.test.ts
import { ethers } from "hardhat";
import {
  AddressFactory,
  AddressFactory__factory,
  PacUSD__factory,
  MMFVault__factory,
  PacUSDStaking__factory,
  MMFVaultDeployFactory,
  MockPricer,
  MockERC20,
  MockPricer__factory,
  MockERC20__factory,
  PacUSDDeployFactory,
  StakingDeployFactory,
  StakingDeployFactory__factory,
} from "../../../typechain-types";
import { expect } from "chai";
import { parseEther } from "ethers";

/**
 * Test suite for AddressFactory contract
 * This suite verifies the correct functionality of contract address computation
 * and deployment using the Create2 mechanism.
 */
describe("AddressFactory", () => {
  let addressFactory: AddressFactory;
  let mmfVaultDeployFactory: MMFVaultDeployFactory;
  let pacUSDDeployFactory: PacUSDDeployFactory;
  let stakingDeployFactory: StakingDeployFactory;

  // Salts for Create2 address computation
  const vaultSalts =[ ethers.keccak256(ethers.toUtf8Bytes("MMFVSalt"))];
  const pacUSDSalt = ethers.keccak256(ethers.toUtf8Bytes("PacUSDSalt"));
  const stakingSalt = ethers.keccak256(ethers.toUtf8Bytes("StakingSalt"));
  
  // Bytecode hashes for contract implementations
  let vaultHash: string;
  let pacUSDHash: string;
  let stakingHash: string;
  
  // Signer addresses
  let deployer: string;
  let other: string;
  
  // Mock contracts
  let Pricer: MockPricer;
  let MMFToken: MockERC20;
  
  // Initial price for MMF token (2 PacUSD per MMF)
  const INITIAL_PRICE = parseEther("2"); 

  /**
   * Setup function to deploy all necessary contracts and initialize test data
   */
  before(async () => {
    // Deploy factory contracts for each component
    const pacUSDFactory = (await ethers.getContractFactory(
      "PacUSD"
    )) as PacUSD__factory;
    const mMFVaultFactory = (await ethers.getContractFactory(
      "MMFVault"
    )) as MMFVault__factory;
    const pacUSDStakingFactory = (await ethers.getContractFactory(
      "PacUSDStaking"
    )) as PacUSDStaking__factory;

    const MMFVaultDeployFactory__factory = await ethers.getContractFactory(
      "MMFVaultDeployFactory"
    );

    const PacUSDDeployFactory__factory = await ethers.getContractFactory(
      "PacUSDDeployFactory"
    );
    const StakingDeployFactory__factory = await ethers.getContractFactory(
      "StakingDeployFactory"
    );

    // Compute bytecode hashes for each contract (used in Create2 address calculation)
    vaultHash = ethers.keccak256(mMFVaultFactory.bytecode);
    pacUSDHash = ethers.keccak256(pacUSDFactory.bytecode);
    stakingHash = ethers.keccak256(pacUSDStakingFactory.bytecode);

    // Get signer addresses
    [deployer, other] = await ethers
      .getSigners()
      .then((signers) => signers.map((signer) => signer.address));

    // Deploy AddressFactory contract with bytecode hashes and salts
    const addressFactoryFactory = (await ethers.getContractFactory(
      "AddressFactory"
    )) as AddressFactory__factory;
    addressFactory = await addressFactoryFactory.deploy(
      vaultHash,
      pacUSDHash,
      pacUSDSalt,
      stakingHash,
      stakingSalt
    );
    await addressFactory.deploymentTransaction();

    // Deploy deployment factories and pass AddressFactory address
    mmfVaultDeployFactory = await MMFVaultDeployFactory__factory.deploy(
      addressFactory.target
    );
    await mmfVaultDeployFactory.waitForDeployment();

    stakingDeployFactory = await StakingDeployFactory__factory.deploy(
      addressFactory.target
    );
    await stakingDeployFactory.waitForDeployment();

    pacUSDDeployFactory = await PacUSDDeployFactory__factory.deploy(
      addressFactory.target
    );
    await pacUSDDeployFactory.waitForDeployment();

    // Deploy mock contracts for testing
    const PricerFactory = (await ethers.getContractFactory(
      "MockPricer"
    )) as MockPricer__factory;
    Pricer = await PricerFactory.deploy(INITIAL_PRICE);

    const MockERC20Factory = (await ethers.getContractFactory(
      "MockERC20"
    )) as MockERC20__factory;
    MMFToken = await MockERC20Factory.deploy("MMF Token", "MMF");
    await MMFToken.mint(deployer, parseEther("1000000"));
  });

  /**
   * Test case: Verify that AddressFactory can compute contract addresses correctly
   * using the Create2 mechanism and that contracts can be deployed to these addresses.
   */
  it("should compute contract addresses correctly", async () => {
    // Prepare factory addresses for computation
    const vaultFactoryAddress = mmfVaultDeployFactory.target.toString();
    const pacUSDFactoryAddress = pacUSDDeployFactory.target.toString();
    const stakingFactoryAddress = stakingDeployFactory.target.toString();

    // Compute addresses using AddressFactory
    await addressFactory.computeAddress(
      pacUSDFactoryAddress,
      stakingFactoryAddress
    );

     await addressFactory.computeVaultAddress(
      vaultFactoryAddress,
      vaultSalts
    );
    // Verify computed Vault implementation address using Create2 standard
    const expectedVaultImpl = ethers.getCreate2Address(
      vaultFactoryAddress,
      vaultSalts[0],
      vaultHash
    );

    // Assert that the computed address matches the expected value
    expect((await addressFactory.getVaultImplAddresses())[0]).to.equal(expectedVaultImpl);

    // Prepare deployment parameters
    const admin = deployer;
    const upgrader = deployer;

    // 1. Deploy PacUSD contract
    // This contract is a stablecoin pegged to USD
    let tx = await pacUSDDeployFactory.deployContracts(
      vaultFactoryAddress, // Address of the Vault factory
      admin, // admin of the PacUSD contract
      pacUSDSalt // Salt for Create2 deployment
    );
    await tx.wait();

    // 2. Deploy MMFVault contract
    // This contract manages the MMF token and related operations
    tx = await mmfVaultDeployFactory.deployContracts(
      [MMFToken.target], // Underlying token
      [Pricer.target], // Price oracle
      vaultSalts, // Salt for Create2 deployment
      admin, // admin of the vault
      upgrader, // upgrader address
    );
    await tx.wait();

    // 3. Deploy Staking contract
    // This contract handles staking of PacUSD tokens
    tx = await stakingDeployFactory.deployContracts(
      [Pricer.target], // Price oracle
      [MMFToken.target],
      admin, // Owner of the staking contract
      upgrader, // Admin address
      admin, // Reserve address
      stakingSalt // Salt for Create2 deployment
    );
    await tx.wait();

    // At this point, all three contracts (PacUSD, MMFVault, Staking)
    // should be deployed to the addresses previously computed by AddressFactory
  });
});