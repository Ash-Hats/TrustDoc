/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import {
  AMOY_CHAIN_NAME,
  ensureAmoyNetwork,
  getConnectedWallet,
  getDocumentsByOwner,
  getWalletChainId,
  isAmoyChain,
  subscribeToDocumentEvents,
  waitForTransactionConfirmation,
} from "../utils/contract";
import { shortAddress } from "../utils/format";
import {
  clearSessionStorage,
  getActivityStorage,
  getSessionStorage,
  getSettingsStorage,
  getVerificationHistoryStorage,
  setActivityStorage,
  setSessionStorage,
  setSettingsStorage,
  setVerificationHistoryStorage,
} from "../services/storageService";
import {
  addActivityLog,
  addVerificationLog,
  getDocumentRecordByHash,
  getActivityLogs,
  getWalletSessions,
  getUserDocumentRecords,
  getVerificationLogs,
  isSupabaseConfigured,
  logAuditEvent,
  logSuspiciousActivity,
  replaceDocumentShares,
  updateDocumentPrivacy,
  updateWalletActivity,
  updateProfileSettings,
  upsertDocumentRecords,
} from "../services/supabaseService";
import { sanitizeText } from "../utils/security";
import { usePolling } from "../hooks/usePolling";
import { useRealtimeSubscription } from "../hooks/useRealtimeSubscription";
import { useAuth } from "./AuthContext";

const AppContext = createContext(null);

const DEFAULT_SETTINGS = {
  notifications: true,
  autoConnect: true,
  explorerBaseUrl: "https://amoy.polygonscan.com",
  securityMode: "strict",
};

const DEFAULT_WALLET = {
  account: "",
  chainId: "",
  status: "disconnected",
  isConnecting: false,
  isSupportedNetwork: false,
};

const POLL_INTERVAL_MS = 45000;
const REALTIME_REFRESH_DEBOUNCE_MS = 450;
const AUTO_CONNECT_EFFECT_GUARD_KEY = "__trustdoc_app_autoconnect__";
const AUTO_CONNECT_SCOPE_GUARD_KEY = "__trustdoc_app_autoconnect_scope__";
const MIN_SILENT_REFRESH_GAP_MS = 1200;
const LOCAL_DOCUMENT_SYNC_COOLDOWN_MS = 2500;

function rememberSeenEvent(ref, key, maxSize = 400) {
  if (!ref.current) {
    ref.current = new Set();
  }

  if (ref.current.has(key)) {
    return false;
  }

  ref.current.add(key);

  if (ref.current.size > maxSize) {
    const [first] = ref.current;
    ref.current.delete(first);
  }

  return true;
}

function buildDocumentsFingerprint(documents = []) {
  const normalized = [...documents]
    .map((item) => {
      const metadata = item?.metadata || {};
      return {
        hash: String(item?.hash || "").toLowerCase(),
        owner: String(item?.owner || "").toLowerCase(),
        revoked: Boolean(item?.revoked),
        timestamp: Number(item?.timestamp || 0),
        blockTimestamp: Number(item?.blockTimestamp || 0),
        txHash: String(item?.txHash || "").toLowerCase(),
        cid: String(item?.cid || ""),
        docType: String(item?.docType || "General"),
        issuedBy: String(item?.issuedBy || "Unknown"),
        privacyLevel: String(item?.privacyLevel || "private"),
        description: String(item?.description || ""),
        fileName: String(item?.fileName || ""),
        fileSize: Number(item?.fileSize || 0),
        fileType: String(item?.fileType || ""),
        sharedWithWallets: Array.isArray(item?.sharedWithWallets)
          ? [...item.sharedWithWallets].map((wallet) => String(wallet || "").toLowerCase()).sort()
          : [],
        metaGasUsed: String(metadata.gasUsed || item?.gasUsed || ""),
        metaBlockNumber: Number(metadata.blockNumber ?? item?.blockNumber ?? 0),
      };
    })
    .sort((a, b) => a.hash.localeCompare(b.hash));

  return JSON.stringify(normalized);
}

function sessionPayload(account, chainId) {
  return {
    account,
    chainId,
    manualDisconnect: false,
    connectedAt: Date.now(),
  };
}

