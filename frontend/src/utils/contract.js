import { ethers } from "ethers";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS?.trim();
const AMOY_RPC_URL = import.meta.env.VITE_AMOY_RPC_URL?.trim();
const AMOY_RPC_FALLBACKS = import.meta.env.VITE_AMOY_RPC_FALLBACKS
  ?.split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY?.trim();
const AUTO_CONNECT_GUARD_KEY = "__trustdoc_auto_connect_once__";

export const AMOY_CHAIN_ID_DEC = 80002;
export const AMOY_CHAIN_ID_HEX = "0x13882";
export const AMOY_CHAIN_NAME = "Polygon Amoy";
export const AMOY_EXPLORER_URL = "https://amoy.polygonscan.com";

const DEFAULT_AMOY_RPCS = ["https://rpc-amoy.polygon.technology"];
const READ_RPC_URLS = Array.from(
  new Set([AMOY_RPC_URL, ...(AMOY_RPC_FALLBACKS || []), ...DEFAULT_AMOY_RPCS].filter(Boolean))
);

const DEFAULT_GAS_OVERRIDES = {
  gasLimit: 500000n,
  maxFeePerGas: ethers.parseUnits("50", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
};

const RETRY_GAS_OVERRIDES = {
  gasLimit: 650000n,
  maxFeePerGas: ethers.parseUnits("80", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("45", "gwei"),
};

const ABI = [
  "function registerDocument(bytes32 _hash, string _cid, string _docType, string _issuedBy)",
  "function verifyDocument(bytes32 _hash) view returns (bool,address,uint256,string,bool)",
  "function getDocumentsByOwner(address _owner) view returns (bytes32[])",
  "event DocumentRegistered(bytes32 indexed hash, address indexed owner, uint256 timestamp, string docType)",
  "event DocumentRevoked(bytes32 indexed hash, address indexed owner)",
];

function normalizeHash(hash) {
  if (typeof hash !== "string") {
    throw new Error("Document hash must be a string");
  }

  const clean = hash.startsWith("0x") ? hash.slice(2) : hash;

  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error("Document hash must be a 64-character SHA-256 hex string");
  }

  return `0x${clean.toLowerCase()}`;
}

function normalizeChainId(chainId) {
  if (typeof chainId === "string") {
    return chainId.startsWith("0x") ? Number.parseInt(chainId, 16) : Number(chainId);
  }

  if (typeof chainId === "number") {
    return chainId;
  }

  if (typeof chainId === "bigint") {
    return Number(chainId);
  }

  return Number.NaN;
}

export function isAmoyChain(chainId) {
  return normalizeChainId(chainId) === AMOY_CHAIN_ID_DEC;
}

function validateSharedConfig() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing VITE_CONTRACT_ADDRESS in frontend/.env");
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
    throw new Error("VITE_CONTRACT_ADDRESS must be a valid 0x address");
  }

  if (spaceTest(CONTRACT_ADDRESS)) {
    throw new Error("VITE_CONTRACT_ADDRESS must not contain spaces");
  }
}

function validateReadConfig() {
  validateSharedConfig();

  if (!READ_RPC_URLS.length) {
    throw new Error("Missing VITE_AMOY_RPC_URL in frontend/.env");
  }

  for (const url of READ_RPC_URLS) {
    if (spaceTest(url)) {
      throw new Error("RPC URLs must not contain spaces");
    }
  }
}

function spaceTest(value) {
  return /\s/.test(value);
}

function extractErrorMessage(error, fallback) {
  const message =
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.message ||
    fallback;

  if (/already exists/i.test(message)) {
    return "This document is already registered on-chain.";
  }

  if (/user rejected|rejected the request|action rejected/i.test(message)) {
    return "Transaction rejected in MetaMask.";
  }

  if (/network changed|chain|wrong network/i.test(message)) {
    return "Please switch MetaMask to Polygon Amoy and try again.";
  }

  if (isRetryableGasError(error)) {
    return "Network gas pricing changed quickly. Please retry in a moment.";
  }

  return message;
}

