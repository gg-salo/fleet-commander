# Fleet Commander — Complete Architecture & System Design

**Generated:** 2026-02-27
**Codebase:** `fleet-commander` (formerly `agent-orchestrator`)

---

## 1. What It Is

Fleet Commander is an open-source system for orchestrating parallel AI coding agents. It is:

- **Agent-agnostic** — supports Claude Code, OpenAI Codex, Aider, OpenCode
- **Runtime-agnostic** — runs in tmux, child processes (future: Docker, k8s)
- **Tracker-agnostic** — works with GitHub Issues, Linear (future: Jira)

The core idea: you point it at a set of issues, it spawns one AI agent per issue in isolated git worktrees, monitors their progress through the full PR lifecycle (CI, reviews, merge), auto-handles routine problems (CI failures, review comments), and only notifies humans when judgment is needed.

**Core principle: Push, not pull.** Spawn agents, walk away, get notified when your attention is required.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict ESM, `.js` imports, `node:` builtins) |
| Runtime | Node 20+ |
| Package Manager | pnpm workspaces (monorepo) |
| Web Framework | Next.js 15 (App Router) + Tailwind CSS |
| CLI Framework | Commander.js 13 |
| Config | YAML + Zod validation |
| Real-time | Server-Sent Events (SSE) |
| Storage | Flat metadata files (key=value) + JSONL event log |
| Code Quality | ESLint + Prettier + vitest |
| Terminal | xterm.js (web), tmux (native) |

---

## 3. Monorepo Structure

```
fleet-commander/
├── packages/
│   ├── core/                         # @composio/ao-core — types, config, services
│   │   └── src/
│   │       ├── types.ts              # ALL interfaces (the source of truth)
│   │       ├── config.ts             # YAML config loading + Zod validation
│   │       ├── session-manager.ts    # Session CRUD + plugin orchestration
│   │       ├── lifecycle-manager.ts  # State machine + polling + reaction engine
│   │       ├── event-store.ts        # JSONL append-only event log
│   │       ├── plugin-registry.ts    # Plugin discovery + loading
│   │       ├── metadata.ts           # Flat-file key=value session metadata
│   │       ├── paths.ts              # Hash-based directory structure
│   │       ├── plan-service.ts       # Planning workflow orchestration
│   │       ├── discovery-service.ts  # Discovery agent orchestration
│   │       ├── prompt-builder.ts     # 3-layer prompt composition for agents
│   │       ├── orchestrator-prompt.ts # System prompt for orchestrator agent
│   │       ├── planning-prompt.ts    # Prompt for planning agents
│   │       ├── review-prompt.ts      # Prompt for review agents
│   │       ├── discovery-prompts.ts  # Prompts for discovery agents
│   │       ├── ci-setup-prompt.ts    # CI configuration prompt
│   │       ├── claudemd-prompt.ts    # CLAUDE.md generation prompt
│   │       ├── plan-store.ts         # Plan persistence (JSON files)
│   │       ├── discovery-store.ts    # Discovery persistence (JSON files)
│   │       ├── tmux.ts               # Shared tmux utilities
│   │       └── utils.ts              # Shell escape, URL validation, JSONL reader
│   │
│   ├── cli/                          # @composio/ao-cli — the `ao` command
│   │   └── src/
│   │       ├── index.ts              # Entry point, registers all commands
│   │       ├── commands/
│   │       │   ├── init.ts           # Interactive setup wizard
│   │       │   ├── start.ts          # Start orchestrator + dashboard
│   │       │   ├── status.ts         # Rich session status table
│   │       │   ├── spawn.ts          # Spawn single/batch sessions
│   │       │   ├── session.ts        # ls, kill, cleanup, restore
│   │       │   ├── send.ts           # Send message with busy detection
│   │       │   ├── review-check.ts   # Check PRs for review comments
│   │       │   ├── dashboard.ts      # Standalone dashboard server
│   │       │   └── open.ts           # Open sessions in terminal tabs
│   │       └── lib/
│   │           ├── create-session-manager.ts  # SessionManager factory
│   │           ├── plugins.ts                 # Plugin resolution
│   │           ├── shell.ts                   # Safe shell execution
│   │           ├── format.ts                  # Output formatting
│   │           ├── session-utils.ts           # Session helpers
│   │           ├── web-dir.ts                 # Dashboard locator
│   │           ├── dashboard-rebuild.ts       # Build cache management
│   │           └── project-detection.ts       # Project type analysis
│   │
│   ├── web/                          # @composio/ao-web — Next.js dashboard
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx        # Root layout (dark theme, IBM Plex fonts)
│   │       │   ├── page.tsx          # Main dashboard (server component)
│   │       │   ├── sessions/[id]/    # Session detail page
│   │       │   └── api/              # 15+ API routes
│   │       ├── components/
│   │       │   ├── Dashboard.tsx     # Main UI — attention zones, stats, PR table
│   │       │   ├── SessionCard.tsx   # Individual session card
│   │       │   ├── SessionDetail.tsx # Full session detail page
│   │       │   ├── DirectTerminal.tsx # xterm.js terminal
│   │       │   ├── AttentionZone.tsx # Kanban column grouping
│   │       │   ├── NotificationCenter.tsx
│   │       │   ├── PlanHistory.tsx
│   │       │   └── DiscoveryHistory.tsx
│   │       └── lib/
│   │           ├── types.ts          # Dashboard-specific types
│   │           ├── format.ts         # UI formatting utilities
│   │           ├── serialize.ts      # Session → DashboardSession conversion
│   │           ├── cache.ts          # TTL cache for PR data
│   │           ├── services.ts       # Server-side singleton services
│   │           ├── validation.ts     # Input sanitization
│   │           └── hooks/            # useLiveSessions (SSE)
│   │
│   └── plugins/                      # All plugin implementations
│       ├── runtime-tmux/             # Execute agents in tmux sessions
│       ├── runtime-process/          # Execute agents as child processes
│       ├── agent-claude-code/        # Claude Code agent (JSONL activity detection)
│       ├── agent-codex/              # OpenAI Codex agent (shell wrapper hooks)
│       ├── agent-aider/              # Aider agent (git log activity detection)
│       ├── agent-opencode/           # OpenCode agent (experimental)
│       ├── workspace-worktree/       # Git worktree isolation
│       ├── workspace-clone/          # Git clone isolation
│       ├── tracker-github/           # GitHub Issues via gh CLI
│       ├── tracker-linear/           # Linear via GraphQL API
│       ├── scm-github/               # GitHub PR/CI/review lifecycle
│       ├── notifier-desktop/         # macOS/Linux desktop notifications
│       ├── notifier-slack/           # Slack webhook (Block Kit)
│       ├── notifier-webhook/         # Generic HTTP webhook (with retry)
│       ├── notifier-composio/        # Composio SDK (Slack/Discord/Gmail)
│       ├── terminal-iterm2/          # iTerm2 tab management (AppleScript)
│       └── terminal-web/             # Web dashboard terminal (in-memory)
│
├── agent-orchestrator.yaml           # User config (gitignored)
├── agent-orchestrator.yaml.example   # Config template
├── CLAUDE.md                         # Agent coding conventions
└── package.json                      # Monorepo root
```

