# Zagz - WhatsApp AI Agent Project

## Stack
- **Language:** TypeScript (Node.js, ESM modules)
- **WhatsApp API:** Baileys (`@whiskeysockets/baileys`)
- **AI Model:** Gemini (`@google/generative-ai`) — default `gemini-2.5-flash`
- **Database:** SQLite (`better-sqlite3`) — synchronous, WAL mode
- **MCP:** Model Context Protocol SDK (`@modelcontextprotocol/sdk`)
- **HTTP:** Axios
- **Scheduling:** node-cron
- **Web Scraping:** cheerio
- **Logging:** pino (required by Baileys)
- **Env:** dotenv

---

## Directory Structure

```
zagz/
├── .claude/                    # AI assistant documentation
├── .husky/                     # Git hooks (pre-commit runs biome + tsc)
├── src/
│   ├── agent/
│   │   ├── core.ts             # Main message processing loop + tool orchestration
│   │   ├── memory.ts           # Semantic memory service (key-value with categories)
│   │   ├── prompt.ts           # Dynamic system prompt builder
│   │   └── session.ts          # Multi-step flow state machine
│   ├── channels/
│   │   └── whatsapp.ts         # CURRENT: Baileys message handler using agentCore
│   ├── config/
│   │   └── index.ts            # (empty, reserved for future centralized config)
│   ├── cron/
│   │   ├── scheduler.ts        # Job seeding + node-cron scheduling
│   │   └── jobs/
│   │       ├── morning-briefing.ts   # 8 AM daily prompt
│   │       ├── finance-summary.ts    # 8 PM daily prompt
│   │       ├── weekly-review.ts      # 9 AM Monday prompt
│   │       └── appointment-reminder.ts  # Every 30 min, 24h/1h reminders
│   ├── db/
│   │   ├── client.ts           # SQLite connection + schema creation (8 tables)
│   │   └── queries/
│   │       ├── conversations.ts
│   │       ├── memories.ts
│   │       ├── sessions.ts
│   │       ├── appointments.ts
│   │       ├── purchases.ts
│   │       ├── cron.ts
│   │       └── tools.ts
│   ├── database/
│   │   └── index.ts            # LEGACY database service (do not use for new code)
│   ├── handlers/
│   │   └── message.ts          # LEGACY message handler (do not use for new code)
│   ├── mcp/
│   │   ├── client.ts           # AgenteMCPManager — connects to servers, aggregates tools
│   │   └── config.ts           # MCP server definitions (filesystem, playwright + dynamic)
│   ├── services/
│   │   ├── ai.ts               # LEGACY AI service (do not use for new code)
│   │   └── whatsapp.ts         # LEGACY WhatsApp wrapper (do not use for new code)
│   ├── tools/
│   │   ├── index.ts            # Barrel export
│   │   ├── registry.ts         # Central dispatcher: declarations, execute(), rate limiting
│   │   ├── memory-tool.ts      # memory_read, memory_write, cron_manage
│   │   ├── paymentTool.ts      # get_payment_credentials, initiate/confirm/complete/cancel_purchase
│   │   ├── schedulingTool.ts   # create/list/update/cancel_appointment
│   │   ├── tavilySearch.ts     # search_web (Tavily API)
│   │   ├── placesSearch.ts     # search_nearby_places (Google Places API)
│   │   ├── autonomous.ts       # autonomous_action (shell/file — requires ALLOW_SELF_MODIFICATION)
│   │   ├── selfEvolution.ts    # evolve_agent (adds MCP servers — requires ALLOW_SELF_MODIFICATION)
│   │   └── emailChecker.ts     # (empty placeholder)
│   └── index.ts                # Entrypoint: init MCP → load tools → start cron → start WhatsApp
├── biome.json                  # Linter/formatter config
├── tsconfig.json               # Strict TS, ESNext, NodeNext modules
└── .env.example                # All required env vars documented
```

---

## Environment Variables

