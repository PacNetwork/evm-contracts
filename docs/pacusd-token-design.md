# PacUSD Token Design

PacUSD is an ERC-20 compatible stablecoin. It features a two-step transaction approval workflow for minting and burning, role-based access control, pausability, blocklisting, and UUPS upgradeability. The system integrates with contract MMFVault for token swaps and contract PacUSDStaking for reward distribution.

## Roles

The `PacUSD` contract has multiple roles (addresses) which control different functionality:

- `admin` (`DEFAULT_ADMIN_ROLE`) - manages role assignments
- `minter` - authorized contract(s) (MMFVault) that can create and destroy tokens
- `approver` (`APPROVER_ROLE`) - approves mint and burn transaction IDs before execution
- `pauser` (`PAUSER_ROLE`) - pause the contract, which prevents all transfers, minting, burning, and rescue operations
- `blocklister` (`BLOCKLISTER_ROLE`) - prevent all transfers to or from a particular address, and prevents that address from minting or burning
- `owner` (upgrader) - authorize contract upgrades via UUPS pattern
- `rescuer` (`RESCUER_ROLE`) - transfer any ERC-20 tokens that are locked up in the contract

PacNetwork will control the address of all roles except for `minter`.

## ERC-20

The `PacUSD` implements the standard methods of the ERC-20 interface with some changes:

- A blocklisted address will be unable to call `transfer`, `transferFrom`, or `approve`, and will be unable to receive tokens.
- All ERC-20 operations (`transfer`, `transferFrom`, `approve`) will fail if the contract has been paused.
- Supports ERC-2612 `permit` for gasless approvals via signatures.

## Issuing and Destroying Tokens

The PacUSD contract uses a **two-step approval workflow** for minting and burning tokens. This provides enhanced security and governance over token issuance.

### Two-Step Approval Workflow

Unlike traditional stablecoins where minters can directly mint tokens, PacUSD requires:

1. **Step 1 - Approval**: An account with `APPROVER_ROLE` must pre-approve a transaction by calling `setMintByTx(txId)` or `setBurnByTx(txId)`
2. **Step 2 - Execution**: A `minter` (MMFVault) executes the approved transaction via `mintByTx(txId, amount, to)` or `burnByTx(txId, amount, from)`

This separation of concerns provides:
- **Governance oversight**: Approvers can review transaction legitimacy before execution
- **Regulatory compliance**: Two-party validation for token issuance
- **Attack mitigation**: Compromised minter cannot unilaterally mint tokens

### Transaction States

Each `txId` has one of four states:

- `TX_STATE_DEFAULT (0)` - Transaction ID has not been used
- `TX_STATE_AVAILABLE (1)` - Transaction has been approved and is ready for execution
- `TX_STATE_EXECUTED (2)` - Transaction has been completed
- `TX_STATE_CANCELED (3)` - Transaction approval has been cancelled

### Minter Management

Minters are authorized contracts (MMFVault) that can execute approved mint/burn operations.

- Minters are set during contract initialization
- Additional minters can be added by modifying the `_minters` mapping (requires contract upgrade)
- Minters do not have allowances - they can only execute pre-approved transactions

### Approving Mint Transactions

The `approver` approves mint transactions via the `setMintByTx` method:

```solidity
function setMintByTx(bytes32 txId) external whenNotPaused onlyRole(APPROVER_ROLE)
```

- Only the `approver` may call `setMintByTx`
- The `txId` must be in `TX_STATE_DEFAULT` (never used before)
- Sets the transaction state to `TX_STATE_AVAILABLE`
- Emits a `MintTxSet(txId)` event

### Cancelling Mint Approvals

Approved mint transactions can be cancelled before execution:

```solidity
function cancelMintByTx(bytes32 txId) external whenNotPaused onlyRole(APPROVER_ROLE)
```

- Only the `approver` may call `cancelMintByTx`
- The `txId` must be in `TX_STATE_AVAILABLE` (approved but not executed)
- Sets the transaction state to `TX_STATE_CANCELED`
- Emits a `MintTxCancelled(txId)` event

