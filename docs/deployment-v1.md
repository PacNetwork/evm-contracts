# V1 Contracts Deployment Guide

This document provides a comprehensive guide to deploying the PacUSD stablecoin ecosystem (v1 contracts) using the factory-based CREATE2 deployment pattern for deterministic cross-chain addresses.

## Overview

The v1 deployment system uses a sophisticated factory pattern to ensure:

- **Deterministic Addresses**: Same contract addresses across multiple chains using CREATE2
- **Coordinated Deployment**: All contracts know each other's addresses before deployment
- **Resumable Process**: Deployment state caching allows recovery from interruptions
- **UUPS Proxy Pattern**: Upgradeable contracts deployed via ERC1967 proxies
- **Address Validation**: Built-in verification against precomputed addresses

## Architecture

### Deployment Components

The deployment consists of two layers:

**1. Factory Contracts (Deployed First):**
- `AddressFactory` - Precomputes and stores all contract addresses
- `PacUSDDeployFactory` - Deploys PacUSD implementation + proxy
- `MMFVaultDeployFactory` - Deploys MMFVault implementation + proxy
- `StakingDeployFactory` - Deploys PacUSDStaking implementation + proxy

**2. Target Contracts (Deployed via Factories):**
- `PacUSD` - Stablecoin implementation + ERC1967Proxy
- `MMFVault` - Token swap vault implementation + ERC1967Proxy
- `PacUSDStaking` - Staking implementation + ERC1967Proxy

### CREATE2 Deterministic Deployment

CREATE2 allows calculating addresses before deployment.

**Benefits:**
- Same salt + same bytecode + same deployer = same address across chains
- Contracts can reference each other's addresses during initialization
- Cross-chain coordination without address registry

## Deployment Flow

### Phase 1: Factory Deployment

```
1. Deploy AddressFactory
   └─> Store bytecode hashes and salts for all contracts

2. Deploy PacUSDDeployFactory
   └─> Reference to AddressFactory

3. Deploy MMFVaultDeployFactory
   └─> Reference to AddressFactory

4. Deploy StakingDeployFactory
   └─> Reference to AddressFactory

5. Compute All Addresses
   └─> AddressFactory.computeAddress()
   └─> AddressFactory.computeVaultAddress()
```

### Phase 2: Target Contract Deployment

```
6. Deploy PacUSD
   └─> PacUSDDeployFactory.deployContracts()
       ├─> Deploy PacUSD implementation via CREATE2
       ├─> Deploy ERC1967Proxy via CREATE2
       ├─> Verify addresses against AddressFactory
       └─> Initialize proxy with vault addresses

7. Deploy PacUSDStaking
   └─> StakingDeployFactory.deployContracts()
       ├─> Deploy PacUSDStaking implementation via CREATE2
       ├─> Deploy ERC1967Proxy via CREATE2
       ├─> Verify addresses against AddressFactory
       └─> Initialize proxy with PacUSD and vault addresses

8. Deploy MMFVault(s)
   └─> MMFVaultDeployFactory.deployContracts()
       ├─> For each MMF token:
       │   ├─> Deploy MMFVault implementation via CREATE2
       │   ├─> Deploy ERC1967Proxy via CREATE2
       │   ├─> Verify addresses against AddressFactory
       │   └─> Initialize proxy with PacUSD, MMF token, pricer, staking
       └─> Support multiple vaults for different MMF tokens
```

### Phase 3: Role Configuration

```
9. Configure PacUSD Roles
   ├─> Grant PAUSER_ROLE
   ├─> Grant BLOCKLISTER_ROLE
   ├─> Grant APPROVER_ROLE
   ├─> Grant RESCUER_ROLE
   ├─> Grant DEFAULT_ADMIN_ROLE
   └─> Revoke deployer's admin role

10. Configure MMFVault Roles (for each vault)
    ├─> Grant PAUSER_ROLE
    ├─> Grant MINT_REWARD_ROLE
    ├─> Grant DEFAULT_ADMIN_ROLE
    └─> Revoke deployer's admin role

11. Configure PacUSDStaking Roles
    ├─> Grant PAUSER_ROLE
    ├─> Grant RESERVE_SET_ROLE
    ├─> Grant REWARD_SCHEME_ROLE
    ├─> Grant DEFAULT_ADMIN_ROLE
    └─> Revoke deployer's admin role
```

## Deployment Execution

### Prepare Environment

Copy `.env.example` to `.env` and fill in required variables.

### Deployment Script

The deployment script supports automated deployment with caching:

```bash
# Deploy to localhost (with mock contracts)
npm run deploy

# Deploy to Sepolia testnet
npm run deploy:sepolia

# Deploy to mainnet
npm run deploy:mainnet
```

### Deployment Steps (Internal)

The script executes 10 distinct steps with caching:

