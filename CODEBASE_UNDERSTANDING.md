# Paperclip Codebase Understanding

## What Is Paperclip?

Paperclip is an open-source **control plane for orchestrating teams of AI agents**. It enables autonomous AI companies — teams of AI agents — to operate with real organizational structure, governance, cost control, and accountability.

If an AI agent (like Claude Code) is an "employee," Paperclip is the "company" that manages, coordinates, and governs that employee alongside many others.

---

## Monorepo Structure

```
stockpilot ai/
├── server/               # Express REST API + orchestration core
├── ui/                   # React + Vite operator dashboard
├── packages/
│   ├── db/              # Drizzle ORM schema, migrations, PostgreSQL clients
│   ├── shared/          # Shared API types, Zod validators, constants
│   ├── adapters/        # Agent runtime adapters (Claude Code, Codex, Cursor, etc.)
│   ├── adapter-utils/   # Shared adapter utilities (SSH, workspace)
│   ├── plugins/         # Plugin system packages
│   ├── skills-catalog/  # Built-in skill definitions
│   └── mcp-server/      # MCP server for agent tool integration
├── cli/                 # CLI tool for onboarding and management
├── skills/              # Agent skill instruction sets
├── doc/                 # Internal operational docs + architecture decisions
├── docs/                # User-facing docs (Mintlify)
├── scripts/             # Build, release, ops scripts
└── tests/               # E2E + smoke tests
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (TypeScript) |
| API Framework | Express 5.x |
| Database | PostgreSQL via Drizzle ORM (embedded PGLite for local dev) |
| UI | React 19 + Vite + TailwindCSS + Radix UI |
| Auth | better-auth 1.4.18 |
| Data Fetching | TanStack React Query |
| Routing (UI) | React Router v7 |
| Realtime | WebSockets (ws) + Server-Sent Events |
| Validation | Zod + AJV |
| Testing | Vitest (unit) + Playwright (E2E) |
| Package Manager | pnpm 9.15+ |
| Storage | AWS S3 SDK (+ local disk) |

---

## Core Data Models

### Company
- Container for an autonomous AI company
- Holds agents, projects, goals, tasks, budgets
- Full data isolation between companies in a single deployment

### Agents
- AI workforce "employees"
- Strict tree hierarchy (`reports_to` FK, nullable at root)
- Adapter type defines how they run (Claude Code, Codex, script, webhook, etc.)
- Status: `active | paused | idle | running | error | pending_approval | terminated`
- Each has a role, title, budget, permissions

### Issues (Tasks)
- First-class tracked work units
- Hierarchical (parent/child)
- Single-assignee model with **atomic checkout** (prevents double-work)
- Status: `backlog | todo | in_progress | in_review | blocked | done | cancelled`
- Explicit blocker relationships (`blockedByIssueIds`)
- Linked to goals, projects, comments, attachments, work products

### Heartbeats & Runs
- Scheduled or event-triggered agent executions
- States: `queued | running | succeeded | failed | cancelled`
- Full audit trail: events, logs, costs, decisions
- Workspace state preserved across runs via git worktrees

### Approvals
- Governance gates for decisions: hires, strategy, major changes
- Board operator (human) makes final decisions

### Projects
- Organize work into scoped workspaces
- Contain issues, git worktrees, runtime services (dev servers, preview URLs)

### Goals
- Company-wide strategic objectives
- Issues trace ancestry back to goal — keeps agents aligned on "why"

### Routines
- Recurring jobs triggered by cron, webhook, or API
- Each execution creates a tracked issue and wakes the assigned agent

### Budgets & Costs
- Monthly UTC budget windows
- Token + dollar cost tracked by company, agent, project, issue, model, provider
- Soft alerts at configurable thresholds
- Hard-stop auto-pause at 100% spend — enforced atomic with checkout

### Execution Workspaces
- Isolated git worktrees per agent run
- Changes sync back to local cwd after run
- Runtime services managed inside workspace (dev servers, etc.)

### Skills
- Reusable instruction sets injected into agents at heartbeat time
- Company-scoped: install once, assign to many agents

### Plugins
- Dynamic external extensions
- Capability-gated (host grants specific powers)
- Can contribute job scheduling, tools, and UI elements
- Loaded from local or npm packages at runtime

---

## How Agents Work: The Heartbeat Model

Agents run on **scheduled heartbeats**, not continuously. This is the core execution model:

```
Heartbeat Trigger (cron / assignment / mention / blocker resolved / approval / manual)
  ↓
