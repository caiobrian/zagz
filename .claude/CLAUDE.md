# Zagz - Personal AI Agent Project

## Stack
- **Language:** TypeScript (Node.js, ESM modules)
- **WhatsApp API:** Baileys (`@whiskeysockets/baileys`)
- **Telegram API:** node-telegram-bot-api
- **AI Providers:** Gemini (`@google/generative-ai`), Claude (`@anthropic-ai/sdk`), OpenAI (`openai`) — default `gemini-2.5-flash`
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
├── docs/                       # Roadmap and planning documents
├── src/
│   ├── agent/
│   │   ├── core.ts             # Main message processing loop + tool orchestration
│   │   ├── memory.ts           # Semantic memory service (key-value with categories)
│   │   ├── memory-extractor.ts # Auto-extracts facts from conversations (async, non-blocking)
│   │   ├── prompt.ts           # Dynamic system prompt builder (chain-of-thought tags)
│   │   ├── session.ts          # Multi-step flow state machine
│   │   └── providers/
│   │       ├── types.ts        # AIProvider, AIChat, ChatMessage interfaces
│   │       ├── index.ts        # createAIProvider() factory (reads AI_PROVIDER env var)
│   │       ├── gemini.ts       # Gemini adapter
│   │       ├── anthropic.ts    # Claude adapter
│   │       └── openai.ts       # OpenAI adapter
│   ├── channels/
│   │   ├── types.ts            # MessageChannel interface
│   │   ├── whatsapp.ts         # Baileys channel implementing MessageChannel
│   │   └── telegram.ts         # Telegram bot channel implementing MessageChannel
│   ├── config/
│   │   └── index.ts            # (empty, reserved for future centralized config)
│   ├── cron/
│   │   ├── scheduler.ts        # Job seeding + node-cron scheduling
│   │   └── jobs/
│   │       ├── morning-briefing.ts      # 8 AM daily prompt
│   │       ├── finance-summary.ts       # 8 PM daily prompt
│   │       ├── weekly-review.ts         # 9 AM Monday prompt
│   │       ├── appointment-reminder.ts  # Every 30 min, 24h/1h reminders
│   │       └── memory-consolidation.ts  # Sunday 3 AM — dedup + consolidate memories
│   ├── db/
│   │   ├── client.ts           # SQLite connection + schema creation
│   │   └── queries/
│   │       ├── conversations.ts
│   │       ├── memories.ts
│   │       ├── sessions.ts
│   │       ├── appointments.ts
│   │       ├── purchases.ts
│   │       ├── cron.ts
│   │       ├── tools.ts
│   │       └── evolution.ts    # agent_evolution_log queries
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
│   ├── skills/
│   │   ├── types.ts            # SkillTool + Skill interfaces
│   │   ├── loader.ts           # Dynamic skill directory loader
│   │   ├── memory/index.ts     # memory_read, memory_write, cron_manage
│   │   ├── scheduling/index.ts # create/list/update/cancel_appointment
│   │   ├── payment/index.ts    # purchase flow tools (logBlocklist on credentials)
│   │   ├── search/index.ts     # search_web, search_nearby_places (rateLimit: 30/h)
│   │   ├── system/index.ts     # autonomous_action, evolve_agent (ALLOW_SELF_MODIFICATION guard)
│   │   ├── price-monitor/      # watch_price, unwatch_price, list_price_monitors
│   │   ├── rss-monitor/        # subscribe_rss, unsubscribe_rss, list_rss_feeds
│   │   └── external/
│   │       ├── skills.json     # Dynamic config: mcpServers + customSkills paths
│   │       └── loader.ts       # loadExternalConfig, saveExternalConfig, addMcpServer
│   ├── tools/
│   │   ├── index.ts            # Barrel export
│   │   ├── registry.ts         # Central dispatcher: dynamic _toolMap, execute(), rate limiting
│   │   ├── selfEvolution.ts    # evolve_agent + rollback_evolution (JSON-based, audit log)
│   │   └── autonomous.ts       # autonomous_action (shell/file — requires ALLOW_SELF_MODIFICATION)
│   ├── webhooks/
│   │   └── server.ts           # Express HTTP server: HMAC-signed webhooks + /health
│   └── index.ts                # Entrypoint: MCP → registry → cron → channels
├── biome.json                  # Linter/formatter config
├── tsconfig.json               # Strict TS, ESNext, NodeNext modules
└── .env.example                # All required env vars documented
```

---

## Environment Variables

```bash
# AI provider (gemini | anthropic | openai — default: gemini)
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# User
USER_NAME=
AUTHORIZED_JID=          # WhatsApp JID allowed to manage cron jobs (optional)

