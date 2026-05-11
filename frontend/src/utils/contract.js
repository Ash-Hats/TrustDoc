import { ethers } from "ethers";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS?.trim();
const AMOY_RPC_URL = import.meta.env.VITE_AMOY_RPC_URL?.trim();
const AMOY_RPC_FALLBACKS = import.meta.env.VITE_AMOY_RPC_FALLBACKS
  ?.split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY?.trim();
const AUTO_CONNECT_GUARD_KEY = "__trustdoc_auto_connect_once__";
const DEBUG_BLOCKCHAIN =
  Boolean(import.meta.env.DEV) ||
  String(import.meta.env.VITE_DEBUG || "").toLowerCase() === "true";

export const AMOY_CHAIN_ID_DEC = 80002;
export const AMOY_CHAIN_ID_HEX = "0x13882";
export const AMOY_CHAIN_NAME = "Polygon Amoy";
export const AMOY_EXPLORER_URL = "https://amoy.polygonscan.com";

const DEFAULT_AMOY_RPCS = ["https://rpc-amoy.polygon.technology"];
const READ_RPC_URLS = Array.from(
  new Set([AMOY_RPC_URL, ...(AMOY_RPC_FALLBACKS || []), ...DEFAULT_AMOY_RPCS].filter(Boolean))
);

const READ_PROVIDER_POLL_INTERVAL_MS = 4000;
const DOCUMENT_EVENT_POLL_INTERVAL_MS = 15000;
const DOCUMENT_EVENT_BOOTSTRAP_LOOKBACK_BLOCKS = 6;
const DOCUMENT_EVENT_QUERY_STEP = 3500;

const REGISTER_GAS_BUFFER_BPS = 12000n;
const REGISTER_GAS_BPS_SCALE = 10000n;
const REGISTER_GAS_LIMIT_FALLBACK = 320000n;
const REGISTER_GAS_LIMIT_CEILING = 900000n;
const TX_CONFIRMATION_TIMEOUT_MS = 180000;

const ABI = [
  "function registerDocument(bytes32 _hash, string _cid, string _docType, string _issuedBy)",
  "function verifyDocument(bytes32 _hash) view returns (bool,address,uint256,string,bool)",
  "function getDocumentsByOwner(address _owner) view returns (bytes32[])",
  "event DocumentRegistered(bytes32 indexed hash, address indexed owner, uint256 timestamp, string docType)",
  "event DocumentRevoked(bytes32 indexed hash, address indexed owner)",
];

const readProviderCache = new Map();
const contractExistsCache = new WeakMap();
const walletRequestCache = new Map();
const registrationDetailsCache = new Map();
let browserProviderSingleton = null;
let browserProviderSource = null;

function logDebug(...args) {
  if (DEBUG_BLOCKCHAIN) {
    console.debug("[trustdoc:blockchain]", ...args);
  }
}

function logWarn(...args) {
  console.warn("[trustdoc:blockchain]", ...args);
}

function resetBrowserProviderSingleton() {
  browserProviderSingleton = null;
  browserProviderSource = null;
}

function shouldResetProvider(error) {
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

  return /(provider destroyed|cancelled request|disconnected|provider is destroyed|disconnected from chain)/i.test(message);
}

function shouldRetryWalletRpc(error) {
  return shouldResetProvider(error);
}

function getBrowserWindow() {
  return typeof window === "undefined" ? null : window;
}

