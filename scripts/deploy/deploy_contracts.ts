import { ethers, run, network } from "hardhat";
import {
  AddressFactory__factory,
  MMFVault__factory,
  MMFVaultDeployFactory__factory,
  PacUSD__factory,
  PacUSDDeployFactory__factory,
  PacUSDStaking__factory,
  StakingDeployFactory__factory,
} from "../../typechain-types";
import { keccak256, toUtf8Bytes } from "ethers";
import dotenv from "dotenv";
import * as fs from "fs";
import path from "path";

dotenv.config();

/**
 * Smart Contract Automated Deployment Script with Cache Support
 * Function: Deploy contracts with caching, resume from breakpoint if deployment is interrupted
 * Features: Deployment state caching, error recovery, step-by-step deployment
 */

// Cache file path
const CACHE_FILE = path.join(
  __dirname,
  network.name + "_deployment_cache.json"
);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Define deployment step enumeration
enum DeploymentStep {
  NONE = 0,
  ADDRESS_FACTORY_DEPLOYED = 1,
  PACUSD_DEPLOY_FACTORY_DEPLOYED = 2,
  MMF_VAULT_DEPLOY_FACTORY_DEPLOYED = 3,
  STAKING_DEPLOY_FACTORY_DEPLOYED = 4,
  CONTRACT_ADDRESSES_CALCULATED = 5,
  PACUSD_PROXY_DEPLOYED = 6,
  STAKING_PROXY_DEPLOYED = 7,
  MMF_VAULT_PROXY_DEPLOYED = 8,
  ROLES_CONFIGURED = 9,
  DEPLOYMENT_COMPLETED = 10,
}

// Deployment state interface
interface DeploymentState {
  step: DeploymentStep;
  addresses: {
    addressFactory?: string;
    pacUSDDeployFactory?: string;
    mmfVaultDeployFactory?: string;
    stakingDeployFactory?: string;
    pacUSDProxy?: string;
    stakingProxy?: string;
    mmfVaultProxy?: string;
    priceAddress?: string;
    mmfTokenAddress?: string;
  };
  network: string;
}

