import { ethers } from "hardhat";
import { DeployFactory, PacUSD, MMFVault } from "../typechain-types";
import { keccak256, toUtf8Bytes } from "ethers";

async function main() {
  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log("Deploying account:", deployer.address);
  // Deployment parameters
  const pricerAddress = process.env.PRIVATE_KEY ?? "";
  const mmfTokenAddress = process.env.MMFTOKEN_ADDRESS ?? "";
  const stakingAddress = process.env.STAKING_ADDRESS ?? "";
  const adminAddress = process.env.ADMIN_ADDRESS ?? "";
  const ownerAddress = process.env.OWNER_ADDRESS ?? "";
  const pauserAddress = process.env.PAUSER_ADDRESS ?? "";
  const resuerAddress = process.env.RESCUER_ADDRESS ?? "";
  const approverAddress = process.env.APPROVER_ADDRESS ?? "";

  const blackListerAddress = process.env.BLACKLISTER_ADDRESS ?? "";

  if (
    adminAddress.length == 0 ||
    ownerAddress.length == 0 ||
    pauserAddress.length == 0 ||
    resuerAddress.length == 0 ||
    blackListerAddress.length == 0 ||
    approverAddress.length == 0 ||
    pricerAddress.length == 0 ||
    pricerAddress.length == 0 ||
    mmfTokenAddress.length == 0 ||
    stakingAddress.length == 0
  ) {
    throw Error("Missing required environment variables");
  }
  const minters = [deployer.address];
  const pacUSDSalt = keccak256(toUtf8Bytes("pacUSD_salt"));
  const mmfVaultSalt = keccak256(toUtf8Bytes("mmfVault_salt"));

  // Deploy DeployFactory contract
  const DeployFactory = await ethers.getContractFactory("DeployFactory");
  const deployFactory = await DeployFactory.deploy();

  console.log("DeployFactory contract address:", deployFactory.target);

  // Calculate expected addresses
  const expectedPacUSDAddress = await deployFactory.computePacUSDAddress(
    deployer.address,
    pacUSDSalt
  );
  const expectedMMFVaultAddress = await deployFactory.computeMMFVaultAddress(
    deployer.address,
    mmfVaultSalt
  );
  console.log("Expected PacUSD address:", expectedPacUSDAddress);
  console.log("Expected MMFVault address:", expectedMMFVaultAddress);

  // Deploy contracts
  const tx = await deployFactory.deployContracts(
    mmfTokenAddress,
    pricerAddress,
    stakingAddress,
    ownerAddress,
    adminAddress,
    minters,
    pacUSDSalt,
    mmfVaultSalt
  );
  const receipt = await tx.wait();

  // Get deployment events
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
    pacUSDProxy: pacUSDProxy,
    mmfVaultProxy: mmfVaultProxy,
  } = parsedLog!!.args;

  console.log("Actual PacUSD address:", pacUSDProxy);
  console.log("Actual MMFVault address:", mmfVaultProxy);

  // Verify expected vs actual addresses
  if (pacUSDProxy !== expectedPacUSDAddress) {
    console.log("Warning: PacUSD address mismatch!");
  }
  if (mmfVaultProxy !== expectedMMFVaultAddress) {
    console.log("Warning: MMFVault address mismatch!");
  }

  // Validate deployed contracts
  const pacUSD = await ethers.getContractAt("PacUSD", pacUSDProxy);
  const mmfVault = await ethers.getContractAt("MMFVault", mmfVaultProxy);

  console.log("PacUSD owner:", await pacUSD.owner());
  console.log("MMFVault owner:", await mmfVault.owner());
  console.log("MMFVault PacUSD address:", await mmfVault.pacUSD());

  //config role
  console.log("\nBegin Config Role\n")
  await pacUSD.grantRole(await pacUSD.PAUSER_ROLE(), pauserAddress);
  await pacUSD.grantRole(await pacUSD.BLACKLISTER_ROLE(), blackListerAddress);
  await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), resuerAddress);
  await pacUSD.grantRole(await pacUSD.APPROVER_ROLE(), approverAddress);
  await mmfVault.grantRole(await mmfVault.PAUSER_ROLE(), pauserAddress);

  console.log("\n\nDeployment completed!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
