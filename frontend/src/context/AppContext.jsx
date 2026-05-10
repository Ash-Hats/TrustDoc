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

const POLL_INTERVAL_MS = 15000;
const REALTIME_REFRESH_DEBOUNCE_MS = 450;

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
  const [realtimeStatus, setRealtimeStatus] = useState("disabled");
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [isSyncRefreshPending, setIsSyncRefreshPending] = useState(false);
  const autoConnectGuard = useRef(false);
  const realtimeRefreshTimerRef = useRef(null);

  useEffect(() => {
    autoConnectGuard.current = false;
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

      setVerificationHistory(nextVerifications);
      setActivity(nextActivity);
      setWalletSessions(sessionRows || []);
      setVerificationHistoryStorage(nextVerifications, scopeKey);
      setActivityStorage(nextActivity, scopeKey);
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
      setWalletSessions([]);
      return [];
    }

    const sessions = await getWalletSessions(session?.accessToken, userId).catch(() => []);
    setWalletSessions(sessions || []);
    return sessions || [];
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

      const previousDocuments = documents;
      setDocuments((current) =>
        current.map((item) =>
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
        )
      );

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

        setLastSyncedAt(Date.now());
        setSyncError("");
        return true;
      } catch (error) {
        setDocuments(previousDocuments);
        setSyncError(error?.message || "Failed to update document access.");
        throw error;
      }
    },
    [documents, remoteEnabled, session, userId]
  );

  const setDisconnectedState = useCallback(() => {
    setWallet({
      ...DEFAULT_WALLET,
      status: "disconnected",
    });
    setDocuments([]);
    setWalletSessions([]);
  }, []);

  const refreshDocuments = useCallback(
    async ({ silent = false } = {}) => {
      if (!wallet.account || wallet.status !== "connected") {
        setDocuments([]);
        return [];
      }

      const linkedWallet = profile?.wallet_address?.toLowerCase() || "";
      if (
        isAuthenticated &&
        linkedWallet &&
        wallet.account.toLowerCase() !== linkedWallet
      ) {
        setDocuments([]);
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

        setDocuments(nextDocuments);
        setLastSyncedAt(Date.now());
        setSyncError("");

        if (remoteEnabled) {
          await upsertDocumentRecords(session?.accessToken, userId, nextDocuments).catch(() => null);
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
            setDocuments(fallbackDocuments);
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
    },
    [
      isAuthenticated,
      profile,
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
      setWallet((previous) => ({ ...previous, isConnecting: true }));

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
        return account;
      } catch (error) {
        const message = error?.message || "Wallet connection failed.";

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
    },
    [
      isAuthenticated,
      linkWallet,
      profile,
      pushActivity,
      refreshWalletSessions,
      refreshDocuments,
      remoteEnabled,
      session?.accessToken,
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
      session?.accessToken,
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
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }

      setIsSyncRefreshPending(true);

      realtimeRefreshTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            await Promise.all([
              refreshDocuments({ silent: true }),
              loadRemoteWorkspaceState(),
            ]);
            setLastSyncedAt(Date.now());
            setSyncError("");
          } catch (error) {
            setSyncError(error?.message || `Failed to sync after ${reason}.`);
          } finally {
            setIsSyncRefreshPending(false);
          }
        })();
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    },
    [loadRemoteWorkspaceState, refreshDocuments]
  );

  const documentsRealtime = useRealtimeSubscription({
    table: "documents",
    event: "*",
    filter: userId ? `user_id=eq.${userId}` : "",
    enabled: remoteEnabled,
    accessToken: session?.accessToken || "",
    onEvent: (payload) => {
      setLastRealtimeEventAt(Date.now());
      scheduleRealtimeRefresh(`documents:${payload?.eventType || "*"}`);
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
      scheduleRealtimeRefresh(`verification:${payload?.eventType || "*"}`);
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
      scheduleRealtimeRefresh(`activity:${payload?.eventType || "*"}`);
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
      scheduleRealtimeRefresh(`wallet:${payload?.eventType || "*"}`);
    },
  });

  useEffect(() => {
    if (!remoteEnabled) {
      setRealtimeStatus("disabled");
      return;
    }

    const statuses = [
      documentsRealtime.status,
      verificationRealtime.status,
      activityRealtime.status,
      walletRealtime.status,
    ].filter(Boolean);

    if (!statuses.length) {
      setRealtimeStatus("connecting");
      return;
    }

    if (statuses.some((item) => item === "CHANNEL_ERROR" || item === "TIMED_OUT")) {
      setRealtimeStatus("error");
      return;
    }

    if (statuses.every((item) => item === "SUBSCRIBED")) {
      setRealtimeStatus("connected");
      return;
    }

    setRealtimeStatus("connecting");
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
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...(localSettings || {}),
      ...(profile?.settings || {}),
    };
    queueMicrotask(() => {
      setSettings(mergedSettings);
      setVerificationHistory(getVerificationHistoryStorage(scopeKey));
      setActivity(getActivityStorage(scopeKey));
      setDocuments([]);
      setLastSyncedAt(0);
      setPendingTransactions([]);
      setWalletSessions([]);
    });

    if (!isAuthenticated) {
      return;
    }

    if (!remoteEnabled) {
      return;
    }

    void loadRemoteWorkspaceState();
  }, [isAuthenticated, loadRemoteWorkspaceState, profile?.settings, remoteEnabled, scopeKey]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (!wallet.account || wallet.status !== "connected") {
      return;
    }

    const timer = setTimeout(() => {
      void refreshDocuments({ silent: true });
    }, 0);

    return () => clearTimeout(timer);
  }, [isAuthenticated, refreshDocuments, userId, wallet.account, wallet.status]);

  useEffect(() => {
    if (autoConnectGuard.current) {
      return;
    }

    autoConnectGuard.current = true;
    const currentSession = getSessionStorage();

    if (!settings.autoConnect || currentSession?.manualDisconnect) {
      return;
    }

    const timer = setTimeout(() => {
      void connectWallet({ requestIfMissing: false, autoSwitch: false, silent: true });
    }, 0);

    return () => clearTimeout(timer);
  }, [connectWallet, settings.autoConnect]);

  useEffect(() => {
    if (!window?.ethereum?.on) {
      return undefined;
    }

    const onChainChanged = async (chainId) => {
      const supported = isAmoyChain(chainId);
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
      } else if (wallet.account) {
        setShowWrongNetworkModal(false);
        pushActivity({
          type: "wallet",
          title: "Network Changed",
          description: "Wallet switched network.",
        });
        if (remoteEnabled) {
          await updateWalletActivity(session?.accessToken, userId, wallet.account).catch(() => null);
        }
        await refreshDocuments({ silent: true });
        await loadRemoteWorkspaceState();
      }
    };

    const onAccountsChanged = async (accounts) => {
      const account = accounts?.[0] || "";

      if (!account) {
        setDisconnectedState();
        return;
      }

      setWallet((previous) => ({
        ...previous,
        account,
        status: previous.isSupportedNetwork ? "connected" : "wrong-network",
      }));
      setSessionStorage(sessionPayload(account, wallet.chainId));
      pushActivity({
        type: "wallet",
        title: "Wallet Account Switched",
        description: shortAddress(account),
      });

      if (remoteEnabled) {
        await updateWalletActivity(session?.accessToken, userId, account).catch(() => null);
        if (isAuthenticated && profile?.wallet_address) {
          const linkedWallet = profile.wallet_address.toLowerCase();
          if (account.toLowerCase() !== linkedWallet) {
            await logSuspiciousActivity(session?.accessToken, userId, {
              activity_type: "wallet_changed_to_unlinked",
              severity: "high",
              description: "Wallet switched to an address not linked to this account.",
              meta: {
                linkedWallet,
                connectedWallet: account.toLowerCase(),
              },
            }).catch(() => null);
          }
        }
      }

      await refreshWalletSessions().catch(() => null);
      await refreshDocuments({ silent: true });
      await loadRemoteWorkspaceState();
    };

    window.ethereum.on("chainChanged", onChainChanged);
    window.ethereum.on("accountsChanged", onAccountsChanged);

    return () => {
      window.ethereum.removeListener?.("chainChanged", onChainChanged);
      window.ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [
    isAuthenticated,
    loadRemoteWorkspaceState,
    profile?.wallet_address,
    pushActivity,
    refreshDocuments,
    refreshWalletSessions,
    remoteEnabled,
    session?.accessToken,
    setDisconnectedState,
    userId,
    wallet.account,
    wallet.chainId,
  ]);

  usePolling(
    () => {
      void refreshDocuments({ silent: true });
    },
    POLL_INTERVAL_MS,
    Boolean(wallet.account && wallet.status === "connected")
  );

  useEffect(() => {
    if (!wallet.account || wallet.status !== "connected") {
      return undefined;
    }

    const unsubscribe = subscribeToDocumentEvents({
      onRegistered: ({ owner, hash }) => {
        if (owner?.toLowerCase() !== wallet.account.toLowerCase()) {
          return;
        }

        pushActivity({
          type: "transaction",
          title: "Document Registered",
          description: sanitizeText(hash || ""),
        });
        void refreshDocuments({ silent: true });
      },
      onRevoked: ({ owner, hash }) => {
        if (owner?.toLowerCase() !== wallet.account.toLowerCase()) {
          return;
        }

        pushActivity({
          type: "transaction",
          title: "Document Revoked",
          description: sanitizeText(hash || ""),
        });
        void refreshDocuments({ silent: true });
      },
    });

    return () => {
      unsubscribe?.();
    };
  }, [wallet.account, wallet.status, pushActivity, refreshDocuments]);

  useEffect(() => {
    if (!remoteEnabled || !wallet.account || wallet.status !== "connected" || !documents.length) {
      return;
    }

    void upsertDocumentRecords(session?.accessToken, userId, documents).catch(() => null);
  }, [documents, remoteEnabled, session?.accessToken, userId, wallet.account, wallet.status]);

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
