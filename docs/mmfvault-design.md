# MMFVault Design

The MMFVault is a decentralized token swap and reward distribution system that enables bidirectional conversion between MMF tokens and PacUSD stablecoin. It features dynamic pricing via oracle integration, configurable fee collection, automated reward distribution to stakers based on price appreciation, and comprehensive safety mechanisms.

## Overview

The MMFVault serves as the primary minting authority for PacUSD, acting as a bridge between MMF tokens (collateral) and PacUSD (stablecoin). Users can:

- Swap MMF tokens for newly minted PacUSD at oracle-determined prices
- Redeem PacUSD for MMF tokens by burning PacUSD
- Benefit from price appreciation through automatic reward distribution to stakers

## Roles

The `MMFVault` contract has multiple roles that control different functionality:

- `admin` (`DEFAULT_ADMIN_ROLE`) - manages fee configuration and fee receiver settings
- `pauser` (`PAUSER_ROLE`) - pause the contract, which prevents all swaps and reward minting
- `reward-minter` (`MINT_REWARD_ROLE`) - trigger reward distribution when MMF price increases
- `owner` (upgrader) - authorize contract upgrades via UUPS pattern

PacNetwork will control all roles.

## Core Functionality

### Token Swapping

The vault enables bidirectional token swaps with dynamic pricing.

#### MMF → PacUSD (Minting)

Users swap MMF tokens for newly minted PacUSD:

```solidity
function mintPacUSD(
    bytes32 txId,
    uint256 amount,
    address to,
    uint256 timestamp
) external whenNotPaused nonReentrant
```

**Process:**
1. User calls `mintPacUSD` with MMF amount
2. Vault validates transaction ID matches parameters
3. Vault queries current MMF price from oracle
4. Vault calculates PacUSD amount: `pacUSDAmount = mmfAmount × price`
5. Vault deducts mint fee: `finalAmount = pacUSDAmount - mintFee`
6. Vault transfers MMF from user to vault
7. Vault calls `pacUSD.mintByTx` (requires pre-approved txId)
8. If fees > 0, vault calls `pacUSD.mintFee(mintFee, feeReceiver)`

**Requirements:**
- Contract must not be paused
- Transaction ID must be valid (matches hash of parameters)
- Recipient address cannot be zero
- Amount must be greater than zero
- Rewards must be minted first if price has increased
- The txId must have been pre-approved via `pacUSD.setMintByTx(txId)` by an approver

#### PacUSD → MMF (Redemption)

Users redeem PacUSD for MMF tokens by burning PacUSD:

```solidity
function redeemMMF(
    bytes32 txId,
    uint256 amount,
    address to,
    uint256 timestamp
) external whenNotPaused nonReentrant
```

**Process:**
1. User calls `redeemMMF` with PacUSD amount
2. Vault validates transaction ID matches parameters
3. Vault queries current MMF price from oracle
4. Vault deducts redeem fee: `finalAmount = amount - redeemFee`
5. Vault calculates MMF amount: `mmfAmount = finalAmount / price`
6. Vault verifies sufficient MMF balance
7. Vault transfers PacUSD from user to vault
8. Vault calls `pacUSD.burnByTx` (requires pre-approved txId)
9. If fees > 0, vault transfers fee in PacUSD to fee receiver
10. Vault transfers MMF to recipient

**Requirements:**
- Contract must not be paused
- Transaction ID must be valid (matches hash of parameters)
- Recipient address cannot be zero
- Amount must be greater than zero
- Rewards must be minted first if price has increased
- If price > `lastPrice`, rewards must be minted first
- Vault must have sufficient MMF tokens
- The txId must have been pre-approved via `pacUSD.setBurnByTx(txId)` by an approver

### Transaction ID Validation

All swap operations require a valid transaction ID to prevent replay attacks and ensure transaction uniqueness.

**Transaction ID Generation:**
The transaction ID (`txId`) is generated as a unique hash using the following parameters:

```solidity
txId = keccak256(abi.encode(
    block.chainid,      // Current blockchain network identifier
    address(this),      // MMFVault contract address
    _msgSender(),       // Address of the user initiating the transaction
    amount,             // Amount to be swapped
    to,                 // Recipient address
    timestamp           // Timestamp of the swap request initiated by the user
))
```

This approach ensures each transaction is uniquely identified and securely bound to its specific context, preventing replay attacks and unauthorized modifications.

**Validation:**
- Vault recomputes `txId` from provided parameters
- Reverts with `InvalidTxId()` if computed hash doesn't match provided txId
- Ensures parameters cannot be modified after txId generation
- Protects against cross-chain replay attacks via `block.chainid`
- Binds transaction to specific user, amount, recipient, and time

### Fee Management

The vault collects fees on both minting and redemption operations.

#### Fee Configuration

**Fee Receiver:**
```solidity
function updateFeeReceiver(address newFeeReceiver) external onlyRole(DEFAULT_ADMIN_ROLE)
```

- Only `admin` may update the fee receiver
- Fee receiver must be set before configuring fee rates
- Fee receiver cannot be the zero address
- Emits `FeeReceiverUpdated(oldReceiver, newReceiver)` event

**Mint Fee Rate (MMF → PacUSD):**
```solidity
function updateMintFeeRate(uint256 newMintFeeRate) external onlyRole(DEFAULT_ADMIN_ROLE)
```

- Only `admin` may update the mint fee rate
- Fee receiver must be set first (reverts with `FeeReceiverRequired()`)
- Fee rate uses `FEE_PRECISION` (1e18 = 100%, 1e16 = 1%)
- Emits `MintFeeRateUpdated(oldRate, newRate)` event