export async function deploy(useCache: boolean = true) {
  // Load or initialize deployment state
  let deploymentState: DeploymentState = {
    step: DeploymentStep.NONE,
    addresses: {},
    network: network.name,
  };

  if (useCache && fs.existsSync(CACHE_FILE)) {
    try {
      const cacheData = fs.readFileSync(CACHE_FILE, "utf8");
      const cachedState = JSON.parse(cacheData) as DeploymentState;

      // Verify if the cached network matches
      if (cachedState.network === network.name) {
        deploymentState = cachedState;
        console.log(`\n===== Loading Deployment Cache ====`);
        console.log(
          `Current Deployment Progress: Step ${deploymentState.step}`
        );
      } else {
        console.log(`\n===== Network Change Detected, Clearing Old Cache ====`);
      }
    } catch (error) {
      console.log(
        `\n===== Failed to Load Cache, Starting Deployment Anew ====`
      );
    }
  }

  // ============== Environment Variable Loading ==============
  let pricerAddress = process.env.PRICER_ADDRESS || "";
  let mmfTokenAddress = process.env.MMFTOKEN_ADDRESS || "";

  //global
  const upgraderAddress = process.env.UPGRADER_ADDRESS || "";
  const adminAddress = process.env.ADMIN_ADDRESS || "";
  //pacusd
  const pacUSDPauserAddress = process.env.PACUSD_PAUSER_ADDRESS || "";
  const pacUSDApproverAddress = process.env.PACUSD_APPROVER_ADDRESS || "";
  const pacUSDRescuerAddress = process.env.PACUSD_RESCUER_ADDRESS || "";
  const pacUSDBlocklisterAddress = process.env.PACUSD_BLOCKLISTER_ADDRESS || "";

  //vault
  const vaultPauserAddress = process.env.VAULT_PAUSER_ADDRESS || "";
  const vaultMintRewardAddress = process.env.VAULT_MINT_REWARD_ADDRESS || "";

  //stking
  const stakingReserveAddress = process.env.STAKING_RESERVE_ADDRESS || "";
  const stakingPauserAddress = process.env.STAKING_PAUSER_ROLE || "";
  const stakingRewardSchemeAddress =
    process.env.STAKING_REWARD_SCHEME_ROLE || "";
  const stakingReserveSetAddress = process.env.STAKING_RESERVE_SET_ROLE || "";

  deploymentState.addresses.priceAddress = pricerAddress;
  deploymentState.addresses.mmfTokenAddress = mmfTokenAddress;

  console.log("\n===== Environment Variable Loading =====");
  // Print loaded environment variables
  console.log(`PRICER_ADDRESS: ${pricerAddress}`);
  console.log(`MMFTOKEN_ADDRESS: ${mmfTokenAddress}`);
  console.log(`UPGRADER_ADDRESS: ${upgraderAddress}`);
  console.log(`OWNER_ADDRESS: ${adminAddress}`);
  console.log(`PacUSD Permission:`);
  console.log(`-- PAUSER_ADDRESS: ${pacUSDPauserAddress}`);
  console.log(`-- RESCUER_ADDRESS: ${pacUSDRescuerAddress}`);
  console.log(`-- APPROVER_ADDRESS: ${pacUSDApproverAddress}`);
  console.log(`-- BLOCKLISTER_ADDRESS: ${pacUSDBlocklisterAddress}`);
  console.log(`MMFVault Permission:`);
  console.log(`-- VAULT_MINT_REWARD_ADDRESS: ${vaultMintRewardAddress}`);
  console.log(`-- PAUSER_ADDRESS: ${vaultPauserAddress}`);
  console.log(`Staking Permission:`);
  console.log(`-- RESERVE_ADDRESS: ${stakingReserveAddress}`);
  console.log(`-- PAUSER_ADDRESS: ${stakingPauserAddress}`);
  console.log(`-- REWARD_SCHEME_ROLE: ${stakingRewardSchemeAddress}`);
  console.log(`-- RESERVE_SET_ROLE: ${stakingReserveSetAddress}`);

  // ============== Deployment Parameters Preparation ==============
  console.log("\n===== Deployment Parameters Preparation =====");
  // Define salts and hashes required for deployment (generated using keccak256)
  const vaultSalts: string[] = [];
  const pacUSDSalt = keccak256(toUtf8Bytes("pac-usd-salt"));
  const stakingSalt = keccak256(toUtf8Bytes("staking-salt"));

  // Generate contract bytecode hashes (for Create2 deployment)
  const pacUSDFactory = (await ethers.getContractFactory(
    "PacUSD"
  )) as PacUSD__factory;
  const mMFVaultFactory = (await ethers.getContractFactory(
    "MMFVault"
  )) as MMFVault__factory;
  const PacUSDStakingFactory = (await ethers.getContractFactory(
    "PacUSDStaking"
  )) as PacUSDStaking__factory;

  const vaultHash = keccak256(mMFVaultFactory.bytecode);
  const pacUSDHash = keccak256(pacUSDFactory.bytecode);
  const stakingHash = keccak256(PacUSDStakingFactory.bytecode);

  // Print key parameters (for deployment consistency verification)
  console.log(`MMFVault Code Hash: ${vaultHash}`);
  console.log(`PacUSD Code Hash: ${pacUSDHash}`);
  console.log(`Staking Code Hash: ${stakingHash}`);

  // ============== Environment Variable Validation ==============
  console.log("\n===== Environment Variable Validation =====");
  const requiredVariables = {
    PRICER_ADDRESS: pricerAddress,
    MMFTOKEN_ADDRESS: mmfTokenAddress,
    UPGRADER_ADDRESS: upgraderAddress,
    ADMIN_ADDRESS: adminAddress,
    //PACUSD
    PACUSD_PAUSER_ADDRESS: pacUSDPauserAddress,
    RESCUER_ADDRESS: pacUSDRescuerAddress,
    APPROVER_ADDRESS: pacUSDApproverAddress,
    BLOCKLISTER_ADDRESS: pacUSDBlocklisterAddress,
    //mmfvault
    MMFVAULT_PAUSER_ADDRESS: vaultPauserAddress,
    VAULT_MINT_REWARD_ADDRESS: vaultMintRewardAddress,
    //staking
    RESERVE_ADDRESS: stakingReserveAddress,
    STAKING_PAUSER_ROLE: stakingPauserAddress,
    RESERVE_SET_ROLE: stakingReserveSetAddress,
    REWARD_SCHEME_ROLE: stakingRewardSchemeAddress,
  };

  const missingVariables = Object.entries(requiredVariables)
    .filter(([key, value]) => value.length === 0)
    .map(([key]) => key);

  if (missingVariables.length > 0) {
    console.error(
      `[Error] Missing required environment variables: ${missingVariables.join(
        ", "
      )}`
    );
    process.exit(1);
  }
  //generate salt by
  let pricerAddresses = pricerAddress.split(",");
  let mmfTokenAddresses = mmfTokenAddress.split(",");
  if (pricerAddresses.length !== mmfTokenAddresses.length) {
    console.error(
      `[Error] pricerAddress size must same with mmfTokenAddress size`
    );
    process.exit(1);
  }

  mmfTokenAddresses.forEach((v, k) => {
    vaultSalts.push(keccak256(toUtf8Bytes("vault-salt-" + v)));
  });

  console.log(
    "[Validation Passed] All required environment variables are configured"
  );

  // ============== Network and Account Information ==============
  console.log(`\n===== Network and Account Information ====`);
  console.log(`Starting deployment to network: ${network.name}`);
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log(`Deployer Address: ${deployer.address}`);

  // ============== Core Deployment Process ==============
  console.log("\n===== Core Deployment Process =====");
  console.log("------------------------");

  // Define cache function
  const saveDeploymentState = (step: DeploymentStep, addresses: any = {}) => {
    deploymentState.step = step;
    deploymentState.addresses = { ...deploymentState.addresses, ...addresses };
    deploymentState.network = network.name;

    fs.writeFileSync(CACHE_FILE, JSON.stringify(deploymentState, null, 2));
    console.log(`[Cache Saved] Deployment progress recorded: Step ${step}`);
  };

  // 1. Deploy AddressFactory Contract
  if (deploymentState.step <= DeploymentStep.ADDRESS_FACTORY_DEPLOYED) {
    console.log("\n--- [1/5] Deploy AddressFactory ---");

    if (deploymentState.addresses.addressFactory) {
      console.log(
        `[Cache] AddressFactory already deployed: ${deploymentState.addresses.addressFactory}`
      );
      const addressFactory = AddressFactory__factory.connect(
        deploymentState.addresses.addressFactory,
        deployer
      );
      saveDeploymentState(DeploymentStep.ADDRESS_FACTORY_DEPLOYED);
    } else {
      console.log("Sending deployment transaction...");
      const addressFactoryFactory = (await ethers.getContractFactory(
        "AddressFactory"
      )) as AddressFactory__factory;
      const addressFactory = await addressFactoryFactory.deploy(
        vaultHash,
        pacUSDHash,
        pacUSDSalt,
        stakingHash,
        stakingSalt
      );
      console.log(
        `Transaction Hash: ${addressFactory.deploymentTransaction()?.hash}`
      );
      await addressFactory.waitForDeployment();
      console.log(
        `✅ [Success] AddressFactory deployed: ${addressFactory.target}`
      );

      deploymentState.addresses.addressFactory =
        addressFactory.target.toString();
      saveDeploymentState(DeploymentStep.ADDRESS_FACTORY_DEPLOYED);
    }
  }

  // 2. Deploy PacUSDDeployFactory Contract
  if (deploymentState.step <= DeploymentStep.PACUSD_DEPLOY_FACTORY_DEPLOYED) {
    console.log("\n--- [2/5] Deploy PacUSDDeployFactory ---");

    if (deploymentState.addresses.pacUSDDeployFactory) {
      console.log(
        `[Cache] PacUSDDeployFactory already deployed: ${deploymentState.addresses.pacUSDDeployFactory}`
      );
      saveDeploymentState(DeploymentStep.PACUSD_DEPLOY_FACTORY_DEPLOYED);
    } else {
      const addressFactory = AddressFactory__factory.connect(
        deploymentState.addresses.addressFactory ?? "",
        deployer
      );

      console.log("Sending deployment transaction...");
      const pacUSDDeployFactoryFactory = (await ethers.getContractFactory(
        "PacUSDDeployFactory"
      )) as PacUSDDeployFactory__factory;
      const pacUSDDeployFactory = await pacUSDDeployFactoryFactory.deploy(
        addressFactory.target
      );
      console.log(
        `Transaction Hash: ${pacUSDDeployFactory.deploymentTransaction()?.hash}`
      );
      await pacUSDDeployFactory.waitForDeployment();

      console.log(
        `✅ [Success] PacUSDDeployFactory deployed: ${pacUSDDeployFactory.target}`
      );

      deploymentState.addresses.pacUSDDeployFactory =
        pacUSDDeployFactory.target.toString();
      saveDeploymentState(DeploymentStep.PACUSD_DEPLOY_FACTORY_DEPLOYED);
    }
  }

  // 3. Deploy MMFVaultDeployFactory Contract
  if (
    deploymentState.step <= DeploymentStep.MMF_VAULT_DEPLOY_FACTORY_DEPLOYED
  ) {
    console.log("\n--- [3/5] Deploy MMFVaultDeployFactory ---");

    if (deploymentState.addresses.mmfVaultDeployFactory) {
      console.log(
        `[Cache] MMFVaultDeployFactory already deployed: ${deploymentState.addresses.mmfVaultDeployFactory}`
      );
      saveDeploymentState(DeploymentStep.MMF_VAULT_DEPLOY_FACTORY_DEPLOYED);
    } else {
      const addressFactory = AddressFactory__factory.connect(
        deploymentState.addresses.addressFactory ?? "",
        deployer
      );

      console.log("Sending deployment transaction...");
      const mmfVaultDeployFactoryFactory = (await ethers.getContractFactory(
        "MMFVaultDeployFactory"
      )) as MMFVaultDeployFactory__factory;
      const mmfVaultDeployFactory = await mmfVaultDeployFactoryFactory.deploy(
        addressFactory.target
      );
      console.log(
        `Transaction Hash: ${
          mmfVaultDeployFactory.deploymentTransaction()?.hash
        }`
      );
      await mmfVaultDeployFactory.waitForDeployment();

      console.log(
        `✅ [Success] MMFVaultDeployFactory deployed: ${mmfVaultDeployFactory.target}`
      );

      deploymentState.addresses.mmfVaultDeployFactory =
        mmfVaultDeployFactory.target.toString();
      saveDeploymentState(DeploymentStep.MMF_VAULT_DEPLOY_FACTORY_DEPLOYED);
    }
  }

  // 4. Deploy StakingDeployFactory Contract
  if (deploymentState.step <= DeploymentStep.STAKING_DEPLOY_FACTORY_DEPLOYED) {
    console.log("\n--- [4/5] Deploy StakingDeployFactory ---");

    if (deploymentState.addresses.stakingDeployFactory) {
      console.log(
        `[Cache] StakingDeployFactory already deployed: ${deploymentState.addresses.stakingDeployFactory}`
      );
      saveDeploymentState(DeploymentStep.STAKING_DEPLOY_FACTORY_DEPLOYED);
    } else {
      const addressFactory = AddressFactory__factory.connect(
        deploymentState.addresses.addressFactory ?? "",
        deployer
      );

      console.log("Sending deployment transaction...");
      const stakingDeployFactoryFactory = (await ethers.getContractFactory(
        "StakingDeployFactory"
      )) as StakingDeployFactory__factory;
      const stakingDeployFactory = await stakingDeployFactoryFactory.deploy(
        addressFactory.target
      );
      console.log(
        `Transaction Hash: ${
          stakingDeployFactory.deploymentTransaction()?.hash
        }`
      );
      await stakingDeployFactory.waitForDeployment();

      console.log(
        `✅ [Success] StakingDeployFactory deployed: ${stakingDeployFactory.target}`
      );

      deploymentState.addresses.stakingDeployFactory =
        stakingDeployFactory.target.toString();
      saveDeploymentState(DeploymentStep.STAKING_DEPLOY_FACTORY_DEPLOYED);
    }
  }

  // 5. Calculate Contract Addresses (via AddressFactory)
  if (deploymentState.step <= DeploymentStep.CONTRACT_ADDRESSES_CALCULATED) {
    console.log("\n--- [5/5] Calculate Target Contract Addresses ---");

    const addressFactory = AddressFactory__factory.connect(
      deploymentState.addresses.addressFactory ?? "",
      deployer
    );
    const vaultAddress = await addressFactory.getVaultAddresses();
    const pacUSDAddress = await addressFactory.pacUSDAddress();
    const stakingAddress = await addressFactory.stakingAddress();

    const isVaultAddressValid = vaultAddress.length > 0;
    const isPacUSDAddressValid = pacUSDAddress !== ZERO_ADDRESS;
    const isStakingAddressValid = stakingAddress !== ZERO_ADDRESS;
    if (isVaultAddressValid && isPacUSDAddressValid && isStakingAddressValid) {
      console.log("[Cache] Contract addresses already calculated");
      saveDeploymentState(DeploymentStep.CONTRACT_ADDRESSES_CALCULATED);
    } else {
      console.log("Calling AddressFactory.computeAddress method...");
      let computeTrasncation = await addressFactory.computeAddress(
        deploymentState.addresses.pacUSDDeployFactory ?? "",
        deploymentState.addresses.stakingDeployFactory ?? ""
      );
      console.log(`Transaction Hash: ${computeTrasncation.hash}`);
      await computeTrasncation.wait();

      computeTrasncation = await addressFactory.computeVaultAddress(
        deploymentState.addresses.mmfVaultDeployFactory ?? "",
        vaultSalts
      );
      console.log(`Transaction Hash: ${computeTrasncation.hash}`);
      await computeTrasncation.wait();
      console.log("✅ [Success] Contract addresses calculated");

      saveDeploymentState(DeploymentStep.CONTRACT_ADDRESSES_CALCULATED);
    }
  }

  // ============== Target Contract Deployment ==============
  console.log("\n===== Target Contract Deployment =====");
  console.log("------------------------");

  // 6. Deploy PacUSD Contract (with proxy)
  if (deploymentState.step <= DeploymentStep.PACUSD_PROXY_DEPLOYED) {
    console.log("\n--- Deploy PacUSD Contract ---");

    const addressFactory = AddressFactory__factory.connect(
      deploymentState.addresses.addressFactory ?? "",
      deployer
    );

    if (deploymentState.addresses.pacUSDProxy) {
      console.log(
        `[Cache] PacUSD Proxy already deployed: ${await addressFactory.pacUSDAddress()}`
      );
      deploymentState.addresses.pacUSDProxy =
        await addressFactory.pacUSDAddress();
      saveDeploymentState(DeploymentStep.PACUSD_PROXY_DEPLOYED);
    } else {
      const pacUSDDeployFactory = PacUSDDeployFactory__factory.connect(
        deploymentState.addresses.pacUSDDeployFactory ?? "",
        deployer
      );

      console.log("Calling PacUSDDeployFactory.deployContracts method...");
      console.log(`Expected Address: ${await addressFactory.pacUSDAddress()}`);
      const pacUSDProxy = await pacUSDDeployFactory.deployContracts(
        deployer.address,
        upgraderAddress,
        pacUSDSalt
      );
      console.log(`Trasncation Hash:${pacUSDProxy.hash}`);
      await pacUSDProxy.wait();
      console.log(`✅ [Success] PacUSD Proxy deployed`);
      deploymentState.addresses.pacUSDProxy =
        await addressFactory.pacUSDAddress();
      saveDeploymentState(DeploymentStep.PACUSD_PROXY_DEPLOYED);
    }
  }

  // 7. Deploy Staking Contract (with proxy)
  if (deploymentState.step <= DeploymentStep.STAKING_PROXY_DEPLOYED) {
    console.log("\n--- Deploy PacUSDStaking Contract ---");

    const addressFactory = AddressFactory__factory.connect(
      deploymentState.addresses.addressFactory ?? "",
      deployer
    );
    if (deploymentState.addresses.stakingProxy) {
      console.log(
        `[Cache] Staking Proxy already deployed: ${await addressFactory.stakingAddress()}`
      );
      deploymentState.addresses.stakingProxy =
        await addressFactory.stakingAddress();
      saveDeploymentState(DeploymentStep.STAKING_PROXY_DEPLOYED);
    } else {
      const stakingDeployFactory = StakingDeployFactory__factory.connect(
        deploymentState.addresses.stakingDeployFactory ?? "",
        deployer
      );

      console.log("Calling StakingDeployFactory.deployContracts method...");
      console.log(`Expected Address: ${await addressFactory.stakingAddress()}`);
      const stakingProxy = await stakingDeployFactory.deployContracts(
        pricerAddresses,
        mmfTokenAddresses,
        deployer.address,
        upgraderAddress,
        stakingReserveAddress,
        stakingSalt
      );
      console.log(`Trasncation Hash:${stakingProxy.hash}`);
      await stakingProxy.wait();
      console.log(`✅ [Success] PacUSDStaking Proxy deployed`);

      deploymentState.addresses.stakingProxy =
        await addressFactory.stakingAddress();
      saveDeploymentState(DeploymentStep.STAKING_PROXY_DEPLOYED);
    }
  }

  // 8. Deploy MMFVault Contract (with proxy)
  if (deploymentState.step <= DeploymentStep.MMF_VAULT_PROXY_DEPLOYED) {
    console.log("\n--- Deploy MMFVault Contract ---");

    const addressFactory = AddressFactory__factory.connect(
      deploymentState.addresses.addressFactory ?? "",
      deployer
    );

    const vaultAddresses = (await addressFactory.getVaultAddresses()).join(",");
    if (deploymentState.addresses.mmfVaultProxy) {
      console.log(`[Cache] MMFVault Proxy already deployed: ${vaultAddresses}`);
      deploymentState.addresses.mmfVaultProxy = vaultAddresses;
      saveDeploymentState(DeploymentStep.MMF_VAULT_PROXY_DEPLOYED);
    } else {
      const mmfVaultDeployFactory = MMFVaultDeployFactory__factory.connect(
        deploymentState.addresses.mmfVaultDeployFactory ?? "",
        deployer
      );

      console.log("Calling MMFVaultDeployFactory.deployContracts method...");
      console.log(`Expected Address: ${vaultAddresses}`);
      const mmfVaultProxy = await mmfVaultDeployFactory.deployContracts(
        mmfTokenAddresses,
        pricerAddresses,
        vaultSalts,
        deployer.address,
        upgraderAddress
      );
      console.log(`Trasncation Hash:${mmfVaultProxy.hash}`);
      await mmfVaultProxy.wait();
      console.log(`✅ [Success] MMFVault Proxy deployed`);

      deploymentState.addresses.mmfVaultProxy = (
        await addressFactory.getVaultAddresses()
      ).join(",");
      saveDeploymentState(DeploymentStep.MMF_VAULT_PROXY_DEPLOYED);
    }
  }

  // ---------------------
  // 9. Configure Role Permissions
  // ---------------------
  if (deploymentState.step <= DeploymentStep.ROLES_CONFIGURED) {
    console.log("\n===== Configuring Role Permissions =====");

    const checkRole = async function name(
      contract: any,
      role: string,
      roleAddress: string,
      tag: string
    ) {
      const hasRole = await contract.hasRole(role, roleAddress);
      if (!hasRole) {
        await (await contract.grantRole(role, roleAddress)).wait();
        console.log(`[Role Granted] ${tag} assigned to:`, roleAddress);
      } else {
        console.log(`[Role Check] ${tag} already assigned to:`, roleAddress);
      }
    };
    const addressFactory = AddressFactory__factory.connect(
      deploymentState.addresses.addressFactory ?? "",
      deployer
    );

    console.log("\n[1/3] Configuring PacUSD Role Permissions");
    const pacUSDAddress = await addressFactory.pacUSDAddress();
    const pacUSD = await ethers.getContractAt("PacUSD", pacUSDAddress);

    await checkRole(
      pacUSD,
      await pacUSD.PAUSER_ROLE(),
      pacUSDPauserAddress,
      "PAUSER_ROLE"
    );

    await checkRole(
      pacUSD,
      await pacUSD.BLOCKLISTER_ROLE(),
      pacUSDBlocklisterAddress,
      "BLOCKLISTER_ROLE"
    );

    await checkRole(
      pacUSD,
      await pacUSD.RESCUER_ROLE(),
      pacUSDRescuerAddress,
      "RESCUER_ROLE"
    );

    await checkRole(
      pacUSD,
      await pacUSD.APPROVER_ROLE(),
      pacUSDApproverAddress,
      "APPROVER_ROLE"
    );

    await checkRole(
      pacUSD,
      await pacUSD.DEFAULT_ADMIN_ROLE(),
      adminAddress,
      "DEFAULT_ADMIN_ROLE"
    );

    let deployerHasAdminRole = await pacUSD.hasRole(
      await pacUSD.DEFAULT_ADMIN_ROLE(),
      deployer.address
    );

    if (deployerHasAdminRole && deployer.address !== adminAddress) {
      await (
        await pacUSD.revokeRole(
          await pacUSD.DEFAULT_ADMIN_ROLE(),
          deployer.address
        )
      ).wait();
      console.log(
        "[Role Revoked] DEFAULT_ADMIN_ROLE revoked from ",
        deployer.address
      );
    } else {
      console.log(
        "[Role Check] DEFAULT_ADMIN_ROLE already revoked from ",
        deployer.address
      );
    }
    console.log("✅ [Verification Passed]PacUSD Role configuration successful");

    console.log("\n[2/3] Configuring MMFVault Role Permissions");
    const vaultAddresses = await addressFactory.getVaultAddresses();
    for (let index = 0; index < vaultAddresses.length; index++) {
      const vaultAddress = vaultAddresses[index];
      const vault = await ethers.getContractAt("MMFVault", vaultAddress);
      await checkRole(
        vault,
        await vault.PAUSER_ROLE(),
        vaultPauserAddress,
        "PAUSER_ROLE"
      );

      await checkRole(
        vault,
        await vault.MINT_REWARD_ROLE(),
        vaultMintRewardAddress,
        "MINT_REWARD_ROLE"
      );

      await checkRole(
        vault,
        await vault.DEFAULT_ADMIN_ROLE(),
        adminAddress,
        "DEFAULT_ADMIN_ROLE"
      );

      deployerHasAdminRole = await vault.hasRole(
        await vault.DEFAULT_ADMIN_ROLE(),
        deployer.address
      );

      if (deployerHasAdminRole && deployer.address !== adminAddress) {
        await (
          await vault.revokeRole(
            await vault.DEFAULT_ADMIN_ROLE(),
            deployer.address
          )
        ).wait();
        console.log(
          "[Role Revoked] DEFAULT_ADMIN_ROLE revoked from ",
          deployer.address
        );
      } else {
        console.log(
          "[Role Check] DEFAULT_ADMIN_ROLE already revoked from ",
          deployer.address
        );
      }
      console.log(
        `✅ [Verification Passed] Vault-${vaultAddress}  Role configuration successful`
      );
    }

    console.log("\n[3/3] Configuring Staking Role Permissions");
    const stakingAddress = await addressFactory.stakingAddress();
    const staking = await ethers.getContractAt("PacUSDStaking", stakingAddress);

    await checkRole(
      staking,
      await staking.PAUSER_ROLE(),
      stakingPauserAddress,
      "PAUSER_ROLE"
    );

    await checkRole(
      staking,
      await staking.RESERVE_SET_ROLE(),
      stakingReserveSetAddress,
      "RESERVE_SET_ROLE"
    );

    await checkRole(
      staking,
      await staking.REWARD_SCHEME_ROLE(),
      stakingRewardSchemeAddress,
      "REWARD_SCHEME_ROLE"
    );

    await checkRole(
      staking,
      await staking.DEFAULT_ADMIN_ROLE(),
      adminAddress,
      "DEFAULT_ADMIN_ROLE"
    );

    deployerHasAdminRole = await staking.hasRole(
      await staking.DEFAULT_ADMIN_ROLE(),
      deployer.address
    );

    if (deployerHasAdminRole && deployer.address !== adminAddress) {
      await (
        await staking.revokeRole(
          await staking.DEFAULT_ADMIN_ROLE(),
          deployer.address
        )
      ).wait();
      console.log(
        "[Role Revoked] DEFAULT_ADMIN_ROLE revoked from ",
        deployer.address
      );
    } else {
      console.log(
        "[Role Check] DEFAULT_ADMIN_ROLE already revoked from ",
        deployer.address
      );
    }
    saveDeploymentState(DeploymentStep.ROLES_CONFIGURED);
    console.log("✅ [Verification Passed] All Role configuration successful");
  }

  // ============== Deployment Results Summary ==============
  if (deploymentState.step < DeploymentStep.DEPLOYMENT_COMPLETED) {
    console.log("\n===== Deployment Results Summary =====");
    console.log("------------------------");
    console.log(`Network: ${network.name}`);
    console.log(`Block Height: ${await ethers.provider.getBlockNumber()}`);
    console.log("\n[Factory Contract Addresses]");
    console.log(
      `✅ AddressFactory: ${deploymentState.addresses.addressFactory}`
    );
    console.log(
      `✅ MMFVaultDeployFactory: ${deploymentState.addresses.mmfVaultDeployFactory}`
    );
    console.log(
      `✅ PacUSDDeployFactory: ${deploymentState.addresses.pacUSDDeployFactory}`
    );
    console.log(
      `✅ StakingDeployFactory: ${deploymentState.addresses.stakingDeployFactory}`
    );

    console.log("\n[Target Contract Addresses]");
    console.log(`✅ Price : ${deploymentState.addresses.priceAddress}`);
    console.log(`✅ MMFToken: ${deploymentState.addresses.mmfTokenAddress}`);
    console.log(
      `✅ MMFVault Proxy: ${deploymentState.addresses.mmfVaultProxy}`
    );
    console.log(`✅ PacUSD Proxy: ${deploymentState.addresses.pacUSDProxy}`);
    console.log(`✅ Staking Proxy: ${deploymentState.addresses.stakingProxy}`);

    console.log("\n===== Deployment Completed =====");
    console.log(
      "✨ All contracts have been successfully deployed to the blockchain network ✨"
    );

    saveDeploymentState(DeploymentStep.DEPLOYMENT_COMPLETED);
  } else {
    console.log("\n===== Deployment Already Completed =====");
    console.log("------------------------");
    console.log(`Network: ${network.name}`);
    console.log(`Block Height: ${await ethers.provider.getBlockNumber()}`);
    console.log("\n[Factory Contract Addresses]");
    console.log(
      `✅ AddressFactory: ${deploymentState.addresses.addressFactory}`
    );
    console.log(
      `✅ MMFVaultDeployFactory: ${deploymentState.addresses.mmfVaultDeployFactory}`
    );
    console.log(
      `✅ PacUSDDeployFactory: ${deploymentState.addresses.pacUSDDeployFactory}`
    );
    console.log(
      `✅ StakingDeployFactory: ${deploymentState.addresses.stakingDeployFactory}`
    );

    console.log("\n[Target Contract Addresses]");
    console.log(`✅ Price : ${deploymentState.addresses.priceAddress}`);
    console.log(`✅ MMFToken: ${deploymentState.addresses.mmfTokenAddress}`);
    console.log(
      `✅ MMFVault Proxy: ${deploymentState.addresses.mmfVaultProxy}`
    );
    console.log(`✅ PacUSD Proxy: ${deploymentState.addresses.pacUSDProxy}`);
    console.log(`✅ Staking Proxy: ${deploymentState.addresses.stakingProxy}`);
  }
}