function toTimestamp(value) {
  if (!value) {
    return Date.now();
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function mapRemoteVerification(row) {
  return {
    id: row.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: toTimestamp(row.created_at),
    source: row.source || "verify",
    status: row.status || "not-found",
    hash: row.hash || "",
    issuer: row.issuer || "Unknown",
    txHash: row.tx_hash || "",
    confidenceScore: Number(row.confidence_score || 0),
  };
}

function mapRemoteActivity(row) {
  return {
    id: row.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: toTimestamp(row.created_at),
    type: row.type || "info",
    title: row.title || "Activity",
    description: row.description || "",
    meta: row.meta || {},
  };
}

function mapRemoteDocument(row) {
  return {
    id: row.id || "",
    hash: row.hash || "",
    owner: row.wallet_address || "",
    cid: row.cid || null,
    docType: row.doc_type || "General",
    issuedBy: row.issued_by || "Unknown",
    revoked: Boolean(row.is_revoked),
    timestamp: Number(row.timestamp || 0),
    blockTimestamp: Number(row.block_timestamp || 0),
    txHash: row.tx_hash || null,
    gatewayUrl: row.gateway_url || null,
    privacyLevel: row.privacy_level || "private",
    description: row.description || "",
    fileName: row.file_name || "",
    fileSize: Number(row.file_size || 0),
    fileType: row.file_type || "",
    gasUsed: row?.metadata?.gasUsed || null,
    blockNumber: row?.metadata?.blockNumber || null,
    metadata: row.metadata || {},
    sharedWithWallets: Array.isArray(row?.metadata?.sharedWithWallets)
      ? row.metadata.sharedWithWallets
      : [],
    exists: true,
  };
}

function createActivityPayload(scopeUserId, entry) {
  return {
    user_id: scopeUserId,
    type: entry.type || "info",
    title: sanitizeText(entry.title || "Activity", { maxLength: 120 }),
    description: sanitizeText(entry.description || "", { maxLength: 350 }),
    meta: entry.meta || {},
    created_at: new Date(entry.createdAt || Date.now()).toISOString(),
  };
}

function createVerificationPayload(scopeUserId, entry) {
  return {
    user_id: scopeUserId,
    source: entry.source || "verify",
    status: entry.status || "not-found",
    hash: entry.hash || "",
    issuer: sanitizeText(entry.issuer || "Unknown", { maxLength: 140 }),
    tx_hash: entry.txHash || "",
    confidence_score: Number(entry.confidenceScore || 0),
    created_at: new Date(entry.createdAt || Date.now()).toISOString(),
  };
}

function normalizePrivacyLevel(value) {
  const normalized = String(value || "private").toLowerCase();
  if (normalized === "shared" || normalized === "public") {
    return normalized;
  }
  return "private";
}

function normalizeShareWalletList(input) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((wallet) => String(wallet || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }

  return Array.from(
    new Set(
      String(input)
        .split(",")
        .map((wallet) => wallet.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function AppProvider({ children }) {
  const { user, profile, session, isAuthenticated, linkWallet } = useAuth();
  const userId = user?.id || "";
  const scopeKey = userId || "public";
  const remoteEnabled = isSupabaseConfigured() && Boolean(session?.accessToken && userId);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [wallet, setWallet] = useState(DEFAULT_WALLET);
  const [documents, setDocuments] = useState([]);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(0);
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [verificationHistory, setVerificationHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [walletSessions, setWalletSessions] = useState([]);
  const [showWrongNetworkModal, setShowWrongNetworkModal] = useState(false);
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [isSyncRefreshPending, setIsSyncRefreshPending] = useState(false);
  const autoConnectGuard = useRef(false);
  const connectInFlightRef = useRef(null);
  const refreshInFlightRef = useRef(null);
  const lastRefreshRunAtRef = useRef(0);
  const lastLocalDocumentUpsertAtRef = useRef(0);
  const lastUpsertFingerprintRef = useRef("");
  const documentsRef = useRef([]);
  const realtimeRefreshTimerRef = useRef(null);
  const connectWalletRef = useRef(null);
  const refreshDocumentsRef = useRef(null);
  const refreshWalletSessionsRef = useRef(null);
  const loadRemoteWorkspaceStateRef = useRef(null);
  const pushActivityRef = useRef(null);
  const walletRef = useRef(DEFAULT_WALLET);
  const listenerContextRef = useRef({
    isAuthenticated: false,
    linkedWallet: "",
    remoteEnabled: false,
    accessToken: "",
    userId: "",
  });
  const seenDocumentEventsRef = useRef(new Set());
  const verificationFingerprintRef = useRef("");
  const activityFingerprintRef = useRef("");
  const walletSessionsFingerprintRef = useRef("");

  useEffect(() => {
    autoConnectGuard.current = false;
    refreshInFlightRef.current = null;
    lastRefreshRunAtRef.current = 0;
    lastLocalDocumentUpsertAtRef.current = 0;
    lastUpsertFingerprintRef.current = "";
    documentsRef.current = [];
    verificationFingerprintRef.current = "";
    activityFingerprintRef.current = "";
    walletSessionsFingerprintRef.current = "";
    if (typeof window !== "undefined") {
      const previousAutoConnectScope = window[AUTO_CONNECT_SCOPE_GUARD_KEY];
      if (previousAutoConnectScope !== scopeKey) {
        window[AUTO_CONNECT_EFFECT_GUARD_KEY] = false;
        window[AUTO_CONNECT_SCOPE_GUARD_KEY] = scopeKey;
      }
    }
    seenDocumentEventsRef.current = new Set();
  }, [scopeKey]);

  const walletLabel = useMemo(() => {
    if (wallet.isConnecting) {
      return "Connecting...";
    }

    if (wallet.account) {
      return shortAddress(wallet.account);
    }

    return "Connect Wallet";
  }, [wallet.account, wallet.isConnecting]);

  const walletStatusLabel = useMemo(() => {
    if (wallet.status === "wrong-network") {
      return "Wrong Network";
    }

    if (wallet.status === "connected") {
      return "Connected";
    }

    if (wallet.isConnecting) {
      return "Connecting...";
    }

    return "Disconnected";
  }, [wallet.isConnecting, wallet.status]);

  const persistSettings = useCallback(
    async (nextSettings) => {
      setSettingsStorage(nextSettings, scopeKey);

      if (!remoteEnabled) {
        return;
      }

      await updateProfileSettings(session?.accessToken, userId, nextSettings).catch(() => null);
    },
    [remoteEnabled, scopeKey, session, userId]
  );

  const pushActivity = useCallback(
    (entry) => {
      const prepared = {
        id: entry.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: entry.createdAt || Date.now(),
        type: entry.type || "info",
        title: sanitizeText(entry.title || "Activity", { maxLength: 120 }),
        description: sanitizeText(entry.description || "", { maxLength: 350 }),
        meta: entry.meta || {},
      };

      setActivity((previous) => {
        const next = [prepared, ...previous].slice(0, 250);
        setActivityStorage(next, scopeKey);
        return next;
      });

      if (remoteEnabled) {
        void addActivityLog(session?.accessToken, createActivityPayload(userId, prepared)).catch(() => null);
      }
    },
    [remoteEnabled, scopeKey, session, userId]
  );

  const persistVerificationHistory = useCallback(
    (item) => {
      const prepared = {
        id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: item.createdAt || Date.now(),
        source: item.source || "verify",
        status: item.status || "not-found",
        hash: item.hash || "",
        issuer: sanitizeText(item.issuer || "Unknown", { maxLength: 140 }),
        txHash: item.txHash || "",
        confidenceScore: Number(item.confidenceScore || 0),
      };

      setVerificationHistory((previous) => {
        const next = [prepared, ...previous].slice(0, 300);
        setVerificationHistoryStorage(next, scopeKey);
        return next;
      });

      if (remoteEnabled) {
        void addVerificationLog(
          session?.accessToken,
          createVerificationPayload(userId, prepared)
        ).catch(() => null);

        if (["tampered", "revoked", "failed", "not-found"].includes(prepared.status)) {
          void logSuspiciousActivity(session?.accessToken, userId, {
            activity_type: "verification_alert",
            severity: prepared.status === "tampered" ? "high" : "medium",
            description: `Verification returned ${prepared.status}.`,
            meta: {
              hash: prepared.hash,
              issuer: prepared.issuer,
              txHash: prepared.txHash,
              source: prepared.source,
            },
          }).catch(() => null);
        }
      }
    },
    [remoteEnabled, scopeKey, session, userId]
  );

  const loadRemoteWorkspaceState = useCallback(async () => {
    if (!remoteEnabled) {
      return;
    }

    try {
      const [verificationRows, activityRows, sessionRows] = await Promise.all([
        getVerificationLogs(session?.accessToken, userId),
        getActivityLogs(session?.accessToken, userId),
        getWalletSessions(session?.accessToken, userId),
      ]);

      const nextVerifications = verificationRows.map(mapRemoteVerification);
      const nextActivity = activityRows.map(mapRemoteActivity);
      const nextVerificationFingerprint = JSON.stringify(nextVerifications);
      const nextActivityFingerprint = JSON.stringify(nextActivity);
      const nextWalletSessionsFingerprint = JSON.stringify(sessionRows || []);

      if (verificationFingerprintRef.current !== nextVerificationFingerprint) {
        setVerificationHistory(nextVerifications);
        setVerificationHistoryStorage(nextVerifications, scopeKey);
        verificationFingerprintRef.current = nextVerificationFingerprint;
      }

      if (activityFingerprintRef.current !== nextActivityFingerprint) {
        setActivity(nextActivity);
        setActivityStorage(nextActivity, scopeKey);
        activityFingerprintRef.current = nextActivityFingerprint;
      }

      if (walletSessionsFingerprintRef.current !== nextWalletSessionsFingerprint) {
        setWalletSessions(sessionRows || []);
        walletSessionsFingerprintRef.current = nextWalletSessionsFingerprint;
      }

      setSyncError("");
    } catch (error) {
      setSyncError(error?.message || "Failed to sync realtime workspace data.");
    }
  }, [remoteEnabled, scopeKey, session, userId]);

  const updateSettings = useCallback(
    async (patch) => {
      const next = {
        ...settings,
        ...patch,
      };
      setSettings(next);
      await persistSettings(next);
    },
    [persistSettings, settings]
  );

  const refreshWalletSessions = useCallback(async () => {
    if (!remoteEnabled) {
      if (walletSessionsFingerprintRef.current !== "[]") {
        setWalletSessions([]);
        walletSessionsFingerprintRef.current = "[]";
      }
      return [];
    }

    const sessions = await getWalletSessions(session?.accessToken, userId).catch(() => []);
    const normalizedSessions = sessions || [];
    const nextFingerprint = JSON.stringify(normalizedSessions);
    if (walletSessionsFingerprintRef.current !== nextFingerprint) {
      setWalletSessions(normalizedSessions);
      walletSessionsFingerprintRef.current = nextFingerprint;
    }
    return normalizedSessions;
  }, [remoteEnabled, session, userId]);

  const updateDocumentAccess = useCallback(
    async ({
      hash,
      privacyLevel,
      sharedWithWallets = [],
      description = "",
      fileName = "",
      fileSize = 0,
      fileType = "",
    }) => {
      if (!hash) {
        throw new Error("Document hash is required.");
      }

      const normalizedHash = hash.toLowerCase();
      const nextPrivacyLevel = normalizePrivacyLevel(privacyLevel);
      const normalizedShares = normalizeShareWalletList(sharedWithWallets);
      const effectiveShares = nextPrivacyLevel === "shared" ? normalizedShares : [];
      const invalidWallet = effectiveShares.find(
        (walletAddress) => !/^0x[a-f0-9]{40}$/i.test(walletAddress)
      );

      if (invalidWallet) {
        throw new Error(`Invalid shared wallet address: ${invalidWallet}`);
      }

      if (nextPrivacyLevel === "shared" && !normalizedShares.length) {
        throw new Error("Shared privacy mode requires at least one wallet address.");
      }

      const previousDocuments = documentsRef.current;
      const optimisticDocuments = previousDocuments.map((item) =>
        item.hash?.toLowerCase() === normalizedHash
          ? {
              ...item,
              privacyLevel: nextPrivacyLevel,
              description,
              fileName,
              fileSize: Number(fileSize || 0),
              fileType,
              sharedWithWallets: effectiveShares,
            }
          : item
      );

      setDocuments(optimisticDocuments);
      documentsRef.current = optimisticDocuments;

      if (!remoteEnabled) {
        return true;
      }

      try {
        const remoteDoc = await getDocumentRecordByHash(session?.accessToken, userId, hash);

        if (!remoteDoc?.id) {
          throw new Error("Document record not found in database yet. Please retry in a moment.");
        }

        await updateDocumentPrivacy(
          session?.accessToken,
          remoteDoc.id,
          userId,
          nextPrivacyLevel
        );
        await replaceDocumentShares(session?.accessToken, userId, remoteDoc.id, effectiveShares);
        await upsertDocumentRecords(session?.accessToken, userId, [
          {
            ...mapRemoteDocument(remoteDoc),
            hash,
            privacyLevel: nextPrivacyLevel,
            description,
            fileName,
            fileSize: Number(fileSize || 0),
            fileType,
            sharedWithWallets: effectiveShares,
            metadata: {
              ...(remoteDoc.metadata || {}),
              sharedWithWallets: effectiveShares,
            },
          },
        ]);

        await logAuditEvent(session?.accessToken, userId, {
          action: "document_access_updated",
          resource_type: "document",
          resource_id: hash,
          changes: {
            privacyLevel: nextPrivacyLevel,
            sharedWithWallets: effectiveShares,
          },
          status: "success",
        }).catch(() => null);

        lastUpsertFingerprintRef.current = buildDocumentsFingerprint(optimisticDocuments);
        lastLocalDocumentUpsertAtRef.current = Date.now();
        setLastSyncedAt(Date.now());
        setSyncError("");
        return true;
      } catch (error) {
        setDocuments(previousDocuments);
        documentsRef.current = previousDocuments;
        setSyncError(error?.message || "Failed to update document access.");
        throw error;
      }
    },
    [remoteEnabled, session, userId]
  );

  const setDisconnectedState = useCallback(() => {
    setWallet({
      ...DEFAULT_WALLET,
      status: "disconnected",
    });
    setDocuments([]);
    documentsRef.current = [];
    lastUpsertFingerprintRef.current = "";
    lastLocalDocumentUpsertAtRef.current = 0;
    lastRefreshRunAtRef.current = 0;
    refreshInFlightRef.current = null;
    walletSessionsFingerprintRef.current = "[]";
    setWalletSessions([]);
  }, []);

  const refreshDocuments = useCallback(
    async ({ silent = false } = {}) => {
      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

      const now = Date.now();
      if (silent && now - lastRefreshRunAtRef.current < MIN_SILENT_REFRESH_GAP_MS) {
        return documentsRef.current;
      }

      const refreshPromise = (async () => {
        if (!wallet.account || wallet.status !== "connected") {
          if (documentsRef.current.length) {
            setDocuments([]);
            documentsRef.current = [];
          }
          return [];
        }

        const linkedWallet = profile?.wallet_address?.toLowerCase() || "";
        if (
          isAuthenticated &&
          linkedWallet &&
          wallet.account.toLowerCase() !== linkedWallet
        ) {
          if (documentsRef.current.length) {
            setDocuments([]);
            documentsRef.current = [];
          }
          if (remoteEnabled) {
            void logSuspiciousActivity(session?.accessToken, userId, {
              activity_type: "wallet_mismatch",
              severity: "high",
              description: "Connected wallet does not match linked profile wallet.",
              meta: {
                connectedWallet: wallet.account.toLowerCase(),
                linkedWallet,
              },
            }).catch(() => null);
          }
          if (!silent && settings.notifications) {
            toast.error("Connected wallet is not linked to the current account.");
          }
          return [];
        }

        if (!silent) {
          setIsDocumentsLoading(true);
        }

        try {
          const chainDocs = await getDocumentsByOwner(wallet.account);
          let nextDocuments = chainDocs;

          if (remoteEnabled) {
            const remoteRows = await getUserDocumentRecords(session?.accessToken, userId).catch(() => []);
            const remoteByHash = new Map(
              remoteRows
                .map(mapRemoteDocument)
                .map((item) => [item.hash?.toLowerCase(), item])
            );

            nextDocuments = chainDocs.map((item) => {
              const existing = remoteByHash.get(item.hash?.toLowerCase());
              return {
                ...item,
                id: existing?.id || item.id || "",
                privacyLevel: normalizePrivacyLevel(existing?.privacyLevel || item.privacyLevel),
                description: existing?.description || item.description || "",
                fileName: existing?.fileName || item.fileName || "",
                fileSize: Number(existing?.fileSize || item.fileSize || 0),
                fileType: existing?.fileType || item.fileType || "",
                sharedWithWallets: Array.isArray(existing?.sharedWithWallets)
                  ? existing.sharedWithWallets
                  : [],
                metadata: {
                  ...(existing?.metadata || {}),
                  ...(item.metadata || {}),
                },
              };
            });
          }

          const previousFingerprint = buildDocumentsFingerprint(documentsRef.current);
          const nextFingerprint = buildDocumentsFingerprint(nextDocuments);

          if (previousFingerprint !== nextFingerprint) {
            setDocuments(nextDocuments);
            documentsRef.current = nextDocuments;
          }

          setLastSyncedAt(Date.now());
          setSyncError("");

          if (remoteEnabled) {
            const shouldUpsert = lastUpsertFingerprintRef.current !== nextFingerprint;
            if (shouldUpsert) {
              await upsertDocumentRecords(session?.accessToken, userId, nextDocuments).catch(() => null);
              lastUpsertFingerprintRef.current = nextFingerprint;
              lastLocalDocumentUpsertAtRef.current = Date.now();
            }

            await updateWalletActivity(session?.accessToken, userId, wallet.account).catch(() => null);
          }

          if (!silent && settings.notifications) {
            toast.success("Documents refreshed.");
          }

          return nextDocuments;
        } catch (error) {
          if (remoteEnabled) {
            try {
              const fallbackRows = await getUserDocumentRecords(session?.accessToken, userId);
              const fallbackDocuments = fallbackRows.map(mapRemoteDocument);
              const fallbackFingerprint = buildDocumentsFingerprint(fallbackDocuments);

              if (buildDocumentsFingerprint(documentsRef.current) !== fallbackFingerprint) {
                setDocuments(fallbackDocuments);
                documentsRef.current = fallbackDocuments;
              }

              lastUpsertFingerprintRef.current = fallbackFingerprint;
              setLastSyncedAt(Date.now());
              setSyncError("");
              return fallbackDocuments;
            } catch {
              // Ignore fallback failure and continue with blockchain error handling.
            }
          }

          const message = error?.message || "Failed to refresh documents.";
          setSyncError(message);
          if (!silent && settings.notifications) {
            toast.error(message);
          }

          pushActivity({
            type: "error",
            title: "Document Sync Failed",
            description: message,
          });

          return [];
        } finally {
          if (!silent) {
            setIsDocumentsLoading(false);
          }
        }
      })();

      refreshInFlightRef.current = refreshPromise.finally(() => {
        refreshInFlightRef.current = null;
        lastRefreshRunAtRef.current = Date.now();
      });

      return refreshInFlightRef.current;
    },
    [
      isAuthenticated,
      profile?.wallet_address,
      pushActivity,
      remoteEnabled,
      session,
      settings.notifications,
      userId,
      wallet.account,
      wallet.status,
    ]
  );

  const connectWallet = useCallback(
    async ({ requestIfMissing = true, autoSwitch = true, silent = false } = {}) => {
      if (connectInFlightRef.current) {
        return connectInFlightRef.current;
      }

      const connectPromise = (async () => {
        setWallet((previous) => ({ ...previous, isConnecting: true }));
        console.debug("[trustdoc:wallet] connectWallet start", {
          requestIfMissing,
          autoSwitch,
          silent,
        });

        try {
          const account = await getConnectedWallet({ requestIfMissing });

          if (!account) {
            setDisconnectedState();
            if (!silent && settings.notifications) {
              toast.error("No wallet account available.");
            }
            return "";
          }

          const networkResult = await ensureAmoyNetwork({ autoSwitch });
          const supported = Boolean(networkResult.isSupported);

          setWallet({
            account,
            chainId: networkResult.chainId,
            status: supported ? "connected" : "wrong-network",
            isConnecting: false,
            isSupportedNetwork: supported,
          });

          setSessionStorage(sessionPayload(account, networkResult.chainId));
          seenDocumentEventsRef.current = new Set();
          lastUpsertFingerprintRef.current = "";
          lastLocalDocumentUpsertAtRef.current = 0;

          if (!supported) {
            setShowWrongNetworkModal(true);
            if (remoteEnabled) {
              await logSuspiciousActivity(session?.accessToken, userId, {
                activity_type: "wrong_network_attempt",
                severity: "medium",
                description: "Wallet connected on unsupported chain.",
                meta: {
                  chainId: networkResult.chainId,
                  account: account.toLowerCase(),
                },
              }).catch(() => null);
            }
            if (!silent && settings.notifications) {
              toast.error(`Switch your wallet to ${AMOY_CHAIN_NAME}.`);
            }
            return account;
          }

          if (!silent && settings.notifications) {
            toast.success("Wallet connected.");
          }

          pushActivity({
            type: "wallet",
            title: "Wallet Connected",
            description: shortAddress(account),
          });

          if (isAuthenticated && !profile?.wallet_address) {
            await linkWallet(account).catch(() => null);
          }

          if (remoteEnabled) {
            await logAuditEvent(session?.accessToken, userId, {
              action: "wallet_connected",
              resource_type: "wallet",
              resource_id: account.toLowerCase(),
              status: "success",
            }).catch(() => null);
            await refreshWalletSessions().catch(() => null);
          }

          await refreshDocuments({ silent: true });
          console.debug("[trustdoc:wallet] connectWallet success", { account });
          return account;
        } catch (error) {
          const message = error?.message || "Wallet connection failed.";
          console.error("[trustdoc:wallet] connectWallet error", error);

          setDisconnectedState();

          if (!silent && settings.notifications) {
            toast.error(message);
          }

          pushActivity({
            type: "error",
            title: "Wallet Error",
            description: message,
          });

          return "";
        } finally {
          setWallet((previous) => ({ ...previous, isConnecting: false }));
        }
      })();

      connectInFlightRef.current = connectPromise.finally(() => {
        connectInFlightRef.current = null;
      });

      return connectInFlightRef.current;
    },
    [
      isAuthenticated,
      linkWallet,
      profile?.wallet_address,
      pushActivity,
      refreshWalletSessions,
      refreshDocuments,
      remoteEnabled,
      session,
      setDisconnectedState,
      settings.notifications,
      userId,
    ]
  );

  const disconnectWallet = useCallback(() => {
    const activeAccount = wallet.account;
    clearSessionStorage();
    setSessionStorage({
      account: "",
      chainId: "",
      manualDisconnect: true,
      connectedAt: 0,
    });
    setDisconnectedState();
    pushActivity({
      type: "wallet",
      title: "Wallet Disconnected",
      description: "Session cleared locally.",
    });

    if (remoteEnabled && session?.accessToken && activeAccount) {
      void logAuditEvent(session?.accessToken, userId, {
        action: "wallet_disconnected",
        resource_type: "wallet",
        resource_id: activeAccount.toLowerCase(),
        status: "success",
      }).catch(() => null);
    }

    if (settings.notifications) {
      toast.success("Wallet disconnected.");
    }
  }, [
    pushActivity,
    remoteEnabled,
    session,
    setDisconnectedState,
    settings.notifications,
    userId,
    wallet.account,
  ]);

  const trackPendingTransaction = useCallback(
    (tx) => {
      const normalized = {
        id: tx.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        txHash: tx.txHash,
        type: tx.type || "register",
        status: "pending",
        createdAt: Date.now(),
        meta: tx.meta || {},
      };

      setPendingTransactions((previous) => [normalized, ...previous].slice(0, 150));
      pushActivity({
        type: "transaction",
        title: "Pending Transaction",
        description: sanitizeText(tx.txHash || ""),
      });

      return normalized.id;
    },
    [pushActivity]
  );

  const resolvePendingTransaction = useCallback(
    async (txHash, { successMessage = "Transaction confirmed." } = {}) => {
      try {
        const receipt = await waitForTransactionConfirmation(txHash);
        setPendingTransactions((previous) =>
          previous.map((item) =>
            item.txHash === txHash
              ? { ...item, status: "confirmed", confirmedAt: Date.now(), receipt }
              : item
          )
        );

        if (settings.notifications) {
          toast.success(successMessage);
        }

        pushActivity({
          type: "transaction",
          title: "Transaction Confirmed",
          description: sanitizeText(txHash),
        });

        if (remoteEnabled && wallet.account) {
          await updateWalletActivity(session?.accessToken, userId, wallet.account).catch(() => null);
        }

        await refreshDocuments({ silent: true });
        return receipt;
      } catch (error) {
        const message = error?.message || "Transaction confirmation failed.";
        setPendingTransactions((previous) =>
          previous.map((item) =>
            item.txHash === txHash ? { ...item, status: "failed", error: message } : item
          )
        );

        if (settings.notifications) {
          toast.error(message);
        }

        pushActivity({
          type: "error",
          title: "Transaction Failed",
          description: message,
        });
        throw error;
      }
    },
    [
      pushActivity,
      refreshDocuments,
      remoteEnabled,
      session,
      settings.notifications,
      userId,
      wallet.account,
    ]
  );

  const addVerificationRecord = useCallback(
    (record) => {
      persistVerificationHistory(record);
    },
    [persistVerificationHistory]
  );

  const scheduleRealtimeRefresh = useCallback(
    (reason = "external-change") => {
      const reasonType = String(reason).split(":")[0];
      if (
        reasonType === "documents" &&
        Date.now() - lastLocalDocumentUpsertAtRef.current < LOCAL_DOCUMENT_SYNC_COOLDOWN_MS
      ) {
        return;
      }

      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }

      setIsSyncRefreshPending((previous) => (previous ? previous : true));

      realtimeRefreshTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const tasks = [loadRemoteWorkspaceStateRef.current?.()];

            if (reasonType === "documents") {
              tasks.push(refreshDocumentsRef.current?.({ silent: true }));
            } else if (reasonType === "wallet") {
              const walletRefreshTask = refreshWalletSessionsRef.current?.();
              if (walletRefreshTask) {
                tasks.push(walletRefreshTask.catch(() => null));
              }
            }

            await Promise.all(tasks.filter(Boolean));
            setLastSyncedAt(Date.now());
            setSyncError("");
          } catch (error) {
            setSyncError(error?.message || `Failed to sync after ${reason}.`);
          } finally {
            setIsSyncRefreshPending((previous) => (previous ? false : previous));
          }
        })();
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    },
    []
  );

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    listenerContextRef.current = {
      isAuthenticated,
      linkedWallet: profile?.wallet_address?.toLowerCase() || "",
      remoteEnabled,
      accessToken: session?.accessToken || "",
      userId,
    };
  }, [isAuthenticated, profile?.wallet_address, remoteEnabled, session?.accessToken, userId]);

  useEffect(() => {
    connectWalletRef.current = connectWallet;
  }, [connectWallet]);

  useEffect(() => {
    refreshDocumentsRef.current = refreshDocuments;
  }, [refreshDocuments]);

  useEffect(() => {
    refreshWalletSessionsRef.current = refreshWalletSessions;
  }, [refreshWalletSessions]);

  useEffect(() => {
    loadRemoteWorkspaceStateRef.current = loadRemoteWorkspaceState;
  }, [loadRemoteWorkspaceState]);

  useEffect(() => {
    pushActivityRef.current = pushActivity;
  }, [pushActivity]);

  const documentsRealtime = useRealtimeSubscription({
    table: "documents",
    event: "*",
    filter: userId ? `user_id=eq.${userId}` : "",
    enabled: remoteEnabled,
    accessToken: session?.accessToken || "",
    onEvent: (payload) => {
      setLastRealtimeEventAt(Date.now());
      scheduleRealtimeRefresh(`documents:${payload?.eventType || payload?.type || "*"}`);
    },
  });

  const verificationRealtime = useRealtimeSubscription({
    table: "verification_history",
    event: "*",
    filter: userId ? `user_id=eq.${userId}` : "",
    enabled: remoteEnabled,
    accessToken: session?.accessToken || "",
    onEvent: (payload) => {
      setLastRealtimeEventAt(Date.now());
      scheduleRealtimeRefresh(`verification:${payload?.eventType || payload?.type || "*"}`);
    },
  });

  const activityRealtime = useRealtimeSubscription({
    table: "activity_logs",
    event: "*",
    filter: userId ? `user_id=eq.${userId}` : "",
    enabled: remoteEnabled,
    accessToken: session?.accessToken || "",
    onEvent: (payload) => {
      setLastRealtimeEventAt(Date.now());
      scheduleRealtimeRefresh(`activity:${payload?.eventType || payload?.type || "*"}`);
    },
  });

  const walletRealtime = useRealtimeSubscription({
    table: "wallet_sessions",
    event: "*",
    filter: userId ? `user_id=eq.${userId}` : "",
    enabled: remoteEnabled,
    accessToken: session?.accessToken || "",
    onEvent: (payload) => {
      setLastRealtimeEventAt(Date.now());
      scheduleRealtimeRefresh(`wallet:${payload?.eventType || payload?.type || "*"}`);
    },
  });

  const realtimeStatus = useMemo(() => {
    if (!remoteEnabled) {
      return "disabled";
    }

    const statuses = [
      documentsRealtime.status,
      verificationRealtime.status,
      activityRealtime.status,
      walletRealtime.status,
    ].filter(Boolean);

    if (!statuses.length) {
      return "connecting";
    }

    if (statuses.some((item) => item === "CHANNEL_ERROR" || item === "TIMED_OUT")) {
      return "error";
    }

    if (statuses.every((item) => item === "SUBSCRIBED")) {
      return "connected";
    }

    return "connecting";
  }, [
    activityRealtime.status,
    documentsRealtime.status,
    remoteEnabled,
    verificationRealtime.status,
    walletRealtime.status,
  ]);

  useEffect(() => {
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = "dark";
      document.documentElement.dataset.accent = "violet";
    }
  }, []);

  useEffect(() => {
    const localSettings = getSettingsStorage(scopeKey);
    const storedVerifications = getVerificationHistoryStorage(scopeKey);
    const storedActivity = getActivityStorage(scopeKey);
    setSettings({
      ...DEFAULT_SETTINGS,
      ...(localSettings || {}),
      ...(profile?.settings || {}),
    });
    setVerificationHistory(storedVerifications);
    setActivity(storedActivity);
    verificationFingerprintRef.current = JSON.stringify(storedVerifications);
    activityFingerprintRef.current = JSON.stringify(storedActivity);
    setDocuments([]);
    documentsRef.current = [];
    setLastSyncedAt(0);
    setPendingTransactions([]);
    setWalletSessions([]);
    walletSessionsFingerprintRef.current = "[]";
    setSyncError("");
    lastUpsertFingerprintRef.current = "";
    lastLocalDocumentUpsertAtRef.current = 0;
    lastRefreshRunAtRef.current = 0;
  }, [scopeKey]);

  useEffect(() => {
    if (!profile?.settings) {
      return;
    }

    setSettings((current) => ({
      ...DEFAULT_SETTINGS,
      ...current,
      ...profile.settings,
    }));
  }, [profile?.settings]);

  useEffect(() => {
    if (!isAuthenticated || !remoteEnabled) {
      return;
    }

    const timer = setTimeout(() => {
      void loadRemoteWorkspaceStateRef.current?.();
    }, 0);

    return () => clearTimeout(timer);
  }, [isAuthenticated, remoteEnabled, scopeKey]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (!wallet.account || wallet.status !== "connected") {
      return;
    }

    const timer = setTimeout(() => {
      void refreshDocumentsRef.current?.({ silent: true });
    }, 0);

    return () => clearTimeout(timer);
  }, [isAuthenticated, userId, wallet.account, wallet.status]);

  useEffect(() => {
    const currentSession = getSessionStorage();
    if (!settings.autoConnect || currentSession?.manualDisconnect) {
      return;
    }

    const browserWindow = typeof window === "undefined" ? null : window;
    if (autoConnectGuard.current || browserWindow?.[AUTO_CONNECT_EFFECT_GUARD_KEY]) {
      return;
    }

    autoConnectGuard.current = true;
    if (browserWindow) {
      browserWindow[AUTO_CONNECT_EFFECT_GUARD_KEY] = true;
    }

    const timer = setTimeout(() => {
      void connectWalletRef.current?.({
        requestIfMissing: false,
        autoSwitch: false,
        silent: true,
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [scopeKey, settings.autoConnect]);

  useEffect(() => {
    const browserWindow = typeof window === "undefined" ? null : window;
    const ethereum = browserWindow?.ethereum;

    if (!ethereum?.on) {
      return undefined;
    }

    const onChainChanged = async (chainId) => {
      try {
        const supported = isAmoyChain(chainId);
        const activeAccount = walletRef.current.account;

        setWallet((previous) => {
          return {
            ...previous,
            chainId,
            status: previous.account ? (supported ? "connected" : "wrong-network") : "disconnected",
            isSupportedNetwork: supported,
          };
        });

        if (!supported) {
          setShowWrongNetworkModal(true);
          return;
        }

        setShowWrongNetworkModal(false);

        if (!activeAccount) {
          return;
        }

        pushActivityRef.current?.({
          type: "wallet",
          title: "Network Changed",
          description: "Wallet switched network.",
        });

        const runtime = listenerContextRef.current;
        if (runtime.remoteEnabled && runtime.accessToken && runtime.userId) {
          await updateWalletActivity(runtime.accessToken, runtime.userId, activeAccount).catch(() => null);
        }

        await refreshDocumentsRef.current?.({ silent: true });
        await loadRemoteWorkspaceStateRef.current?.();
      } catch (error) {
        console.error("[trustdoc:wallet] chainChanged handler failed", error);
      }
    };

    const onAccountsChanged = async (accounts) => {
      try {
        const account = accounts?.[0] || "";

        if (!account) {
          setDisconnectedState();
          return;
        }

        let chainId = walletRef.current.chainId;
        try {
          chainId = await getWalletChainId();
        } catch {
          // Use latest known chain id if wallet RPC chain check fails.
        }

        const supported = isAmoyChain(chainId);
        setWallet((previous) => ({
          ...previous,
          account,
          chainId,
          status: supported ? "connected" : "wrong-network",
          isSupportedNetwork: supported,
        }));

        setSessionStorage(sessionPayload(account, chainId));
        setShowWrongNetworkModal(!supported);
        seenDocumentEventsRef.current = new Set();
        lastUpsertFingerprintRef.current = "";
        lastLocalDocumentUpsertAtRef.current = 0;

        pushActivityRef.current?.({
          type: "wallet",
          title: "Wallet Account Switched",
          description: shortAddress(account),
        });

        const runtime = listenerContextRef.current;
        if (runtime.remoteEnabled && runtime.accessToken && runtime.userId) {
          await updateWalletActivity(runtime.accessToken, runtime.userId, account).catch(() => null);

          if (runtime.isAuthenticated && runtime.linkedWallet) {
            if (account.toLowerCase() !== runtime.linkedWallet) {
              await logSuspiciousActivity(runtime.accessToken, runtime.userId, {
                activity_type: "wallet_changed_to_unlinked",
                severity: "high",
                description: "Wallet switched to an address not linked to this account.",
                meta: {
                  linkedWallet: runtime.linkedWallet,
                  connectedWallet: account.toLowerCase(),
                },
              }).catch(() => null);
            }
          }
        }

        await refreshWalletSessionsRef.current?.().catch(() => null);
        await refreshDocumentsRef.current?.({ silent: true });
        await loadRemoteWorkspaceStateRef.current?.();
      } catch (error) {
        console.error("[trustdoc:wallet] accountsChanged handler failed", error);
      }
    };

    ethereum.on("chainChanged", onChainChanged);
    ethereum.on("accountsChanged", onAccountsChanged);

    return () => {
      ethereum.removeListener?.("chainChanged", onChainChanged);
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [setDisconnectedState]);

  usePolling(
    () => {
      void refreshDocumentsRef.current?.({ silent: true });
    },
    POLL_INTERVAL_MS,
    Boolean(wallet.account && wallet.status === "connected")
  );

  useEffect(() => {
    if (!wallet.account || wallet.status !== "connected") {
      return undefined;
    }

    const accountLower = wallet.account.toLowerCase();
    const unsubscribe = subscribeToDocumentEvents({
      onRegistered: ({ owner, hash, txHash }) => {
        if (owner?.toLowerCase() !== accountLower) {
          return;
        }

        const eventKey = `registered:${txHash || hash || ""}`;
        if (!rememberSeenEvent(seenDocumentEventsRef, eventKey)) {
          return;
        }

        pushActivityRef.current?.({
          type: "transaction",
          title: "Document Registered",
          description: sanitizeText(hash || ""),
        });
        void refreshDocumentsRef.current?.({ silent: true });
      },
      onRevoked: ({ owner, hash, txHash }) => {
        if (owner?.toLowerCase() !== accountLower) {
          return;
        }

        const eventKey = `revoked:${txHash || hash || ""}`;
        if (!rememberSeenEvent(seenDocumentEventsRef, eventKey)) {
          return;
        }

        pushActivityRef.current?.({
          type: "transaction",
          title: "Document Revoked",
          description: sanitizeText(hash || ""),
        });
        void refreshDocumentsRef.current?.({ silent: true });
      },
    });

    return () => {
      unsubscribe?.();
    };
  }, [wallet.account, wallet.status]);

  const walletVerification = useMemo(() => {
    if (!wallet.account) {
      return {
        status: "disconnected",
        label: "Disconnected",
        details: "No wallet connected.",
      };
    }

    const linkedWallet = profile?.wallet_address?.toLowerCase() || "";
    const sessionRecord = walletSessions.find(
      (entry) => entry.wallet_address?.toLowerCase() === wallet.account.toLowerCase()
    );

    if (wallet.status === "wrong-network") {
      return {
        status: "wrong-network",
        label: "Wrong Network",
        details: `Switch wallet to ${AMOY_CHAIN_NAME}.`,
      };
    }

    if (sessionRecord?.verified) {
      return {
        status: "verified",
        label: "Verified",
        details: "Wallet signature verified and session recorded.",
      };
    }

    if (linkedWallet && linkedWallet === wallet.account.toLowerCase()) {
      return {
        status: "linked",
        label: "Linked",
        details: "Wallet is linked to your profile account.",
      };
    }

    return {
      status: "unlinked",
      label: "Unlinked",
      details: "Connected wallet is not linked to your profile.",
    };
  }, [profile?.wallet_address, wallet.account, wallet.status, walletSessions]);

  const syncState = useMemo(() => {
    return {
      realtimeStatus,
      realtimeError:
        documentsRealtime.error ||
        verificationRealtime.error ||
        activityRealtime.error ||
        walletRealtime.error ||
        syncError,
      lastSyncedAt,
      lastRealtimeEventAt,
      isCrossTabSynced: true,
      isPendingRefresh: isSyncRefreshPending,
      isStale: false,
    };
  }, [
    activityRealtime.error,
    documentsRealtime.error,
    isSyncRefreshPending,
    lastRealtimeEventAt,
    lastSyncedAt,
    realtimeStatus,
    syncError,
    verificationRealtime.error,
    walletRealtime.error,
  ]);

  const contextValue = useMemo(
    () => ({
      settings,
      wallet,
      walletLabel,
      walletStatusLabel,
      documents,
      isDocumentsLoading,
      lastSyncedAt,
      pendingTransactions,
      verificationHistory,
      activity,
      walletSessions,
      walletVerification,
      syncState,
      showWrongNetworkModal,
      setShowWrongNetworkModal,
      connectWallet,
      disconnectWallet,
      updateSettings,
      updateDocumentAccess,
      refreshDocuments,
      refreshWalletSessions,
      trackPendingTransaction,
      resolvePendingTransaction,
      addVerificationRecord,
      pushActivity,
      ensureSupportedNetwork: () => ensureAmoyNetwork({ autoSwitch: true }),
      syncChainId: getWalletChainId,
    }),
    [
      settings,
      wallet,
      walletLabel,
      walletStatusLabel,
      documents,
      isDocumentsLoading,
      lastSyncedAt,
      pendingTransactions,
      verificationHistory,
      activity,
      walletSessions,
      walletVerification,
      syncState,
      showWrongNetworkModal,
      connectWallet,
      disconnectWallet,
      updateSettings,
      updateDocumentAccess,
      refreshDocuments,
      refreshWalletSessions,
      trackPendingTransaction,
      resolvePendingTransaction,
      addVerificationRecord,
      pushActivity,
    ]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useAppContext must be used inside <AppProvider />");
  }

  return context;
}