# Channels (comma-separated: whatsapp, telegram — default: whatsapp)
CHANNELS=whatsapp
TELEGRAM_BOT_TOKEN=

# Database
DATABASE_FILE=./database.db

# Search APIs
TAVILY_API_KEY=
GOOGLE_MAPS_API_KEY=

# Self-modification (optional, dangerous)
ALLOW_SELF_MODIFICATION=false

# Webhooks (leave empty to disable)
WEBHOOK_PORT=
WEBHOOK_SECRET=

# Payment credentials (never logged or displayed to user)
CARD_NUMBER=
CARD_HOLDER_NAME=
CARD_EXPIRY_MONTH=
CARD_EXPIRY_YEAR=
CARD_CVV=
CARD_BILLING_CPF=
CARD_BILLING_ZIP=
CARD_BILLING_ADDRESS=
CARD_BILLING_CITY=
CARD_BILLING_STATE=

TZ=America/Sao_Paulo
```

---

## Architecture Overview

### Startup Sequence (`src/index.ts`)
1. Load `.env`
2. Initialize MCP manager (connects to all configured MCP servers)
3. Initialize skill registry — loads built-in skills + `customSkills` from `skills.json`
4. Initialize cron scheduler (seeds default jobs, starts schedules)
5. Wire alert senders (price monitor, RSS monitor, webhooks)
6. Start all configured channels (WhatsApp and/or Telegram)
7. Log "Agent online"

### Message Processing Flow
```
Incoming message (WhatsApp self-chat or Telegram)
  → channel.onMessage handler (index.ts)
  → agentCore.handleMessage(text)
    → generatePlan() — preliminary plan (text-only, no tools)
    → Load active session
    → Build system prompt (memories + session + chain-of-thought tags)
    → Load recent 20 conversations as history
    → Send to AI provider with tool declarations
    → Tool call loop (max 20 iterations + loop detection):
        → detectLoop() — stop if same tool+args called 3x
        → toolRegistry.execute() → SkillTool.execute()
        → Error recovery hints injected on failure patterns
        → Send tool results back to AI provider
    → Strip [PENSAMENTO]/[PLANO] tags from response
    → Persist conversation to DB
    → extractMemories() — async background fact extraction
  → Send response back to user
```

### AI Provider Abstraction
```
createAIProvider() (AI_PROVIDER env var)
  → GeminiProvider   (default)
  → AnthropicProvider
  → OpenAIProvider
       ↓
  AIProvider.startChat() → AIChat
  AIChat.send(message | ToolResult[]) → AIResponse
```

### Channel Abstraction
```
MessageChannel interface: start(), sendMessage(), onMessage(handler)
  → WhatsAppChannel  (Baileys — self-chat only, single user)
  → TelegramChannel  (polling — multi-user)
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
| `memories` | Key-value facts with categories (8 types: finance, projects, preferences, routine, location, episodic, context, preference) |
| `sessions` | Multi-step flow state + JSON context |
| `conversations` | Chat history (role, content, session_id) |
| `cron_jobs` | Scheduled task metadata, enabled flag, last run status |
| `tools_log` | Tool execution audit trail (sensitive tools excluded) |
| `purchases` | E-commerce transaction tracking |
| `appointments` | Service bookings + reminder tracking |
| `agent_evolution_log` | Audit trail for evolve_agent actions (snapshot before/after) |
| `price_monitors` | URLs + target prices for price monitoring |
| `rss_feeds` | RSS feed subscriptions + keyword filters |

