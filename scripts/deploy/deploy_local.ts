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
import { Addressable, keccak256, parseEther, toUtf8Bytes } from "ethers";
import dotenv from "dotenv";
import * as fs from "fs";
import path from "path";
import { deploy } from "./deploy_contracts";
dotenv.config();

async function deploy_mock() {
  console.log("=========Deploy Mock================");
  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log("Deploying account:", deployer.address);
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const mockERc20 = await MockERC20Factory.deploy("MMF Token", "MMF");
  await mockERc20.waitForDeployment();

  const MockPricerFactory = await ethers.getContractFactory("MockPricer");
  const mockPricer = await MockPricerFactory.deploy(parseEther("1"));
  await mockPricer.waitForDeployment();

  console.log("MMFToken:", mockERc20.target);
  console.log("MockPricer:", mockPricer.target);

  console.log("\n=========Deploy Mock Success================");
  return [mockERc20.target.toString(), mockPricer.target.toString()];
}

async function main() {
  let pricerAddresses: string[] = [];
  let mmfTokenAddresses: string[] = [];
  for (let index = 0; index < 3; index++) {
    const [mmfTokenAddress, pricerAddress] = await deploy_mock();
    pricerAddresses.push(pricerAddress);
    mmfTokenAddresses.push(mmfTokenAddress);
  }
  process.env["PRICER_ADDRESS"] = pricerAddresses.join(",");
  process.env["MMFTOKEN_ADDRESS"] = mmfTokenAddresses.join(",");
  await deploy(false);
}
// Execute the main function and handle exceptions
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n===== Deployment Failed =====");
    console.error(`Error Type: ${error.name}`);
    console.error(`Error Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
    process.exit(1);
  });
