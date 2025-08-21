import { ethers, network } from "hardhat";
import {
  AddressFactory__factory,
  MMFVaultDeployFactory__factory,
  MMFVault__factory,
} from "../../typechain-types";
import { keccak256, toUtf8Bytes, isAddress } from "ethers";
import dotenv from "dotenv";
import * as fs from "fs";
import path from "path";

dotenv.config();

// Cache file path (shared with original deployment)
const CACHE_FILE = path.join(
  __dirname,
  network.name + "_deployment_cache.json"
);

// Deployment state interface
interface DeploymentState {
  step: number;
  addresses: {
    addressFactory?: string;
    mmfVaultDeployFactory?: string;
    priceAddress?: string;
    mmfTokenAddress?: string;
    mmfVaultProxy?: string;
  };
  network: string;
}

/**
 * Read and parse comma-separated parameters from .env file
 * @param key Environment variable key
 * @returns Parsed array with empty values filtered out
 */
function getCommaSeparatedEnv(key: string): string[] {
  const value = process.env[key] || "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "" && isAddress(item));
}

/**
 * Check if a contract exists at the given address
 * @param address Contract address to check
 * @returns Boolean indicating if contract exists
 */
async function checkContractExistence(address: string): Promise<boolean> {
  if (!isAddress(address)) return false;
  try {
    const code = await ethers.provider.getCode(address);
    // Contract exists if code length > 2 (0x is 2 characters)
    return code.length > 2;
  } catch (e) {}
  return false;
}

/**
 * Deploy new MMFVaults (parameters read from config file)
 * @param useCache Whether to use cache (default: true)
 */
