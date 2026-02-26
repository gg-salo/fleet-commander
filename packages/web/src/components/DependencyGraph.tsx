"use client";

import { useMemo } from "react";
import type { PlanTask } from "@/lib/types";

interface DependencyGraphProps {
  tasks: PlanTask[];
}

const SCOPE_COLORS: Record<string, string> = {
  small: "var(--color-accent-blue)",
  medium: "var(--color-accent-violet)",
};

/** Compute topological layers for DAG visualization. */
function computeLayers(tasks: PlanTask[]): PlanTask[][] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const layers: PlanTask[][] = [];
  const assigned = new Set<string>();

  // Iteratively assign tasks to layers
  let remaining = [...tasks];
  while (remaining.length > 0) {
    const layer: PlanTask[] = [];
    for (const task of remaining) {
      // A task goes in this layer if all its dependencies are already assigned
      const depsResolved = task.dependencies.every(
        (depId) => assigned.has(depId) || !taskMap.has(depId),
      );
      if (depsResolved) {
        layer.push(task);
      }
    }

    // Safety: if no tasks can be placed, we have a cycle — place all remaining
    if (layer.length === 0) {
      layers.push(remaining);
      break;
    }

    for (const t of layer) assigned.add(t.id);
    layers.push(layer);
    remaining = remaining.filter((t) => !assigned.has(t.id));
  }

  return layers;
}

export function DependencyGraph({ tasks }: DependencyGraphProps) {
  const layers = useMemo(() => computeLayers(tasks), [tasks]);

  if (tasks.length === 0) return null;

  return (
    <div className="dep-graph flex flex-col gap-5">
      {layers.map((layer, layerIdx) => (
        <div key={layerIdx} className="dep-layer flex flex-wrap justify-center gap-3">
          {layer.map((task) => (
            <div
              key={task.id}
              className="dep-node min-w-[140px] max-w-[200px] rounded-[8px] border border-[var(--color-border-default)] px-3 py-2.5"
              style={{
                background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                  #{task.id}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                  style={{
                    color: SCOPE_COLORS[task.scope] ?? "var(--color-text-muted)",
                    backgroundColor: `color-mix(in srgb, ${SCOPE_COLORS[task.scope] ?? "var(--color-text-muted)"} 12%, transparent)`,
                  }}
                >
                  {task.scope}
                </span>
              </div>
              <p
                className="text-[11px] leading-snug text-[var(--color-text-primary)]"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {task.title}
              </p>
              {task.dependencies.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {task.dependencies.map((depId) => (
                    <span
                      key={depId}
                      className="rounded bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]"
                    >
                      depends on #{depId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