---

## 4. Plugin Architecture (The Core Abstraction)

Everything is a plugin. There are **8 plugin slots**, each defined by a TypeScript interface in `packages/core/src/types.ts`. Every implementation is a standalone package that exports a `PluginModule`.

### 4.1 Plugin Slot Summary

| # | Slot | Purpose | Key Interface Methods | Built-in Implementations |
|---|------|---------|----------------------|--------------------------|
| 1 | **Runtime** | WHERE agents execute | `create`, `destroy`, `sendMessage`, `sendKeys`, `getOutput`, `isAlive`, `getMetrics`, `getAttachInfo` | tmux, process |
| 2 | **Agent** | WHICH AI tool runs | `getLaunchCommand`, `getEnvironment`, `detectActivity`, `getActivityState`, `getSessionInfo`, `setupWorkspaceHooks`, `isProcessRunning`, `getRestoreCommand` | claude-code, codex, aider, opencode |
| 3 | **Workspace** | HOW code is isolated | `create`, `destroy`, `list`, `exists`, `restore`, `postCreate` | worktree, clone |
| 4 | **Tracker** | WHERE issues live | `getIssue`, `isCompleted`, `branchName`, `generatePrompt`, `listIssues`, `createIssue`, `updateIssue` | github, linear |
| 5 | **SCM** | PR/CI/review lifecycle | `detectPR`, `getPRState`, `getCIChecks`, `getReviews`, `getMergeability`, `mergePR` | github |
| 6 | **Notifier** | HOW humans get alerted | `notify`, `notifyWithActions`, `post` | desktop, slack, webhook, composio |
| 7 | **Terminal** | HOW humans see sessions | `openSession`, `openAll`, `isSessionOpen` | iterm2, web |
| 8 | **Lifecycle** | Automation engine | (core service, not a plugin slot) | built-in |

