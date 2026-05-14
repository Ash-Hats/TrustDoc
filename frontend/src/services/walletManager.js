import {
  AMOY_CHAIN_NAME,
  ensureAmoyNetwork,
  getBrowserProvider,
  getConnectedWallet,
  getWalletChainId,
  getWalletSigner,
  isAmoyChain,
} from "../utils/contract";

const subscribers = new Set();
let attachedEthereum = null;
let accountsChangedHandler = null;
let chainChangedHandler = null;

function getInjectedEthereum() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ethereum || null;
}

function emitAccountsChanged(account, accounts) {
  for (const subscriber of subscribers) {
    if (typeof subscriber.onAccountsChanged !== "function") {
      continue;
    }

    try {
      subscriber.onAccountsChanged({
        account: account || "",
        accounts: Array.isArray(accounts) ? accounts : [],
      });
    } catch (error) {
      console.error("[trustdoc:wallet-manager] accountsChanged callback failed", error);
    }
  }
}

function emitChainChanged(chainId) {
  for (const subscriber of subscribers) {
    if (typeof subscriber.onChainChanged !== "function") {
      continue;
    }

    try {
      subscriber.onChainChanged({
        chainId: chainId || "",
        isSupported: isAmoyChain(chainId),
      });
    } catch (error) {
      console.error("[trustdoc:wallet-manager] chainChanged callback failed", error);
    }
  }
}

function attachWalletListenersIfNeeded() {
  if (attachedEthereum) {
    return;
  }

  const ethereum = getInjectedEthereum();
  if (!ethereum?.on) {
    return;
  }

  accountsChangedHandler = (accounts) => {
    const account = accounts?.[0] || "";
    emitAccountsChanged(account, accounts);
  };

  chainChangedHandler = (chainId) => {
    emitChainChanged(chainId);
  };

  ethereum.on("accountsChanged", accountsChangedHandler);
  ethereum.on("chainChanged", chainChangedHandler);
  attachedEthereum = ethereum;
}

function detachWalletListenersIfUnused() {
  if (subscribers.size > 0 || !attachedEthereum) {
    return;
  }

  attachedEthereum.removeListener?.("accountsChanged", accountsChangedHandler);
  attachedEthereum.removeListener?.("chainChanged", chainChangedHandler);
  attachedEthereum = null;
  accountsChangedHandler = null;
  chainChangedHandler = null;
}

export function subscribeWalletEvents(listener = {}) {
  subscribers.add(listener);
  attachWalletListenersIfNeeded();

  return () => {
    subscribers.delete(listener);
    detachWalletListenersIfUnused();
  };
}

export async function connectWallet({
  requestIfMissing = true,
  autoSwitch = false,
  forcePrompt = false,
} = {}) {
  const account = await getConnectedWallet({ requestIfMissing, forcePrompt });
  if (!account) {
    return {
      account: "",
      chainId: "",
      isSupported: false,
      switched: false,
    };
  }

  const network = await ensureAmoyNetwork({ autoSwitch });

  return {
    account,
    chainId: network.chainId || "",
    isSupported: Boolean(network.isSupported),
    switched: Boolean(network.switched),
  };
}

export async function disconnectWallet() {
  return true;
}

export function getProvider() {
  return getBrowserProvider();
}

export async function getSigner({ requestIfMissing = false, forcePrompt = false } = {}) {
  return getWalletSigner({ requestIfMissing, forcePrompt });
}

export async function getCurrentAddress({ requestIfMissing = false, forcePrompt = false } = {}) {
  return getConnectedWallet({ requestIfMissing, forcePrompt });
}

export async function getCurrentChainId() {
  return getWalletChainId();
}

export async function getWalletSnapshot({
  requestIfMissing = false,
  autoSwitch = false,
  forcePrompt = false,
} = {}) {
  const account = await getConnectedWallet({ requestIfMissing, forcePrompt });
  const chainId = await getWalletChainId().catch(() => "");

  if (!account) {
    return {
      account: "",
      chainId,
      isSupported: isAmoyChain(chainId),
      status: "disconnected",
    };
  }

  if (isAmoyChain(chainId)) {
    return {
      account,
      chainId,
      isSupported: true,
      status: "connected",
    };
  }

  if (!autoSwitch) {
    return {
      account,
      chainId,
      isSupported: false,
      status: "wrong-network",
    };
  }

  const switched = await ensureAmoyNetwork({ autoSwitch: true });
  return {
    account,
    chainId: switched.chainId || chainId,
    isSupported: Boolean(switched.isSupported),
    status: switched.isSupported ? "connected" : "wrong-network",
  };
}

export function getWalletNetworkName(chainId) {
  if (isAmoyChain(chainId)) {
    return AMOY_CHAIN_NAME;
  }

  return "Unsupported network";
}
