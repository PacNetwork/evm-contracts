import Safe, { buildSignatureBytes } from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import { ethers, network } from "hardhat";

/**
 * Safe Upgrade Function for UUPS Proxies
 *
 * This function facilitates upgrading a UUPS proxy contract through a Gnosis Safe multisig.
 * It prepares the upgrade transaction, signs it, and proposes it to the Safe service.
 *
 * @param contract - The contract instance of the proxy to be upgraded
 * @param newImplementationAddress - Address of the new implementation contract
 * @param initData - Optional initialization data for the upgrade
 */
export async function safeUpgrade(
  contract: any,
  newImplementationAddress: string,
  initData: string = "0x"
) {
  // Retrieve configuration from environment variables
  const SIGNER_PRIVATE_KEY = process.env.UPGRADE_PRIVATE_KEY as string;
  const safeAddress = process.env.UPGRADER_ADDRESS as string;
  const API_KEY = process.env.SAFE_API_KEY as string;

  if (!SIGNER_PRIVATE_KEY || !safeAddress || !API_KEY) {
    throw new Error("Missing required environment variables");
  }

  // Initialize Safe Protocol Kit with provider and signer
  const protocolKit = await Safe.init({
    provider: network.provider,
    signer: SIGNER_PRIVATE_KEY,
    safeAddress,
  });

  // Encode upgrade transaction data using UUPS proxy method
  const upgradeData = contract.interface.encodeFunctionData(
    "upgradeToAndCall",
    [newImplementationAddress, initData]
  );

  // Build Safe transaction parameters
  const safeTransactionData = {
    to: contract.target,
    data: upgradeData,
    value: "0",
  };

  // Create and sign the Safe transaction
  console.log("[Info] Creating Safe transaction...");
  let safeTransaction = await protocolKit.createTransaction({
    transactions: [safeTransactionData],
  });

  console.log("[Info] Signing transaction...");
  const signedSafeTransaction = await protocolKit.signTransaction(
    safeTransaction
  );
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

  // Initialize Safe API Kit with chain ID
  const chainId = BigInt(network.config.chainId?.toString() || "0");
  const apiKit = new SafeApiKit({
    chainId,
    apiKey: API_KEY,
  });

  // Get signer address and propose transaction to Safe service
  const signer = new ethers.Wallet(SIGNER_PRIVATE_KEY, ethers.provider);
  const senderAddress = await signer.getAddress();

  console.log("[Info] Proposing transaction to Safe service...");
  await apiKit.proposeTransaction({
    safeAddress,
    safeTransactionData: signedSafeTransaction.data,
    safeTxHash,
    senderAddress,
    senderSignature: buildSignatureBytes([
      signedSafeTransaction.getSignature(senderAddress)!,
    ]),
  });

  console.log(
    `[Success] Upgrade transaction proposed! Safe Tx Hash: ${safeTxHash}`
  );
}