### 4.2 Plugin Module Pattern

Every plugin exports this shape:

```typescript
import type { PluginModule, Runtime } from "@composio/ao-core";

export const manifest = {
  name: "tmux",
  slot: "runtime" as const,
  description: "Runtime plugin: tmux sessions",
  version: "0.1.0",
};

export function create(config?: Record<string, unknown>): Runtime {
  return { /* interface methods */ };
}

export default { manifest, create } satisfies PluginModule<Runtime>;
```

### 4.3 Plugin Registry

The `PluginRegistry` maps `"slot:name"` to `{ manifest, instance }`. On startup:

1. `loadBuiltins()` tries to import each built-in plugin package
2. Gracefully skips any that aren't installed
3. Calls `create(config)` to instantiate
4. Stores in the map

Plugins are resolved per-project — each project can override the default runtime, agent, workspace, etc.

### 4.4 Plugin Implementation Details

#### Runtime: tmux
- Creates detached tmux sessions
- Handles long commands (>200 chars) via `load-buffer` + `paste-buffer` to avoid truncation
- Validates session IDs with regex to prevent shell injection
- `sendMessage()` clears input with `C-u` before sending

#### Runtime: process
- Spawns child processes with `detached: true` for process group management
- Rolling output buffer (max 1000 lines)
- Graceful shutdown: SIGTERM → 5s wait → SIGKILL

#### Agent: claude-code (most mature, 796 lines)
- **Activity detection**: Reads JSONL session files at `~/.claude/projects/{encoded-path}/`
  - Only reads last 128KB for performance
  - `type: "thinking"` → active, `type: "ready"` → ready/idle
- **Metadata hooks**: Installs bash PostToolUse hook that intercepts `gh pr create`, `git checkout -b`, `gh pr merge` and auto-updates session metadata
- **Cost tracking**: Extracts `costUSD` from JSONL entries
- **Session resume**: Detects last session file, generates `--session-id` command

#### Agent: codex
- Uses shell wrapper scripts at `~/.ao/bin/` that intercept `gh`/`git` commands
- Wrapper scripts source a shared `ao-metadata-helper` with path traversal validation
- Prepends `~/.ao/bin` to PATH so wrappers intercept before real commands

#### Agent: aider
- Monitors `.aider.chat.history.md` mtime + `git log --since="60 seconds ago"` for activity
- Conservative: returns `null` when uncertain (avoids false positives)

#### Workspace: worktree
- `git worktree add -b {branch} {path} origin/{defaultBranch}`
- Handles "branch already exists" by checking out existing branch
- Configurable base dir (default `~/.worktrees`)

#### Workspace: clone
- `git clone --reference {source}` for shared objects (faster, less disk)
- Falls back to local path if no remote

#### SCM: github (581 lines)
- PR detection by branch name via `gh pr list`
- CI checks via GitHub GraphQL API
- Bot author filtering: codecov[bot], dependabot[bot], renovate[bot], etc.
- Review separation: human reviews vs automated bot comments
- Merge readiness: checks required reviews, CI, conflicts

#### Tracker: linear
- Transport abstraction: Direct API vs Composio SDK
- Auto-detects transport from env vars (`COMPOSIO_API_KEY` or `LINEAR_API_KEY`)
- Lazy-loads Composio SDK (optional dependency)

#### Notifier: slack
- Block Kit rich formatting (header, section, context blocks)
- Priority emoji mapping
- Action buttons for interactive responses

#### Notifier: webhook
- Generic HTTP POST with JSON payload
- Exponential backoff retry (retryable: 429, 5xx; non-retryable: 4xx)
- Custom headers from config

---

## 5. Session Lifecycle (The Main Flow)

### 5.1 Session States

A session progresses through 14 possible states:

```
spawning → working → pr_open → review_pending → approved → mergeable → merged → done
                  ↘ ci_failed ↗     ↗
                  ↘ changes_requested ↗
                  ↘ needs_input (human judgment needed)
                  ↘ stuck (no progress)
                  ↘ errored / killed / terminated
```

Plus 6 activity states detected in real-time:
- `active` — agent is processing
- `ready` — agent finished turn, waiting for input
- `idle` — inactive beyond threshold (default 5 min)
- `waiting_input` — agent asking for permission
- `blocked` — agent hit an error
- `exited` — process no longer running

### 5.2 Spawn Flow

When `ao spawn <project> <issue>` runs:

