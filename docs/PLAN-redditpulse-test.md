# Testing Fleet Commander with RedditPulse — Step-by-Step Guide

## Context

Fleet Commander (Phases 1-4) is built. We want to test it end-to-end with RedditPulse, a real Next.js SaaS project. This plan walks through setup, configuration, and running a real workflow.

**RedditPulse**: Next.js 16, TypeScript, pnpm, Supabase + OpenAI. No CI, no tests, no CLAUDE.md yet.
**Repo**: `Myosin-xyz/reddit-pulse`
**Local path**: `/Users/gmdscpr/Documents/Projectos/Crypto & Blockchain/DeFi Projects/MyosinDAO/github/reddit-pulse`

---

## Step 1: Prerequisites Check

Verify these are installed and working:
```bash
node --version      # Need 20+
tmux -V             # Need tmux installed
gh auth status      # Need GitHub CLI authenticated
pnpm --version      # Need pnpm
```

## Step 2: Build & Link the CLI

From the fleet-commander repo:
```bash
cd "/Users/gmdscpr/Documents/Projectos/Crypto & Blockchain/DeFi Projects/MyosinDAO/github/fleet-commander"
pnpm install && pnpm build
cd packages/cli && npm link
```

Verify: `ao --version` should work.

## Step 3: Switch RedditPulse to `main` branch

Fleet Commander creates worktrees from the default branch. Make sure we're on main:
```bash
cd "/Users/gmdscpr/Documents/Projectos/Crypto & Blockchain/DeFi Projects/MyosinDAO/github/reddit-pulse"
git checkout main
git pull
```

## Step 4: Update `agent-orchestrator.yaml`

Edit the config at the fleet-commander repo root to add RedditPulse as a project:

```yaml
# file: agent-orchestrator.yaml (in fleet-commander root, or wherever you run `ao` from)

dataDir: ~/.ao-sessions
worktreeDir: ~/.worktrees

defaults:
  runtime: tmux
  agent: claude-code
  workspace: worktree
  notifiers: [desktop]

projects:
  reddit-pulse:
    name: RedditPulse
    repo: Myosin-xyz/reddit-pulse
    path: "/Users/gmdscpr/Documents/Projectos/Crypto & Blockchain/DeFi Projects/MyosinDAO/github/reddit-pulse"
    defaultBranch: main
    sessionPrefix: rp
    scm:
      plugin: github
    tracker:
      plugin: github
    postCreate:
      - "pnpm install"
    agentConfig:
      permissions: skip

reactions:
  ci-failed:
    auto: true
    action: send-to-agent
    retries: 2
    escalateAfter: 2
  changes-requested:
    auto: true
    action: send-to-agent
    escalateAfter: 30m
  approved-and-green:
    auto: false
    action: notify
    priority: action
```

Key decisions:
- **tracker: github** — use GitHub Issues (not Linear)
- **sessionPrefix: rp** — sessions will be named rp-1, rp-2, etc.
- **postCreate: pnpm install** — install deps in each worktree
- **permissions: skip** — let Claude Code run without permission prompts

## Step 5: Start Fleet Commander

```bash
ao start
```

This starts:
1. The **web dashboard** at http://localhost:3000
2. An **orchestrator agent** in tmux

Open the dashboard in your browser to see it live.

## Step 6: Choose a Test Workflow

Three options for a real test, pick one (or do all three in sequence):

### Option A: "Set Up CI" (Phase 1 feature)
Click **"New Work" → "Set Up CI"** in the dashboard. This spawns an agent that:
- Analyzes RedditPulse's codebase
- Creates a GitHub Actions CI workflow
- Writes baseline tests
- Opens a PR

This is the simplest first test since RedditPulse has no CI yet.

### Option B: "Plan Feature" (Phase 2 feature)
Click **"New Work" → "Plan Feature"** and describe something like:
> "Add a settings page where users can configure their notification preferences (email digest frequency, alert types to receive, quiet hours)"

The planning agent will:
- Read the codebase
- Break the feature into tasks
- Present a plan for review
- After approval, create GitHub issues and spawn coding agents

### Option C: Spawn from CLI with an existing issue
If there are open GitHub issues on `Myosin-xyz/reddit-pulse`:
```bash
ao spawn reddit-pulse <issue-number>
```

This spawns a single coding agent to work on that issue.

## Step 7: Monitor & Interact

- **Dashboard** (http://localhost:3000): Watch sessions move through states (working → pr_open → review_pending → etc.)
- **Notification bell**: Check the notification center for lifecycle events
- **Daily summary**: See the summary panel at the top
- **Terminal**: Click a session to see live agent output
- **CLI**: `ao status` to check all sessions from terminal

If an agent gets stuck:
```bash
ao send rp-1 "Try a different approach — use X instead of Y"
```

## Step 8: Review the PR

Once an agent opens a PR:
1. Dashboard shows it in the "pending" or "review" column
2. Review on GitHub as normal
3. If you request changes, the reaction system auto-sends comments to the agent
4. When approved + CI green, it moves to "merge" column — one click to merge

---

## What to Watch For (Testing Checklist)

- [ ] Dashboard loads and shows the RedditPulse project
- [ ] "New Work" panel opens with RedditPulse selected
- [ ] Agent spawns successfully (tmux session created, worktree set up)
- [ ] Agent starts working (status transitions visible)
- [ ] PR gets created and appears in dashboard
- [ ] Notification bell shows events
- [ ] Daily summary panel reflects session states
- [ ] Session detail page shows live terminal output
- [ ] `ao status` CLI works