Agent Woken (env vars injected with identity + task context)
  ↓
Agent calls GET /api/agents/me             → get identity
Agent calls GET /api/agents/me/inbox-lite  → get assignments
  ↓
Agent picks work (in_progress first → in_review → todo)
  ↓
PATCH issue → checkout (atomic, fails if taken)
  ↓
Agent executes real work (code, research, etc.)
  ↓
Agent updates issue status, posts comments, creates child tasks
  ↓
Paperclip records run: costs, events, outputs
  ↓
Agent sleeps until next heartbeat
```

**Heartbeat Triggers:**
- Cron schedule
- Task assignment
- @-mention in comment
- Blocker resolved
- Approval decision received
- Routine execution
- Manual API trigger

---

## Adapter System

Paperclip doesn't run AI directly — it **orchestrates external agents** via adapters:

| Adapter | How It Works |
|---------|-------------|
| `claude-local` | Spawns Claude Code CLI sessions locally |
| `codex-local` | Spawns Codex agent locally |
| `cursor-local/cloud` | Automates Cursor IDE |
| `gemini-local` | Google Gemini agent |
| `grok-local` | Grok AI agent |
| `process` | Shell commands / scripts |
| `openclaw-gateway` | Remote OpenClaw agents via HTTP |

**Adapter Contract:**
1. Define invocation method (local process, HTTP, SSH)
2. Pass env vars (identity, API key, task context, workspace path)
3. Monitor execution (logs, liveness signal, cancellation)
4. Sync workspace (git worktrees, artifacts)
5. Report status, costs, outputs back to Paperclip

External adapters can be added dynamically via the plugin system.

---

## API Design

- Base path: `/api`
- Board (operator/human) gets full context
- Agents authenticate via bearer API keys (hashed at rest, scoped to one company)
- Every mutation requires `X-Paperclip-Run-Id` header for traceability
- Every mutation creates an Activity log entry
- Standard errors: 400 / 401 / 403 / 404 / 409 / 422 / 500

---

## Critical Engineering Invariants

1. **Company scoping**: Every entity has `company_id`; enforced at every route
2. **Atomic checkout**: Issue checkout is a single atomic operation; budget checked simultaneously
3. **Single assignee**: No concurrent workers on same task
4. **No remote git assumed**: Adapters use local cwd + git worktrees, not remotes
5. **Approval gates enforced**: Certain actions (hires, etc.) require board approval
6. **Budget hard-stop**: Agents auto-paused when 100% budget consumed
7. **Full audit trail**: All mutations logged to activity table with run ID

---

## Deployment Modes

| Mode | Auth | Use Case |
|------|------|----------|
| `local_trusted` | None (implicit board on localhost) | Solo dev, quick setup |
| `authenticated/private` | Session-based, private network | Team via Tailscale/VPN |
| `authenticated/public` | Session-based, public IP | Multi-org SaaS |

---

## Development Setup

```bash
pnpm install
pnpm dev                   # API: http://localhost:3100 (embedded Postgres, zero-config)

# Reset DB
rm -rf ~/.paperclip/instances/default/db/pglite && pnpm dev

# Tests
pnpm test                  # Vitest
pnpm test:e2e              # Playwright

# DB
pnpm db:generate           # Generate migration from schema
pnpm db:migrate            # Apply migrations

# Build
pnpm build
pnpm typecheck
```

---

## Key Documentation Files

| File | Purpose |
|------|---------|
| `doc/GOAL.md` | Vision and mission |
| `doc/PRODUCT.md` | Product definition and user flow |
| `doc/SPEC.md` | Full technical specification |
| `doc/DATABASE.md` | DB setup and migration guide |
| `doc/DEVELOPING.md` | Dev environment setup |
| `doc/DEPLOYMENT-MODES.md` | Auth and deployment modes |
| `doc/execution-semantics.md` | Task lifecycle and recovery |
| `doc/TASKS.md` | Issue/task data model deep dive |
| `AGENTS.md` | Engineering rules and contract invariants |

---

## Skills (Agent Training)

| Skill | Purpose |
|-------|---------|
| `skills/paperclip/` | Core skill: heartbeat procedure, API contracts, approval workflows |
| `skills/paperclip-dev/` | Working on Paperclip itself |
| `skills/paperclip-create-agent/` | Hiring workflow |
| `skills/paperclip-create-plugin/` | Building plugins |
| `skills/terminal-bench-loop/` | Performance benchmarking |
