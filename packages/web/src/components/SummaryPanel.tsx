"use client";

import { useState } from "react";
import type { DailySummary } from "@/lib/types";

interface SummaryPanelProps {
  summary: DailySummary;
}

export function SummaryPanel({ summary }: SummaryPanelProps) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ao-summary-expanded") === "true";
  });

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem("ao-summary-expanded", String(next));
  };

  const { mergedToday, readyToMerge, workingSessions, pendingPlansCount, workingCount } = summary;
  const total = mergedToday.length + readyToMerge.length + workingCount + pendingPlansCount;

  if (total === 0) return null;

  return (
    <div className="mb-6 rounded-[8px] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      {/* Collapsed header */}
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 text-[12px]">
          <span className="font-semibold text-[var(--color-text-primary)]">Today</span>
          <span className="text-[var(--color-text-secondary)]">
            {[
              mergedToday.length > 0 && (
                <span key="merged" className="text-[var(--color-accent-green)]">
                  {mergedToday.length} merged
                </span>
              ),
              readyToMerge.length > 0 && (
                <span key="ready" className="text-[var(--color-status-attention)]">
                  {readyToMerge.length} ready
                </span>
              ),
              workingCount > 0 && (
                <span key="working" className="text-[var(--color-accent-blue)]">
                  {workingCount} working
                </span>
              ),
              pendingPlansCount > 0 && (
                <span key="plans">
                  {pendingPlansCount} pending plans
                </span>
              ),
            ]
              .filter(Boolean)
              .reduce<React.ReactNode[]>((acc, el, i) => {
                if (i > 0) acc.push(<span key={`sep-${i}`} className="mx-1 text-[var(--color-text-muted)]">·</span>);
                acc.push(el);
                return acc;
              }, [])}
          </span>
        </div>
        <svg
          className={`h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[var(--color-border-subtle)] px-4 py-3 space-y-3">
          {/* Merged */}
          {mergedToday.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent-green)]">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4" />
                </svg>
                Merged
              </div>
              <div className="space-y-1">
                {mergedToday.map((item) => (
                  <a
                    key={item.sessionId}
                    href={item.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                  >
                    {item.prTitle || item.sessionId}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Ready to Merge */}
          {readyToMerge.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-status-attention)]">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Ready to Merge
              </div>
              <div className="space-y-1">
                {readyToMerge.map((item) => (
                  <a
                    key={item.sessionId}
                    href={item.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                  >
                    {item.prTitle || `PR #${item.prNumber}`}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Working */}
          {workingSessions.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent-blue)]">
                <span className="h-2 w-2 rounded-full bg-[var(--color-accent-blue)]" />
                Working
              </div>
              <div className="space-y-1">
                {workingSessions.map((item) => (
                  <a
                    key={item.sessionId}
                    href={`/sessions/${encodeURIComponent(item.sessionId)}`}
                    className="block text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                  >
                    {item.summary || item.sessionId}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Pending Plans */}
          {pendingPlansCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {pendingPlansCount} pending plan{pendingPlansCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
