# Camel Contract V2

A minimal viable product for a contract system, integrating token swapping, staking, and stablecoin functionalities with enhanced deployment and upgrade capabilities.

## Project Overview

This project extends the Camel Contract system with a factory-based deployment mechanism, enabling predictable contract addresses and streamlined upgrades. The solution now includes a `DeployFactory` contract that uses CREATE2 to deploy proxy instances of `PacUSD` and `MMFVault`, ensuring address determinism and upgradeability via the UUPS pattern.

### Key Features

- **Factory-Driven Deployment**: `DeployFactory` uses CREATE2 to deploy contracts with predictable addresses, incorporating sender and salt parameters.
- **Proxy Architecture**: Both `PacUSD` and `MMFVault` are deployed via ERC1967 proxies, supporting safe upgrades without changing addresses.
- **Enhanced Security**: Strict input validation and role-based access control (Admin, Pauser, Minter, etc.).
- **Predictable Address Calculation**: Precompute deployment addresses using `computePacUSDAddress` and `computeMMFVaultAddress` methods.
- **Comprehensive Testing**: Unit tests for deployment logic, upgradeability, and contract initialization.

## Contract Architecture

The project now includes the following core components:

- **`DeployFactory.sol`**: Factory contract for deploying `PacUSD` and `MMFVault` proxies using CREATE2.
- **`PacUSD.sol`**: Stablecoin contract with minting, burning, blacklisting, and transaction tracking.
- **`MMFVault.sol`**: Main vault for token swapping, staking, and reward distribution.
- **Proxies**: ERC1967 proxies for upgradeability, deployed via CREATE2 for address predictability.

## Prerequisites

- [Node.js](https://nodejs.org/en/) (v18 or higher)
- [npm](https://www.npmjs.com/) (included with Node.js)
- [Hardhat](https://hardhat.org/) (development environment)
- [Git](https://git-scm.com/) (for cloning the project)
- Environment variables management via `.env` file

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/black-domain/camel-contract-m2-v2.git
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

## Running Tests

### Test Suite Overview

The test suite now includes:

1. **`DeployFactory` Tests**:
   - Address predictability with CREATE2 and sender-specific salts.
   - Zero address input validation.
   - UUPS upgradeability for proxied contracts.
   - Contract initialization correctness.

2. **`PacUSD` and `MMFVault` Tests**:
   - Initialization and role assignment.
   - Token swapping and reward distribution.
   - Emergency pause functionality.
   - Upgradeability via admin roles.

### Running Tests

To execute all tests:
```bash
npx hardhat test
```

### Test Coverage

To generate coverage reports:
```bash
npx hardhat coverage
```

## Deploying Contracts

### Environment Configuration

First, configure your environment variables in a `.env` file (refer to `.env.example` for structure):
```env
DEPLOYER_PRIVATE_KEY=your-deployer-private-key
MMFTOKEN_ADDRESS=MMF-token-contract-address
PRICER_ADDRESS=pricer-contract-address
STAKING_ADDRESS=staking-contract-address
OWNER_ADDRESS=initial-owner-address
ADMIN_ADDRESS=admin-address-for-upgrades
APPROVER_ADDRESS=approver-role-address
PAUSER_ADDRESS=pauser-role-address
RESCUER_ADDRESS=rescuer-role-address
BLACKLISTER_ADDRESS=blacklister-role-address
```

### Local Development (Hardhat Network)

1. Start the local node:
   ```bash
   npx hardhat node
   ```

2. Deploy contracts using the factory script:
   ```bash
   npx hardhat run scripts/deploy.ts
   ```

### Custom Network

Configure the network in `hardhat.config.js` and deploy:
```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

## Project Structure

```
camel-contract-v2/
├── contracts/                # Smart contracts
│   ├── interface/            # Contract interfaces
│   ├── PacUSD.sol            # Stablecoin implementation
│   ├── MMFVault.sol          # Main vault for token swapping
│   └── DeployFactory.sol     # Factory for deploying proxied contracts
├── scripts/                  # Deployment and utility scripts
│   └── deploy.ts             # Main deployment script using DeployFactory
├── test/                     # Test cases
│   ├── PacUSD.test.ts        # Tests for PacUSD
│   ├── MMFVault.test.ts      # Tests for MMFVault
│   └── DeployFactory.test.ts # Tests for deployment logic
├── typechain-types/          # Generated TypeChain typings
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