### Minting

A `minter` mints tokens via the `mintByTx` method:

```solidity
function mintByTx(
    bytes32 txId,
    uint256 amount,
    address to
) external onlyMinter whenNotPaused nonReentrant notBlocklisted(to)
```

- Only a `minter` may call `mintByTx`
- The `txId` must be in `TX_STATE_AVAILABLE` (pre-approved)
- The recipient `to` must not be blocklisted or the zero address
- Sets the transaction state to `TX_STATE_EXECUTED`
- Increases the balance of `to` and `totalSupply` by `amount`
- Minting fails when the contract is paused
- Emits a `Mint(to, amount)` event and standard ERC-20 `Transfer(0x00, to, amount)` event

### Approving Burn Transactions

The `approver` approves burn transactions via the `setBurnByTx` method:

```solidity
function setBurnByTx(bytes32 txId) external whenNotPaused onlyRole(APPROVER_ROLE)
```

- Only the `approver` may call `setBurnByTx`
- The `txId` must be in `TX_STATE_DEFAULT` (never used before)
- Sets the transaction state to `TX_STATE_AVAILABLE`
- Emits a `BurnTxSet(txId)` event

### Cancelling Burn Approvals

Approved burn transactions can be cancelled before execution:

```solidity
function cancelBurnByTx(bytes32 txId) external whenNotPaused onlyRole(APPROVER_ROLE)
```

- Only the `approver` may call `cancelBurnByTx`
- The `txId` must be in `TX_STATE_AVAILABLE` (approved but not executed)
- Sets the transaction state to `TX_STATE_CANCELED`
- Emits a `BurnTxCancelled(txId)` event

### Burning

A `minter` burns tokens via the `burnByTx` method:

```solidity
function burnByTx(
    bytes32 txId,
    uint256 amount,
    address from
) external onlyMinter notBlocklisted(from) whenNotPaused nonReentrant
```

- Only a `minter` may call `burnByTx`
- The `txId` must be in `TX_STATE_AVAILABLE` (pre-approved)
- The address `from` must not be blocklisted or the zero address
- The address `from` must have a balance greater than or equal to `amount`
- Sets the transaction state to `TX_STATE_EXECUTED`
- Decreases the balance of `from` and `totalSupply` by `amount`
- Burning fails when the contract is paused
- Emits a `Burn(from, amount)` event and standard ERC-20 `Transfer(from, 0x00, amount)` event

### Minting Rewards

```solidity
function mintReward(
    uint256 amount,
    address to
) external onlyMinter whenNotPaused notBlocklisted(to) nonReentrant
```

- Only a `minter` (MMFVault) may call `mintReward`
- The recipient `to` is typically the PacUSDStaking contract
- Does not require pre-approval via `setMintByTx`
- Amount must be greater than zero
- Recipient must not be blocklisted or the zero address
- Minting fails when the contract is paused
- Emits a `MintReward(to, amount)` event

### Minting Fees

PacUSD supports fee minting for vault swap fees:

```solidity
function mintFee(
    uint256 amount,
    address to
) external onlyMinter whenNotPaused notBlocklisted(to) nonReentrant
```

- Only a `minter` (MMFVault) may call `mintFee`
- The recipient `to` is the designated fee receiver
- Does not require pre-approval via `setMintByTx`
- Amount must be greater than zero
- Recipient must not be blocklisted or the zero address
- Minting fails when the contract is paused
- Emits a `MintFee(to, amount)` event

## Blocklisting

Addresses can be blocklisted. A blocklisted address will be unable to transfer tokens, receive tokens, mint, or burn tokens.

### Adding a Blocklisted Address

The `blocklister` blocklists an address via the `addToBlocklist` method:

```solidity
function addToBlocklist(address account) external onlyRole(BLOCKLISTER_ROLE)
```

- Only the `blocklister` may call `addToBlocklist`
- The `account` cannot be the zero address
- Blocklisting emits an `AddToBlocklist(account)` event

### Removing a Blocklisted Address

