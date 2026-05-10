export function shortAddress(address) {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTimestamp(unixSeconds) {
  if (!unixSeconds) {
    return "-";
  }

  return new Date(unixSeconds * 1000).toLocaleString();
}

export function formatRelativeTime(unixSeconds) {
  if (!unixSeconds) {
    return "-";
  }

  const now = Date.now();
  const then = unixSeconds * 1000;
  const diffMs = now - then;

  if (diffMs < 60000) {
    return "just now";
  }

  if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes}m ago`;
  }

  if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours}h ago`;
  }

  const days = Math.floor(diffMs / 86400000);
  return `${days}d ago`;
}

export function formatCount(value) {
  return new Intl.NumberFormat().format(value || 0);
}