### Key Conventions
- All queries are prepared statements (`better-sqlite3` sync API)
- `updated_at` columns updated on every upsert
- Foreign keys enforced (`PRAGMA foreign_keys = ON`)
- WAL journal mode for concurrent reads
- Indexes on frequently-filtered columns

---

## Skills System

### How It Works
All tools are organized as **Skills** — self-contained modules under `src/skills/`.

Each skill directory exports a default `Skill` object:
```typescript
interface Skill {
  name: string;
  version: string;
  description: string;
  tools: SkillTool[];
  onInit?(): Promise<void>;
}
```

`initRegistry()` in `src/tools/registry.ts`:
1. Loads all built-in skills from `src/skills/` via `loadSkills()`
2. Loads any `customSkills` paths listed in `src/skills/external/skills.json`
3. Loads any `extraSkills` passed directly (runtime registration)
4. Builds `_toolMap: Map<toolName, SkillTool>`

### Built-in Skills

| Skill | Location | Tools |
|-------|----------|-------|
| memory | `skills/memory/` | `memory_read`, `memory_write`, `cron_manage` |
| scheduling | `skills/scheduling/` | `create/list/update/cancel_appointment` |
| payment | `skills/payment/` | `get_payment_credentials`, `initiate/confirm/complete/cancel_purchase` |
| search | `skills/search/` | `search_web`, `search_nearby_places` |
| system | `skills/system/` | `autonomous_action`, `evolve_agent` (ALLOW_SELF_MODIFICATION guard) |
| price-monitor | `skills/price-monitor/` | `watch_price`, `unwatch_price`, `list_price_monitors` |
| rss-monitor | `skills/rss-monitor/` | `subscribe_rss`, `unsubscribe_rss`, `list_rss_feeds` |

### Adding a New Skill
1. Create `src/skills/<skill-name>/index.ts` exporting a default `Skill` object
2. It will be auto-discovered by `loadSkills()` on next startup — no registry changes needed

### External / Dynamic Skills
- Add skill directory paths to `customSkills` array in `src/skills/external/skills.json`
- Add MCP servers to `mcpServers` array in the same file (used by `evolve_agent`)
- Changes take effect on next startup (or runtime via `registerSkill()`)

### Registry Properties
**Rate limits:** `search_web` and `search_nearby_places` — 30 calls/hour
**Logging blocklist:** `get_payment_credentials` is never written to `tools_log`
**Sensitive data masking:** card number, CVV, CPF masked before any logging
**MCP fallback:** tools not found in `_toolMap` are forwarded to `mcpManager.callTool()`

---

## MCP Integration (`src/mcp/`)
- Default servers: `filesystem` (isolated `workspace/` dir), `playwright` (headless browser)
- Tool names namespaced as `serverName__toolName`
- JSON schema sanitized for AI providers (removes `$schema`, `default`, `examples`)
- New servers added dynamically via `evolve_agent` tool → persisted to `skills.json`

---

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `morning_briefing` | `0 8 * * *` | Daily briefing: projects, routines, appointments |
| `finance_summary` | `0 20 * * *` | Daily financial recap from memories |
| `weekly_review` | `0 9 * * 1` | Monday project + goals review |
| `appointment_reminders` | `*/30 * * * *` | 24h and 1h reminders for upcoming appointments |
| `memory_consolidation` | `0 3 * * 0` | Sunday 3 AM — AI-powered dedup + consolidation of memories |
| *(price monitor)* | `*/30 * * * *` | Checks watched URLs, alerts when target price reached |
| *(rss monitor)* | `*/30 * * * *` | Checks RSS feeds, alerts on new matching items |