```
1. Validate project exists in config
2. Resolve plugins (runtime, agent, workspace, tracker, scm)
3. Validate issue exists via Tracker plugin
4. Atomically reserve session ID (e.g., "app-1") using O_EXCL flag
5. Generate globally unique tmux name: "{config-hash}-app-1"
6. Generate branch name (explicit > tracker > ad-hoc)
7. Create workspace via Workspace plugin (git worktree)
8. Run post-create hooks (pnpm install, symlinks)
9. Generate 3-layer prompt (base + config context + user rules)
10. Create runtime via Runtime plugin (tmux session)
11. Write metadata file (flat key=value)
12. Run post-launch setup (agent workspace hooks)
13. Return Session object
```

### 5.3 Prompt Composition (3 Layers)

The `prompt-builder.ts` composes agent prompts:

| Layer | Source | Content |
|-------|--------|---------|
| **1. Base** | Constant in code | Session lifecycle, git workflow, PR best practices |
| **2. Config** | `agent-orchestrator.yaml` + Tracker | Project name/repo/branch, issue details, reaction hints |
| **3. User** | `agentRules` / `agentRulesFile` | Project-specific coding conventions |

### 5.4 Orchestrator Agent

When `ao start` runs, it spawns a special **orchestrator agent** — a Claude Code session that manages worker agents. The orchestrator receives a system prompt with:
- All `ao` CLI commands and their usage
- Project info (repo, branch, prefix)
- Session management workflows
- Configured reaction rules
- Common workflows (bulk processing, stuck agents, PR review flow)

The orchestrator does NOT write code — it coordinates workers.

### 5.5 Activity Detection Per Agent

| Agent | Detection Method | Data Source |
|-------|-----------------|-------------|
| **Claude Code** | JSONL last entry type + file mtime | `~/.claude/projects/{path}/{session}.jsonl` |
| **Codex** | Shell wrapper hooks update metadata | `~/.ao/bin/gh`, `~/.ao/bin/git` wrappers |
| **Aider** | Recent git commits + chat history mtime | `git log --since="60s"`, `.aider.chat.history.md` |
| **OpenCode** | Returns null (global SQLite, no per-workspace scoping) | `~/.local/share/opencode/opencode.db` |

---

## 6. Lifecycle Manager (The Automation Engine)

The lifecycle manager is the heart of the system. It runs a **polling loop** (default 30s interval) that detects state transitions and triggers reactions.

### 6.1 State Determination

For each active session, determines status by checking (in priority order):

```
1. Is runtime alive?          → NO → killed
2. Is agent process running?  → NO → killed (or exited)
3. Is agent waiting for input? → YES → needs_input
4. Does a PR exist?           → Auto-detect by branch via SCM
5. Is PR merged/closed?       → merged / closed
6. Is CI failing?             → ci_failed
7. Are changes requested?     → changes_requested
8. Is PR approved?            → approved (+ if CI passing → mergeable)
9. Is review pending?         → review_pending
10. Has a PR?                 → pr_open
11. Default                   → working
```

### 6.2 Reaction System

When a state transition matches a configured reaction:

```
Event triggers reaction
    ↓
Track attempt count for (sessionId, reactionKey)
    ↓
Check escalation criteria:
  - retries exceeded? (e.g., 2 failed CI fix attempts)
  - escalateAfter duration passed? (e.g., 30 minutes)
    ↓
If escalating → urgent notification to human
If not → execute action:
  - send-to-agent: message via runtime
  - notify: event + notification
  - auto-merge: merge PR (placeholder)
  - spawn-review: spawn review agent
```

### 6.3 Default Reactions

| Event | Action | Behavior |
|-------|--------|----------|
| `ci-failed` | send-to-agent | Send CI failure details, retry 2x, then escalate |
| `changes-requested` | send-to-agent | Forward review comments, escalate after 30min |
| `bugbot-comments` | send-to-agent | Forward automated review comments |
| `merge-conflicts` | send-to-agent | Notify agent of conflicts, escalate after 15min |
| `approved-and-green` | notify | Notify human PR is ready (auto-merge optional) |
| `agent-stuck` | notify (urgent) | After 10min of no activity |
| `agent-needs-input` | notify (urgent) | Agent is waiting for permission/decision |
| `agent-exited` | notify (urgent) | Agent process died |
| `pr-created` | spawn-review | Auto-spawn review agent to check the PR |
| `all-complete` | notify (info) | All sessions finished, include summary |

---

## 7. Event System

### 7.1 Event Types (26+)

