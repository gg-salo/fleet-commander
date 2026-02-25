"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Plan, PlanTask } from "@/lib/types";

type PlanStep = "select" | "describe" | "planning" | "review" | "executing" | "done";

interface NewWorkPanelProps {
  projects: Array<{ id: string; name: string }>;
  onClose: () => void;
}

export function NewWorkPanel({ projects, onClose }: NewWorkPanelProps) {
  const defaultProject = projects.length === 1 ? projects[0].id : "";
  const [selectedProject, setSelectedProject] = useState(defaultProject);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan state
  const [planStep, setPlanStep] = useState<PlanStep>("select");
  const [featureDescription, setFeatureDescription] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [editedTasks, setEditedTasks] = useState<PlanTask[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canSubmit = useMemo(() => selectedProject !== "" && !loading, [selectedProject, loading]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to spawn CI setup session");
    } finally {
      setLoading(false);
    }
  };

  const pollPlan = useCallback(
    (planId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/plan/${encodeURIComponent(planId)}?projectId=${encodeURIComponent(selectedProject)}`,
          );
          if (!res.ok) return;
          const data = (await res.json()) as { plan: Plan };
          setPlan(data.plan);

          if (data.plan.status === "ready") {
            if (pollRef.current) clearInterval(pollRef.current);
            setEditedTasks(data.plan.tasks);
            setPlanStep("review");
          } else if (data.plan.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(data.plan.error ?? "Planning failed");
            setPlanStep("describe");
          }
        } catch {
          // Ignore poll errors
        }
      }, 3000);
    },
    [selectedProject],
  );

  const handlePlanFeature = async () => {
    if (!canSubmit || featureDescription.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          description: featureDescription.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        throw new Error((data?.error as string) ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { plan: Plan };
      setPlan(data.plan);
      setPlanStep("planning");
      pollPlan(data.plan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTask = (taskId: string) => {
    setEditedTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleAddTask = () => {
    const newId = String(
      Math.max(0, ...editedTasks.map((t) => parseInt(t.id, 10) || 0)) + 1,
    );
    setEditedTasks((prev) => [
      ...prev,
      {
        id: newId,
        title: "",
        description: "",
        acceptanceCriteria: [],
        scope: "small" as const,
        dependencies: [],
      },
    ]);
  };

  const handleUpdateTask = (taskId: string, field: keyof PlanTask, value: string) => {
    setEditedTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, [field]: value } : t)),
    );
  };

  const handleApprove = async () => {
    if (!plan) return;
    setLoading(true);
    setError(null);
    setPlanStep("executing");

    try {
      // Save edits first if tasks were modified
      if (editedTasks !== plan.tasks) {
        const editRes = await fetch(`/api/plan/${encodeURIComponent(plan.id)}/edit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selectedProject, tasks: editedTasks }),
        });
        if (!editRes.ok) {
          const data = (await editRes.json().catch(() => null)) as Record<string, unknown> | null;
          throw new Error((data?.error as string) ?? "Failed to save edits");
        }
      }

      // Approve the plan
      const res = await fetch(`/api/plan/${encodeURIComponent(plan.id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        throw new Error((data?.error as string) ?? "Failed to approve plan");
      }

      setPlanStep("done");
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve plan");
      setPlanStep("review");
    } finally {
      setLoading(false);
    }
  };

  const spinnerSvg = (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-base)]"
        style={{ animation: "slide-in-right 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            {planStep === "select" && "New Work"}
            {planStep === "describe" && "Plan Feature"}
            {planStep === "planning" && "Planning..."}
            {planStep === "review" && "Review Plan"}
            {planStep === "executing" && "Creating Issues..."}
            {planStep === "done" && "Done!"}
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
          {/* Project Selector (always visible except in done/executing) */}
          {planStep !== "done" && planStep !== "executing" && (
            <>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                disabled={planStep !== "select" && planStep !== "describe"}
                className="mb-6 w-full rounded-[6px] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
              >
                {projects.length !== 1 && <option value="">Select a project...</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {/* ─── Step: Select ─── */}
          {planStep === "select" && (
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
                    {spinnerSvg}
                    Spawning session...
                  </div>
                )}
              </button>

              {/* Plan Feature */}
              <button
                onClick={() => setPlanStep("describe")}
                disabled={!canSubmit}
                className="w-full rounded-[8px] border border-[var(--color-border-default)] p-4 text-left transition-colors hover:border-[var(--color-accent-violet)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--color-border-default)]"
                style={{
                  background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <svg className="h-4 w-4 text-[var(--color-accent-violet)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                    Plan Feature
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                  Describe a feature, get a plan, then spawn agents to implement it.
                </p>
              </button>
            </div>
          )}

          {/* ─── Step: Describe ─── */}
          {planStep === "describe" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Feature Description
              </label>
              <textarea
                value={featureDescription}
                onChange={(e) => setFeatureDescription(e.target.value)}
                placeholder="Describe the feature you want to build..."
                rows={6}
                maxLength={5000}
                className="mb-4 w-full rounded-[6px] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                style={{ resize: "vertical" }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPlanStep("select");
                    setError(null);
                  }}
                  className="rounded-[6px] border border-[var(--color-border-default)] px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  Back
                </button>
                <button
                  onClick={handlePlanFeature}
                  disabled={!canSubmit || featureDescription.trim().length === 0}
                  className="flex-1 rounded-[6px] bg-[var(--color-accent-violet)] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      {spinnerSvg}
                      Creating plan...
                    </span>
                  ) : (
                    "Plan This"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: Planning ─── */}
          {planStep === "planning" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="mb-4 h-8 w-8 animate-spin text-[var(--color-accent-violet)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                Analyzing codebase...
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                The planning agent is reading your project and creating a task breakdown.
              </p>
            </div>
          )}

          {/* ─── Step: Review ─── */}
          {planStep === "review" && (
            <div>
              <div className="mb-4 space-y-3">
                {editedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-[8px] border border-[var(--color-border-default)] p-3"
                    style={{
                      background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                    }}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => handleUpdateTask(task.id, "title", e.target.value)}
                        className="flex-1 bg-transparent text-[13px] font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
                        placeholder="Task title..."
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          {task.scope}
                        </span>
                        <button
                          onClick={() => handleRemoveTask(task.id)}
                          className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)]"
                          aria-label="Remove task"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                      {task.description.length > 150
                        ? task.description.slice(0, 150) + "..."
                        : task.description}
                    </p>
                    {task.dependencies.length > 0 && (
                      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                        Depends on: {task.dependencies.map((d) => `#${d}`).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Task */}
              <button
                onClick={handleAddTask}
                className="mb-4 w-full rounded-[6px] border border-dashed border-[var(--color-border-default)] py-2 text-[11px] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-secondary)]"
              >
                + Add Task
              </button>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPlanStep("describe");
                    setError(null);
                  }}
                  className="rounded-[6px] border border-[var(--color-border-default)] px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  Back
                </button>
                <button
                  onClick={handleApprove}
                  disabled={loading || editedTasks.length === 0}
                  className="flex-1 rounded-[6px] bg-[var(--color-accent-green)] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create Issues & Spawn
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: Executing ─── */}
          {planStep === "executing" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="mb-4 h-8 w-8 animate-spin text-[var(--color-accent-green)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                Creating issues & spawning agents...
              </p>
            </div>
          )}

          {/* ─── Step: Done ─── */}
          {planStep === "done" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="mb-4 h-8 w-8 text-[var(--color-accent-green)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                Agents spawned!
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Reloading dashboard...
              </p>
            </div>
          )}

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
