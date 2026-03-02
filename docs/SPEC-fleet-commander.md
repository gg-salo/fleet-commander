# Fleet Commander — Spec & Vision

## What We're Building

An enhanced workflow layer on top of Agent Orchestrator that turns it from a "session manager" into a **full autonomous development pipeline** for solo developers and small teams who rely heavily on AI coding.

The core idea: **you describe what you want in plain language, and the system plans it, builds it, reviews it, and queues it for your approval.**

---

## The Pipeline

```
You (plain language) → Planning Agent → GitHub Issues → Coding Agents → Review Agent → You merge
                                                              ↑
                                                    CI/Testing guardrails
```

## User Persona

Solo developer or tiny team. Codes with AI (vibe coding). Strong on product vision, UX intuition, and catching logic gaps. Not a line-by-line code reviewer. Manages multiple SaaS projects simultaneously. Wants to supervise a fleet of AI developers, not babysit each one.

---

## Three New Agents

### 1. Planning Agent

**Role:** Takes a plain-language feature description and breaks it into well-scoped, agent-ready GitHub issues.

**How it works:**
- User writes a feature description in the dashboard (e.g., "Add a content calendar where users can see scheduled posts, drag to reschedule, and click to edit")
- Planning agent analyzes the project codebase (reads CLAUDE.md, file structure, existing patterns)
- Produces a task breakdown: 3-6 issues, each small enough for one agent session, with dependencies mapped
- User reviews the plan at the **product level** (not code level) — edits, adds, removes tasks
- User approves → issues are created on GitHub → coding agents are spawned

**What it outputs (per task):**
- Title (concise, action-oriented)
- Description (acceptance criteria, relevant files/patterns, constraints)
- Dependencies (which tasks must finish first)
- Estimated scope (small/medium — no large tasks, those get split further)

**Leverages:** Existing `spawnOrchestrator()` infrastructure + orchestrator prompt system. The planning agent is a Claude Code session with a specialized system prompt.

### 2. CI/Testing Setup Agent (One-Time Per Project)

**Role:** Bootstraps CI and testing guardrails on a project that doesn't have them yet.

**How it works:**
- User triggers "Set up CI" from the dashboard for a project
- Agent analyzes the codebase: tech stack, existing tests (if any), build system
- Creates `.github/workflows/ci.yml` with: lint, typecheck, build, test
- Writes baseline tests for core business logic (API routes, key functions, data validation)
- Opens a PR with all of this for the user to merge

**This is the foundation.** Without CI, the reaction system has nothing to work with. This agent runs once per project to establish the safety net that makes everything else reliable.

**Leverages:** Standard `ao spawn` with a specialized prompt. No framework changes needed.

### 3. Review Agent

**Role:** Automatically reviews PRs created by coding agents before the user sees them.

**How it works:**
- Coding agent opens a PR → lifecycle manager detects `pr.created` event
- New reaction (`pr-created`) spawns a review agent session
- Review agent checks the PR against:
  - The original issue requirements (does it do what was asked?)
  - Project conventions (from CLAUDE.md / agentRules)
  - Security basics (no hardcoded secrets, no SQL injection, etc.)
  - Test coverage (did the agent write tests?)
  - Code quality (no massive files, no dead code, no obvious bugs)
- Posts review as a structured comment on the PR
- If issues found → reaction system sends them back to the coding agent
- If approved → PR moves to "ready for merge" → user gets notified

**What it catches vs. what the user catches:**
- Review agent: mechanical issues (bugs, security, conventions, missing tests)
- User: product-level issues (does this feature make sense? is the UX right?)

**Leverages:** Existing reaction system + new `pr.created` reaction type + new `SCM.postReview()` method on the GitHub SCM plugin.

---

## Dashboard Changes

### New: Planning Panel (the entry point)

**Accessed via:** "+ New Work" button on the main dashboard header.

**Flow:**

**Step 1 — Describe**
```
┌─────────────────────────────────────────────────────────┐
│  New Work                                                │
│                                                          │
│  Project: [RankFuel ▾]                                   │
│                                                          │
│  What do you want to build?                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Add a content calendar view where users can see    │  │
│  │ scheduled posts, drag to reschedule, and click to  │  │
│  │ edit. Should integrate with the existing post      │  │
│  │ editor.                                            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [Plan This →]                                           │
└─────────────────────────────────────────────────────────┘
```

