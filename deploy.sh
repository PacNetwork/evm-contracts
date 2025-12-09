#!/bin/sh

# evm-contracts Deployment Script
# Usage:
#   NETWORK=mainnet DEPLOY_ACTION=deploy_all ./deploy.sh
#   Or set NETWORK and DEPLOY_ACTION in .env file

set -e

# Change to app directory (for Docker compatibility)
cd /app 2>/dev/null || cd "$(dirname "$0")"

# ============================================
# Configuration
# ============================================
VALID_NETWORKS="sepolia mainnet testnet"
VALID_ACTIONS="deploy_vault deploy_all upgrade_pacusd upgrade_vault upgrade_staking"

# ============================================
# Environment Variable Loading
# ============================================
if [ -f .env ]; then
    echo "✓ Loading environment variables from .env file"
    # Use a safer method to load env vars (handles spaces and special chars)
    set -a
    . ./.env
    set +a
fi

# Set defaults if not provided
NETWORK="${NETWORK:-}"
DEPLOY_ACTION="${DEPLOY_ACTION:-}"

# ============================================
# Deployment Functions
# ============================================
deploy_vault() {
    echo "  → Deploying new vault..."
    npx hardhat run ./scripts/deploy/deploy_vault.ts --network "$NETWORK"
}

deploy_all() {
    echo "  → Deploying all contracts..."
    npx hardhat run ./scripts/deploy/deploy.ts --network "$NETWORK"
}

upgrade_pacusd() {
    echo "  → Upgrading PACUSD contract..."
    npx hardhat run ./scripts/upgrade/upgrade_pacusd.ts --network "$NETWORK"
}

upgrade_vault() {
    echo "  → Upgrading vault contract..."
    npx hardhat run ./scripts/upgrade/upgrade_vault.ts --network "$NETWORK"
}

upgrade_staking() {
    echo "  → Upgrading staking contract..."
    npx hardhat run ./scripts/upgrade/upgrade_staking.ts --network "$NETWORK"
}

# ============================================
# Validation Functions
# ============================================
validate_network() {
    network="$1"
    for net in $VALID_NETWORKS; do
        if [ "$network" = "$net" ]; then
            return 0
        fi
    done
    return 1
}

validate_action() {
    action="$1"
    for act in $VALID_ACTIONS; do
        if [ "$action" = "$act" ]; then
            return 0
        fi
    done
    return 1
}

# ============================================
# Main Execution
# ============================================

# Validate network
if [ -z "$NETWORK" ]; then
    echo "❌ Error: NETWORK environment variable is not set" >&2
    echo "  Please set NETWORK in .env file or as environment variable" >&2
    echo "  Valid networks: ${VALID_NETWORKS[*]}" >&2
    exit 1
fi

if ! validate_network "$NETWORK"; then
    echo "❌ Error: Invalid network '$NETWORK'" >&2
    echo "  Valid networks: ${VALID_NETWORKS[*]}" >&2
    exit 1
fi

# Validate action
if [ -z "$DEPLOY_ACTION" ]; then
    echo "❌ Error: DEPLOY_ACTION environment variable is not set" >&2
    echo "  Please set DEPLOY_ACTION in .env file or as environment variable" >&2
    echo "  Valid actions: ${VALID_ACTIONS[*]}" >&2
    exit 1
fi

if ! validate_action "$DEPLOY_ACTION"; then
    echo "❌ Error: Invalid DEPLOY_ACTION '$DEPLOY_ACTION'" >&2
    echo "  Valid actions: ${VALID_ACTIONS[*]}" >&2
    exit 1
fi

# ============================================
# Deployment Process
# ============================================
echo "========================================"
echo "🔧 Deployment Configuration"
echo "========================================"
echo "  Network: $NETWORK"
echo "  Action:  $DEPLOY_ACTION"
echo ""

echo "🧠 Compiling smart contracts..."
if ! npx hardhat compile; then
    echo "❌ Error: Compilation failed" >&2
    exit 1
fi

echo ""
echo "🚀 Executing deployment script..."
case "$DEPLOY_ACTION" in
    "deploy_vault")
        deploy_vault
        ;;
    "deploy_all")
        deploy_all
        ;;
    "upgrade_pacusd")
        upgrade_pacusd
        ;;
    "upgrade_vault")
        upgrade_vault
        ;;
    "upgrade_staking")
        upgrade_staking
        ;;
esac

echo ""
echo "========================================"
echo "✅ Deployment completed successfully!"
echo "========================================"