function getInjectedEthereum() {
  const browserWindow = getBrowserWindow();
  if (!browserWindow?.ethereum?.request) {
    throw new Error("MetaMask is not installed. Please install MetaMask and try again.");
  }
  return browserWindow.ethereum;
}

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
    error?.info?.message ||
    error?.message ||
    fallback;

  if (/already exists/i.test(message)) {
    return "This document is already registered on-chain.";
  }

  if (/user rejected|rejected the request|action rejected/i.test(message)) {
    return "Transaction rejected in MetaMask.";
  }

  if (/insufficient funds|insufficient balance|insufficient pol/i.test(message)) {
    return "Insufficient POL balance to pay gas fees on Polygon Amoy.";
  }

  if (/execution reverted|call exception|revert/i.test(message)) {
    return "Transaction reverted on-chain. Recheck contract inputs and registration state.";
  }

  if (/unsupported operation|cannot sign|missing signer|sendtransaction/i.test(message)) {
    return "Wallet signing is unavailable. Reconnect MetaMask and retry.";
  }

  if (/network changed|chain|wrong network/i.test(message)) {
    return "Please switch MetaMask to Polygon Amoy and try again.";
  }

  if (isRetryableGasError(error)) {
    return "Gas pricing changed quickly on network. Retrying with updated estimate may help.";
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

function getWalletRequestKey(method, params) {
  return `${method}:${JSON.stringify(params || [])}`;
}

export async function requestWalletRpc(method, params = []) {
  const ethereum = getInjectedEthereum();
  const normalizedParams = Array.isArray(params) ? params : [params];
  const requestKey = getWalletRequestKey(method, normalizedParams);

  if (walletRequestCache.has(requestKey)) {
    return walletRequestCache.get(requestKey);
  }

  const requestPromise = (async () => {
    try {
      return await ethereum.request({ method, params: normalizedParams });
    } catch (error) {
      if (shouldResetProvider(error)) {
        resetBrowserProviderSingleton();
      }

      if (!shouldRetryWalletRpc(error)) {
        throw error;
      }

      return ethereum.request({ method, params: normalizedParams });
    }
  })().finally(() => {
    walletRequestCache.delete(requestKey);
  });

  walletRequestCache.set(requestKey, requestPromise);
  return requestPromise;
}

export function getBrowserProvider() {
  const browserWindow = getBrowserWindow();
  const ethereum = getInjectedEthereum();

  if (!browserProviderSingleton || browserProviderSource !== ethereum) {
    browserProviderSingleton = new ethers.BrowserProvider(ethereum);
    browserProviderSource = ethereum;
    logDebug("Created BrowserProvider singleton.", { hasWindow: Boolean(browserWindow) });
  }

  return browserProviderSingleton;
}

export async function getWalletSigner() {
  const provider = getBrowserProvider();
  return provider.getSigner();
}

function getReadProviders() {
  return READ_RPC_URLS.map((url) => {
    if (!readProviderCache.has(url)) {
      const provider = new ethers.JsonRpcProvider(url, undefined, {
        polling: true,
        pollingInterval: READ_PROVIDER_POLL_INTERVAL_MS,
        staticNetwork: true,
      });

      readProviderCache.set(url, provider);
      logDebug("Initialized read provider.", { rpcUrl: url });
    }

    return readProviderCache.get(url);
  });
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
  const cached = contractExistsCache.get(provider);
  if (cached) {
    return cached;
  }

  const validation = (async () => {
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (!code || code === "0x") {
      throw new Error("Contract not deployed at VITE_CONTRACT_ADDRESS on Polygon Amoy.");
    }
    return true;
  })();

  contractExistsCache.set(provider, validation);

  try {
    return await validation;
  } catch (error) {
    contractExistsCache.delete(provider);
    throw error;
  }
}

export async function getWalletChainId() {
  const browserWindow = getBrowserWindow();
  if (!browserWindow?.ethereum?.request) {
    return "";
  }

  try {
    return await requestWalletRpc("eth_chainId", []);
  } catch (error) {
    logWarn("Failed to read wallet chain id.", error);
    throw new Error(extractErrorMessage(error, "Unable to read wallet chain id."), {
      cause: error,
    });
  }
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
  getInjectedEthereum();

  try {
    await requestWalletRpc("wallet_switchEthereumChain", [{ chainId: AMOY_CHAIN_ID_HEX }]);
  } catch (switchError) {
    if (switchError?.code !== 4902) {
      throw new Error(explainNetworkSwitchFailure(switchError), { cause: switchError });
    }

    try {
      await requestWalletRpc("wallet_addEthereumChain", [getAmoyNetworkParams()]);
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
  const browserWindow = getBrowserWindow();
  if (!browserWindow?.ethereum?.request) {
    return "";
  }

  let accounts = await requestWalletRpc("eth_accounts", []);

  if (!accounts.length && requestIfMissing) {
    accounts = await requestWalletRpc("eth_requestAccounts", []);
  }

  return accounts[0] || "";
}

export async function autoConnectWalletOnce({ requestIfMissing = false } = {}) {
  const browserWindow = getBrowserWindow();
  if (!browserWindow?.ethereum?.request) {
    return "";
  }

  if (browserWindow[AUTO_CONNECT_GUARD_KEY]) {
    return getConnectedWallet({ requestIfMissing: false });
  }

  browserWindow[AUTO_CONNECT_GUARD_KEY] = true;

  try {
    return await getConnectedWallet({ requestIfMissing });
  } catch {
    return "";
  }
}

async function getWriteContract({ enforceNetwork = true } = {}) {
  validateSharedConfig();

  const provider = getBrowserProvider();
  let connected = await requestWalletRpc("eth_accounts", []);

  if (!connected.length) {
    connected = await requestWalletRpc("eth_requestAccounts", []);
  }

  if (!connected.length) {
    throw new Error("No wallet account available.");
  }

  if (enforceNetwork) {
    const chainId = await getWalletChainId();

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

function assertShortString(value, fieldName, maxLength) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return normalized;
}

function getRegisterArgs({ hashHex, cid, docType, issuedBy }) {
  const normalizedCid = String(cid || "").trim();
  if (!normalizedCid) {
    throw new Error("CID is required for on-chain registration");
  }

  const normalizedDocType = assertShortString(docType || "General", "Document type", 40) || "General";
  const normalizedIssuedBy = assertShortString(issuedBy || "Unknown", "Issuer name", 120) || "Unknown";

  return [
    normalizeHash(hashHex),
    normalizedCid,
    normalizedDocType,
    normalizedIssuedBy,
  ];
}

function mergeTxOverrides(baseOverrides = {}, txOverrides = {}) {
  return {
    ...(baseOverrides || {}),
    ...(txOverrides || {}),
  };
}

function capGasLimit(gasLimit) {
  if (gasLimit <= 0n) {
    return REGISTER_GAS_LIMIT_FALLBACK;
  }

  if (gasLimit > REGISTER_GAS_LIMIT_CEILING) {
    return REGISTER_GAS_LIMIT_CEILING;
  }

  return gasLimit;
}

async function buildRegisterTxOverrides(contract, args, txOverrides = {}) {
  const userOverrides = txOverrides || {};
  const hasCustomGasLimit = userOverrides.gasLimit !== undefined && userOverrides.gasLimit !== null;

  if (hasCustomGasLimit) {
    return mergeTxOverrides({}, userOverrides);
  }

  let estimatedGas = null;

  try {
    estimatedGas = await contract.registerDocument.estimateGas(...args, userOverrides);
  } catch (error) {
    logWarn("Gas estimation failed for registerDocument, using fallback gas limit.", error);
  }

  const bufferedEstimate =
    estimatedGas && estimatedGas > 0n
      ? capGasLimit((estimatedGas * REGISTER_GAS_BUFFER_BPS) / REGISTER_GAS_BPS_SCALE)
      : REGISTER_GAS_LIMIT_FALLBACK;

  return mergeTxOverrides(
    {
      gasLimit: bufferedEstimate,
    },
    userOverrides
  );
}

async function resolveRegistrationDetails(contract, provider, normalizedHash) {
  const cacheKey = String(normalizedHash || "").toLowerCase();
  if (registrationDetailsCache.has(cacheKey)) {
    return registrationDetailsCache.get(cacheKey);
  }

  const pendingResolution = (async () => {
  try {
    const filter = contract.filters.DocumentRegistered(normalizedHash);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 200000);
    const logs = await contract.queryFilter(filter, fromBlock, latestBlock);

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
  })();

  registrationDetailsCache.set(cacheKey, pendingResolution);
  return pendingResolution;
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

function mapRegisteredEvent(log) {
  return {
    hash: log?.args?.[0] || log?.args?.hash || "",
    owner: log?.args?.[1] || log?.args?.owner || "",
    timestamp: Number(log?.args?.[2] || log?.args?.timestamp || 0),
    docType: log?.args?.[3] || log?.args?.docType || "General",
    txHash: log?.transactionHash || "",
    blockNumber: Number(log?.blockNumber || 0),
  };
}

function mapRevokedEvent(log) {
  return {
    hash: log?.args?.[0] || log?.args?.hash || "",
    owner: log?.args?.[1] || log?.args?.owner || "",
    txHash: log?.transactionHash || "",
    blockNumber: Number(log?.blockNumber || 0),
  };
}

export function subscribeToDocumentEvents({
  onRegistered,
  onRevoked,
  pollIntervalMs = DOCUMENT_EVENT_POLL_INTERVAL_MS,
} = {}) {
  validateReadConfig();

  let stopped = false;
  let timerRef = null;
  let isPolling = false;
  let lastBlock = null;

  const scheduleNext = () => {
    if (stopped) {
      return;
    }

    timerRef = setTimeout(() => {
      void poll();
    }, pollIntervalMs);
  };

  const poll = async () => {
    if (stopped || isPolling) {
      return;
    }

    isPolling = true;

    try {
      await withReadProviderFallback(async (provider) => {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const latestBlock = await provider.getBlockNumber();

        const startBlock =
          typeof lastBlock === "number"
            ? Math.max(0, lastBlock + 1)
            : Math.max(0, latestBlock - DOCUMENT_EVENT_BOOTSTRAP_LOOKBACK_BLOCKS);

        if (startBlock > latestBlock) {
          lastBlock = latestBlock;
          return;
        }

        let cursor = startBlock;
        while (cursor <= latestBlock) {
          const batchEnd = Math.min(cursor + DOCUMENT_EVENT_QUERY_STEP - 1, latestBlock);
          const [registered, revoked] = await Promise.all([
            contract.queryFilter(contract.filters.DocumentRegistered(), cursor, batchEnd),
            contract.queryFilter(contract.filters.DocumentRevoked(), cursor, batchEnd),
          ]);

          for (const eventLog of registered) {
            onRegistered?.(mapRegisteredEvent(eventLog));
          }

          for (const eventLog of revoked) {
            onRevoked?.(mapRevokedEvent(eventLog));
          }

          cursor = batchEnd + 1;
        }

        lastBlock = latestBlock;
      });
    } catch (error) {
      logWarn("Document event polling failed.", error);
    } finally {
      isPolling = false;
      scheduleNext();
    }
  };

  void poll();

  return () => {
    stopped = true;
    if (timerRef) {
      clearTimeout(timerRef);
    }
  };
}

export async function waitForTransactionConfirmation(txHash, { timeoutMs = TX_CONFIRMATION_TIMEOUT_MS } = {}) {
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
        if (/reverted on-chain/i.test(error?.message || "")) {
          throw error;
        }
        latestError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  throw new Error(
    extractErrorMessage(latestError, "Transaction confirmation timed out. Please check explorer.")
  );
}

async function waitForSubmittedTransaction(txResponse, { timeoutMs = TX_CONFIRMATION_TIMEOUT_MS } = {}) {
  if (!txResponse?.hash) {
    throw new Error("Transaction hash is missing from wallet response.");
  }

  try {
    const receipt = await txResponse.wait(1, timeoutMs);

    if (!receipt) {
      return waitForTransactionConfirmation(txResponse.hash, { timeoutMs });
    }

    if (receipt.status === 0n || receipt.status === 0) {
      throw new Error("Transaction reverted on-chain.");
    }

    return receipt;
  } catch (error) {
    const replacementHash = error?.replacement?.hash;
    if (replacementHash) {
      if (error?.cancelled) {
        throw new Error("Transaction was cancelled in wallet before confirmation.", {
          cause: error,
        });
      }
      return waitForTransactionConfirmation(replacementHash, { timeoutMs });
    }

    if (/timeout|not mined/i.test(error?.message || "")) {
      return waitForTransactionConfirmation(txResponse.hash, { timeoutMs });
    }

    throw error;
  }
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

  try {
    await contract.registerDocument.staticCall(...args, txOverrides || {});
  } catch (error) {
    throw new Error(
      extractErrorMessage(error, "Document registration would revert on-chain."),
      { cause: error }
    );
  }

  const initialOverrides = await buildRegisterTxOverrides(contract, args, txOverrides);
  let usedOverrides = initialOverrides;

  let txResponse = null;

  try {
    txResponse = await contract.registerDocument(...args, initialOverrides);
    logDebug("Submitted registerDocument transaction.", {
      hash: txResponse.hash,
      gasLimit: initialOverrides?.gasLimit?.toString?.() || initialOverrides?.gasLimit,
    });
  } catch (error) {
    if (!isRetryableGasError(error)) {
      throw new Error(
        extractErrorMessage(error, "Failed to register document on-chain."),
        { cause: error }
      );
    }

    if (typeof onGasRetry === "function") {
      onGasRetry();
    }

    try {
      const retryOverrides = await buildRegisterTxOverrides(contract, args, txOverrides);
      txResponse = await contract.registerDocument(...args, retryOverrides);
      usedOverrides = retryOverrides;
      logDebug("Retry registerDocument transaction submitted.", {
        hash: txResponse.hash,
        gasLimit: retryOverrides?.gasLimit?.toString?.() || retryOverrides?.gasLimit,
      });
    } catch (retryError) {
      throw new Error(
        extractErrorMessage(retryError, "Failed to register document on-chain."),
        { cause: retryError }
      );
    }
  }

  if (!txResponse?.hash) {
    throw new Error("Wallet did not return a transaction hash.");
  }

  const resolvedHash = txResponse.hash;
  return {
    txHash: resolvedHash,
    gasLimit: usedOverrides?.gasLimit || null,
    waitForConfirmation: (options = {}) =>
      waitForSubmittedTransaction(txResponse, {
        timeoutMs: options.timeoutMs || TX_CONFIRMATION_TIMEOUT_MS,
      }),
  };
}
