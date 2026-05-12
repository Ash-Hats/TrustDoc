/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearAuthSessionStorage,
  getAuthSessionStorage,
  setAuthSessionStorage,
} from "../services/storageService";
import {
  addActivityLog,
  buildGoogleOAuthUrl,
  deleteUserData,
  getCurrentUser,
  getProfile,
  getSupabaseSetupGuide,
  isSupabaseConfigured,
  normalizeAuthSession,
  parseSessionFromUrlHash,
  refreshSession as refreshSupabaseSession,
  requestPasswordReset,
  signInWithEmail,
  signOutSession,
  signUpWithEmail,
  updateCurrentUser,
  upsertProfile,
} from "../services/supabaseService";
import { getCurrentAddress, getSigner } from "../services/walletManager";

const AuthContext = createContext(null);
const WALLET_EMAIL_DOMAIN = "wallet.trustdoc.app";

function toDisplayName(user) {
  return (
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "TrustDoc User"
  );
}

function buildProfilePayload(user, existingProfile = {}, patch = {}) {
  return {
    user_id: user.id,
    email: user.email || existingProfile.email || "",
    display_name: patch.displayName || existingProfile.display_name || toDisplayName(user),
    wallet_address: patch.walletAddress ?? existingProfile.wallet_address ?? "",
    settings: patch.settings || existingProfile.settings || {},
    last_login_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildLocalProfile(user, existingProfile = {}, patch = {}) {
  return {
    id: existingProfile.id || user.id,
    user_id: user.id,
    email: user.email || existingProfile.email || "",
    display_name: patch.displayName || existingProfile.display_name || toDisplayName(user),
    wallet_address: patch.walletAddress ?? existingProfile.wallet_address ?? "",
    settings: patch.settings || existingProfile.settings || {},
    updated_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  };
}

function mapSessionPayload(payload) {
  return payload
    ? {
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        tokenType: payload.tokenType || "bearer",
        expiresAt: Number(payload.expiresAt || 0),
      }
    : null;
}

async function deriveWalletCredential(signature, walletAddress) {
  const seed = `${signature}:${walletAddress.toLowerCase()}:trustdoc.wallet.credential.v1`;
  const encoded = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `Td!${hex}Aa1`;
}

async function requestWalletSignature() {
  const walletAddress = await getCurrentAddress({ requestIfMissing: true });
  if (!walletAddress) {
    throw new Error("No wallet account available.");
  }

  const signer = await getSigner({ requestIfMissing: false });
  const address = (await signer.getAddress()).toLowerCase();
  const nonce =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const issuedAt = new Date().toISOString();

  const message = [
    "TrustDoc Wallet Sign-In",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");

  const signature = await signer.signMessage(message);
  return { address, signature };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => mapSessionPayload(getAuthSessionStorage()));
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const supabaseReady = isSupabaseConfigured();
  const setupGuide = useMemo(() => getSupabaseSetupGuide(), []);

  const clearAuthState = useCallback(() => {
    clearAuthSessionStorage();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const ensureProfile = useCallback(
    async (authSession, authUser, patch = {}) => {
      if (!authUser) {
        return null;
      }

      if (!supabaseReady) {
        const fallback = buildLocalProfile(authUser, profile || {}, patch);
        setProfile(fallback);
        return fallback;
      }

      try {
        const existing = await getProfile(authSession.accessToken, authUser.id).catch(() => null);
        const payload = buildProfilePayload(authUser, existing || {}, patch);
        const saved = await upsertProfile(authSession.accessToken, payload);
        const nextProfile = saved || buildLocalProfile(authUser, existing || {}, patch);
        setProfile(nextProfile);
        return nextProfile;
      } catch {
        const fallback = buildLocalProfile(authUser, profile || {}, patch);
        setProfile(fallback);
        return fallback;
      }
    },
    [profile, supabaseReady]
  );

  const hydrateFromSession = useCallback(
    async (nextSession) => {
      if (!nextSession?.accessToken) {
        clearAuthState();
        return null;
      }

      setSession(nextSession);
      setAuthSessionStorage(nextSession);

      const authUser = await getCurrentUser(nextSession.accessToken);
      setUser(authUser);
      await ensureProfile(nextSession, authUser);
      setAuthError("");
      return authUser;
    },
    [clearAuthState, ensureProfile]
  );

  const signIn = useCallback(
    async ({ email, password }) => {
      if (!supabaseReady) {
        throw new Error("Supabase is not configured.");
      }

      setIsAuthLoading(true);
      try {
        const payload = await signInWithEmail({ email: email.trim(), password });
        const normalized = normalizeAuthSession(payload);

        if (!normalized) {
          throw new Error("Unable to create session.");
        }

        const authUser = await hydrateFromSession(normalized);
        return authUser;
      } finally {
        setIsAuthLoading(false);
      }
    },
    [hydrateFromSession, supabaseReady]
  );

  const signUp = useCallback(
    async ({ email, password, displayName }) => {
      if (!supabaseReady) {
        throw new Error("Supabase is not configured.");
      }

      setIsAuthLoading(true);
      try {
        const payload = await signUpWithEmail({
          email: email.trim(),
          password,
          displayName,
        });

        if (payload?.session) {
          const normalized = normalizeAuthSession(payload.session);
          if (normalized) {
            await hydrateFromSession(normalized);
          }
        }

        return {
          user: payload?.user || null,
          requiresEmailVerification: !payload?.session,
        };
      } finally {
        setIsAuthLoading(false);
      }
    },
    [hydrateFromSession, supabaseReady]
  );

  const signInWithGoogle = useCallback(
    (nextPath = "/dashboard") => {
      if (!supabaseReady) {
        throw new Error("Supabase is not configured.");
      }

      const url = buildGoogleOAuthUrl(nextPath);
      if (!url) {
        throw new Error("Unable to start Google sign-in.");
      }

      window.location.assign(url);
    },
    [supabaseReady]
  );

  const completeOAuthFromHash = useCallback(
    async (hashValue) => {
      const parsed = parseSessionFromUrlHash(hashValue);
      if (!parsed) {
        throw new Error("No OAuth session found in callback URL.");
      }

      setIsAuthLoading(true);
      try {
        await hydrateFromSession(parsed);
      } finally {
        setIsAuthLoading(false);
      }
    },
    [hydrateFromSession]
  );

  const refreshAuthSession = useCallback(async () => {
    if (!session?.refreshToken || !supabaseReady) {
      return null;
    }

    const refreshed = await refreshSupabaseSession(session.refreshToken);
    const normalized = normalizeAuthSession(refreshed);

    if (!normalized) {
      throw new Error("Session refresh failed.");
    }

    await hydrateFromSession(normalized);
    return normalized;
  }, [hydrateFromSession, session, supabaseReady]);

  const logout = useCallback(async () => {
    if (session?.accessToken && supabaseReady) {
      await signOutSession(session.accessToken).catch(() => null);
    }

    clearAuthState();
  }, [clearAuthState, session, supabaseReady]);

  const sendResetPasswordEmail = useCallback(
    async (email) => {
      if (!supabaseReady) {
        throw new Error("Supabase is not configured.");
      }

      await requestPasswordReset(email.trim());
    },
    [supabaseReady]
  );

  const updateAuthProfile = useCallback(
    async (patch) => {
      if (!user || !session?.accessToken) {
        throw new Error("You must be logged in to update your profile.");
      }

      if (patch?.displayName) {
        await updateCurrentUser(session.accessToken, {
          data: { display_name: patch.displayName },
        }).catch(() => null);
      }

      return ensureProfile(session, user, patch);
    },
    [ensureProfile, session, user]
  );

  const linkWallet = useCallback(
    async (walletAddress) => {
      if (!walletAddress) {
        throw new Error("Wallet address is required.");
      }

      return updateAuthProfile({ walletAddress: walletAddress.toLowerCase() });
    },
    [updateAuthProfile]
  );

  const unlinkWallet = useCallback(async () => {
    return updateAuthProfile({ walletAddress: "" });
  }, [updateAuthProfile]);

  const signInWithWallet = useCallback(async () => {
    if (!supabaseReady) {
      throw new Error("Supabase is not configured.");
    }

    setIsAuthLoading(true);
    try {
      const { address, signature } = await requestWalletSignature();
      const syntheticEmail = `wallet_${address.slice(2)}@${WALLET_EMAIL_DOMAIN}`;
      const password = await deriveWalletCredential(signature, address);

      let payload = null;
      try {
        payload = await signInWithEmail({ email: syntheticEmail, password });
      } catch {
        await signUpWithEmail({
          email: syntheticEmail,
          password,
          displayName: `Wallet ${address.slice(2, 8)}`,
        });
        payload = await signInWithEmail({ email: syntheticEmail, password });
      }

      const normalized = normalizeAuthSession(payload);
      if (!normalized) {
        throw new Error("Wallet sign-in failed.");
      }

      const authUser = await hydrateFromSession(normalized);
      if (authUser) {
        await ensureProfile(normalized, authUser, { walletAddress: address });
        await addActivityLog(normalized.accessToken, {
          user_id: authUser.id,
          type: "wallet",
          title: "Wallet Login",
          description: address,
          meta: { source: "wallet-login" },
        }).catch(() => null);
      }

      return authUser;
    } finally {
      setIsAuthLoading(false);
    }
  }, [ensureProfile, hydrateFromSession, supabaseReady]);

  const deleteAccount = useCallback(async () => {
    if (!user || !session?.accessToken) {
      throw new Error("You must be logged in to delete your account data.");
    }

    await deleteUserData(session.accessToken, user.id);
    await logout();
  }, [logout, session, user]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (!supabaseReady) {
        if (isMounted) {
          setIsAuthLoading(false);
        }
        return;
      }

      const stored = mapSessionPayload(getAuthSessionStorage());
      if (!stored?.refreshToken) {
        if (isMounted) {
          setIsAuthLoading(false);
        }
        return;
      }

      try {
        let next = stored;
        if (!next.expiresAt || next.expiresAt <= Date.now() + 45000) {
          const refreshed = await refreshSupabaseSession(next.refreshToken);
          next = normalizeAuthSession(refreshed);
        }

        if (next) {
          await hydrateFromSession(next);
        } else {
          clearAuthState();
        }
      } catch (error) {
        clearAuthState();
        if (isMounted) {
          setAuthError(error?.message || "Session expired.");
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [clearAuthState, hydrateFromSession, supabaseReady]);

  useEffect(() => {
    if (!session?.refreshToken || !session?.expiresAt || !supabaseReady) {
      return undefined;
    }

    const refreshMs = Math.max(1000, session.expiresAt - Date.now() - 45000);

    const timer = setTimeout(() => {
      void refreshAuthSession().catch(() => {
        clearAuthState();
      });
    }, refreshMs);

    return () => clearTimeout(timer);
  }, [clearAuthState, refreshAuthSession, session, supabaseReady]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onFocus = () => {
      const stored = mapSessionPayload(getAuthSessionStorage());
      if (!stored?.refreshToken) {
        return;
      }

      if (!session || stored.accessToken !== session.accessToken) {
        void hydrateFromSession(stored).catch(() => null);
      }
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydrateFromSession, session]);

  const contextValue = useMemo(
    () => ({
      session,
      user,
      profile,
      authError,
      isAuthLoading,
      isSupabaseConfigured: supabaseReady,
      setupGuide,
      isAuthenticated: Boolean(user && session?.accessToken),
      signIn,
      signUp,
      signInWithGoogle,
      signInWithWallet,
      completeOAuthFromHash,
      sendResetPasswordEmail,
      logout,
      refreshAuthSession,
      updateAuthProfile,
      linkWallet,
      unlinkWallet,
      deleteAccount,
      clearAuthState,
    }),
    [
      authError,
      clearAuthState,
      completeOAuthFromHash,
      deleteAccount,
      isAuthLoading,
      linkWallet,
      logout,
      profile,
      refreshAuthSession,
      sendResetPasswordEmail,
      session,
      setupGuide,
      signIn,
      signInWithGoogle,
      signInWithWallet,
      signUp,
      supabaseReady,
      unlinkWallet,
      updateAuthProfile,
      user,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider />");
  }
  return context;
}
