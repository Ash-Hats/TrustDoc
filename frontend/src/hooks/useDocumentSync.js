import { useEffect, useRef, useCallback, useState } from "react";
import { usePollingSubscription } from "./useRealtimeSubscription";

/**
 * Hook for synchronizing document state across multiple tabs/windows
 * Uses BroadcastChannel API for realtime sync when available
 */
export function useDocumentSync(userId, onSync) {
  const channelRef = useRef(null);
  const onSyncRef = useRef(onSync);
  const syncTimerRef = useRef(null);
  const [isSynced, setIsSynced] = useState(true);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    // Use BroadcastChannel for cross-tab communication
    if (typeof BroadcastChannel !== "undefined" && userId) {
      try {
        channelRef.current = new BroadcastChannel(`trustdoc-docs-${userId}`);

        const handleMessage = (event) => {
          if (event.data.type === "document_sync") {
            setIsSynced(false);
            onSyncRef.current?.(event.data.payload);
            // Re-sync after a short delay
            if (syncTimerRef.current) {
              clearTimeout(syncTimerRef.current);
            }
            syncTimerRef.current = setTimeout(() => setIsSynced(true), 500);
          }
        };

        channelRef.current.addEventListener("message", handleMessage);

        return () => {
          if (channelRef.current) {
            channelRef.current.removeEventListener("message", handleMessage);
            channelRef.current.close();
          }
          if (syncTimerRef.current) {
            clearTimeout(syncTimerRef.current);
            syncTimerRef.current = null;
          }
        };
      } catch (error) {
        console.warn("BroadcastChannel not available:", error);
      }
    }

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [userId]);

  const broadcast = useCallback((data) => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: "document_sync",
        payload: data,
        timestamp: Date.now(),
      });
    }
  }, []);

  return { isSynced, broadcast };
}

/**
 * Hook for handling optimistic updates
 * Allows UI to update immediately while sync happens in background
 */
export function useOptimisticUpdate(initialState) {
  const [state, setState] = useState(initialState);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const update = useCallback(
    async (updateFn, rollbackFn = null) => {
      setIsPending(true);
      setError(null);

      // Save previous state for rollback
      const previousState = state;

      try {
        // Optimistically update UI
        setState((prevState) => updateFn(prevState));

        // Perform async operation
        // This would typically be an API call
        // For now, we just simulate the operation

        return true;
      } catch (err) {
        setError(err);
        // Rollback on error
        setState(previousState);
        rollbackFn?.(previousState);
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [state]
  );

  return { state, setState, update, isPending, error };
}

/**
 * Hook for tracking document changes and syncing with server
 * Debounces sync requests to avoid too many API calls
 */
export function useDocumentChangeTracking(
  documents,
  onSync,
  debounceMs = 1000
) {
  const timeoutRef = useRef(null);
  const previousDocsRef = useRef(documents);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Check if documents have changed
    const hasChanged = JSON.stringify(documents) !==
      JSON.stringify(previousDocsRef.current);

    if (hasChanged) {
      setHasPendingChanges(true);

      // Debounce sync
      timeoutRef.current = setTimeout(() => {
        onSync?.(documents);
        setHasPendingChanges(false);
      }, debounceMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [documents, onSync, debounceMs]);

  useEffect(() => {
    previousDocsRef.current = documents;
  }, [documents]);

  return { hasPendingChanges };
}

/**
 * Hook for document polling with smart cache invalidation
 */
export function useDocumentPolling(
  fetchFn,
  userId,
  options = {}
) {
  const {
    interval = 15000, // 15 seconds
    onSuccess,
    onError,
    enabled = true,
  } = options;

  const cacheRef = useRef(null);
  const [lastFetch, setLastFetch] = useState(0);

  const handleFetch = useCallback(async () => {
    try {
      const data = await fetchFn();

      // Only sync if data has changed
      if (JSON.stringify(data) !== JSON.stringify(cacheRef.current)) {
        cacheRef.current = data;
        onSuccess?.(data);
      }
    } catch (error) {
      console.error("Document polling error:", error);
      onError?.(error);
    }

    setLastFetch(Date.now());
  }, [fetchFn, onSuccess, onError]);

  const { isPolling, startPolling, stopPolling } = usePollingSubscription({
    fetchFn: handleFetch,
    interval,
    enabled,
  });

  return {
    isPolling,
    startPolling,
    stopPolling,
    lastFetch,
  };
}