function isRetryableGasError(error) {
  const message = [
    error?.shortMessage,
    error?.reason,
    error?.info?.error?.message,
    error?.info?.message,
    error?.message,
    error?.cause?.message,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  return /(gas|fee|underpriced|max fee|maxfeepergas|max priority|base fee|intrinsic|replacement)/i.test(message);
}

function buildGatewayUrl(cid) {
  if (!cid || !PINATA_GATEWAY) {
    return null;
  }

  return `${PINATA_GATEWAY.replace(/\/+$/, "")}/ipfs/${cid}`;
}

function getBrowserProvider() {
  if (!window?.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask and try again.");
  }

  return new ethers.BrowserProvider(window.ethereum);
}

function getReadProviders() {
  return READ_RPC_URLS.map((url) => new ethers.JsonRpcProvider(url));
}

async function withReadProviderFallback(executor) {
  const providers = getReadProviders();
  let latestError = null;

  for (const provider of providers) {
    try {
      const network = await provider.getNetwork();

      if (!isAmoyChain(network.chainId)) {
        continue;
      }

      await assertContractExists(provider);
      return await executor(provider);
    } catch (error) {
      latestError = error;
    }
  }

  throw new Error(
    extractErrorMessage(
      latestError,
      "Failed to query Polygon Amoy RPC. Check VITE_AMOY_RPC_URL / fallback URLs."
    )
  );
}

async function assertContractExists(provider) {
  const code = await provider.getCode(CONTRACT_ADDRESS);

  if (!code || code === "0x") {
    throw new Error("Contract not deployed at VITE_CONTRACT_ADDRESS on Polygon Amoy.");
  }
}

export async function getWalletChainId() {
  if (!window?.ethereum) {
    return "";
  }

  return window.ethereum.request({ method: "eth_chainId" });
}

function getAmoyNetworkParams() {
  const preferredRpc = AMOY_RPC_URL || DEFAULT_AMOY_RPCS[0];

  return {
    chainId: AMOY_CHAIN_ID_HEX,
    chainName: AMOY_CHAIN_NAME,
    nativeCurrency: {
      name: "POL",
      symbol: "POL",
      decimals: 18,
    },
    rpcUrls: [preferredRpc, ...DEFAULT_AMOY_RPCS.filter((url) => url !== preferredRpc)],
    blockExplorerUrls: [AMOY_EXPLORER_URL],
  };
}

export function explainNetworkSwitchFailure(error) {
  const code = Number(error?.code);
  const message = (error?.message || error?.shortMessage || "").toLowerCase();

  if (code === 4001 || /user rejected|denied|cancel/i.test(message)) {
    return "Network switch request was rejected in MetaMask.";
  }

  if (code === -32002 || /request already pending|already processing/i.test(message)) {
    return "MetaMask already has a pending request. Open MetaMask and complete it first.";
  }

  if (
    code === 4902 ||
    /unknown chain|unrecognized chain|wallet_addethereumchain|chain not added/i.test(message)
  ) {
    return "Polygon Amoy is not added in this wallet. Add the network manually in MetaMask and retry.";
  }

  if (/unsupported|not support|not available/i.test(message)) {
    return "Automatic network switching is not supported by your wallet/browser. Use manual network switch.";
  }

  if (/network changed|chain changed/i.test(message)) {
    return "Wallet network changed while switching. Re-open MetaMask and switch to Polygon Amoy manually.";
  }

  return error?.message || "Unable to switch wallet network automatically.";
}

export function getManualNetworkSwitchUrl() {
  return "https://chainlist.org/chain/80002";
}

export async function switchToAmoyNetwork() {
  if (!window?.ethereum) {
    throw new Error("MetaMask is not installed.");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: AMOY_CHAIN_ID_HEX }],
    });
  } catch (switchError) {
    if (switchError?.code !== 4902) {
      throw new Error(explainNetworkSwitchFailure(switchError), { cause: switchError });
    }

    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [getAmoyNetworkParams()],
      });
    } catch (addError) {
      throw new Error(explainNetworkSwitchFailure(addError), { cause: addError });
    }
  }

  return getWalletChainId();
}

export async function ensureAmoyNetwork({ autoSwitch = true } = {}) {
  const chainId = await getWalletChainId();

  if (!chainId) {
    return {
      chainId: "",
      isSupported: false,
      switched: false,
    };
  }

  if (isAmoyChain(chainId)) {
    return {
      chainId,
      isSupported: true,
      switched: false,
    };
  }

  if (!autoSwitch) {
    return {
      chainId,
      isSupported: false,
      switched: false,
    };
  }

  const switchedChainId = await switchToAmoyNetwork();

  return {
    chainId: switchedChainId,
    isSupported: isAmoyChain(switchedChainId),
    switched: true,
  };
}