**Step 2 — Review Plan**
```
┌─────────────────────────────────────────────────────────┐
│  Plan: Content Calendar                          [Edit]  │
│                                                          │
│  4 tasks · Est. 4 agent sessions · ~2-3 hours            │
│                                                          │
│  ┌─ 1. Add CalendarView component ──────────────────┐   │
│  │  Week/month toggle, renders PostCard per day      │   │
│  │  Files: src/components/CalendarView.tsx            │   │
│  │  Scope: medium                                    │   │
│  │  [Edit] [Remove]                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ 2. Add GET /api/posts/scheduled ────────────────┐   │
│  │  Returns posts grouped by date, supports range    │   │
│  │  Scope: small                                     │   │
│  │  [Edit] [Remove]                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ 3. Drag-to-reschedule + PATCH endpoint ─────────┐   │
│  │  Depends on: #1, #2                               │   │
│  │  Scope: medium                                    │   │
│  │  [Edit] [Remove]                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ 4. Connect calendar to post editor ─────────────┐   │
│  │  Depends on: #1                                   │   │
│  │  Scope: small                                     │   │
│  │  [Edit] [Remove]                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [+ Add Task]                                            │
│                                                          │
│  [← Back]  [Create Issues & Spawn →]                     │
└─────────────────────────────────────────────────────────┘
```

**Step 3 — Executing**

After "Create Issues & Spawn", the system:
1. Creates GitHub issues for each task
2. Spawns coding agents in dependency order (independent tasks in parallel, dependent tasks queued)
3. Returns user to main dashboard where sessions appear in real-time

### New: Review Insights on Session Cards

Session cards get a new section when the review agent has posted:

```
┌─ rf-12  Calendar grid component ────────────────────┐
│  ██████████░░ PR #47 · CI passing                    │
│                                                      │
│  Review Agent: ✅ Approved                           │
│  "Code follows project patterns. Tests cover the     │
│   main render paths. One minor suggestion posted."   │
│                                                      │
│  [View PR] [Merge] [View Review]                     │
└──────────────────────────────────────────────────────┘
```

Or if issues were found:

```
┌─ rf-13  Scheduled posts API ────────────────────────┐
│  ██████████░░ PR #48 · CI passing                    │
│                                                      │
│  Review Agent: ⚠️ 2 issues found                     │
│  "Missing input validation on date range params.     │
│   No tests for edge case: empty schedule."           │
│  → Sent back to coding agent                         │
│                                                      │
│  [View PR] [View Review]                             │
└──────────────────────────────────────────────────────┘
```

### New: Daily Summary View

A collapsible section at the top of the dashboard (or a separate `/summary` page):

```
┌─────────────────────────────────────────────────────┐
│  Today's Summary                                     │
│                                                      │
│  ✅ Merged: 3 PRs                                   │
│     rf-13 Scheduled posts API                        │
│     rp-8  Subreddit config page                      │
│     rp-7  Mention alert webhook                      │
│                                                      │
│  👀 Ready to merge: 1 PR                            │
│     rf-12 Calendar grid component                    │
│                                                      │
│  🔧 Working: 2 sessions                             │
│     rf-14 Drag to reschedule (waiting on rf-12)      │
│     rf-15 Post editor connection                     │
│                                                      │
│  📋 Plans pending: 0                                │
│                                                      │
│  💰 Estimated cost today: ~$6.80                    │
└─────────────────────────────────────────────────────┘
```

### New: CI Setup Flow

Accessible per-project, one-time setup:

```
┌─────────────────────────────────────────────────────┐
│  RankFuel — Setup                                    │
│                                                      │
│  CI Status: ❌ No CI pipeline detected               │
│                                                      │
│  The CI setup agent will:                            │
│  • Analyze your codebase and tech stack              │
│  • Create a GitHub Actions CI workflow               │
│  • Write baseline tests for core logic               │
│  • Open a PR for your review                         │
│                                                      │
│  This is recommended before spawning coding agents.  │
│                                                      │
│  [Set Up CI →]                                       │
└─────────────────────────────────────────────────────┘
```

### Enhanced: Notification Center

In-dashboard feed (dropdown from header bell icon):

```
┌─────────────────────────────────────────────────────┐
│  🔔 Notifications                          [Clear]   │
│                                                      │
│  2m ago · rf-12 PR ready to merge                    │
│  15m ago · rf-13 Review agent approved               │
│  30m ago · rp-8 Agent addressed review comments      │
│  1h ago · rf-14 Spawned (waiting on dependencies)    │
│  1h ago · Plan "Content Calendar" created 4 issues   │
└─────────────────────────────────────────────────────┘
```

