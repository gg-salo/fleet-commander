"use client";

import { useMemo, useState } from "react";

interface NewWorkPanelProps {
  projects: Array<{ id: string; name: string }>;
  onClose: () => void;
}

export function NewWorkPanel({ projects, onClose }: NewWorkPanelProps) {
  const defaultProject = projects.length === 1 ? projects[0].id : "";
  const [selectedProject, setSelectedProject] = useState(defaultProject);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => selectedProject !== "" && !loading, [selectedProject, loading]);

  const handleSetupCI = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/setup-ci", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        throw new Error((data?.error as string) ?? `Failed (${res.status})`);
      }
      onClose();
      // Trigger a page reload so the new session appears in the kanban
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to spawn CI setup session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-base)]"
        style={{ animation: "slide-in-right 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            New Work
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Project Selector */}
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            Project
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="mb-6 w-full rounded-[6px] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          >
            {projects.length !== 1 && (
              <option value="">Select a project...</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Action Cards */}
          <div className="space-y-3">
            {/* Set Up CI */}
            <button
              onClick={handleSetupCI}
              disabled={!canSubmit}
              className="w-full rounded-[8px] border border-[var(--color-border-default)] p-4 text-left transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--color-border-default)]"
              style={{
                background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <div className="mb-1 flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--color-accent-green)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                  Set Up CI
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                Analyze the codebase, create a GitHub Actions workflow, write baseline tests, and open a PR.
              </p>
              {loading && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-accent)]">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Spawning session...
                </div>
              )}
            </button>

            {/* Plan Feature (disabled placeholder) */}
            <div
              className="w-full rounded-[8px] border border-[var(--color-border-subtle)] p-4 opacity-50"
              style={{
                background: "linear-gradient(175deg, rgba(28,36,47,0.5) 0%, rgba(18,23,31,0.5) 100%)",
              }}
            >
              <div className="mb-1 flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--color-accent-violet)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                  Plan Feature
                </span>
                <span className="rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  coming soon
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                Describe a feature, get a plan, then spawn agents to implement it.
              </p>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="mt-4 rounded-[6px] border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.08)] px-3 py-2.5 text-[11px] text-[var(--color-status-error)]">
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