```typescript
enum DeploymentStep {
  NONE = 0,
  ADDRESS_FACTORY_DEPLOYED = 1,
  PACUSD_DEPLOY_FACTORY_DEPLOYED = 2,
  MMF_VAULT_DEPLOY_FACTORY_DEPLOYED = 3,
  STAKING_DEPLOY_FACTORY_DEPLOYED = 4,
  CONTRACT_ADDRESSES_CALCULATED = 5,
  PACUSD_PROXY_DEPLOYED = 6,
  STAKING_PROXY_DEPLOYED = 7,
  MMF_VAULT_PROXY_DEPLOYED = 8,
  ROLES_CONFIGURED = 9,
  DEPLOYMENT_COMPLETED = 10
}
```

### Deployment Cache

The script creates a network-specific cache file:

```
scripts/deploy/{network}_deployment_cache.json
```

**Cache Structure:**
```json
{
  "step": 5,
  "network": "sepolia",
  "addresses": {
    "addressFactory": "0x...",
    "pacUSDDeployFactory": "0x...",
    "mmfVaultDeployFactory": "0x...",
    "stakingDeployFactory": "0x...",
    "pacUSDProxy": "0x...",
    "stakingProxy": "0x...",
    "mmfVaultProxy": "0x...,0x...",
    "priceAddress": "0x...",
    "mmfTokenAddress": "0x..."
  }
}
```

**Recovery from Interruption:**
If deployment is interrupted, simply re-run the script:
- Loads cache automatically
- Resumes from last completed step
- Validates network matches cached network
- Skips already-deployed contracts

## Salt Generation Strategy

### Fixed Salts (PacUSD, Staking)

```typescript
const pacUSDSalt = keccak256(toUtf8Bytes("pac-usd-salt"));
const stakingSalt = keccak256(toUtf8Bytes("staking-salt"));
```

These salts are constant across all deployments.

### Dynamic Salts (Vaults)

```typescript
const vaultSalts: string[] = [];
mmfTokenAddresses.forEach((mmfToken) => {
    vaultSalts.push(keccak256(toUtf8Bytes("vault-salt-" + mmfToken)));
});
```

Each vault gets a unique salt based on its MMF token address.

**Benefits:**
- Multiple vaults can coexist
- Each vault has deterministic address
- Same MMF token → same vault address across chains

## Deployment Output

The deployment creates several artifacts:

**1. Cache File**
```
scripts/deploy/{network}_deployment_cache.json
```

**2. Hardhat Deployment Records**
```
deployments/{network}/
├── AddressFactory.json
├── PacUSDDeployFactory.json
├── MMFVaultDeployFactory.json
├── StakingDeployFactory.json
├── PacUSD.json
├── MMFVault.json
└── PacUSDStaking.json
```

**3. TypeChain Type Definitions**
```
typechain-types/
├── AddressFactory.ts
├── PacUSD.ts
├── MMFVault.ts
└── PacUSDStaking.ts
```

## Troubleshooting

### Common Deployment Issues

**1. Address Mismatch Error**
```
Error: ImplAddressError(expected, actual)
```

**Cause:** Bytecode hash changed after AddressFactory deployment

**Solution:**
- Redeploy AddressFactory with correct bytecode hashes
- Ensure no contract code changes between factory and target deployment
- Clear deployment cache

**2. Missing Environment Variables**
```
Error: Missing required environment variables: PRICER_ADDRESS, ADMIN_ADDRESS
```

**Solution:**
- Copy `.env.example` to `.env`
- Fill in all required variables
- Verify no empty strings

**3. Initialization Failed**
```
Error: InitializationFailed()
```

**Cause:** Proxy initialization reverted

**Common reasons:**
- Zero address in parameters
- Vault addresses not computed yet
- Invalid parameter combination

**Solution:**
- Check AddressFactory has computed addresses
- Verify all addresses are non-zero
- Check initialization parameters

**4. Salt Already Exists**
```
Error: SaltAlreadyExists(salt)
```

**Cause:** Trying to deploy multiple vaults with same salt

**Solution:**
- Each MMF token gets unique salt automatically
- Check for duplicate MMF token addresses in configuration
- Clear AddressFactory state if redeploying

### Recovery Procedures

**Restart from Specific Step:**

1. Edit cache file to set desired step:
```json
{
  "step": 5,  // Change this number
  ...
}
```

2. Delete addresses for steps you want to redo:
```json
{
  "step": 5,
  "addresses": {
    "addressFactory": "0x...",
    // Delete these to redeploy:
    // "pacUSDProxy": "0x...",
    // "stakingProxy": "0x...",
  }
}
```

3. Rerun deployment script

**Complete Fresh Deployment:**

```bash
# Delete cache file
rm scripts/deploy/{network}_deployment_cache.json

# Redeploy
npm run deploy:sepolia
```
