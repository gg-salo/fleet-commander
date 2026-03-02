"use client";

import { useState, useCallback, useEffect } from "react";

export type ViewMode = "list" | "pipeline";

const STORAGE_KEY = "ao-view-mode";

/**
 * Persistent view mode toggle backed by localStorage.
 * Also syncs to `?view=` URL parameter via history.replaceState.
 */
export function useViewMode(): { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void } {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    // URL param takes priority
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("view");
    if (urlMode === "pipeline" || urlMode === "list") return urlMode;
    // Then localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pipeline") return "pipeline";
    return "list";
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    const url = new URL(window.location.href);
    if (mode === "list") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", mode);
    }
    history.replaceState(null, "", url.toString());
  }, []);

  // Hide pipeline on small screens
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && viewMode === "pipeline") {
        setViewMode("list");
      }
    };
    mql.addEventListener("change", handler);
    // Force list on initial mount if mobile
    if (mql.matches && viewMode === "pipeline") {
      setViewMode("list");
    }
    return () => mql.removeEventListener("change", handler);
  }, [viewMode, setViewMode]);

  return { viewMode, setViewMode };
}
