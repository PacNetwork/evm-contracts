import { ethers } from "hardhat";
import { parseEther } from "ethers";
import dotenv from "dotenv";
import { deployNewMMFVaultsFromConfig } from "./deploy_vaultcontract";
dotenv.config();

async function deploy_mock() {
  console.log("=========Deploy Vault Mock================");
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
  for (let index = 0; index < 1; index++) {
    const [mmfTokenAddress, pricerAddress] = await deploy_mock();
    pricerAddresses.push(pricerAddress);
    mmfTokenAddresses.push(mmfTokenAddress);
  }
  process.env["NEW_PRICER_ADDRESSES"] =  pricerAddresses.join(",");
  process.env["NEW_MMF_TOKEN_ADDRESSES"] = mmfTokenAddresses.join(",");
  await deployNewMMFVaultsFromConfig();
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
