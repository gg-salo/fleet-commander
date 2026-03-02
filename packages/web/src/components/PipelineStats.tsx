"use client";

import type { AttentionLevel, FilterMode } from "@/lib/types";
import { cn } from "@/lib/cn";

interface PipelineStatsProps {
  counts: Record<AttentionLevel, number>;
  activeFilter: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
}

const STAT_ITEMS: Array<{
  level: AttentionLevel;
  label: string;
  color: string;
  filterTarget?: FilterMode;
}> = [
  { level: "working", label: "WORKING", color: "var(--color-status-working)" },
  { level: "merge", label: "MERGE", color: "var(--color-status-ready)", filterTarget: "action" },
  { level: "review", label: "REVIEW", color: "var(--color-accent-orange)", filterTarget: "action" },
  { level: "respond", label: "RESPOND", color: "var(--color-status-error)", filterTarget: "action" },
  { level: "pending", label: "PENDING", color: "var(--color-status-attention)" },
  { level: "done", label: "DONE", color: "var(--color-text-tertiary)", filterTarget: "done" },
];

export function PipelineStats({ counts, activeFilter, onFilterChange }: PipelineStatsProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <span className="text-[13px] text-[var(--color-text-muted)]">no sessions</span>;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAT_ITEMS.map((item) => {
        const count = counts[item.level];
        if (count === 0) return null;
        return (
          <button
            key={item.level}
            onClick={() => onFilterChange(item.filterTarget ?? item.level === "working" ? "working" : "all")}
            className={cn(
              "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] transition-colors",
              "hover:bg-[rgba(255,255,255,0.05)]",
              activeFilter === (item.filterTarget ?? "all") && "bg-[rgba(255,255,255,0.06)]",
            )}
          >
            <span
              className="h-[6px] w-[6px] rounded-full shrink-0"
              style={{ background: item.color }}
            />
            <span className="text-[16px] font-bold tabular-nums" style={{ color: item.color }}>
              {count}
            </span>
            <span className="font-semibold tracking-wider text-[var(--color-text-muted)]">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
