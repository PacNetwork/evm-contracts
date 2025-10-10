# PacUSD Stablecoin Smart Contracts

This repository contains the smart contracts for PacUSD, a stablecoin system with integrated token swapping, staking, and reward distribution. All contracts are written in [Solidity](https://soliditylang.org/).

## Table of Contents

- [Development Environment](#development-environment)
- [Development](#development)
  - [TypeScript Type Definition Files](#typescript-type-definition-files-for-the-contracts)
  - [Linting and Formatting](#linting-and-formatting)
  - [Testing](#testing)
  - [Fuzzing](#fuzzing)
- [Deployment](#deployment)
- [Contracts](#contracts)
  - [Core Contracts](#core-contracts)
  - [Ecosystem Architecture](#ecosystem-architecture)
  - [Factory Contracts](#factory-contracts)
- [System Overview](#system-overview)
  - [Token Swapping](#1-token-swapping-mmfvault)
  - [Stablecoin Issuance](#2-stablecoin-issuance-pacusd)
  - [Reward Distribution](#3-reward-distribution-pacusdstaking)
- [Architecture](#architecture)
- [Additional Documentation](#additional-documentation)
- [Audit Reports](#audit-reports)
- [License](#license)

## Development Environment

Requirements:

- Node.js 18+
- npm or yarn
- Hardhat 2.25.0+

```sh
$ npm install          # Install dependencies
```

## Development

### Contract Compilation

```sh
$ npm run compile
```

### Linting and Formatting

To check Solidity code:

```sh
$ npx solhint 'contracts/**/*.sol'
```

### Testing

Run all tests:

```sh
$ npm test
```

To run tests in a specific file:

```sh
$ npx hardhat test test/v1/pacusd/pacusd.test.ts
```

To run tests and generate test coverage:

```sh
$ npm run coverage
```

### Fuzzing

The project includes Echidna fuzzing tests for critical contract invariants:

```sh
# Test pause state invariants
$ echidna . --contract PauseStateTest --config echidna.yaml --test-mode assertion

# Test scenario fuzzing
$ echidna . --contract SceneFuzzTest --config echidna.yaml
```

## Deployment

The PacUSD system uses a sophisticated factory-based CREATE2 deployment pattern for deterministic cross-chain addresses.

### Prerequisites

1. Create a copy of `.env.example` and name it `.env`. Fill in appropriate values:

```sh
cp .env.example .env
```

### Deploy Commands

Deploy to localhost (with mock contracts):

```sh
$ npm run deploy
```

Deploy to Sepolia testnet:

```sh
$ npm run deploy:sepolia
```

Deploy to mainnet:

```sh
$ npm run deploy:mainnet
```

Deploy only vault contracts:

```sh
$ npm run deploy_vault:sepolia
$ npm run deploy_vault:mainnet
```

### Upgrade Commands

Upgrade individual contracts:

```sh
$ npm run upgradePacUSD:sepolia
$ npm run upgradeVault:sepolia
$ npm run upgradeStaking:sepolia
```

For detailed deployment instructions, see [Deployment Guide](./docs/deployment.md).

## Contracts

The PacUSD system consists of three interconnected core contracts, each using the UUPS (Universal Upgradeable Proxy Standard) pattern:

### Core Contracts

1. **PacUSD** ([`contracts/v1/pacusd/PacUSD.sol`](./contracts/v1/pacusd/PacUSD.sol))
   - ERC-20 stablecoin with enhanced governance
   - Two-step approval workflow for minting/burning
   - Serves as the central token for the entire ecosystem

2. **MMFVault** ([`contracts/v1/vault/MMFVault.sol`](./contracts/v1/vault/MMFVault.sol))
   - Token swap gateway (MMF ↔ PacUSD)
   - Primary minter for PacUSD
   - Distributes rewards to stakers based on MMF price appreciation

3. **PacUSDStaking** ([`contracts/v1/staking/PacUSDStaking.sol`](./contracts/v1/staking/PacUSDStaking.sol))
   - Staking contract for earning rewards
   - Receives and distributes rewards from the vault
   - Supports compounding and external incentive programs

**Key Relationships:**

1. **MMFVault → PacUSD**: Vault is an authorized minter that creates/destroys PacUSD during swaps
2. **MMFVault → PacUSDStaking**: Vault notifies staking contract when distributing rewards
3. **PacUSDStaking ← Users**: Users stake PacUSD to earn rewards from vault operations

For detailed design documentation, see:
- [PacUSD Token Design](./docs/pacusd-token-design.md)
- [MMFVault Design](./docs/mmfvault-design.md)
- [PacUSDStaking Design](./docs/staking-design.md)

### Factory Contracts

The deployment uses CREATE2 for deterministic cross-chain addresses:

- **AddressFactory** - Precomputes and coordinates all contract addresses
- **PacUSDDeployFactory** - Deploys PacUSD implementation + proxy
- **MMFVaultDeployFactory** - Deploys vault(s) implementation + proxy
- **StakingDeployFactory** - Deploys staking implementation + proxy

This factory architecture ensures the same contract addresses across multiple chains. See the [Deployment Guide](./docs/deployment.md) for details.

## System Overview

The PacUSD ecosystem operates through three interconnected workflows:

### 1. Token Swapping (MMFVault)

Users interact with the vault to swap between MMF tokens and PacUSD:

**Minting Flow:** User deposits MMF → Vault mints PacUSD
**Redemption Flow:** User deposits PacUSD → Vault returns MMF

The vault uses oracle-based pricing and collects configurable fees on both operations. When MMF price increases, the vault automatically mints additional PacUSD as rewards for stakers.

See [MMFVault Design](./docs/mmfvault-design.md) for complete details.

### 2. Stablecoin Issuance (PacUSD)

PacUSD is the central stablecoin with enhanced governance:

**Two-Step Approval Workflow:**
1. Approver pre-approves transaction ID
2. Vault executes approved mint/burn

This separation provides oversight and security beyond traditional stablecoins.

See [PacUSD Token Design](./docs/pacusd-token-design.md) for complete details.

### 3. Reward Distribution (PacUSDStaking)

Users stake PacUSD to earn rewards from vault operations:

**Staking Flow:** User stakes PacUSD → Earns proportional rewards → Can restake or claim

The staking contract uses an accumulated reward rate system for gas-efficient distribution. When the vault mints rewards, they're distributed proportionally to all stakers.

See [PacUSDStaking Design](./docs/staking-design.md) for complete details.

## Additional Documentation

Comprehensive technical documentation is available in the [`docs/`](./docs/) directory:

- **[PacUSD Token Design](./docs/pacusd-token-design.md)** - Two-step approval workflow, role system, minting/burning mechanisms, blocklisting, upgrading, and rescue functionality

- **[MMFVault Design](./docs/mmfvault-design.md)** - Token swapping mechanics, fee management, price-based reward system, oracle integration, and security features

- **[PacUSDStaking Design](./docs/staking-design.md)** - Accumulated reward rate system, staking operations, minimum lock periods, reserve allocation, and external reward schemes

- **[Deployment Guide](./docs/deployment.md)** - Factory-based CREATE2 deployment process, environment configuration, cross-chain deployment, and troubleshooting

### Audit Reports

The contracts have been audited by:
- [CertiK](https://www.certik.com/) 
- [ExVul](https://www.exvul.com/)

Audit reports can be found in the [`audit-reports/`](./audit-reports/) directory.

## License

MIT License. See [LICENSE](./LICENSE) for details.