```bash
# AI
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# User
USER_NAME=
AUTHORIZED_JID=          # WhatsApp JID allowed to manage cron jobs (optional)

# Database
DATABASE_FILE=./database.db

# Search APIs
TAVILY_API_KEY=
GOOGLE_MAPS_API_KEY=

# Self-modification (optional, dangerous)
ALLOW_SELF_MODIFICATION=false

# Payment credentials (never logged or displayed to user)
CARD_NUMBER=
CARD_HOLDER_NAME=
CARD_EXPIRY_MONTH=
CARD_EXPIRY_YEAR=
CARD_CVV=
CARD_CPF=
CARD_BILLING_ZIP=
CARD_BILLING_STREET=
CARD_BILLING_NUMBER=
CARD_BILLING_CITY=
CARD_BILLING_STATE=

TZ=America/Sao_Paulo
```

---

## Architecture Overview

### Startup Sequence (`src/index.ts`)
1. Load `.env`
2. Initialize MCP manager (connects to all configured MCP servers)
3. Load self-modification tools if `ALLOW_SELF_MODIFICATION=true`
4. Initialize cron scheduler (seeds default jobs, starts schedules)
5. Start WhatsApp via Baileys
6. Log "Agent online"

### Message Processing Flow
```
WhatsApp message (from self, in personal chat)
  → channels/whatsapp.ts
  → agentCore.handleMessage(text)
    → Load active session
    → Build system prompt (memories + session injected)
    → Load recent 20 conversations as history
    → Send to Gemini with tool declarations
    → Tool call loop (max 5 iterations):
        → Intercept evolve_agent / autonomous_action
        → Other tools → toolRegistry.execute()
        → Send function response back to Gemini
    → Format response for WhatsApp
    → Persist conversation to DB
  → Send response back to user
```

### Session State Machine
```
idle → in_progress → awaiting_confirmation → completed
                   ↘                       → failed
```
Flows: `"cinema" | "purchase" | "search" | "cron_result" | "appointment" | null`

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `memories` | Key-value facts with categories (finance, projects, preferences, routine) |
| `sessions` | Multi-step flow state + JSON context |
| `conversations` | Chat history (role, content, session_id) |
| `cron_jobs` | Scheduled task metadata, enabled flag, last run status |
| `tools_log` | Tool execution audit trail (sensitive tools excluded) |
| `purchases` | E-commerce transaction tracking |
| `appointments` | Service bookings + reminder tracking |

### Key Conventions
- All queries are prepared statements (`better-sqlite3` sync API)
- `updated_at` columns updated on every upsert
- Foreign keys enforced (`PRAGMA foreign_keys = ON`)
- WAL journal mode for concurrent reads
- Indexes on frequently-filtered columns: `idx_memories_category`, `idx_conversations_created`, `idx_sessions_state`, `idx_appointments_scheduled`, `idx_appointments_status`, `idx_purchases_session`, `idx_purchases_status`

---

## Tools System

### Registry (`src/tools/registry.ts`)
All tools implement a common interface: `execute(args): Promise<string> | string`

**Rate limits:** `search_web` and `search_nearby_places` — 30 calls/hour
**Logging blocklist:** `get_payment_credentials` is never written to `tools_log`
**Sensitive data masking:** card number, CVV, CPF masked before any logging

### Available Tools

| Tool Name | File | Description |
|-----------|------|-------------|
| `search_web` | tavilySearch.ts | Tavily web/news search, auto-detects cinema queries |
| `search_nearby_places` | placesSearch.ts | Google Places with geocoding, min 3.5★ filter |
| `memory_read` | memory-tool.ts | Read memories by key or category |
| `memory_write` | memory-tool.ts | Persist user facts with categories |
| `cron_manage` | memory-tool.ts | list/enable/disable/delete cron jobs (AUTHORIZED_JID only) |
| `get_payment_credentials` | paymentTool.ts | Returns card data from env (never logged) |
| `initiate_purchase` | paymentTool.ts | Creates purchase record (pending) |
| `confirm_purchase` | paymentTool.ts | User-confirmed, marks confirmed |
| `complete_purchase` | paymentTool.ts | Records outcome (success/fail, actual price) |
| `cancel_purchase` | paymentTool.ts | Cancels pending/confirmed purchase |
| `create_appointment` | schedulingTool.ts | Creates appointment with reminders |
| `list_appointments` | schedulingTool.ts | Lists by status |
| `update_appointment` | schedulingTool.ts | Reschedule/update fields |
| `cancel_appointment` | schedulingTool.ts | Cancels appointment |
| `evolve_agent` | selfEvolution.ts | Adds MCP server to config (guarded) |
| `autonomous_action` | autonomous.ts | run_command / write_file (guarded) |
| `[mcp]__[tool]` | mcp/client.ts | Dynamically loaded from MCP servers |

