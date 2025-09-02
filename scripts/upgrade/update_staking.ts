import { ethers, upgrades, network } from "hardhat";
import { safeUpgrade } from "./safe_upgrade";
import dotenv from "dotenv";
import { safeExecute } from "./safe_update";
dotenv.config();

const UpdateContract = "PacUSDStaking";
async function main() {
  const contractAddress = process.env.STAKING_ADDRESS || "";
  const newVaultAddress = process.env.NEW_VAULT_ADDRESS || "";

  // Log network configuration
  console.log(`[Info] Network: ${network.name}`);
  console.log(`[Info] Chain ID: ${network.config.chainId}`);
  console.log(`[Info] Staking Contract: ${contractAddress}`);

  // Get the deployer account and display its address
  const [deployer] = await ethers.getSigners();
  console.log(`[Info] Update with account: ${deployer.address}`);

  // Validate contract address format using Ethers.js utility
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`[Error] Invalid contract address: ${contractAddress}`);
  }

    // Validate contract address format using Ethers.js utility
  if (!ethers.isAddress(newVaultAddress)) {
    throw new Error(`[Error] Invalid contract address: ${newVaultAddress}`);
  }

  // Check if contract exists at the specified address
  const contractCode = await ethers.provider.getCode(contractAddress);
  if (contractCode === "0x") {
    throw new Error(`[Error] No contract found at address: ${contractAddress}`);
  }
  

  // Load contract factory and attach to existing proxy
  console.log("[Info] Loading contract factory...");
  const NewContract = await ethers.getContractFactory(UpdateContract);
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

    // Encode upgrade transaction data using UUPS proxy method
  const initData = proxyContract.interface.encodeFunctionData(
    "updateUpdater",
    [newVaultAddress]
  );

  // Build Safe transaction parameters
  const safeTransactionData = {
    to: proxyContract.target,
    data: initData,
    value: "0",
  };


  await safeExecute(safeTransactionData)
}

// Execute main function with proper error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Fatal] Update process failed:", error);
    process.exit(1);
  });