| Category | Events |
|----------|--------|
| **Session** | `session.spawned`, `.working`, `.exited`, `.killed`, `.stuck`, `.needs_input`, `.errored` |
| **PR** | `pr.created`, `.updated`, `.merged`, `.closed` |
| **CI** | `ci.passing`, `.failing`, `.fix_sent`, `.fix_failed` |
| **Reviews** | `review.pending`, `.approved`, `.changes_requested`, `.comments_sent`, `.comments_unresolved` |
| **Automated** | `automated_review.found`, `.fix_sent` |
| **Merge** | `merge.ready`, `.conflicts`, `.completed` |
| **Reactions** | `reaction.triggered`, `.escalated` |
| **Summary** | `summary.all_complete` |

### 7.2 Event Storage

- **Format**: JSONL (one JSON object per line, append-only)
- **Location**: `~/.agent-orchestrator/{hash}-{projectId}/events.jsonl`
- **Pruning**: Lazy — rewrites when exceeding `maxEvents` (default 500)
- **Query**: Filter by type, priority, sessionId, date range, with limit/offset

### 7.3 Event Priority

| Level | Meaning | Notification |
|-------|---------|-------------|
| `urgent` | Needs human attention NOW | Desktop + sound, Slack |
| `action` | Human action needed soon | Desktop (silent), Slack |
| `warning` | Auto-handling failed | Logged, Slack |
| `info` | Status update | Logged only |

---

## 8. Web Dashboard

### 8.1 Architecture

The dashboard is a Next.js 15 App Router application with:
- **Server Components** for initial data loading and enrichment
- **Client Components** for interactivity (SSE, terminal, actions)
- **API Routes** for session management, plans, discoveries
- **SSE endpoint** for real-time fingerprint-based updates

### 8.2 Attention Zones

The dashboard groups sessions into 6 Kanban-style zones:

| Zone | Color | Condition |
|------|-------|-----------|
| **Merge** | Green | PR approved + CI passing |
| **Respond** | Red | Agent needs input, blocked, or exited |
| **Review** | Yellow | CI failing, conflicts, or unresolved comments |
| **Pending** | Blue | PR open, awaiting review |
| **Working** | Blue | Agent actively coding |
| **Done** | Gray | Merged, completed, or killed |

### 8.3 Real-Time Update Flow (SSE + Fingerprinting)

```
Client                          Server
  │                               │
  │── EventSource(/api/events) ──→│
  │                               │── Poll sessionManager.list() every 3s
  │←── snapshot (lightweight) ────│   {id, status, activity, attentionLevel}
  │                               │
  │  [hash fingerprints]          │
  │  [changed?]                   │
  │── GET /api/sessions ─────────→│── Full enrichment (PR, CI, reviews)
  │←── DashboardSession[] ───────│   (5min TTL cache)
  │                               │
  │←── heartbeat every 15s ──────│
  │  + full refresh every 30s     │   (catches CI/review changes)
```

Key insight: SSE sends only lightweight snapshots. Client fingerprints `{id}:{status}:{activity}:{attentionLevel}` per session. Full fetch (with expensive PR enrichment) only happens when fingerprint changes.

### 8.4 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sessions` | GET | List all sessions with enriched PR/CI/review data |
| `/api/sessions/[id]` | GET | Single session detail |
| `/api/sessions/[id]/send` | POST | Send message to agent |
| `/api/sessions/[id]/restore` | POST | Restore terminated session |
| `/api/sessions/[id]/kill` | POST | Kill session |
| `/api/events` | GET | SSE stream (fingerprint snapshots) |
| `/api/notifications` | GET | Notification history |
| `/api/plans` | GET | List plans for project |
| `/api/plan` | POST | Create feature plan |
| `/api/plan/[id]` | GET | Get plan details |
| `/api/plan/[id]/approve` | POST | Approve plan → create issues → spawn agents |
| `/api/plan/[id]/edit` | POST | Edit plan tasks |
| `/api/discoveries` | GET | List discoveries |
| `/api/discover` | POST | Trigger discovery agent |
| `/api/discover/[id]` | GET | Get discovery results |
| `/api/prs/[id]/merge` | POST | Merge PR (validates mergeability first) |
| `/api/spawn` | POST | Spawn new session |

### 8.5 Key Components

| Component | Type | Purpose |
|-----------|------|---------|
| `Dashboard` | Client | Main layout: attention zones, stats, PR table, new work panel |
| `SessionCard` | Client | Expandable card: status, alerts, timeline, actions |
| `SessionDetail` | Client | Full page: metadata, PR details, CI checks, terminal |
| `DirectTerminal` | Client | xterm.js WebSocket terminal with clipboard/resize |
| `AttentionZone` | Client | Kanban column with colored header and session cards |
| `NotificationCenter` | Client | Bell icon + dropdown panel with event history |
| `PlanHistory` | Client | Plan list with task details and dependency graph |
| `DiscoveryHistory` | Client | Discovery findings with priority/effort indicators |