The `blocklister` removes an address from the blocklist via the `removeFromBlocklist` method:

```solidity
function removeFromBlocklist(address account) external onlyRole(BLOCKLISTER_ROLE)
```

- Only the `blocklister` may call `removeFromBlocklist`
- The `account` cannot be the zero address
- Unblocklisting emits a `RemoveFromBlocklist(account)` event

## Pausing

The entire contract can be paused in case a serious bug is found or there is a serious key compromise. All transfers, minting, burning, and rescue operations will be prevented while the contract is paused. Other functionality, such as modifying the blocklist, cancelling approved transactions, changing roles, and upgrading will remain operational as those methods may be required to fix or mitigate the issue that caused the pause.

### Pause

The `pauser` pauses the contract via the `pause` method:

```solidity
function pause() external onlyRole(PAUSER_ROLE)
```

- Only the `pauser` may call `pause`
- Sets the `paused` flag to true
- Pausing emits a `Paused(msg.sender)` event

### Unpause

The `pauser` unpauses the contract via the `unpause` method:

```solidity
function unpause() external onlyRole(PAUSER_ROLE)
```

- Only the `pauser` may call `unpause`
- Sets the `paused` flag to false
- All functionality is restored when the contract is unpaused
- Unpausing emits an `Unpaused(msg.sender)` event

## Meta Transactions Compatibility

### ERC-2612

The contract is compatible with [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612). Users may update their ERC-20 allowances by signing a `permit` message and passing the signed message to a relayer who will execute the on-chain transaction, instead of submitting a transaction themselves.

```solidity
function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) public override whenNotPaused notBlocklisted(owner) notBlocklisted(spender)
```

- Both `owner` and `spender` must not be blocklisted
- Contract must not be paused
- Signature must be valid and not expired

## Upgrading

The PacUSD contract uses the UUPS (Universal Upgradeable Proxy Standard) pattern via OpenZeppelin's `UUPSUpgradeable`. The actual token will be a Proxy contract (ERC1967Proxy) which forwards all calls to the PacUSD implementation via delegatecall. This pattern allows the PacNetwork team to upgrade the logic of the deployed token seamlessly.

### Upgrade Authorization

Upgrades are authorized via the `_authorizeUpgrade` internal function:

```solidity
function _authorizeUpgrade(address newImpl) internal override onlyOwner
```

- Only the `owner` (upgrader) role may authorize upgrades
- The new implementation address must not be the zero address
- Upgrades are executed by calling `upgradeToAndCall` on the proxy

## Rescuing Locked Tokens

PacUSD includes emergency rescue functionality to recover ERC-20 tokens that are accidentally sent to the contract.

### Rescue Tokens

```solidity
function rescueTokens(
    IERC20 tokenContract,
    address to,
    uint256 amount
) external onlyRole(RESCUER_ROLE) notBlocklisted(to) nonReentrant whenNotPaused
```

- Only the `rescuer` may call `rescueTokens`
- Recipient must not be blocklisted or the zero address
- Amount must be greater than zero and available in contract balance
- Rescue operations fail when the contract is paused
- Emits a `TokensRescued(tokenContract, to, amount)` event

## Reassigning Roles

Roles are managed via OpenZeppelin's `AccessControlUpgradeable`:

### Admin Role

```solidity
function grantRole(bytes32 role, address account) public onlyRole(getRoleAdmin(role))
function revokeRole(bytes32 role, address account) public onlyRole(getRoleAdmin(role))
```

- `DEFAULT_ADMIN_ROLE` can grant and revoke all roles
- Each role has a role admin that can manage that specific role
- Role changes emit `RoleGranted` and `RoleRevoked` events

### Upgrader (Owner)

The upgrader uses OpenZeppelin's `Ownable2StepUpgradeable`:

```solidity
function transferOwnership(address newOwner) public onlyOwner
function acceptOwnership() public
```

- Two-step ownership transfer prevents accidental transfers
- New owner must explicitly accept ownership
- `transferOwnership` may only be called by the current owner