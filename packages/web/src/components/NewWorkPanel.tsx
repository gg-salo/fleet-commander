"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Plan,
  PlanTask,
  Discovery,
  DiscoveryFinding,
  PRListItem,
  ReviewBatch,
} from "@/lib/types";
import { DependencyGraph } from "./DependencyGraph";

type PlanStep =
  | "select"
  | "describe"
  | "planning"
  | "review"
  | "executing"
  | "done"
  | "discover-describe"
  | "discovering"
  | "discover-review"
  | "review-select"
  | "review-progress"
  | "review-results";

interface NewWorkPanelProps {
  projects: Array<{ id: string; name: string }>;
  onClose: () => void;
}

type DiscoveryTypeOption = "ux-audit" | "competitor-research" | "code-health";

export function NewWorkPanel({ projects, onClose }: NewWorkPanelProps) {
  const defaultProject = projects.length === 1 ? projects[0].id : "";
  const [selectedProject, setSelectedProject] = useState(defaultProject);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Plan state
  const [planStep, setPlanStep] = useState<PlanStep>("select");
  const [featureDescription, setFeatureDescription] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [editedTasks, setEditedTasks] = useState<PlanTask[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Discovery state
  const [discoveryType, setDiscoveryType] = useState<DiscoveryTypeOption>("ux-audit");
  const [discoveryContext, setDiscoveryContext] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());

  // Review PRs state
  const [openPRs, setOpenPRs] = useState<PRListItem[]>([]);
  const [selectedPRs, setSelectedPRs] = useState<Set<number>>(new Set());
  const [reviewBatch, setReviewBatch] = useState<ReviewBatch | null>(null);
  const [loadingPRs, setLoadingPRs] = useState(false);

  const canSubmit = useMemo(() => selectedProject !== "" && loadingAction === null, [selectedProject, loadingAction]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSetupCI = async () => {
    if (!canSubmit) return;
    setLoadingAction("ci");
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
      setLoadingAction(null);
    }
  };

  const handleGenerateClaudeMd = async () => {
    if (!canSubmit) return;
    setLoadingAction("claude-md");
    setError(null);
    try {
      const res = await fetch("/api/generate-claudemd", {
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
      setError(err instanceof Error ? err.message : "Failed to spawn CLAUDE.md generator");
    } finally {
      setLoadingAction(null);
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

  const pollDiscovery = useCallback(
    (discoveryId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/discover/${encodeURIComponent(discoveryId)}?projectId=${encodeURIComponent(selectedProject)}`,
          );
          if (!res.ok) return;
          const data = (await res.json()) as { discovery: Discovery };
          setDiscovery(data.discovery);

          if (data.discovery.status === "ready") {
            if (pollRef.current) clearInterval(pollRef.current);
            // Select all findings by default
            setSelectedFindings(new Set(data.discovery.findings.map((f) => f.id)));
            setPlanStep("discover-review");
          } else if (data.discovery.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(data.discovery.error ?? "Discovery failed");
            setPlanStep("discover-describe");
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
    setLoadingAction("plan");
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
      setLoadingAction(null);
    }
  };

  const handleStartDiscovery = async () => {
    if (!canSubmit) return;
    setLoadingAction("discover");
    setError(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          type: discoveryType,
          context: discoveryContext.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        throw new Error((data?.error as string) ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { discovery: Discovery };
      setDiscovery(data.discovery);
      setPlanStep("discovering");
      pollDiscovery(data.discovery.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start discovery");
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePlanSelected = async () => {
    if (!discovery || selectedFindings.size === 0) return;

    // Build feature description from selected findings
    const selected = discovery.findings.filter((f) => selectedFindings.has(f.id));
    const description = selected
      .map((f) => `## ${f.title}\n\n${f.description}\n\n**Priority:** ${f.priority} | **Effort:** ${f.effort}`)
      .join("\n\n---\n\n");

    // Switch to planning flow with the concatenated description
    setFeatureDescription(description);
    setLoadingAction("plan-selected");
    setError(null);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          description,
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
      setError(err instanceof Error ? err.message : "Failed to create plan from findings");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleFetchOpenPRs = useCallback(async () => {
    if (!selectedProject) return;
    setLoadingPRs(true);
    try {
      const res = await fetch(`/api/review-prs?projectId=${encodeURIComponent(selectedProject)}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        throw new Error((data?.error as string) ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { prs: PRListItem[] };
      setOpenPRs(data.prs);
      setSelectedPRs(new Set(data.prs.map((pr) => pr.number)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch open PRs");
    } finally {
      setLoadingPRs(false);
    }
  }, [selectedProject]);

  const handleReviewSelected = async () => {
    if (!canSubmit || selectedPRs.size === 0) return;
    setLoadingAction("review-prs");
    setError(null);
    try {
      const res = await fetch("/api/review-prs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          prNumbers: Array.from(selectedPRs),
          autoFix: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        throw new Error((data?.error as string) ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { batch: ReviewBatch };
      setReviewBatch(data.batch);
      setPlanStep("review-progress");
      pollReviewBatch(data.batch.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start review batch");
    } finally {
      setLoadingAction(null);
    }
  };

  const pollReviewBatch = useCallback(
    (batchId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/review-prs/${encodeURIComponent(batchId)}?projectId=${encodeURIComponent(selectedProject)}`,
          );
          if (!res.ok) return;
          const data = (await res.json()) as { batch: ReviewBatch };
          setReviewBatch(data.batch);

          if (data.batch.status === "done" || data.batch.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setPlanStep("review-results");
          }
        } catch {
          // Ignore poll errors
        }
      }, 3000);
    },
    [selectedProject],
  );

  const togglePR = (prNumber: number) => {
    setSelectedPRs((prev) => {
      const next = new Set(prev);
      if (next.has(prNumber)) {
        next.delete(prNumber);
      } else {
        next.add(prNumber);
      }
      return next;
    });
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
    setLoadingAction("approve");
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
      setLoadingAction(null);
    }
  };

  const toggleFinding = (findingId: string) => {
    setSelectedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) {
        next.delete(findingId);
      } else {
        next.add(findingId);
      }
      return next;
    });
  };

  const spinnerSvg = (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  const headerTitle = () => {
    switch (planStep) {
      case "select": return "New Work";
      case "describe": return "Plan Feature";
      case "planning": return "Planning...";
      case "review": return "Review Plan";
      case "executing": return "Creating Issues...";
      case "done": return "Done!";
      case "discover-describe": return "Discovery";
      case "discovering": return "Discovering...";
      case "discover-review": return "Review Findings";
      case "review-select": return "Review PRs";
      case "review-progress": return "Reviewing...";
      case "review-results": return "Review Results";
    }
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

  const DISCOVERY_LABELS: Record<DiscoveryTypeOption, { label: string; description: string; color: string }> = {
    "ux-audit": {
      label: "UI/UX Audit",
      description: "Audit your interface design and user experience, suggest improvements",
      color: "var(--color-accent-violet)",
    },
    "competitor-research": {
      label: "Competitor Research",
      description: "Research competitors and identify feature gaps",
      color: "var(--color-accent-blue)",
    },
    "code-health": {
      label: "Code Health Audit",
      description: "Find tech debt, security issues, and performance problems",
      color: "var(--color-status-attention)",
    },
  };

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
            {headerTitle()}
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
          {/* Project Selector (always visible except in done/executing/discovering) */}
          {planStep !== "done" && planStep !== "executing" && planStep !== "discovering" && planStep !== "review-progress" && (
            <>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                disabled={planStep !== "select" && planStep !== "describe" && planStep !== "discover-describe" && planStep !== "review-select"}
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
            <div className="space-y-6">
              {/* Build section */}
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
                  Build
                </h3>
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
                    {loadingAction === "ci" && (
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
              </div>

              {/* Review section */}
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
                  Review
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setPlanStep("review-select");
                      void handleFetchOpenPRs();
                    }}
                    disabled={!canSubmit}
                    className="w-full rounded-[8px] border border-[var(--color-border-default)] p-4 text-left transition-colors hover:border-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--color-border-default)]"
                    style={{
                      background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <svg className="h-4 w-4 text-[var(--color-accent-blue)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                        Review Open PRs
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                      Batch-review open PRs with AI agents. Auto-fix when changes are requested.
                    </p>
                  </button>
                </div>
              </div>

              {/* Discover section */}
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
                  Discover
                </h3>
                <div className="space-y-3">
                  {(Object.entries(DISCOVERY_LABELS) as Array<[DiscoveryTypeOption, typeof DISCOVERY_LABELS[DiscoveryTypeOption]]>).map(
                    ([type, info]) => (
                      <button
                        key={type}
                        onClick={() => {
                          setDiscoveryType(type);
                          setPlanStep("discover-describe");
                        }}
                        disabled={!canSubmit}
                        className="w-full rounded-[8px] border border-[var(--color-border-default)] p-4 text-left transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--color-border-default)]"
                        style={{
                          background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
                        }}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <svg className="h-4 w-4" style={{ color: info.color }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                            {info.label}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                          {info.description}
                        </p>
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Setup section */}
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
                  Setup
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={handleGenerateClaudeMd}
                    disabled={!canSubmit}
                    className="w-full rounded-[8px] border border-[var(--color-border-default)] p-4 text-left transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--color-border-default)]"
                    style={{
                      background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <svg className="h-4 w-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                        Generate CLAUDE.md
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                      Create a comprehensive CLAUDE.md for AI agents working in your codebase.
                    </p>
                    {loadingAction === "claude-md" && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-accent)]">
                        {spinnerSvg}
                        Spawning session...
                      </div>
                    )}
                  </button>
                </div>
              </div>
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
                  {loadingAction === "plan" ? (
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

          {/* ─── Step: Discover Describe ─── */}
          {planStep === "discover-describe" && (
            <div>
              <div className="mb-4 flex items-center gap-2 rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2">
                <svg className="h-4 w-4 shrink-0" style={{ color: DISCOVERY_LABELS[discoveryType].color }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {DISCOVERY_LABELS[discoveryType].label}
                </span>
              </div>

              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Focus Area (optional)
              </label>
              <textarea
                value={discoveryContext}
                onChange={(e) => setDiscoveryContext(e.target.value)}
                placeholder="E.g., 'Focus on the dashboard pages' or 'Compare with Vercel and Netlify'"
                rows={4}
                maxLength={5000}
                className="mb-4 w-full rounded-[6px] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                style={{ resize: "vertical" }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPlanStep("select");
                    setError(null);
                    setDiscoveryContext("");
                  }}
                  className="rounded-[6px] border border-[var(--color-border-default)] px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  Back
                </button>
                <button
                  onClick={handleStartDiscovery}
                  disabled={!canSubmit}
                  className="flex-1 rounded-[6px] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: DISCOVERY_LABELS[discoveryType].color }}
                >
                  {loadingAction === "discover" ? (
                    <span className="flex items-center justify-center gap-2">
                      {spinnerSvg}
                      Starting...
                    </span>
                  ) : (
                    "Start Discovery"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: Discovering ─── */}
          {planStep === "discovering" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="mb-4 h-8 w-8 animate-spin" style={{ color: DISCOVERY_LABELS[discoveryType].color }} viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                Analyzing codebase...
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                The {DISCOVERY_LABELS[discoveryType].label.toLowerCase()} agent is working. This may take a few minutes.
              </p>
            </div>
          )}

          {/* ─── Step: Discover Review ─── */}
          {planStep === "discover-review" && discovery && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {selectedFindings.size} of {discovery.findings.length} selected
                </span>
                <button
                  onClick={() => {
                    if (selectedFindings.size === discovery.findings.length) {
                      setSelectedFindings(new Set());
                    } else {
                      setSelectedFindings(new Set(discovery.findings.map((f) => f.id)));
                    }
                  }}
                  className="text-[11px] text-[var(--color-accent)] hover:underline"
                >
                  {selectedFindings.size === discovery.findings.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="mb-4 space-y-2">
                {discovery.findings.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    selected={selectedFindings.has(finding.id)}
                    onToggle={() => toggleFinding(finding.id)}
                    priorityColors={PRIORITY_COLORS}
                    effortColors={EFFORT_COLORS}
                  />
                ))}
              </div>

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
                  onClick={handlePlanSelected}
                  disabled={loadingAction !== null || selectedFindings.size === 0}
                  className="flex-1 rounded-[6px] bg-[var(--color-accent-violet)] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingAction === "plan-selected" ? (
                    <span className="flex items-center justify-center gap-2">
                      {spinnerSvg}
                      Creating plan...
                    </span>
                  ) : (
                    `Plan Selected (${selectedFindings.size})`
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: Review Select ─── */}
          {planStep === "review-select" && (
            <div>
              {loadingPRs ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg className="mb-4 h-6 w-6 animate-spin text-[var(--color-accent-blue)]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-[12px] text-[var(--color-text-muted)]">Fetching open PRs...</p>
                </div>
              ) : openPRs.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[13px] text-[var(--color-text-secondary)]">No open PRs found.</p>
                  <button
                    onClick={() => { setPlanStep("select"); setError(null); }}
                    className="mt-3 rounded-[6px] border border-[var(--color-border-default)] px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  >
                    Back
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {selectedPRs.size} of {openPRs.length} selected
                    </span>
                    <button
                      onClick={() => {
                        if (selectedPRs.size === openPRs.length) {
                          setSelectedPRs(new Set());
                        } else {
                          setSelectedPRs(new Set(openPRs.map((pr) => pr.number)));
                        }
                      }}
                      className="text-[11px] text-[var(--color-accent)] hover:underline"
                    >
                      {selectedPRs.size === openPRs.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div className="mb-4 space-y-2">
                    {openPRs.map((pr) => (
                      <button
                        key={pr.number}
                        onClick={() => togglePR(pr.number)}
                        className="w-full rounded-[8px] border p-3 text-left transition-colors"
                        style={{
                          borderColor: selectedPRs.has(pr.number) ? "var(--color-accent)" : "var(--color-border-default)",
                          background: selectedPRs.has(pr.number)
                            ? "linear-gradient(175deg, rgba(31,111,235,0.08) 0%, rgba(18,23,31,1) 100%)"
                            : "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                            style={{
                              borderColor: selectedPRs.has(pr.number) ? "var(--color-accent)" : "var(--color-border-default)",
                              backgroundColor: selectedPRs.has(pr.number) ? "var(--color-accent)" : "transparent",
                            }}
                          >
                            {selectedPRs.has(pr.number) && (
                              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">#{pr.number}</span>
                              <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">{pr.title}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                                style={{
                                  color: pr.ciStatus === "passing" ? "var(--color-accent-green)" : pr.ciStatus === "failing" ? "var(--color-status-error)" : "var(--color-text-muted)",
                                  backgroundColor: pr.ciStatus === "passing" ? "rgba(63,185,80,0.12)" : pr.ciStatus === "failing" ? "rgba(248,81,73,0.12)" : "var(--color-bg-subtle)",
                                }}
                              >
                                CI: {pr.ciStatus}
                              </span>
                              <span className="rounded-full bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]">
                                +{pr.additions} -{pr.deletions}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPlanStep("select"); setError(null); }}
                      className="rounded-[6px] border border-[var(--color-border-default)] px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleReviewSelected}
                      disabled={!canSubmit || selectedPRs.size === 0}
                      className="flex-1 rounded-[6px] bg-[var(--color-accent-blue)] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingAction === "review-prs" ? (
                        <span className="flex items-center justify-center gap-2">
                          {spinnerSvg}
                          Starting review...
                        </span>
                      ) : (
                        `Review Selected (${selectedPRs.size})`
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Step: Review Progress ─── */}
          {planStep === "review-progress" && reviewBatch && (
            <div>
              <div className="mb-4 space-y-2">
                {reviewBatch.items.map((item) => (
                  <div
                    key={item.prNumber}
                    className="flex items-center gap-3 rounded-[8px] border border-[var(--color-border-default)] p-3"
                    style={{
                      background: "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
                    }}
                  >
                    {/* Status icon */}
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {item.status === "reviewing" && (
                        <svg className="h-4 w-4 animate-spin text-[var(--color-accent-blue)]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {item.status === "approved" && (
                        <svg className="h-4 w-4 text-[var(--color-accent-green)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {item.status === "fixing" && (
                        <svg className="h-4 w-4 animate-spin text-[var(--color-status-attention)]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {item.status === "fix_done" && (
                        <svg className="h-4 w-4 text-[var(--color-accent-green)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {item.status === "rejected" && (
                        <svg className="h-4 w-4 text-[var(--color-status-error)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      )}
                      {item.status === "pending" && (
                        <div className="h-3 w-3 rounded-full bg-[var(--color-text-muted)]" />
                      )}
                    </div>

                    {/* PR info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                        #{item.prNumber} {item.prTitle}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">
                        {item.status === "reviewing" && "Reviewing..."}
                        {item.status === "approved" && "Approved"}
                        {item.status === "fixing" && "Fixing review feedback..."}
                        {item.status === "fix_done" && "Fixes pushed"}
                        {item.status === "rejected" && (item.error ?? "Changes requested")}
                        {item.status === "pending" && "Queued"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-center text-[11px] text-[var(--color-text-muted)]">
                Polling every 3s...
              </p>
            </div>
          )}

          {/* ─── Step: Review Results ─── */}
          {planStep === "review-results" && reviewBatch && (
            <div>
              {/* Summary counts */}
              <div className="mb-4 flex gap-3">
                {[
                  { label: "Approved", count: reviewBatch.items.filter((i) => i.status === "approved").length, color: "var(--color-accent-green)" },
                  { label: "Fixed", count: reviewBatch.items.filter((i) => i.status === "fix_done").length, color: "var(--color-status-attention)" },
                  { label: "Rejected", count: reviewBatch.items.filter((i) => i.status === "rejected").length, color: "var(--color-status-error)" },
                ].filter((s) => s.count > 0).map((s) => (
                  <div
                    key={s.label}
                    className="flex-1 rounded-[6px] border border-[var(--color-border-subtle)] p-2 text-center"
                    style={{ background: "var(--color-bg-surface)" }}
                  >
                    <p className="text-[16px] font-bold" style={{ color: s.color }}>{s.count}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Per-PR links */}
              <div className="mb-4 space-y-1.5">
                {reviewBatch.items.map((item) => (
                  <a
                    key={item.prNumber}
                    href={item.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                  >
                    <span className={
                      item.status === "approved" ? "text-[var(--color-accent-green)]" :
                      item.status === "fix_done" ? "text-[var(--color-status-attention)]" :
                      "text-[var(--color-status-error)]"
                    }>
                      {item.status === "approved" ? "+" : item.status === "fix_done" ? "~" : "x"}
                    </span>
                    #{item.prNumber} {item.prTitle}
                  </a>
                ))}
              </div>

              <button
                onClick={() => {
                  onClose();
                  window.location.reload();
                }}
                className="w-full rounded-[6px] bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90"
              >
                Done
              </button>
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
              {/* Dependency graph (only when tasks have dependencies) */}
              {editedTasks.some((t) => t.dependencies.length > 0) && (
                <div className="mb-4">
                  <DependencyGraph tasks={editedTasks} />
                </div>
              )}

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
                  disabled={loadingAction !== null || editedTasks.length === 0}
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

function FindingCard({
  finding,
  selected,
  onToggle,
  priorityColors,
  effortColors,
}: {
  finding: DiscoveryFinding;
  selected: boolean;
  onToggle: () => void;
  priorityColors: Record<string, string>;
  effortColors: Record<string, string>;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full rounded-[8px] border p-3 text-left transition-colors"
      style={{
        borderColor: selected ? "var(--color-accent)" : "var(--color-border-default)",
        background: selected
          ? "linear-gradient(175deg, rgba(31,111,235,0.08) 0%, rgba(18,23,31,1) 100%)"
          : "linear-gradient(175deg, rgba(28,36,47,1) 0%, rgba(18,23,31,1) 100%)",
      }}
    >
      <div className="mb-1 flex items-start gap-2">
        <div
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
          style={{
            borderColor: selected ? "var(--color-accent)" : "var(--color-border-default)",
            backgroundColor: selected ? "var(--color-accent)" : "transparent",
          }}
        >
          {selected && (
            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">
            {finding.title}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {finding.description.length > 120
              ? finding.description.slice(0, 120) + "..."
              : finding.description}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{
                color: priorityColors[finding.priority],
                backgroundColor: `color-mix(in srgb, ${priorityColors[finding.priority]} 12%, transparent)`,
              }}
            >
              {finding.priority}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{
                color: effortColors[finding.effort],
                backgroundColor: `color-mix(in srgb, ${effortColors[finding.effort]} 12%, transparent)`,
              }}
            >
              {finding.effort}
            </span>
            <span className="rounded-full bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]">
              {finding.category}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
