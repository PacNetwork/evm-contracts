# Camel Contract V2

A minimal viable product for a contract system, integrating token swapping, staking, and stablecoin functionalities with enhanced deployment and upgrade capabilities.

## Project Overview

This project extends the Camel Contract system with a factory-based deployment mechanism, enabling predictable contract addresses and streamlined upgrades. The solution now includes a `DeployFactory` contract that uses CREATE2 to deploy proxy instances of `PacUSD` and `MMFVault`, ensuring address determinism and upgradeability via the UUPS pattern.

## Prerequisites

- [Node.js](https://nodejs.org/en/) (v18 or higher)
- [npm](https://www.npmjs.com/) (included with Node.js)
- [Hardhat](https://hardhat.org/) (development environment)
- [Git](https://git-scm.com/) (for cloning the project)
- Environment variables management via `.env` file

## Installation

1. Clone the repository:
   ```bash
   git clone ${url}
   cd camel-contract-v2
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

## Deploying Contracts

### Environment Configuration

First, configure your environment variables in a `.env` file (refer to `.env.example` for structure):
```env
MMFTOKEN_ADDRESS=MMF-token-contract-address
PRICER_ADDRESS=pricer-contract-address
STAKING_ADDRESS=staking-contract-address
OWNER_ADDRESS=initial-owner-address
UPGRADER_ADDRESS=upgrader-address
APPROVER_ADDRESS=approver-role-address
PAUSER_ADDRESS=pauser-role-address
RESCUER_ADDRESS=rescuer-role-address
BLACKLISTER_ADDRESS=blacklister-role-address

MMFTOKEN_ADDRESS= mmftoken-address
PRICER_ADDRESS=pricer-address
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
camel-contract-v2/
├── contracts/                # Smart contracts
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
├── hardhat.config.js         # Hardhat configuration
├── .env                      # Environment variables (based on .env.example)
├── package.json              # Project dependencies
├── LICENSE                   # BUSL-1.1 license
└── README.md                 # Project documentation
```

## Dependencies

### New Dependencies
- [@openzeppelin/contracts/utils/Create2.sol](https://www.npmjs.com/package/@openzeppelin/contracts) v5.3.0: For deterministic contract deployment.
- [@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol](https://www.npmjs.com/package/@openzeppelin/contracts) v5.3.0: Proxy implementation for upgradeability.

### Development Dependencies
- [@openzeppelin/hardhat-upgrades](https://www.npmjs.com/package/@openzeppelin/hardhat-upgrades) v3.9.0: Enhanced support for proxy upgrades.

## License

This project is licensed under the BUSL-1.1 license - see the [LICENSE](LICENSE) file for details.

## Contact

For support or questions, please contact the project maintainer.
