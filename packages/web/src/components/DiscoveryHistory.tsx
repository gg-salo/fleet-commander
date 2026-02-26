"use client";

import { useCallback, useEffect, useState } from "react";
import type { Discovery, DiscoveryStatus, DiscoveryType } from "@/lib/types";

interface DiscoveryHistoryProps {
  projects: Array<{ id: string; name: string }>;
}

const STATUS_COLORS: Record<DiscoveryStatus, string> = {
  ready: "var(--color-accent-green)",
  failed: "var(--color-status-error)",
  discovering: "var(--color-text-muted)",
};

const TYPE_LABELS: Record<DiscoveryType, string> = {
  "ux-audit": "UI/UX",
  "competitor-research": "Competitor",
  "code-health": "Code Health",
};

const TYPE_COLORS: Record<DiscoveryType, string> = {
  "ux-audit": "var(--color-accent-violet)",
  "competitor-research": "var(--color-accent-blue)",
  "code-health": "var(--color-status-attention)",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--color-status-error)",
  medium: "var(--color-status-attention)",
  low: "var(--color-text-muted)",
};

const EFFORT_COLORS: Record<string, string> = {
  small: "var(--color-accent-green)",
  medium: "var(--color-status-attention)",
  large: "var(--color-status-error)",
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DiscoveryHistory({ projects }: DiscoveryHistoryProps) {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const fetchDiscoveries = useCallback(async () => {
    const all: Discovery[] = [];
    for (const project of projects) {
      try {
        const res = await fetch(`/api/discoveries?projectId=${encodeURIComponent(project.id)}`);
        if (!res.ok) continue;
        const data = (await res.json()) as { discoveries: Discovery[] };
        all.push(...data.discoveries);
      } catch {
        // Skip failed fetch
      }
    }
    // Sort newest first
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setDiscoveries(all);
  }, [projects]);

  useEffect(() => {
    void fetchDiscoveries();
  }, [fetchDiscoveries]);

  if (discoveries.length === 0) return null;

  return (
    <div className="mb-8">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-3 flex items-center gap-2 px-1"
      >
        <h2 className="text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
          Discoveries
        </h2>
        <span className="rounded-full bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
          {discoveries.length}
        </span>
        <svg
          className={`h-3 w-3 text-[var(--color-text-muted)] transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="space-y-3">
          {discoveries.map((discovery) => {
            const isExpanded = expandedId === discovery.id;

            return (
              <div
                key={discovery.id}
                className="rounded-[8px] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : discovery.id)}
                  className="flex w-full items-start justify-between px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
                        style={{
                          color: TYPE_COLORS[discovery.type],
                          backgroundColor: `color-mix(in srgb, ${TYPE_COLORS[discovery.type]} 12%, transparent)`,
                        }}
                      >
                        {TYPE_LABELS[discovery.type]}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
                        style={{
                          color: STATUS_COLORS[discovery.status],
                          backgroundColor: `color-mix(in srgb, ${STATUS_COLORS[discovery.status]} 12%, transparent)`,
                        }}
                      >
                        {discovery.status}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                      <span className="text-[var(--color-text-muted)]">
                        {relativeTime(discovery.createdAt)}
                      </span>
                      {discovery.findings.length > 0 && (
                        <span className="text-[var(--color-text-muted)]">
                          {discovery.findings.length} findings
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    className={`ml-2 mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--color-border-subtle)] px-4 py-3">
                    {discovery.error && (
                      <p className="mb-2 text-[11px] text-[var(--color-status-error)]">
                        {discovery.error}
                      </p>
                    )}

                    {discovery.findings.length === 0 && !discovery.error && (
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        No findings yet.
                      </p>
                    )}

                    <div className="space-y-2">
                      {discovery.findings.map((finding) => (
                        <div
                          key={finding.id}
                          className="rounded-[6px] border border-[var(--color-border-subtle)] px-3 py-2"
                        >
                          <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
                            {finding.title}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                            {finding.description.length > 200
                              ? finding.description.slice(0, 200) + "..."
                              : finding.description}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                              style={{
                                color: PRIORITY_COLORS[finding.priority],
                                backgroundColor: `color-mix(in srgb, ${PRIORITY_COLORS[finding.priority]} 12%, transparent)`,
                              }}
                            >
                              {finding.priority}
                            </span>
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                              style={{
                                color: EFFORT_COLORS[finding.effort],
                                backgroundColor: `color-mix(in srgb, ${EFFORT_COLORS[finding.effort]} 12%, transparent)`,
                              }}
                            >
                              {finding.effort}
                            </span>
                            <span className="rounded-full bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]">
                              {finding.category}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
