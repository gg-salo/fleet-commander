"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Plan } from "@/lib/types";

interface UsePlansResult {
  plans: Plan[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Fetches plans for all projects, polls every 30s (matches useLiveSessions cadence).
 */
export function usePlans(projects: Array<{ id: string; name: string }>): UsePlansResult {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPlans = useCallback(async () => {
    const allPlans: Plan[] = [];
    for (const project of projects) {
      try {
        const res = await fetch(`/api/plans?projectId=${encodeURIComponent(project.id)}`);
        if (!res.ok) continue;
        const data = (await res.json()) as { plans: Plan[] };
        allPlans.push(...data.plans);
      } catch {
        // Skip failed fetch
      }
    }
    allPlans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setPlans(allPlans);
    setLoading(false);
  }, [projects]);

  useEffect(() => {
    void fetchPlans();
    intervalRef.current = setInterval(() => void fetchPlans(), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPlans]);

  return { plans, loading, refresh: fetchPlans };
}