export async function getConnectedWallet({ requestIfMissing = false } = {}) {
  if (!window?.ethereum) {
    return "";
  }

  const provider = getBrowserProvider();
  let accounts = await provider.send("eth_accounts", []);

  if (!accounts.length && requestIfMissing) {
    accounts = await provider.send("eth_requestAccounts", []);
  }

  return accounts[0] || "";
}

export async function autoConnectWalletOnce({ requestIfMissing = false } = {}) {
  if (!window?.ethereum) {
    return "";
  }

  if (window[AUTO_CONNECT_GUARD_KEY]) {
    return getConnectedWallet({ requestIfMissing: false });
  }

  window[AUTO_CONNECT_GUARD_KEY] = true;

  try {
    return await getConnectedWallet({ requestIfMissing });
  } catch {
    return "";
  }
}

async function getWriteContract({ enforceNetwork = true } = {}) {
  validateSharedConfig();

  const provider = getBrowserProvider();
  const connected = await provider.send("eth_accounts", []);

  if (!connected.length) {
    await provider.send("eth_requestAccounts", []);
  }

  if (enforceNetwork) {
    const chainId = await provider.send("eth_chainId", []);

    if (!isAmoyChain(chainId)) {
      throw new Error("Please switch MetaMask to Polygon Amoy.");
    }
  }

  const signer = await provider.getSigner();
  const chainContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  const signerProvider = signer.provider;
  if (signerProvider) {
    await assertContractExists(signerProvider);
  }

  return chainContract;
}

function getRegisterArgs({ hashHex, cid, docType, issuedBy }) {
  if (!cid?.trim()) {
    throw new Error("CID is required for on-chain registration");
  }

  return [
    normalizeHash(hashHex),
    cid.trim(),
    docType?.trim() || "General",
    issuedBy?.trim() || "Unknown",
  ];
}

async function resolveRegistrationDetails(contract, provider, normalizedHash) {
  try {
    const filter = contract.filters.DocumentRegistered(normalizedHash);
    const logs = await contract.queryFilter(filter, 0, "latest");

    if (!logs.length) {
      return {
        cid: null,
        docType: null,
        issuedBy: null,
        txHash: null,
        blockNumber: null,
        blockTimestamp: null,
        gasUsed: null,
      };
    }

    const latest = logs[logs.length - 1];
    const txHash = latest.transactionHash;
    const blockNumber = latest.blockNumber;

    const [tx, block, receipt] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getBlock(blockNumber),
      provider.getTransactionReceipt(txHash),
    ]);

    let cid = null;
    let docType = null;
    let issuedBy = null;

    if (tx?.data) {
      const iface = new ethers.Interface(ABI);
      const parsed = iface.parseTransaction({
        data: tx.data,
        value: tx.value,
      });

      if (parsed?.name === "registerDocument") {
        cid = parsed.args?.[1] || null;
        docType = parsed.args?.[2] || null;
        issuedBy = parsed.args?.[3] || null;
      }
    }

    return {
      cid,
      docType,
      issuedBy,
      txHash,
      blockNumber,
      blockTimestamp: block?.timestamp ? Number(block.timestamp) : null,
      gasUsed: receipt?.gasUsed ? receipt.gasUsed.toString() : null,
    };
  } catch {
    return {
      cid: null,
      docType: null,
      issuedBy: null,
      txHash: null,
      blockNumber: null,
      blockTimestamp: null,
      gasUsed: null,
    };
  }
}

async function verifyDocumentWithContext(contract, provider, hashHex) {
  const normalizedHash = normalizeHash(hashHex);
  const [exists, owner, timestamp, issuedBy, revoked] = await contract.verifyDocument(normalizedHash);

  if (!exists) {
    return {
      hash: normalizedHash,
      exists,
      owner,
      timestamp: 0,
      issuedBy: "",
      revoked,
      cid: null,
      docType: "General",
      txHash: null,
      blockNumber: null,
      blockTimestamp: null,
      gasUsed: null,
      gatewayUrl: null,
    };
  }

  const registration = await resolveRegistrationDetails(contract, provider, normalizedHash);

  return {
    hash: normalizedHash,
    exists,
    owner,
    timestamp: Number(timestamp),
    issuedBy: registration.issuedBy || issuedBy || "",
    revoked,
    cid: registration.cid,
    docType: registration.docType || "General",
    txHash: registration.txHash,
    blockNumber: registration.blockNumber,
    blockTimestamp: registration.blockTimestamp,
    gasUsed: registration.gasUsed,
    gatewayUrl: buildGatewayUrl(registration.cid),
  };
}

