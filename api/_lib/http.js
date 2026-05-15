import { allowedOrigins } from "./env.js";

export function getHeaderValue(input) {
  if (Array.isArray(input)) {
    return String(input[0] || "");
  }
  return String(input || "");
}

export function getRequestOrigin(request) {
  return getHeaderValue(request?.headers?.origin).trim();
}

export function getClientIp(request) {
  const forwardedFor = getHeaderValue(request?.headers?.["x-forwarded-for"]);
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = getHeaderValue(request?.headers?.["x-real-ip"]);
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

export function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

export function sendText(response, status, text, contentType = "text/plain; charset=utf-8") {
  response.status(status);
  response.setHeader("Content-Type", contentType);
  response.send(text);
}

export function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

export function setCorsHeaders(request, response, methods = ["GET"]) {
  const origin = getRequestOrigin(request);
  const allowList = allowedOrigins();
  const allowOrigin = allowList.includes(origin) ? origin : allowList[0] || "*";

  response.setHeader("Access-Control-Allow-Origin", allowOrigin);
  response.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-TrustDoc-Intent");
  response.setHeader("Vary", "Origin");
}

export function handleOptions(request, response, methods = ["GET"]) {
  setCorsHeaders(request, response, methods);
  setSecurityHeaders(response);
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return true;
  }
  return false;
}

export async function parseJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const raw = request.body;
  if (!raw) {
    return {};
  }

  if (typeof raw === "string") {
    return JSON.parse(raw);
  }

  return {};
}

export function parseAuthToken(request) {
  const authHeader = getHeaderValue(request?.headers?.authorization);
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

export function enforceTrustedOrigin(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const origin = getRequestOrigin(request);
  if (!origin) {
    return false;
  }

  return allowedOrigins().includes(origin);
}

export function toCsv(rows = []) {
  if (!rows.length) {
    return "";
  }

  const headers = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row || {}).forEach((key) => acc.add(key));
      return acc;
    }, new Set())
  );

  const escapeCell = (value) => {
    const raw = value == null ? "" : String(value);
    if (/[",\n]/.test(raw)) {
      return `"${raw.replace(/"/g, "\"\"")}"`;
    }
    return raw;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row?.[header])).join(",")),
  ];

  return lines.join("\n");
}

