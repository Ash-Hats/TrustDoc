const DEFAULT_ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "doc",
  "docx",
  "txt",
  "json",
];

export function sanitizeText(value, { maxLength = 120 } = {}) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[<>`$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeFileName(fileName) {
  return sanitizeText(fileName, { maxLength: 200 });
}

export function isAllowedFileType(fileName, allowed = DEFAULT_ALLOWED_EXTENSIONS) {
  if (!fileName || typeof fileName !== "string") {
    return false;
  }

  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return allowed.includes(extension);
}

export function validateFileSelection(file, { maxBytes, allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS }) {
  if (!file) {
    return "Please select a file.";
  }

  if (typeof maxBytes === "number" && file.size > maxBytes) {
    return `File size must be ${(maxBytes / (1024 * 1024)).toFixed(0)}MB or less.`;
  }

  if (!isAllowedFileType(file.name, allowedExtensions)) {
    return `Unsupported file type. Allowed: ${allowedExtensions.join(", ")}.`;
  }

  return "";
}

export function safeJsonParse(value, fallbackValue) {
  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}
