"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DashboardSession,
  DashboardStats,
  SSESnapshotEvent,
} from "@/lib/types";

interface LiveData {
  liveSessions: DashboardSession[];
  liveStats: DashboardStats;
  refresh: () => Promise<void>;
}

/**
 * Connects to the SSE `/api/events` stream and auto-refreshes sessions
 * when the lightweight snapshot fingerprint changes, or every 30s to
 * catch PR-level state changes (CI completing, reviews arriving).
 */
export function useLiveSessions(
  initialSessions: DashboardSession[],
  initialStats: DashboardStats,
): LiveData {
  const [sessions, setSessions] = useState(initialSessions);
  const [stats, setStats] = useState(initialStats);
  const fetchingRef = useRef(false);
  const fingerprintRef = useRef("");

  const fetchFull = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = (await res.json()) as {
        sessions: DashboardSession[];
        stats: DashboardStats;
      };
      setSessions(data.sessions);
      setStats(data.stats);
    } catch {
      // Network error — skip, retry on next trigger
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Compute fingerprint from snapshot sessions
    const computeFingerprint = (
      snapshotSessions: SSESnapshotEvent["sessions"],
    ): string =>
      snapshotSessions
        .map(
          (s) => `${s.id}:${s.status}:${s.activity}:${s.attentionLevel}`,
        )
        .sort()
        .join("|");

    // Initialize fingerprint from server-rendered data
    fingerprintRef.current = initialSessions
      .map((s) => `${s.id}:${s.status}:${s.activity}`)
      .sort()
      .join("|");

    // Connect to SSE
    const es = new EventSource("/api/events");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as SSESnapshotEvent;
        if (data.type !== "snapshot") return;

        const newFingerprint = computeFingerprint(data.sessions);
        if (newFingerprint !== fingerprintRef.current) {
          fingerprintRef.current = newFingerprint;
          void fetchFull();
        }
      } catch {
        // Malformed SSE data — ignore
      }
    };

    // Periodic full refresh every 30s for PR state changes
    const interval = setInterval(() => {
      void fetchFull();
    }, 30_000);

    return () => {
      es.close();
      clearInterval(interval);
    };
  }, [fetchFull, initialSessions]);

  return { liveSessions: sessions, liveStats: stats, refresh: fetchFull };
}
