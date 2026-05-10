import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getFilterStorage, setFilterStorage } from "../services/storageService";
import {
  DEFAULT_DOCUMENT_FILTERS,
  DOCUMENT_FILTER_KEYS,
  normalizeDocumentFilters,
} from "../utils/documentFilters";

function readFiltersFromSearchParams(searchParams) {
  const values = {};
  for (const key of DOCUMENT_FILTER_KEYS) {
    if (searchParams.has(key)) {
      values[key] = searchParams.get(key) || "";
    }
  }

  return normalizeDocumentFilters(values);
}

function hasKnownFilterParams(searchParams) {
  return DOCUMENT_FILTER_KEYS.some((key) => searchParams.has(key));
}

function buildSearchParams(currentParams, filters) {
  const nextParams = new URLSearchParams(currentParams);

  for (const key of DOCUMENT_FILTER_KEYS) {
    nextParams.delete(key);
  }

  const normalized = normalizeDocumentFilters(filters);
  const fallback = DEFAULT_DOCUMENT_FILTERS;

  for (const key of DOCUMENT_FILTER_KEYS) {
    const value = normalized[key];
    if (value === undefined || value === null || value === "" || value === fallback[key]) {
      continue;
    }
    nextParams.set(key, String(value));
  }

  return nextParams;
}

export function useDocumentFilters() {
  const { user } = useAuth();
  const scopeKey = user?.id || "public";
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const stableSearchParams = useMemo(
    () => new URLSearchParams(searchKey),
    [searchKey]
  );

  const filters = useMemo(
    () => readFiltersFromSearchParams(stableSearchParams),
    [stableSearchParams]
  );

  useEffect(() => {
    if (hasKnownFilterParams(stableSearchParams)) {
      return;
    }

    const stored = getFilterStorage(scopeKey);
    if (!stored) {
      return;
    }

    const next = buildSearchParams(stableSearchParams, stored);
    if (next.toString() === searchKey) {
      return;
    }
    setSearchParams(next, { replace: true });
  }, [scopeKey, searchKey, setSearchParams, stableSearchParams]);

  useEffect(() => {
    setFilterStorage(filters, scopeKey);
  }, [filters, scopeKey]);

  const updateFilters = useCallback(
    (patch, { replace = true, resetPage = true } = {}) => {
      const next = {
        ...filters,
        ...patch,
      };

      if (resetPage) {
        next.page = 1;
      }

      const params = buildSearchParams(stableSearchParams, next);
      setSearchParams(params, { replace });
    },
    [filters, setSearchParams, stableSearchParams]
  );

  const setPage = useCallback(
    (page) => {
      const params = buildSearchParams(stableSearchParams, { ...filters, page });
      setSearchParams(params, { replace: true });
    },
    [filters, setSearchParams, stableSearchParams]
  );

  const resetFilters = useCallback(() => {
    const params = buildSearchParams(stableSearchParams, DEFAULT_DOCUMENT_FILTERS);
    setSearchParams(params, { replace: true });
  }, [setSearchParams, stableSearchParams]);

  const buildQueryString = useCallback(
    (nextFilters) => {
      const params = buildSearchParams(stableSearchParams, {
        ...filters,
        ...nextFilters,
      });
      const serialized = params.toString();
      return serialized ? `?${serialized}` : "";
    },
    [filters, stableSearchParams]
  );

  return {
    filters,
    updateFilters,
    setPage,
    resetFilters,
    buildQueryString,
  };
}
