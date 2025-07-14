import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-ignition-ethers");
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";
import dotenv from "dotenv";
require("hardhat-abi-exporter");

dotenv.config();
const DEPLOY_PRIVATE_KEY = process.env.DEPLOY_PRIVATE_KEY ?? "";
const CMC_APIKEY = process.env.CMC_APIKEY ?? "";
const ETHSCAN_APIKEY = process.env.ETHSCAN_APIKEY ?? "";
const GAS_REPORT = (process.env.GAS_REPORT ?? "0") === "1";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  abiExporter: [
    {
      path: "./abi/",
      runOnCompile: true,
      only: [":PacUSD$", ":MMFVault$", ":PacUSDStaking$"],
      clear: true,
      format: "json",
    },
  ],
  gasReporter: {
    enabled: GAS_REPORT,
    outputFile: "gas-report.md",
    reportFormat: "markdown",
    showUncalledMethods: true,
    etherscan: ETHSCAN_APIKEY,
    coinmarketcap: CMC_APIKEY,
    L1: "ethereum",
    excludeContracts: [
      "MockERC20",
      "MockPacUSD",
      "MockPacUSDStakingV2",
      "MockScheme",
      "MockStaking",
      "PacUSDStakingTest",
      "MockPricer",
    ],
  },
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: {
        count: 20,
        initialIndex: 0,
        accountsBalance: "1000000000000000000000",
      },
      mining: {
        auto: true,
        interval: 5000,
      },
    },
    sepolia: {
      url: "https://sepolia.gateway.tenderly.co",
      chainId: 11155111,
      accounts: [DEPLOY_PRIVATE_KEY],
    },
    testnet: {
      url: "",
      chainId: 0,
      accounts: [],
    },
    mainnet: {
      url: "",
      chainId: 0,
      accounts: [],
    },
  },
};

export default config;