**Redeem Fee Rate (PacUSD → MMF):**
```solidity
function updateRedeemFeeRate(uint256 newRedeemFeeRate) external onlyRole(DEFAULT_ADMIN_ROLE)
```

- Only `admin` may update the redeem fee rate
- Fee receiver must be set first (reverts with `FeeReceiverRequired()`)
- Fee rate uses `FEE_PRECISION` (1e18 = 100%, 1e16 = 1%)
- Emits `RedeemFeeRateUpdated(oldRate, newRate)` event

## Price-Based Reward System

The vault implements an automatic reward distribution mechanism that mints PacUSD rewards when MMF price increases.

### Reward Mechanism

**Concept:**
When MMF price appreciates, the total value of MMF held in the vault increases. This value increase is captured as PacUSD rewards and distributed to stakers.

**Formula:**
```solidity
rewardAmount = priceIncrease × totalMMFToken
```

### Minting Rewards

```solidity
function mintReward(uint256 rewardPrice) public whenNotPaused nonReentrant onlyRole(MINT_REWARD_ROLE)
```

**Process:**
1. `reward-minter` calls `mintReward` with current price
2. Vault queries actual current price from oracle
3. Vault validates `rewardPrice`
4. If there is a price increase:
   - Calculate reward amount based on price difference
   - Call `staking.distributeReward` to trigger the reward distribution
   - Call `pacUSD.mintReward` to mint rewards
   - Emit `RewardMinted` event with details

**Requirements:**
- Only `reward-minter` can call `mintReward`
- Contract must not be paused
- Provided `rewardPrice` must match actual current price (reverts with `MismatchPrice()`)
- Price must be monotonically increasing

**Critical Constraint:**
The vault enforces that `mintReward()` must be called before any mint/redeem operations when price has increased. This ensures:
- Rewards are always minted before allowing swaps at new prices
- No user can mint/redeem at old prices when appreciation has occurred
- Stakers receive their fair share of value appreciation

## Oracle Integration

The vault relies on a price oracle (`IPricer`) for MMF token pricing.

### Price Requirements

**Precision:**
- Prices are denominated in USD with 18 decimals
- `PRICER_PRECISION = 1e18` means 1.0 USD

**Price Tracking:**
- `lastPrice` stores the last recorded price for reward calculation
- Updated only when `mintReward()` is called successfully
- Used to enforce reward minting before swaps at new prices

### Price Oracle Interface

```solidity
interface IPricer {
    function getLatestPrice() external view returns (uint256);
}
```

The oracle must return prices with 18 decimal precision representing USD value per MMF token.

## Pausing

The vault can be paused in case of emergency or security issues.

### Pause

```solidity
function pause() external onlyRole(PAUSER_ROLE)
```

- Only `pauser` may call `pause`
- Prevents all swap operations (`mintPacUSD`, `redeemMMF`)
- Prevents reward minting (`mintReward`)
- Fee configuration and role management remain operational
- Emits `Paused(msg.sender)` event

### Unpause
    
```solidity
function unpause() external onlyRole(PAUSER_ROLE)
```

- Only `pauser` may call `unpause`
- Restores all vault functionality
- Emits `Unpaused(msg.sender)` event

## Upgrading

The MMFVault uses the UUPS (Universal Upgradeable Proxy Standard) pattern for upgrades.

### Upgrade Authorization

```solidity
function _authorizeUpgrade(address newImpl) internal override onlyOwner
```

- Only the `owner` (upgrader) role may authorize upgrades
- New implementation address must not be the zero address
- Upgrades executed via `upgradeToAndCall` on the proxy

### Daily Operations

**User Minting PacUSD:**
1. User approves MMF tokens to vault
2. Off-chain: Approver calls `pacUSD.setMintByTx(txId)` with pre-computed txId
3. User calls `vault.mintPacUSD(txId, mmfAmount, recipient, timestamp)`
4. Vault transfers MMF, mints PacUSD to user (minus fees)

**User Redeeming MMF:**
1. User approves PacUSD tokens to vault
2. Off-chain: Approver calls `pacUSD.setBurnByTx(txId)` with pre-computed txId
3. User calls `vault.redeemMMF(txId, pacUSDAmount, recipient, timestamp)`
4. Vault burns PacUSD (minus fees), transfers MMF to user

**Price Monitoring & Rewards:**
1. Monitor MMF price periodically
2. When price increases, call `vault.mintReward(currentPrice)`
3. Vault mints rewards to staking contract
4. Staking contract distributes rewards to stakers

## Key Design Decisions

### Why Two-Step Approval for Minting/Burning?

The vault uses PacUSD's two-step approval workflow for enhanced security:
- **Governance oversight**: Approvers review transactions before vault executes them
- **Regulatory compliance**: Two-party validation for token issuance
- **Attack mitigation**: Compromised vault cannot unilaterally mint without approval

### Why Enforce Reward Minting Before Price Increases?

It ensures:
- **Fair distribution**: Stakers receive rewards before anyone can swap at new prices
- **Prevents gaming**: Users cannot front-run reward minting to avoid dilution
- **Value preservation**: Collateral appreciation benefits stakers proportionally

### Why Separate Fee Types?

Different fee structures for minting vs. redemption allow:
- **Flexibility**: Adjust incentives based on market conditions
- **Revenue optimization**: Different fee rates for different operations
- **User experience**: Transparent fee structure for each operation