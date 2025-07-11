import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-ignition-ethers");
import "@openzeppelin/hardhat-upgrades";

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

  networks: {
    hardhat: {},
    devnet: {
      url: "",
      chainId: 0,
      accounts: [],
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