---

## New API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/plan` | POST | Submit feature description → start planning agent |
| `/api/plan/[id]` | GET | Get plan status and task breakdown |
| `/api/plan/[id]/approve` | POST | Approve plan → create issues + spawn agents |
| `/api/plan/[id]/edit` | PATCH | Edit plan tasks before approval |
| `/api/setup-ci` | POST | Trigger CI setup agent for a project |
| `/api/notifications` | GET | Get notification feed for dashboard |

---

## New Reaction Types

| Reaction | Trigger | Action |
|----------|---------|--------|
| `pr-created` | Coding agent opens a PR | Spawn review agent for that PR |
| `review-approved` | Review agent approves | Notify user: "PR ready to merge" |
| `review-issues` | Review agent finds problems | Send issues back to coding agent |

---

## Backend Changes

### Core (packages/core)

1. **Plan Service** — New service that manages planning sessions
   - `createPlan(projectId, description)` → spawns planning agent
   - `getPlan(planId)` → returns parsed task breakdown
   - `approvePlan(planId)` → creates GitHub issues + spawns agents in dependency order
   - Stores plan state in data directory (like session metadata)

2. **New reaction types** — Add `pr-created`, `review-approved`, `review-issues` to lifecycle manager's event-to-reaction mapping

3. **SCM enhancement** — Add `postReview(pr, body, verdict)` method to SCM interface and GitHub plugin

### Plugins

4. **Review agent prompt** — Specialized system prompt for code review (project conventions, security checklist, test coverage requirements)

5. **CI setup agent prompt** — Specialized system prompt for bootstrapping CI + tests

---

## Implementation Phases

### Phase 1: Foundation (CI Setup + Project Guardrails)
- CI setup agent prompt
- Dashboard: CI setup flow per project
- API route: `/api/setup-ci`
- **Why first:** Everything else depends on CI being in place

### Phase 2: Planning Agent
- Plan service in core
- Planning agent prompt (the key piece)
- Dashboard: Planning panel (describe → review → approve → spawn)
- API routes: `/api/plan`, `/api/plan/[id]`, `/api/plan/[id]/approve`
- Dependency-aware spawning (parallel where possible, queued where dependent)
- **Why second:** This is the main entry point for the user

### Phase 3: Review Agent
- New reaction type: `pr-created` → spawn review agent
- Review agent prompt
- `SCM.postReview()` implementation in scm-github
- Dashboard: Review insights on session cards
- Reaction types: `review-approved`, `review-issues`
- **Why third:** Needs the reaction system and SCM enhancement

### Phase 4: Polish
- Daily summary view
- Notification center in dashboard
- Cost tracking aggregation
- Dependency visualization (simple DAG)
- Plan history (past plans and their outcomes)

---

## Design Principles

1. **Product-level review, not code-level.** The user reviews plans and tests features. They don't read diffs.
2. **Progressive disclosure.** Dashboard shows status at a glance, details on click.
3. **Graceful degradation.** If planning agent is slow, show a spinner. If review agent fails, fall back to normal flow (user reviews manually).
4. **No new dependencies.** Build with existing stack (Tailwind, React, custom components). No shadcn, no new UI libraries.
5. **Security first.** Validate all inputs. Never interpolate user text into shell commands. Use `execFile`.
6. **Small PRs.** Each phase should be deliverable independently. Don't build Phase 3 features into Phase 1 code.

---

## Tech Decisions

- **Planning agent output format:** Structured JSON (parsed from agent's response) with fallback to markdown parsing
- **Plan storage:** Flat files in data directory (consistent with existing session metadata pattern)
- **Review agent communication:** Posts GitHub PR review comments via `gh api` (through SCM plugin)
- **Dependency-aware spawning:** Simple topological sort. Independent tasks spawn immediately, dependent tasks spawn when blockers complete (lifecycle manager already detects session completion)
- **Notification storage:** JSONL event log (already exists) + new API route to query recent events

---

## Resolved Decisions

1. **Plan editing granularity** — Start simple: reorder + add/remove tasks only. Editing issue descriptions in the dashboard comes later.
2. **Review agent depth** — Lightweight checklist (conventions + security + tests). Deep code review comes later.
3. **Multi-plan coordination** — Allow multiple plans running simultaneously. Sessions are isolated by worktree. Dashboard shows all.
4. **Cost controls** — Not in v1. Add budget limits later based on actual usage patterns.