### 8.6 Caching Strategy

- **PR data**: 5-minute TTL cache (keyed by `owner/repo#number`)
- **Rate-limited responses**: Cached with 60-minute TTL + "stale data" UI warning
- **Issue titles**: 5-minute TTL
- **Services singleton**: Cached in `globalThis` for Next.js HMR stability

---

## 9. CLI Commands

| Command | Purpose | Key Features |
|---------|---------|-------------|
| `ao init` | Setup wizard | Detects project type, frameworks, test tools |
| `ao start [project]` | Launch orchestrator + dashboard | Spawns orchestrator agent with system prompt |
| `ao stop [project]` | Kill orchestrator + dashboard | Finds PID on port via `lsof` |
| `ao status` | Rich session table | Live branch, PR, CI, reviews, agent summary |
| `ao spawn <project> [issue]` | Spawn single session | Creates worktree + tmux session |
| `ao batch-spawn <project> <issues...>` | Spawn multiple | Deduplicates (skips existing/dead) |
| `ao session ls` | List sessions | Groups by project, shows age + status |
| `ao session kill <session>` | Kill session | Destroys runtime + workspace |
| `ao session cleanup` | Kill completed | Checks: PR merged? Issue closed? Runtime dead? |
| `ao session restore <session>` | Restore crashed | Re-spawns runtime, recovers worktree |
| `ao send <session> <msg>` | Send message | Waits for idle, handles long messages via paste-buffer |
| `ao review-check [project]` | Process reviews | Finds unresolved threads, sends fix prompts |
| `ao dashboard` | Standalone dashboard | `--rebuild` to clean .next cache |
| `ao open [target]` | Open terminal tabs | iTerm2 AppleScript integration |

---

## 10. Planning & Discovery Workflows

### 10.1 Planning Flow

```
User describes feature via dashboard or API
    ↓
System creates Plan record (status: "planning")
    ↓
Spawns planning agent in isolated worktree (branch: plan/{planId})
    ↓
Agent analyzes codebase, writes task breakdown to JSON file
    ↓
System detects output → Plan status: "ready"
    ↓
User reviews/edits tasks in dashboard
    ↓
User approves plan
    ↓
System creates GitHub/Linear issues for each task
    ↓
Spawns one coding agent per task (with dependency tracking)
    ↓
Plan status: "executing" → "done" when all sessions complete
```

### 10.2 Discovery Types

| Type | Purpose | Agent Prompt |
|------|---------|-------------|
| `ux-audit` | Analyze UI for usability, accessibility, consistency | Reads UI code, identifies issues |
| `competitor-research` | Research competitors and market positioning | Web research + analysis |
| `code-health` | Analyze code quality, complexity, test coverage | Static analysis, metrics |

Each spawns a specialized agent that writes findings (with priority + effort estimates) to a JSON file.

---

## 11. Configuration System

### 11.1 Config File Format

```yaml
dataDir: ~/.agent-orchestrator       # Session metadata storage
worktreeDir: ~/.worktrees            # Git worktree base directory
port: 3000                           # Dashboard port

defaults:
  runtime: tmux                      # tmux | process
  agent: claude-code                 # claude-code | codex | aider
  workspace: worktree                # worktree | clone
  notifiers: [desktop]               # desktop | slack | webhook | composio

projects:
  my-app:
    name: My App
    repo: org/my-app
    path: ~/my-app
    defaultBranch: main
    sessionPrefix: app               # Auto-generated if omitted
    tracker:
      plugin: github                 # github | linear
    symlinks: [.env, .claude]        # Files to symlink into worktrees
    postCreate: ["pnpm install"]     # Commands after workspace creation
    agentConfig:
      permissions: skip              # --dangerously-skip-permissions
      model: opus                    # Model override
    agentRules: |                    # Inline rules for agents
      Always run tests before pushing.
    agentRulesFile: .agent-rules.md  # External rules file
    orchestratorRules: |             # Rules for orchestrator agent
      Prefer batch-spawning related issues.
    reactions:                       # Per-project reaction overrides
      approved-and-green:
        auto: true                   # Enable auto-merge

notifiers:                           # Named notification channels
  slack:
    plugin: slack
    webhook: ${SLACK_WEBHOOK_URL}

notificationRouting:                 # Route by priority level
  urgent: [desktop, slack]
  action: [desktop, slack]
  warning: [slack]
  info: [slack]
```