### MCP Integration (`src/mcp/`)
- Default servers: `filesystem` (isolated `workspace/` dir), `playwright` (headless)
- Tool names namespaced as `serverName__toolName`
- JSON schema sanitized for Gemini (removes `$schema`, `default`, `examples`)
- New servers added dynamically via `evolve_agent` tool (modifies `mcp/config.ts`)

---

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `morning_briefing` | `0 8 * * *` | Daily briefing: projects, routines, appointments |
| `finance_summary` | `0 20 * * *` | Daily financial recap from memories |
| `weekly_review` | `0 9 * * 1` | Monday project + goals review |
| `appointment_reminders` | `*/30 * * * *` | 24h and 1h reminders for upcoming appointments |

Cron jobs run `agentCore.handleCronPrompt()` and send output via WhatsApp.
Results and errors are logged to the `cron_jobs` table.

---

## Security & Safety Conventions

1. **Credential isolation:** Payment card data lives only in `.env`; never logged, stored in DB, or shown to user
2. **Prompt injection defense:** Stored memories are sanitized (XML delimiters escaped) before being injected into the system prompt
3. **User confirmation:** Multi-step purchase flow requires explicit user approval before executing payment
4. **Rate limiting:** External API tools have per-hour call limits
5. **Autonomous tool guards:** `autonomous_action` blocks writes to `.env`, `auth_info_baileys/`, `database.db`, `node_modules/`
6. **Cron job authorization:** Only `AUTHORIZED_JID` can enable/disable/delete cron jobs via `cron_manage`
7. **Self-modification gate:** `evolve_agent` and `autonomous_action` only load when `ALLOW_SELF_MODIFICATION=true`
8. **Tool call loop limit:** Max 5 tool iterations per message to prevent infinite loops

---

## Legacy Code (Do Not Use for New Features)

The following files are superseded by the agent architecture but remain for reference:

| Legacy File | Replaced By |
|-------------|-------------|
| `src/handlers/message.ts` | `src/channels/whatsapp.ts` |
| `src/services/ai.ts` | `src/agent/core.ts` |
| `src/services/whatsapp.ts` | `src/channels/whatsapp.ts` |
| `src/database/index.ts` | `src/db/client.ts` + `src/db/queries/` |

**Current entry points:**
- Message handling: `src/channels/whatsapp.ts` → `agentCore`
- Agent logic: `src/agent/core.ts`
- Database: `src/db/client.ts` + individual query modules

---

## Code Patterns

- Use `async/await` for all async operations
- Business logic in `services/` or `agent/`
- Message handling in `channels/` (not `handlers/`)
- All DB queries isolated in `db/queries/<entity>.ts`
- New tools: add implementation in `tools/`, register in `tools/registry.ts`
- Tool `execute()` always returns `string` (sync or async)
- Session context stored as typed JSON in `sessions.context`

---

## Commands

```bash
npm run dev        # tsx --watch src/index.ts
npm run build      # npx tsc
npm start          # node dist/index.js
npm run lint       # biome lint ./src
npm run format     # biome format --write ./src
npm run check      # biome check --write ./src  (lint + format + auto-fix)
npm run typecheck  # tsc --noEmit
```

---

## Pre-Commit (MANDATORY)

**ALWAYS run before committing:**

```bash
npm run check      # Biome: lint + format + auto-fix
npm run typecheck  # TypeScript: verify types without compiling
```

**ABSOLUTE RULE:** NEVER run `git commit` if `npm run check` or `npm run typecheck` report any errors or warnings. Fix ALL problems before proceeding. This includes:
- Biome warnings (`noExplicitAny`, `noNonNullAssertion`, etc.)
- Formatting or lint errors
- TypeScript type errors

Repeat the `check → fix → check` cycle until both commands complete with zero issues. Only then run `git commit`. The pre-commit hook (husky) also runs these checks automatically, but always run them proactively before calling `git commit`.

---

## Code Quality (Biome)

- **Linter + Formatter:** Biome (`biome.json` at root)
- `biome check --write` applies lint and formatting automatically
- Config: 2 spaces, double quotes, ES5 trailing commas, 100-char line width
- Warnings on `noExplicitAny` and `noNonNullAssertion` — treat as errors
