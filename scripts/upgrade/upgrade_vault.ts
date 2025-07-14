import { ethers, upgrades, network } from "hardhat";
import { safeUpgrade } from "./safe";
import dotenv from "dotenv";
dotenv.config();

const UpgradeContract="MMFVault"

/**
 * UUPS Contract Upgrade Script
 * 
 * This script facilitates the upgrade of an existing UUPS (Universal Upgradeable Proxy Standard)
 * contract to a new implementation. It includes comprehensive validation checks, deployment 
 * verification, and error handling to ensure a secure and smooth upgrade process.
 */
async function main() {
  // Retrieve and validate contract address from environment variables
  const contractAddress = process.env.MMFVAULT_ADDRESS || "";
  if (!contractAddress) {
    throw new Error("[Error] Missing environment variable: MMFVAULT_ADDRESS");
  }

  // Log network configuration
  console.log(`[Info] Network: ${network.name}`);
  console.log(`[Info] Chain ID: ${network.config.chainId}`);

  // Get the deployer account and display its address
  const [deployer] = await ethers.getSigners();
  console.log(`[Info] Upgrading with account: ${deployer.address}`);

  // Validate contract address format using Ethers.js utility
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`[Error] Invalid contract address: ${contractAddress}`);
  }

  // Check if contract exists at the specified address
  const contractCode = await ethers.provider.getCode(contractAddress);
  if (contractCode === "0x") {
    throw new Error(`[Error] No contract found at address: ${contractAddress}`);
  }

  // Load contract factory and attach to existing proxy
  console.log("[Info] Loading contract factory...");
  const NewContract = await ethers.getContractFactory(UpgradeContract);
  const proxyContract = await NewContract.attach(contractAddress);

  // Force import the proxy contract (required if not deployed via Hardhat)
  console.log("[Info] Importing proxy contract...");
  try {
    await upgrades.forceImport(contractAddress, NewContract);
    console.log("[Success] Proxy contract imported successfully");
  } catch (error) {
    console.log(`[Warning] Failed to import proxy: ${error}`);
    console.log("[Info] Continuing with upgrade...");
  }

  // Validate upgrade safety against storage layout changes
  console.log("[Info] Validating upgrade safety...");
  try {
    await upgrades.validateUpgrade(contractAddress, NewContract, {
      kind: "uups",
      unsafeAllow: [], // Explicitly disallow unsafe changes
    });
    console.log("[Success] Upgrade validation passed");
  } catch (error) {
    console.error("[Error] Upgrade validation failed:", error);
    throw error;
  }

  // Get current implementation address
  const currentImplementationAddress = await upgrades.erc1967.getImplementationAddress(contractAddress);
  
  // Deploy new implementation contract
  console.log("[Info] Deploying new implementation...");
  const newImplementation = await NewContract.deploy();
  await newImplementation.waitForDeployment();
  
  // Check if new implementation is different from current
  if (currentImplementationAddress === newImplementation.target) {
    console.log("[Info] New implementation is the same as current. Upgrade aborted.");
    return;
  }
  
  // Log new implementation address
  console.log(`[Info] New implementation address: ${newImplementation.target}`);
  
  // Perform safe upgrade using custom utility
  console.log("[Info] Initiating safe upgrade process...");
  //default not call init，
  await safeUpgrade(proxyContract, newImplementation.target.toString(), "0x");
}

// Execute main function with proper error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Fatal] Upgrade process failed:", error);
    process.exit(1);
  });