export async function deployNewMMFVaultsFromConfig(useCache: boolean = true) {
  // Read new parameters from .env
  const newMmfTokenAddresses = getCommaSeparatedEnv("NEW_MMF_TOKEN_ADDRESSES");
  const newPricerAddresses = getCommaSeparatedEnv("NEW_PRICER_ADDRESSES");

  // Validate parameter validity
  if (newMmfTokenAddresses.length === 0) {
    throw new Error("No valid NEW_MMF_TOKEN_ADDRESSES found in config file");
  }
  if (newPricerAddresses.length === 0) {
    throw new Error("No valid NEW_PRICER_ADDRESSES found in config file");
  }
  if (newMmfTokenAddresses.length !== newPricerAddresses.length) {
    throw new Error(
      `Mismatch between number of token addresses (${newMmfTokenAddresses.length}) and pricer addresses (${newPricerAddresses.length})`
    );
  }

  // Load existing deployment state
  let deploymentState: DeploymentState = {
    step: 0,
    addresses: {},
    network: network.name,
  };

  if (useCache && fs.existsSync(CACHE_FILE)) {
    try {
      const cacheData = fs.readFileSync(CACHE_FILE, "utf8");
      const cachedState = JSON.parse(cacheData) as DeploymentState;
      if (cachedState.network === network.name) {
        deploymentState = cachedState;
        console.log(`\n===== Loading Existing Deployment Cache =====`);
        console.log(
          `Current Deployment Progress: Step ${deploymentState.step}`
        );
      } else {
        console.log(`\n===== Network Mismatch, Using New Cache =====`);
      }
    } catch (error) {
      console.log(`\n===== Failed to Load Cache, Reinitializing =====`);
    }
  }

  // Verify base factory contract addresses
  if (!deploymentState.addresses.addressFactory) {
    throw new Error(
      "AddressFactory address not found, please complete initial deployment first"
    );
  }
  if (!deploymentState.addresses.mmfVaultDeployFactory) {
    throw new Error(
      "MMFVaultDeployFactory address not found, please complete initial deployment first"
    );
  }

  // Load permission configurations from environment variables
  const upgraderAddress = process.env.UPGRADER_ADDRESS || "";
  const adminAddress = process.env.ADMIN_ADDRESS || "";
  const vaultPauserAddress = process.env.VAULT_PAUSER_ADDRESS || "";

  // Validate permission-related environment variables
  const requiredVars = [
    {
      name: "UPGRADER_ADDRESS",
      value: upgraderAddress,
      valid: isAddress(upgraderAddress),
    },
    {
      name: "ADMIN_ADDRESS",
      value: adminAddress,
      valid: isAddress(adminAddress),
    },
    {
      name: "VAULT_PAUSER_ADDRESS",
      value: vaultPauserAddress,
      valid: isAddress(vaultPauserAddress),
    },
  ];
  const invalidVars = requiredVars.filter((v) => !v.valid);
  if (invalidVars.length > 0) {
    throw new Error(
      `Invalid or missing required addresses: ${invalidVars
        .map((v) => v.name)
        .join(", ")}`
    );
  }

  // Print deployment information
  console.log("\n===== New MMFVault Deployment Parameters =====");
  console.log(`Network: ${network.name}`);
  console.log(`Number of new tokens: ${newMmfTokenAddresses.length}`);
  console.log(`New token address list: ${newMmfTokenAddresses.join(", ")}`);
  console.log(
    `Corresponding pricer addresses: ${newPricerAddresses.join(", ")}`
  );
  console.log(`Admin address: ${adminAddress}`);
  console.log(`Upgrader address: ${upgraderAddress}`);
  console.log(`Vault pauser address: ${vaultPauserAddress}`);

  // Get deployer signer
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log(`Deployer address: ${deployer.address}`);

  // Connect to factory contracts
  const addressFactory = AddressFactory__factory.connect(
    deploymentState.addresses.addressFactory,
    deployer
  );
  const mmfVaultDeployFactory = MMFVaultDeployFactory__factory.connect(
    deploymentState.addresses.mmfVaultDeployFactory,
    deployer
  );

  // Generate salts for new vaults
  const newVaultSalts = newMmfTokenAddresses.map((tokenAddr) =>
    keccak256(toUtf8Bytes(`vault-salt-${tokenAddr}`))
  );

  // 1. Get existing data from AddressFactory
  console.log("\n===== Fetching Existing Deployment Data =====");
  const [allVaultSalts, allVaultAddresses] = await Promise.all([
    addressFactory.getVaultSalts(),
    addressFactory.getVaultAddresses(),
  ]);

  // Create salt-to-address mapping
  const saltToAddress: Map<string, string> = new Map();
  allVaultSalts.forEach((salt, index) => {
    saltToAddress.set(
      salt.toLowerCase(),
      allVaultAddresses[index].toLowerCase()
    );
  });

  // 2. Classify tokens into different categories
  type TokenDeploymentStatus = {
    token: string;
    pricer: string;
    salt: string;
    address?: string;
    status:
      | "new"
      | "saltExists_contractMissing"
      | "saltExists_contractExists"
      | "saltExists_contractInvalid";
  };

  const tokenStatusList: TokenDeploymentStatus[] = [];

  for (let i = 0; i < newMmfTokenAddresses.length; i++) {
    const token = newMmfTokenAddresses[i];
    const pricer = newPricerAddresses[i];
    const salt = newVaultSalts[i];
    const saltStr = salt.toLowerCase();

    if (saltToAddress.has(saltStr)) {
      const vaultAddress = saltToAddress.get(saltStr)!;
      const contractExists = await checkContractExistence(vaultAddress);

      if (!contractExists) {
        tokenStatusList.push({
          token,
          pricer,
          salt,
          address: vaultAddress,
          status: "saltExists_contractMissing",
        });
      } else {
        // Verify if it's a valid MMFVault contract
        try {
          const vault = MMFVault__factory.connect(vaultAddress, deployer);
          // Check a simple view function to verify contract validity
          await vault.PAUSER_ROLE();
          tokenStatusList.push({
            token,
            pricer,
            salt,
            address: vaultAddress,
            status: "saltExists_contractExists",
          });
        } catch (error) {
          tokenStatusList.push({
            token,
            pricer,
            salt,
            address: vaultAddress,
            status: "saltExists_contractInvalid",
          });
        }
      }
    } else {
      tokenStatusList.push({
        token,
        pricer,
        salt,
        status: "new",
      });
    }
  }

  // Log classification results
  console.log("\n===== Token Deployment Classification =====");
  console.log(
    `- New tokens (no salt): ${
      tokenStatusList.filter((t) => t.status === "new").length
    }`
  );
  console.log(
    `- Existing salt but missing contract: ${
      tokenStatusList.filter((t) => t.status === "saltExists_contractMissing")
        .length
    }`
  );
  console.log(
    `- Existing salt and valid contract: ${
      tokenStatusList.filter((t) => t.status === "saltExists_contractExists")
        .length
    }`
  );
  console.log(
    `- Existing salt but invalid contract: ${
      tokenStatusList.filter((t) => t.status === "saltExists_contractInvalid")
        .length
    }`
  );

  // 3. Process tokens with existing salt but invalid/missing contracts
  const repairCandidates = tokenStatusList.filter(
    (t) =>
      t.status === "saltExists_contractMissing" ||
      t.status === "saltExists_contractInvalid"
  );

  if (repairCandidates.length > 0) {
    console.log("\n===== Repairing Incomplete Deployments =====");
    const repairTokens = repairCandidates.map((t) => t.token);
    const repairPricers = repairCandidates.map((t) => t.pricer);
    const repairSalts = repairCandidates.map((t) => t.salt);

    console.log(`Repairing ${repairCandidates.length} vaults...`);
    const deployTx = await mmfVaultDeployFactory.deployContracts(
      repairTokens,
      repairPricers,
      repairSalts,
      deployer.address,
      upgraderAddress
    );
    console.log(`Repair deployment hash: ${deployTx.hash}`);
    await deployTx.wait();
    console.log("Repair deployment completed");
  }

  // 4. Process new tokens (no existing salt)
  const newTokens = tokenStatusList.filter((t) => t.status === "new");
  if (newTokens.length > 0) {
    console.log("\n===== Processing New Deployments =====");
    const newTokenAddresses = newTokens.map((t) => t.token);
    const newPricerAddresses = newTokens.map((t) => t.pricer);
    const newSalts = newTokens.map((t) => t.salt);

    // Calculate addresses for new vaults
    console.log("\nCalculating new vault addresses...");
    const computeTx = await addressFactory.computeVaultAddress(
      deploymentState.addresses.mmfVaultDeployFactory,
      newSalts
    );
    console.log(`Computation transaction hash: ${computeTx.hash}`);
    await computeTx.wait();
    console.log("Address calculation completed");

    // Deploy new Vault proxies
    console.log("\nDeploying new MMFVault proxies...");
    const deployTx = await mmfVaultDeployFactory.deployContracts(
      newTokenAddresses,
      newPricerAddresses,
      newSalts,
      deployer.address,
      upgraderAddress
    );
    console.log(`Deployment transaction hash: ${deployTx.hash}`);
    await deployTx.wait();
    console.log("New vault deployment completed");
  }

  // 5. Collect all addresses that need permission checks
  const allVaultsToCheck = [
    ...tokenStatusList
      .filter((t) => t.status === "saltExists_contractExists")
      .map((t) => t.address!),
    ...repairCandidates.map((t) => t.address!),
    ...(newTokens.length > 0 ? await addressFactory.getVaultAddresses() : []),
  ];

  // Deduplicate addresses
  const uniqueVaultsToCheck = [
    ...new Set(allVaultsToCheck.filter((addr) => addr)),
  ];

  // 6. Verify and configure permissions for all relevant vaults
  console.log("\n===== Verifying and Configuring Permissions =====");
  console.log(
    `Checking permissions for ${uniqueVaultsToCheck.length} vaults...`
  );

  for (const vaultAddress of uniqueVaultsToCheck) {
    if (!(await checkContractExistence(vaultAddress))) {
      console.log(
        `Skipping permission check for ${vaultAddress} - contract not found`
      );
      continue;
    }

    try {
      const vault = MMFVault__factory.connect(vaultAddress, deployer);

      // Check and grant pauser role
      const pauserRole = await vault.PAUSER_ROLE();
      const hasPauserRole = await vault.hasRole(pauserRole, vaultPauserAddress);

      if (!hasPauserRole) {
        await (await vault.grantRole(pauserRole, vaultPauserAddress)).wait();
        console.log(
          `Granted PAUSER_ROLE to ${vaultPauserAddress} for ${vaultAddress}`
        );
      } else {
        console.log(`PAUSER_ROLE already set for ${vaultAddress}`);
      }

      // Check and grant admin role
      const adminRole = await vault.DEFAULT_ADMIN_ROLE();
      const hasAdminRole = await vault.hasRole(adminRole, adminAddress);

      if (!hasAdminRole) {
        await (await vault.grantRole(adminRole, adminAddress)).wait();
        console.log(
          `Granted DEFAULT_ADMIN_ROLE to ${adminAddress} for ${vaultAddress}`
        );
      } else {
        console.log(`DEFAULT_ADMIN_ROLE already set for ${vaultAddress}`);
      }

      // Revoke deployer's admin role if exists
      if (
        (await vault.hasRole(adminRole, deployer.address)) &&
        deployer.address !== adminAddress
      ) {
        await (await vault.revokeRole(adminRole, deployer.address)).wait();
        console.log(
          `Revoked DEFAULT_ADMIN_ROLE from ${deployer.address} for ${vaultAddress}`
        );
      } else {
        console.log(`No action needed for deployer role on ${vaultAddress}`);
      }
    } catch (error) {
      console.error(
        `Error configuring permissions for ${vaultAddress}:`,
        error
      );
    }
  }

  // Update cache with latest vault addresses
  const finalVaultAddresses = await addressFactory.getVaultAddresses();
  deploymentState.addresses.mmfVaultProxy = finalVaultAddresses.join(",");
  fs.writeFileSync(CACHE_FILE, JSON.stringify(deploymentState, null, 2));

  // Deployment result summary
  console.log("\n===== Deployment Process Completed =====");
  console.log(`Total vaults after operation: ${finalVaultAddresses.length}`);
  console.log(`New vaults deployed: ${newTokens.length}`);
  console.log(`Vaults repaired: ${repairCandidates.length}`);
  console.log(
    `Vaults with existing valid contracts: ${
      tokenStatusList.filter((t) => t.status === "saltExists_contractExists")
        .length
    }`
  );
}