### 11.2 Config Resolution

Search order: `AO_CONFIG_PATH` env → directory tree walk → home directory locations

Validated with Zod at load time. `~` expansion in all paths. Default reactions applied if not overridden.

---

## 12. Data Architecture (No Database)

### 12.1 Directory Structure

```
~/.agent-orchestrator/
├── {config-hash}-{projectId}/
│   ├── .origin                    # Original config path (collision detection)
│   ├── sessions/
│   │   ├── app-1                  # Flat key=value metadata
│   │   ├── app-2
│   │   └── archive/
│   │       └── app-1_1706000000  # Archived sessions (timestamped)
│   ├── worktrees/                 # (if using built-in worktree dir)
│   │   ├── app-1/
│   │   └── app-2/
│   ├── plans/
│   │   ├── plan-1740500000-abc.json
│   │   └── plan-1740500000-abc-output.json  # Agent output
│   ├── discoveries/
│   │   ├── discovery-1740500000-def.json
│   │   └── discovery-1740500000-def-output.json
│   └── events.jsonl               # Append-only event log
```

### 12.2 Session Metadata Format

```
project=my-app
worktree=/Users/dev/.worktrees/my-app/app-1
branch=feat/INT-1234
status=working
tmuxName=a3b4c5d6e7f8-app-1
pr=https://github.com/org/repo/pull/42
issue=INT-1234
summary=Implementing user authentication
agent=claude-code
createdAt=2024-01-01T10:00:00Z
runtimeHandle={"id":"a3b4c5d6e7f8-app-1","runtimeName":"tmux","data":{}}
```

### 12.3 Naming System

| Name Type | Format | Example | Purpose |
|-----------|--------|---------|---------|
| Session ID | `{prefix}-{num}` | `app-1` | User-facing, human-friendly |
| Tmux name | `{hash}-{prefix}-{num}` | `a3b4c5d6e7f8-app-1` | Globally unique across configs |
| Config hash | `sha256(dirname(configPath)).slice(0,12)` | `a3b4c5d6e7f8` | Isolates multiple orchestrators |

### 12.4 Why No Database

1. **Simplicity** — no setup, no migrations, no connection management
2. **Portability** — just files, works anywhere
3. **Debuggability** — `cat` a file to see state
4. **Backwards compatibility** — original was bash scripts writing key=value files
5. **Atomic operations** — `O_EXCL` for ID reservation, `rename` for atomic writes

---

## 13. Security Model

| Concern | Protection |
|---------|-----------|
| Shell injection | Always `execFile` (never `exec`), args as arrays |
| Path traversal | Session/project ID regex validation (`/^[a-zA-Z0-9_-]+$/`) |
| tmux escape injection | `stripControlChars()` on user messages |
| AppleScript injection | `escapeAppleScript()` for iTerm2 |
| Webhook URL validation | `validateUrl()` before HTTP requests |
| Input validation | Zod for config, `validateIdentifier()`/`validateString()` for API |
| Command timeouts | 30s default on all external commands |
| Metadata hook safety | Path traversal validation in agent wrapper scripts |

---

## 14. Key Design Patterns

### 14.1 Two-Tier Automation
Routine issues are auto-handled. Humans are only notified when automation fails or judgment is needed. This is the fundamental UX principle.

### 14.2 Fingerprint-Based Real-Time
SSE sends lightweight fingerprints instead of full state. Client diffs fingerprints and fetches full data only on change. Dramatically reduces bandwidth and API calls.

### 14.3 Graceful Degradation
- PR enrichment has 4s timeout — show what we have if GitHub API is slow
- Rate-limited responses cached with 60min TTL + stale-data warning in UI
- Missing plugins are skipped (not fatal)
- Failed reactions are retried, then escalated

### 14.4 Plugin Composition
Any layer can be swapped per-project without changing the core. This makes the system viable across different teams, toolchains, and deployment environments.

### 14.5 Stateless Orchestrator
No database means no schema migrations, no connection pooling, no operational complexity. Files are the API. This trades query performance for operational simplicity — appropriate for the scale (dozens of sessions, not millions).

---

## 15. Complete Data Flow

### 15.1 Full Session Lifecycle

