# MARS Contracts V2

A minimal viable product for a contract system, integrating token swapping, staking, and stablecoin functionalities with enhanced deployment and upgrade capabilities.

## Project Overview

This project extends the MARS Contract system with a factory-based deployment mechanism, enabling predictable contract addresses and streamlined upgrades. The solution now includes a `DeployFactory` contract that uses CREATE2 to deploy proxy instances of `PacUSD`, `MMFVault` and `PacUSDStaking`, ensuring address determinism and upgradeability via the UUPS pattern.

## Prerequisites

- [Node.js](https://nodejs.org/en/) (v18 or higher)
- [npm](https://www.npmjs.com/) (included with Node.js)
- [Hardhat](https://hardhat.org/) (development environment)
- [Echidna](https://secure-contracts.com/program-analysis/echidna/index.html) (for fuzzing test the contracts)
- [Git](https://git-scm.com/) (for cloning the project)
- Environment variables management via `.env` file

## Installation

1. Clone the repository:
   ```bash
   git clone ${url}
   cd MARS-m2-ethereum
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Compiling Contracts

To compile the smart contracts, run:
```bash
npx hardhat compile
```

This will generate TypeChain typings for all contracts, in the `typechain-types/` directory.

##  Tests

### Running Tests

To execute all tests:
```bash
npm run test
```

### Test Coverage

To generate coverage reports:
```bash
npm run coverage
```

### Fuzzing Test with Echidna

To perform fuzzing test using Echidna, ensure Echidna is installed and configured. Run the following commands to test specific contracts:

- Test the PauseStateTest contract in assertion mode:

  ```bash
  echidna . --contract PauseStateTest --config echidna.yaml --test-mode assertion
  ```

- Test the SceneFuzzTest contract with default settings:

  ```bash
  echidna . --contract SceneFuzzTest --config echidna.yaml
  ```

The echidna.yaml configuration file specifies test parameters such as iteration limits and target contracts. Ensure it is properly configured in the project root.

## Deploying Contracts

### Environment Configuration

First, configure your environment variables in a `.env` file (refer to `.env.example` for structure):
```env
MMFTOKEN_ADDRESS=MMF-token-contract-address
PRICER_ADDRESS=MMF-token-pricer-contract-address

#all contract
DEPLOY_PRIVATE_KEY=deployer-private-key
ADMIN_ADDRESS=admin-role-address
UPGRADER_ADDRESS=contract-upgrader-address

#staking
STAKING_RESERVE_ADDRESS=staking-reserve-address
STAKING_PAUSER_ROLE=staking-pauser-role-address
STAKING_RESERVE_SET_ROLE=staking-reserve-set-role-address
STAKING_REWARD_SCHEME_ROLE=staking-reward-scheme-role-address

#vault
VAULT_PAUSER_ADDRESS=MMF-vault-pauser-role-address

#pacusd
PACUSD_APPROVER_ADDRESS=PacUSD-approver-role-address
PACUSD_PAUSER_ADDRESS=PacUSD-pauser-role-address
PACUSD_RESCUER_ADDRESS=PacUSD-rescuer-role-address
PACUSD_BLOCKLISTER_ADDRESS=PacUSD-blocklister-role-address


#FOR GAS REPORT 
GAS_REPORT=0   #1 enable
CMC_APIKEY=
ETHSCAN_APIKEY=

#for upgrade
UPGRADE_PRIVATE_KEY=upgrader-private-key
SAFE_API_KEY=safe-wallet-api-key
```

### Local Development (Hardhat Network)

1. Start the local node:
   ```bash
   npm run node
   ```
2. Deploy contracts using the factory script:
   ```bash
   npm run deploy
   ```
    **Configure the mock contract to .env**

### Custom Network

Configure the network in `hardhat.config.js` and deploy:
```bash
npm run deploy:{network}
```

## Project Structure

```
MARS-m2-ethereum/
├── contracts/                # Smart contracts
│   ├── echidna/              # Contracts designed for Echidna fuzzing tests, including test harnesses and invariants
│   ├── helper/               # Helper contracts
│   ├── interface/            # Contract interfaces
│   ├── mock/                 # Mock contracts
│   └── v1/                   # V1 version contracts
│       ├── factory/          # Address and deploy factory contracts
│       ├── pacusd/           # PacUsd contracts
│       ├── staking/          # PacUSDStaking contracts
│       └── vault/            # MMFVault contracts
├── scripts/                  # Deployment and utility scripts
│   ├── deploy/               # Deploy scripts
│   ├── upgrade/              # Contract upgrade scripts
│   ├── utils/                # Script utils
│   └── v1/                   # V1 scripts
│       └── scene/            # Product scene test scripts
├── test/                     # Test cases
│   └── v1/                   # V1 version test cases
│       ├── factory/          # Address factory test cases
│       ├── pacusd/           # PacUsd test cases
│       ├── staking/          # PacUSDStaking test cases
│       └── vault/            # MMFVault test cases
├── .env.example              # Environment variables for example
├── echidna.yaml              # Configuration file for fuzz testing with Echidna
├── hardhat.config.js         # Hardhat configuration
├── package.json              # Project dependencies
├── README.md                 # Project readme documentation
└── tsconfig.json             # Typescipt config
```

## Dependencies

### New Dependencies
- [@openzeppelin/contracts/utils/Create2.sol](https://www.npmjs.com/package/@openzeppelin/contracts) v5.3.0: For deterministic contract deployment.
- [@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol](https://www.npmjs.com/package/@openzeppelin/contracts) v5.3.0: Proxy implementation for upgradeability.

### Development Dependencies
- [@openzeppelin/hardhat-upgrades](https://www.npmjs.com/package/@openzeppelin/hardhat-upgrades) v3.9.0: Enhanced support for proxy upgrades.

## License

This project is licensed under the BUSL-1.1 license.

## Contact

For support or questions, please contact the project maintainer.
