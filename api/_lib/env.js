function required(name, fallback = "") {
  const value = String(process.env[name] || fallback || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getEnv() {
  const supabaseUrl = required("SUPABASE_URL", process.env.VITE_SUPABASE_URL);
  const supabaseAnonKey = required("SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY);
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const appOrigin = String(process.env.APP_ORIGIN || process.env.VITE_APP_ORIGIN || "").trim();

  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    supabaseAnonKey,
    serviceRoleKey,
    appOrigin,
  };
}

export function allowedOrigins() {
  const raw = String(process.env.TRUSTDOC_ALLOWED_ORIGINS || "").trim();
  const env = getEnv();
  const configured = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const defaults = [
    env.appOrigin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean);

  return Array.from(new Set([...configured, ...defaults]));
}

