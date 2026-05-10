export function normalizeExplorerBase(baseUrl) {
  if (!baseUrl || typeof baseUrl !== "string") {
    return "https://amoy.polygonscan.com";
  }

  return baseUrl.replace(/\/+$/, "");
}

export function buildTxUrl(baseUrl, txHash) {
  if (!txHash) {
    return "";
  }

  return `${normalizeExplorerBase(baseUrl)}/tx/${txHash}`;
}

export function buildBlockUrl(baseUrl, blockNumber) {
  if (!blockNumber) {
    return "";
  }

  return `${normalizeExplorerBase(baseUrl)}/block/${blockNumber}`;
}
