export const DOCUMENT_FILTER_KEYS = [
  "q",
  "status",
  "issuer",
  "wallet",
  "type",
  "sort",
  "page",
];

export const DEFAULT_DOCUMENT_FILTERS = {
  q: "",
  status: "all",
  issuer: "all",
  wallet: "all",
  type: "all",
  sort: "newest",
  page: 1,
};

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "type_asc", label: "Type A-Z" },
  { value: "type_desc", label: "Type Z-A" },
  { value: "issuer_asc", label: "Issuer A-Z" },
  { value: "issuer_desc", label: "Issuer Z-A" },
];

function toSearchable(value) {
  return (value || "").toString().trim().toLowerCase();
}

function normalizeHash(hash) {
  if (!hash) {
    return "";
  }
  return hash.toLowerCase();
}

function normalizePage(rawPage) {
  const parsed = Number.parseInt(rawPage, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeDocumentFilters(filters = {}) {
  return {
    q: (filters.q || "").trim(),
    status: filters.status || "all",
    issuer: filters.issuer || "all",
    wallet: filters.wallet || "all",
    type: filters.type || "all",
    sort: filters.sort || "newest",
    page: normalizePage(filters.page),
  };
}

function buildPendingByHash(pendingTransactions = []) {
  const map = new Map();

  for (const pending of pendingTransactions) {
    if (pending?.status !== "pending") {
      continue;
    }

    const rawHash = pending?.meta?.hash || pending?.hash || "";
    const hash = rawHash.startsWith("0x") ? rawHash.toLowerCase() : `0x${rawHash.toLowerCase()}`;
    if (!hash || hash === "0x") {
      continue;
    }

    map.set(hash, pending);
  }

  return map;
}

export function enrichDocuments(documents = [], pendingTransactions = [], verificationHistory = []) {
  void verificationHistory;
  const pendingByHash = buildPendingByHash(pendingTransactions);

  const index = new Map();
  const enriched = documents.map((doc) => {
    const normalizedHash = normalizeHash(doc?.hash);

    let derivedStatus = "verified";
    if (pendingByHash.has(normalizedHash)) {
      derivedStatus = "pending";
    } else if (doc?.revoked) {
      derivedStatus = "tampered";
    }

    const next = {
      ...doc,
      derivedStatus,
    };

    index.set(normalizedHash, true);
    return next;
  });

  for (const [hash, pending] of pendingByHash.entries()) {
    if (index.has(hash)) {
      continue;
    }

    enriched.push({
      hash,
      owner: pending?.meta?.owner || "",
      cid: "",
      docType: pending?.meta?.docType || "Pending",
      issuedBy: pending?.meta?.issuer || "Pending",
      revoked: false,
      timestamp: Math.floor((pending?.createdAt || Date.now()) / 1000),
      blockTimestamp: 0,
      txHash: pending?.txHash || "",
      gatewayUrl: "",
      exists: false,
      derivedStatus: "pending",
      isSyntheticPending: true,
    });
  }

  return enriched;
}

export function applyDocumentFilters(documents = [], filters = {}) {
  const normalizedFilters = normalizeDocumentFilters(filters);
  const query = toSearchable(normalizedFilters.q);
  const issuerFilter = toSearchable(normalizedFilters.issuer);
  const walletFilter = toSearchable(normalizedFilters.wallet);
  const typeFilter = toSearchable(normalizedFilters.type);

  let filtered = documents.filter((document) => {
    const searchTarget = [document.hash, document.issuedBy, document.owner, document.docType]
      .map((value) => toSearchable(value))
      .join(" ");

    const matchesSearch = !query || searchTarget.includes(query);

    const matchesStatus =
      normalizedFilters.status === "all" ||
      (normalizedFilters.status === "verified" && document.derivedStatus === "verified") ||
      (normalizedFilters.status === "pending" && document.derivedStatus === "pending") ||
      (normalizedFilters.status === "tampered" && document.derivedStatus === "tampered") ||
      (normalizedFilters.status === "revoked" && Boolean(document.revoked));

    const matchesIssuer =
      issuerFilter === "all" || toSearchable(document.issuedBy) === issuerFilter;
    const matchesWallet =
      walletFilter === "all" || toSearchable(document.owner) === walletFilter;
    const matchesType = typeFilter === "all" || toSearchable(document.docType) === typeFilter;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesIssuer &&
      matchesWallet &&
      matchesType
    );
  });

  filtered = [...filtered].sort((left, right) => {
    switch (normalizedFilters.sort) {
      case "oldest":
        return Number(left.timestamp || 0) - Number(right.timestamp || 0);
      case "type_asc":
        return (left.docType || "").localeCompare(right.docType || "");
      case "type_desc":
        return (right.docType || "").localeCompare(left.docType || "");
      case "issuer_asc":
        return (left.issuedBy || "").localeCompare(right.issuedBy || "");
      case "issuer_desc":
        return (right.issuedBy || "").localeCompare(left.issuedBy || "");
      default:
        return Number(right.timestamp || 0) - Number(left.timestamp || 0);
    }
  });

  return filtered;
}

export function paginateDocuments(documents = [], page = 1, pageSize = 8) {
  const total = documents.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    total,
    totalPages,
    safePage,
    items: documents.slice(start, start + pageSize),
  };
}

export function summarizeDocuments(documents = []) {
  return documents.reduce(
    (summary, document) => {
      summary.total += 1;
      if (document.derivedStatus === "verified") {
        summary.verified += 1;
      } else if (document.derivedStatus === "pending") {
        summary.pending += 1;
      } else if (document.derivedStatus === "tampered") {
        summary.tampered += 1;
      }

      return summary;
    },
    { total: 0, verified: 0, pending: 0, tampered: 0 }
  );
}
