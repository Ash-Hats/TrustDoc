function toDayKey(unixSeconds) {
  if (!unixSeconds) {
    return null;
  }

  const date = new Date(unixSeconds * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function recentDays(count) {
  const days = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
    days.push({
      key,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
  }

  return days;
}

export function buildVerificationTrend(documents, verifications, range = 7) {
  const dayMap = new Map(recentDays(range).map((item) => [item.key, { ...item, registered: 0, verified: 0 }]));

  for (const document of documents) {
    const key = toDayKey(document?.timestamp);
    if (key && dayMap.has(key)) {
      dayMap.get(key).registered += 1;
    }
  }

  for (const verification of verifications) {
    const key = toDayKey(verification?.createdAt ? Math.floor(verification.createdAt / 1000) : 0);
    if (key && dayMap.has(key) && verification?.status === "verified") {
      dayMap.get(key).verified += 1;
    }
  }

  return Array.from(dayMap.values());
}

export function buildIssuerActivity(documents) {
  const stats = new Map();

  for (const document of documents) {
    const issuer = document?.issuedBy || "Unknown";
    stats.set(issuer, (stats.get(issuer) || 0) + 1);
  }

  return Array.from(stats.entries())
    .map(([issuer, count]) => ({ issuer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

export function buildAnalyticsSummary(documents, verifications, pendingTransactions) {
  const totalDocs = documents.length;
  const revokedDocs = documents.filter((doc) => doc.revoked).length;
  const successfulVerifications = verifications.filter((item) => item.status === "verified").length;
  const failedVerifications = verifications.filter((item) => item.status !== "verified").length;
  const totalVerifications = successfulVerifications + failedVerifications;
  const successRate = totalVerifications
    ? Number(((successfulVerifications / totalVerifications) * 100).toFixed(1))
    : 0;

  return {
    totalDocs,
    revokedDocs,
    successfulVerifications,
    failedVerifications,
    successRate,
    pendingTransactions: pendingTransactions.length,
    fraudAlerts: revokedDocs + failedVerifications,
  };
}
