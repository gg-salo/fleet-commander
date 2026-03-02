"use client";

import type { AttentionLevel, FilterMode } from "@/lib/types";
import { cn } from "@/lib/cn";

interface FilterTabsProps {
  activeFilter: FilterMode;
  counts: Record<AttentionLevel, number>;
  onFilterChange: (mode: FilterMode) => void;
}

export function FilterTabs({ activeFilter, counts, onFilterChange }: FilterTabsProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const actionCount = counts.merge + counts.respond + counts.review;
  const workingCount = counts.working + counts.pending;
  const doneCount = counts.done;

  const tabs: Array<{ mode: FilterMode; label: string; count: number }> = [
    { mode: "all", label: "All", count: total },
    { mode: "action", label: "Needs Action", count: actionCount },
    { mode: "working", label: "Working", count: workingCount },
    { mode: "done", label: "Done", count: doneCount },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border-subtle)] px-1">
      {tabs.map((tab) => (
        <button
          key={tab.mode}
          onClick={() => onFilterChange(tab.mode)}
          className={cn(
            "relative px-3 py-2.5 text-[12px] font-medium transition-colors",
            activeFilter === tab.mode
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
          )}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className={cn(
              "ml-1.5 tabular-nums text-[11px]",
              activeFilter === tab.mode
                ? "text-[var(--color-text-secondary)]"
                : "text-[var(--color-text-tertiary)]",
            )}>
              {tab.count}
            </span>
          )}
          {activeFilter === tab.mode && (
            <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[var(--color-accent)]" />
          )}
        </button>
      ))}
    </div>
  );
}
