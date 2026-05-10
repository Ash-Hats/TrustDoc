import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRealtimeClient, isRealtimeClientAvailable, setRealtimeAuthToken } from "../services/supabaseRealtimeClient";

function buildChannelName(table, filter = "", channelName = "") {
  if (channelName) {
    return channelName;
  }

  const base = `trustdoc-${table || "table"}`;
  if (!filter) {
    return base;
  }

  const safeFilter = filter.replace(/[^a-zA-Z0-9._=-]/g, "_").slice(0, 80);
  return `${base}-${safeFilter}`;
}

export function useRealtimeSubscription(config) {
  const {
    table,
    event = "*",
    onEvent,
    filter,
    enabled = true,
    schema = "public",
    accessToken = "",
    channelName = "",
  } = config;

  const callbackRef = useRef(onEvent);
  const channelRef = useRef(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("idle");
  const [lastEventAt, setLastEventAt] = useState(0);
  const [error, setError] = useState("");

  const isActive = Boolean(enabled && table && typeof onEvent === "function" && isRealtimeClientAvailable());
  const resolvedChannelName = useMemo(
    () => buildChannelName(table, filter, channelName),
    [channelName, filter, table]
  );

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const unsubscribe = useCallback(async () => {
    const client = getRealtimeClient();
    const channel = channelRef.current;

    if (!client || !channel) {
      return;
    }

    channelRef.current = null;
    await client.removeChannel(channel).catch(() => null);
  }, []);

  useEffect(() => {
    if (!isActive) {
      setStatus("disabled");
      setError("");
      void unsubscribe();
      return undefined;
    }

    const client = getRealtimeClient();

    if (!client) {
      setStatus("unavailable");
      setError("Supabase realtime client is unavailable.");
      return undefined;
    }

    setError("");
    setStatus("connecting");
    setRealtimeAuthToken(accessToken || "");

    const channel = client
      .channel(resolvedChannelName)
      .on(
        "postgres_changes",
        {
          event,
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          if (!mountedRef.current) {
            return;
          }

          setLastEventAt(Date.now());
          callbackRef.current?.(payload);
        }
      );

    channelRef.current = channel;
    channel.subscribe((nextStatus) => {
      if (!mountedRef.current) {
        return;
      }

      setStatus(nextStatus);

      if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") {
        setError("Realtime subscription interrupted. Falling back to polling.");
      } else {
        setError("");
      }
    });

    return () => {
      void unsubscribe();
    };
  }, [
    accessToken,
    event,
    filter,
    isActive,
    resolvedChannelName,
    schema,
    table,
    unsubscribe,
  ]);

  return {
    isSubscribed: status === "SUBSCRIBED",
    status,
    error,
    lastEventAt,
    unsubscribe,
  };
}

export function useRealtimeSubscriptions(configs = []) {
  const [connectedCount, setConnectedCount] = useState(0);
  const [latestEventAt, setLatestEventAt] = useState(0);
  const [hasErrors, setHasErrors] = useState(false);

  useEffect(() => {
    const normalizedConfigs = (configs || [])
      .filter((config) => Boolean(config?.enabled !== false && config?.table && config?.onEvent))
      .map((config, index) => ({
        ...config,
        channelName:
          config.channelName ||
          buildChannelName(config.table, config.filter, `trustdoc-multi-${index}`),
      }));

    if (!normalizedConfigs.length || !isRealtimeClientAvailable()) {
      setConnectedCount(0);
      setLatestEventAt(0);
      setHasErrors(false);
      return undefined;
    }

    const client = getRealtimeClient();
    if (!client) {
      setConnectedCount(0);
      setLatestEventAt(0);
      setHasErrors(true);
      return undefined;
    }

    const channels = [];
    let subscribed = 0;
    let errored = false;

    for (const config of normalizedConfigs) {
      setRealtimeAuthToken(config.accessToken || "");

      const channel = client
        .channel(config.channelName)
        .on(
          "postgres_changes",
          {
            event: config.event || "*",
            schema: config.schema || "public",
            table: config.table,
            ...(config.filter ? { filter: config.filter } : {}),
          },
          (payload) => {
            setLatestEventAt(Date.now());
            config.onEvent?.(payload);
          }
        );

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed += 1;
          setConnectedCount(subscribed);
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          errored = true;
          setHasErrors(true);
        }
      });

      channels.push(channel);
    }

    setHasErrors(errored);

    return () => {
      void Promise.all(channels.map((channel) => client.removeChannel(channel).catch(() => null)));
      setConnectedCount(0);
    };
  }, [configs]);

  const count = (configs || []).filter(Boolean).length;

  return {
    count,
    connectedCount,
    allSubscribed: count > 0 && connectedCount === count,
    latestEventAt,
    hasErrors,
  };
}

export function usePollingSubscription(config) {
  const {
    fetchFn,
    interval = 15000,
    onData,
    enabled = true,
    stopOnError = false,
  } = config;

  const intervalRef = useRef(null);
  const isPollingRef = useRef(false);
  const mountedRef = useRef(true);
  const [lastError, setLastError] = useState("");
  const [lastRunAt, setLastRunAt] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    isPollingRef.current = false;
  }, []);

  const startPolling = useCallback(async () => {
    if (isPollingRef.current || !enabled || typeof fetchFn !== "function") {
      return;
    }

    isPollingRef.current = true;

    const run = async () => {
      try {
        const data = await fetchFn();
        if (mountedRef.current) {
          setLastError("");
          setLastRunAt(Date.now());
        }
        onData?.(data);
      } catch (error) {
        if (mountedRef.current) {
          setLastError(error?.message || "Polling failed.");
        }

        if (stopOnError) {
          stopPolling();
        }
      }
    };

    await run();
    intervalRef.current = setInterval(() => {
      void run();
    }, interval);
  }, [enabled, fetchFn, interval, onData, stopOnError, stopPolling]);

  useEffect(() => {
    if (enabled) {
      void startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  return {
    isPolling: isPollingRef.current,
    startPolling,
    stopPolling,
    lastRunAt,
    lastError,
  };
}