export async function verifyDocumentOnChain(hashHex) {
  validateReadConfig();

  return withReadProviderFallback(async (provider) => {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    return verifyDocumentWithContext(contract, provider, hashHex);
  });
}

export async function getDocumentsByOwner(ownerAddress) {
  validateReadConfig();

  if (!ownerAddress || !ethers.isAddress(ownerAddress)) {
    throw new Error("A valid wallet address is required.");
  }

  return withReadProviderFallback(async (provider) => {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const hashes = await contract.getDocumentsByOwner(ownerAddress);

    const docs = await Promise.all(
      hashes.map((hash) => verifyDocumentWithContext(contract, provider, hash))
    );

    return docs
      .filter((doc) => doc.exists)
      .sort((a, b) => b.timestamp - a.timestamp);
  });
}

export async function getRecentDocumentEvents({ fromBlock = 0, toBlock = "latest" } = {}) {
  validateReadConfig();

  return withReadProviderFallback(async (provider) => {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const [registered, revoked] = await Promise.all([
      contract.queryFilter(contract.filters.DocumentRegistered(), fromBlock, toBlock),
      contract.queryFilter(contract.filters.DocumentRevoked(), fromBlock, toBlock),
    ]);

    return {
      registered,
      revoked,
    };
  });
}

export function subscribeToDocumentEvents({ onRegistered, onRevoked } = {}) {
  validateReadConfig();

  const provider = getReadProviders()[0];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  const registeredHandler = (hash, owner, timestamp, docType, event) => {
    onRegistered?.({
      hash,
      owner,
      timestamp: Number(timestamp),
      docType,
      txHash: event?.log?.transactionHash || event?.transactionHash || "",
    });
  };

  const revokedHandler = (hash, owner, event) => {
    onRevoked?.({
      hash,
      owner,
      txHash: event?.log?.transactionHash || event?.transactionHash || "",
    });
  };

  contract.on("DocumentRegistered", registeredHandler);
  contract.on("DocumentRevoked", revokedHandler);

  return () => {
    contract.off("DocumentRegistered", registeredHandler);
    contract.off("DocumentRevoked", revokedHandler);
    provider.destroy?.();
  };
}

export async function waitForTransactionConfirmation(txHash, { timeoutMs = 180000 } = {}) {
  if (!txHash) {
    throw new Error("Transaction hash is required.");
  }

  const start = Date.now();
  let latestError = null;

  while (Date.now() - start < timeoutMs) {
    for (const provider of getReadProviders()) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);

        if (receipt) {
          if (receipt.status === 0n || receipt.status === 0) {
            throw new Error("Transaction reverted on-chain.");
          }

          return receipt;
        }
      } catch (error) {
        latestError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  throw new Error(
    extractErrorMessage(latestError, "Transaction confirmation timed out. Please check explorer.")
  );
}

export async function registerDocumentOnChain({
  hashHex,
  cid,
  docType,
  issuedBy,
  txOverrides,
  onGasRetry,
}) {
  const contract = await getWriteContract();
  const args = getRegisterArgs({ hashHex, cid, docType, issuedBy });

  const initialOverrides = {
    ...(txOverrides || {}),
    ...DEFAULT_GAS_OVERRIDES,
  };

  try {
    const tx = await contract.registerDocument(...args, initialOverrides);

    return {
      txHash: tx.hash,
      waitForConfirmation: () => waitForTransactionConfirmation(tx.hash),
    };
  } catch (error) {
    if (!isRetryableGasError(error)) {
      throw new Error(
        extractErrorMessage(error, "Failed to register document on-chain"),
        { cause: error }
      );
    }

    if (typeof onGasRetry === "function") {
      onGasRetry();
    }

    try {
      const retryOverrides = {
        ...(txOverrides || {}),
        ...RETRY_GAS_OVERRIDES,
      };

      const retryTx = await contract.registerDocument(...args, retryOverrides);

      return {
        txHash: retryTx.hash,
        waitForConfirmation: () => waitForTransactionConfirmation(retryTx.hash),
      };
    } catch (retryError) {
      throw new Error(
        extractErrorMessage(retryError, "Failed to register document on-chain"),
        { cause: retryError }
      );
    }
  }
}
