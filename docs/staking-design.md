# PacUSDStaking Design

The PacUSDStaking contract enables users to stake PacUSD tokens and earn rewards over time. It features a sophisticated accumulated reward rate system, minimum staking periods, and restaking capabilities.

## Overview

The staking contract provides:

- Stake PacUSD tokens to earn proportional rewards
- Compound rewards through restaking without claiming
- Minimum staking period enforcement to encourage long-term participation
- Fair reward distribution based on accumulated reward rate mechanism

## Roles

The `PacUSDStaking` contract has multiple roles that control different functionality:

- `admin` (`DEFAULT_ADMIN_ROLE`) - manages role assignments and minimum staking period configuration
- `pauser` (`PAUSER_ROLE`) - pause the contract, preventing all staking operations
- `reserve-setter` (`RESERVE_SET_ROLE`) - update the address that receives rewards for unstaked tokens
- `reward-scheme-manager` (`REWARD_SCHEME_ROLE`) - add and remove external reward schemes
- `owner` (upgrader) - authorize contract upgrades via UUPS pattern
- `updaters` - authorized addresses (MMFVault) that can call `distributeReward()`

PacNetwork will control all roles.

## Core Functionality

### Staking Tokens

Users stake PacUSD tokens to participate in reward distribution.

```solidity
function stake(uint256 amount) external nonReentrant whenNotPaused
```

**Requirements:**
- Contract must not be paused
- Amount must be greater than zero
- User must have sufficient PacUSD token balance
- User must have approved contract to transfer tokens

### Unstaking Tokens

Users unstake PacUSD tokens after the minimum staking period.

```solidity
function unstake(uint256 amount) external nonReentrant whenNotPaused
```

**Requirements:**
- Contract must not be paused
- Amount must be greater than zero
- User must have sufficient staking balance
- Minimum staking period must have elapsed

**Important:** The staking timestamp is reset on every unstake, meaning users must wait another full minimum staking period before they can unstake again.

### Restaking Rewards

Users can compound their rewards by restaking without claiming.

```solidity
function restake(uint256 amount) external nonReentrant whenNotPaused
```

**Key Differences from Staking:**
- **No token transfer**: Rewards are already in the contract
- **No timestamp reset**: Staking timestamp remains unchanged
- **From rewards**: Uses available reward balance
- **Compounds**: Increases staking balance without claiming

**Requirements:**
- Contract must not be paused
- Amount must be greater than zero
- User must have sufficient unclaimed rewards

### Claiming Rewards

Users claim accumulated rewards as liquid PacUSD tokens.

```solidity
function claimReward(uint256 amount) external nonReentrant whenNotPaused
```

**Requirements:**
- Contract must not be paused
- Amount must be greater than zero
- User must have sufficient reward balance

### Distributing Rewards

```solidity
function distributeReward(uint256 newReward) external onlyUpdater nonReentrant whenNotPaused
```

**Requirements:**
- Only `updaters` (MMFVault) may call `distributeReward`
- Contract must not be paused
- New reward must be greater than zero

**Reward Calculation:**
```solidity
individualRewardIncrement = newReward x individualStakedAmount / totalPacUSDSupply
```

### Setting Reserve Address

```solidity
function setReserve(address reserve) external onlyRole(RESERVE_SET_ROLE)
```

**Requirements:**
- Only `reserve-setter` can call `setReserve`
- New reserve address cannot be zero
- New reserve address must be different from current
- New reserve address must have no existing rewards (prevents loss)


## External Reward Schemes

The staking contract supports up to 5 external reward schemes for additional incentive programs.

### Reward Scheme Interface

```solidity
interface IRewardScheme {
    function isActive() external view returns (bool);
    function update() external;
    function updateUserInternalState(address user, uint256 stakedAmount) external;
}
```

External schemes are notified of:
- User stake/unstake/restake events (via `updateUserInternalState`)
- Global reward distributions (via `update`)

### Adding Reward Schemes

```solidity
function addRewardScheme(address scheme) external onlyRole(REWARD_SCHEME_ROLE)
```