```
Human                CLI / Dashboard              Core                    Plugins
  │                       │                        │                        │
  │── ao spawn ──────────→│                        │                        │
  │                       │── spawn() ────────────→│                        │
  │                       │                        │── getIssue() ─────────→│ Tracker
  │                       │                        │←─ issue details ───────│
  │                       │                        │── create() ───────────→│ Workspace
  │                       │                        │←─ worktree path ───────│
  │                       │                        │── buildPrompt() ──────→│ (internal)
  │                       │                        │── create() ───────────→│ Runtime
  │                       │                        │←─ runtime handle ──────│
  │                       │                        │── writeMetadata() ────→│ (disk)
  │←─ session created ───│←─ Session ──────────────│                        │
  │                       │                        │                        │
  │  (agent works autonomously...)                 │                        │
  │                       │                        │                        │
  │               [Lifecycle Manager polls every 30s]                       │
  │                       │                        │── isAlive() ──────────→│ Runtime
  │                       │                        │── getActivityState() ──→│ Agent
  │                       │                        │── detectPR() ─────────→│ SCM
  │                       │                        │── getCIChecks() ──────→│ SCM
  │                       │                        │── getReviews() ───────→│ SCM
  │                       │                        │                        │
  │               [CI fails → auto-reaction]        │                        │
  │                       │                        │── sendMessage() ──────→│ Runtime
  │                       │                        │   "CI failed, please   │
  │                       │                        │    fix these errors..." │
  │                       │                        │                        │
  │               [Review comments → auto-reaction] │                        │
  │                       │                        │── sendMessage() ──────→│ Runtime
  │                       │                        │   "Please address the  │
  │                       │                        │    review comments..."  │
  │                       │                        │                        │
  │               [Approved + CI passing]           │                        │
  │←── notification ─────│←─ notify() ─────────────│── notify() ───────────→│ Notifier
  │   "PR ready to merge" │                        │                        │
  │                       │                        │                        │
  │── merge PR ──────────→│                        │                        │
  │                       │── mergePR() ──────────→│── mergePR() ──────────→│ SCM
  │←─ merged ────────────│                        │── cleanup() ──────────→│ Workspace
```

---

## 16. Key Metrics & Limits

| Metric | Value |
|--------|-------|
| Lifecycle poll interval | 30s (configurable) |
| SSE snapshot interval | 3s |
| SSE heartbeat | 15s |
| Full client refresh | 30s |
| PR enrichment timeout | 4s |
| Metadata enrichment timeout | 3s |
| PR cache TTL | 5 min (60 min on rate limit) |
| Event log max entries | 500 (then lazy prune) |
| Shell command timeout | 30s |
| Max message length | 10,000 chars |
| JSONL read optimization | Last 128KB |
| Activity ready threshold | 5 min |
| Reaction escalation | Configurable per-reaction |

---

## 17. Extending the System

### Adding a New Plugin

1. Create package: `packages/plugins/{slot}-{name}/`
2. Implement the interface from `types.ts`
3. Export `PluginModule` with `manifest` + `create()` + `satisfies` check
4. Add to `BUILTIN_PLUGINS` array in `plugin-registry.ts`
5. Add to CLI's `plugins.ts` if needed for direct resolution

### Adding a New Event Type

1. Add to `EventType` union in `types.ts`
2. Emit from `lifecycle-manager.ts` at the appropriate state transition
3. Add reaction mapping in default reactions
4. Handle in dashboard UI if visual representation needed

### Adding a New CLI Command

1. Create `packages/cli/src/commands/{name}.ts`
2. Export `registerXxx(program: Command)` function
3. Import and call in `packages/cli/src/index.ts`

### Adding a New API Route

1. Create `packages/web/src/app/api/{route}/route.ts`
2. Use `getServices()` to access core services
3. Validate inputs with `validateIdentifier()`/`validateString()`
4. Return `NextResponse.json()`

---

## 18. What Makes This Different

1. **Automation engine, not monitoring tool** — Monitoring shows state; Fleet Commander acts on state changes automatically (CI fix, review response, merge).

2. **Agent-agnostic** — Works with any AI that runs in a terminal. Most tools are built for one AI; this works with Claude Code, Codex, Aider, and more.

3. **Stateless by design** — No database. Flat files are debuggable, portable, and backwards-compatible. Trades query performance for operational simplicity.

4. **Push-first UX** — The primary interface is notifications, not a dashboard. Designed so you don't need to watch it.

5. **Two-tier escalation** — Auto-handles routine issues. Only bothers humans when automation fails or judgment is needed.

6. **Full PR lifecycle** — Issue → branch → implementation → PR → CI → review → merge, with intervention at every stage.

7. **Composable** — Swap any layer without changing the core. Different teams can use different agents, runtimes, trackers, and notification channels.
