import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

let realtimeClient = null;
let activeAccessToken = "";

function hasRealtimeConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isRealtimeClientAvailable() {
  return hasRealtimeConfig();
}

export function getRealtimeClient() {
  if (!hasRealtimeConfig()) {
    return null;
  }

  if (!realtimeClient) {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "X-Client-Info": "trustdoc-realtime-client",
        },
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return realtimeClient;
}

export function setRealtimeAuthToken(accessToken = "") {
  const client = getRealtimeClient();

  if (!client) {
    return;
  }

  const normalizedToken = accessToken.trim();

  if (normalizedToken === activeAccessToken) {
    return;
  }

  activeAccessToken = normalizedToken;

  if (normalizedToken) {
    client.realtime.setAuth(normalizedToken);
  }
}

export async function teardownRealtimeClient() {
  if (!realtimeClient) {
    return;
  }

  try {
    await realtimeClient.removeAllChannels();
  } finally {
    realtimeClient = null;
    activeAccessToken = "";
  }
}