**Requirements:**
- Only `reward-scheme-manager` can add schemes
- Scheme address cannot be zero
- Scheme cannot already exist
- Maximum 5 schemes allowed

### Removing Reward Schemes

```solidity
function removeRewardScheme(address scheme) external onlyRole(REWARD_SCHEME_ROLE)
```

**Requirements:**
- Only `reward-scheme-manager` can remove schemes
- Scheme must exist in the array

**Note:** External reward schemes will not affect the main staking mechanism.

## Minimum Staking Period

The contract enforces a minimum time lock to encourage long-term staking.

**Current:** 1 day (`86400 seconds`)
**Reset on:** Stake and Unstake only (not Restake)
**Configurable:** By `admin`

### Setting Minimum Staking Period

```solidity
function setMinStakingPeriod(uint256 period) external onlyRole(DEFAULT_ADMIN_ROLE)
```

**Requirements:**
- Only `admin` may update period

## Pausing

The staking contract can be paused for emergency situations.

### Pause

```solidity
function pause() external onlyRole(PAUSER_ROLE)
```

- Only `pauser` may call `pause`
- Prevents all state-changing operations:
  - `stake`
  - `unstake`
  - `restake`
  - `claimReward`
  - `distributeReward`
- Configuration functions remain operational
- Emits `Paused(msg.sender)` event

### Unpause

```solidity
function unpause() external onlyRole(PAUSER_ROLE)
```

- Only `pauser` may call `unpause`
- Restores all functionality
- Emits `Unpaused(msg.sender)` event

## Upgrading

The PacUSDStaking uses UUPS pattern for upgrades.

### Upgrade Authorization

```solidity
function _authorizeUpgrade(address newImpl) internal override onlyOwner
```

- Defined in `BaseStaking` abstract contract
- Only the `owner` (upgrader) role may authorize upgrades
- New implementation address must not be zero
- Upgrades executed via `upgradeToAndCall` on proxy

## View Functions

The contract provides read-only functions for querying state.

### Query User Rewards

```solidity
function rewardOf(address user) external view returns (uint256)
```

Returns total unclaimed rewards (stored + newly accrued):
```solidity
return rewardBalances[user] + _calculateRewardIncrement(user);
```

### Query User Staking Balance

```solidity
function balanceOf(address user) external view returns (uint256)
```

Returns user's current staked amount:
```solidity
return stakingBalances[user];
```

### Query Total Staked

```solidity
function totalStaked() external view returns (uint256)
```

Returns total amount of tokens staked across all users:
```solidity
return totalStaked_;
```

### Query All Schemes

```solidity
function getAllSchemes() external view returns (address[] memory)
```

Returns array of all active reward scheme addresses.

## Events

The staking contract emits detailed events for monitoring.

### User Action Events

```solidity
event Staked(address indexed user, uint256 amount);
event Unstaked(address indexed user, uint256 amount);
event Restaked(address indexed user, uint256 amount);
event RewardClaimed(address indexed user, uint256 amount);
```

### Distribution Events

```solidity
event RewardDistributed(
    address indexed updater,
    uint256 newReward,
    uint256 rewardRate
);
```

### Configuration Events

```solidity
event ReserveSet(address indexed reserve);
event RewardSchemeAdded(address indexed scheme);
event RewardSchemeRemoved(address indexed scheme);
event MinStakingPeriodSet(uint256 indexed period);
```

## Integration with MMFVault

The vault calls `distributeReward()` when MMF price increases.

### Reward Flow

1. **Price Increase Detected:** MMFVault detects MMF price appreciation
2. **Vault Calls Distribute:** `vault.mintReward(currentPrice)` calculates reward amount
3. **Mint Rewards:** `pacUSD.mintReward(rewardAmount, address(staking))` mints PacUSD to staking
4. **Distribute to Stakers:** `staking.distributeReward(rewardAmount)` updates reward rate
5. **Users Claim/Restake:** Users can claim or restake their proportional share

### Updater Authorization

MMFVault must be registered as an updater during initialization:

```solidity
initialize(
    pacUSDAddress,
    upgrader,
    admin,
    reserve,
    [vaultAddress]  // Updaters array
);
```

Only updaters can call `distributeReward()`.