Cron jobs run `agentCore.handleCronPrompt()` and send output via WhatsApp.
Results and errors are logged to the `cron_jobs` table.

---

## Proactivity & Events

### Webhook Server (`src/webhooks/server.ts`)
- Express HTTP server at `WEBHOOK_PORT`
- HMAC-SHA256 signature validation via `WEBHOOK_SECRET`
- `POST /webhook` — receives external events, processes through agentCore
- `GET /health` — health check

### Price Monitor (`skills/price-monitor/`)
- `watch_price(url, selector?, targetPrice)` — register URL for monitoring
- Cron every 30 min scrapes URL, compares to target price
- Alerts once when price ≤ target

### RSS Monitor (`skills/rss-monitor/`)
- `subscribe_rss(url, keywords?)` — subscribe to feed with optional keyword filter
- Cron every 30 min fetches feed, compares to last seen items
- Alerts on up to 3 new matching items per feed

---

## Auto-Evolution (`evolve_agent` + `rollback_evolution`)

- `evolve_agent`: Adds a new MCP server to `skills.json`, connects at runtime, logs to `agent_evolution_log`
- `rollback_evolution`: Lists past evolutions or restores `skills.json` from a previous snapshot
- Guard: both tools only available when `ALLOW_SELF_MODIFICATION=true`
- `autonomous_action`: Runs shell commands or writes files; blocks writes to `.env`, `auth_info_baileys/`, `database.db`, `node_modules/`

---

## Security & Safety Conventions

1. **Credential isolation:** Payment card data lives only in `.env`; never logged, stored in DB, or shown to user
2. **Prompt injection defense:** Stored memories are sanitized (XML delimiters escaped) before being injected into the system prompt
3. **User confirmation:** Multi-step purchase flow requires explicit user approval before executing payment
4. **Rate limiting:** External API tools have per-hour call limits
5. **Autonomous tool guards:** `autonomous_action` blocks writes to sensitive paths
6. **Cron job authorization:** Only `AUTHORIZED_JID` can enable/disable/delete cron jobs via `cron_manage`
7. **Self-modification gate:** `evolve_agent` and `autonomous_action` only load when `ALLOW_SELF_MODIFICATION=true`
8. **Tool call loop limit:** Max 20 iterations per message + `detectLoop()` stops repeated identical calls
9. **Evolution audit:** Every `evolve_agent` call writes before/after snapshot to `agent_evolution_log`

---

## Legacy Code (Do Not Use for New Features)

| Legacy File | Replaced By |
|-------------|-------------|
| `src/handlers/message.ts` | `src/channels/whatsapp.ts` |
| `src/services/ai.ts` | `src/agent/core.ts` + `src/agent/providers/` |
| `src/services/whatsapp.ts` | `src/channels/whatsapp.ts` |
| `src/database/index.ts` | `src/db/client.ts` + `src/db/queries/` |
| `src/tools/memory-tool.ts` etc. | `src/skills/memory/index.ts` etc. |

**Current entry points:**
- Message handling: `src/channels/whatsapp.ts` or `src/channels/telegram.ts` → `agentCore`
- Agent logic: `src/agent/core.ts`
- AI provider: `src/agent/providers/index.ts` → `createAIProvider()`
- Database: `src/db/client.ts` + individual query modules

---

## Code Patterns

- Use `async/await` for all async operations
- Business logic in `agent/` or `skills/`
- Message handling in `channels/` (not `handlers/`)
- All DB queries isolated in `db/queries/<entity>.ts`
- New tools: create a skill in `skills/<name>/index.ts` — auto-discovered, no registry changes needed
- Tool `execute()` always returns `string` (sync or async)
- Session context stored as typed JSON in `sessions.context`
- AI provider calls go through `AIChat.send()` — never import provider SDKs in `core.ts`

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
