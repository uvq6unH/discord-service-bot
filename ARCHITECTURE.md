# Discord Service Bot — Architecture

> **Runtime:** Node.js ESM  
> **Deploy:** Render.com or PM2 on VPS  
> **Stack:** Discord.js · Express · Upstash Redis · React + Vite (dashboard)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Deploy Modes](#3-deploy-modes)
4. [Boot Flow](#4-boot-flow)
5. [Backend — src/](#5-backend--src)
6. [Frontend — dashboard/](#6-frontend--dashboard)
7. [Redis Key Scheme](#7-redis-key-scheme)
8. [Deployment](#8-deployment)
9. [Feature Data Flows](#9-feature-data-flows)
10. [Dependency Map](#10-dependency-map)

---

## 1. System Overview

Multi-feature Discord bot with two deploy modes:

**Mode A — Monolith (1 process):**
```
src/index.js → bot + dashboard in the same process
```

**Mode B — Split (2 processes):**
```
src/index.bot.js    → Discord client process
src/index.server.js → Express dashboard process
Communication: Upstash Redis (shared state, config, sessions)
```

```
┌──────────────────────┐      Redis (Upstash)      ┌─────────────────────────┐
│   discord-bot        │ ◄───── shared state ──────► │   discord-dashboard     │
│   (index.bot.js)     │       configs               │   (index.server.js)     │
│                      │       sessions              │                         │
│  • Discord Gateway   │       distributed locks     │  • Express + OAuth2     │
│  • Slash commands    │                             │  • REST API             │
│  • Music (Lavalink)  │                             │  • React SPA (Vite)     │
│  • Economy / Games   │                             │  • Guild config UI      │
│  • Riot API          │                             │                         │
└──────────────────────┘                             └─────────────────────────┘
```

**Design principles:**
- **Redis-first persistence:** All state lives in Upstash Redis. JSON files are local-dev fallback only.
- **Granular Redis keys:** Each subsystem uses its own key (`guild:{id}:economy:{userId}`) — avoids contention on concurrent writes.
- **Distributed locking:** `withRedisLock()` (Redis) or `asyncMutex` (single-process). Safe to scale horizontally.
- **Per-guild isolation:** Config and state are all keyed by `guildId`.
- **`botClient` optional:** `server.js` accepts `botClient` (can be `null`). Guild data routes use Redis `guild_cache` as primary source; 503 only when cache is cold AND no botClient. `/api/slash-sync` queues to Redis instead of returning 503.

---

## 2. Architecture Diagram

```
Discord API ◄──────────────────────────────────► Lavalink Server
     │ WebSocket (Gateway)        REST/WS         (Java, audio)
     │ REST (API calls)
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ src/index.js  ← MONOLITH ENTRY (Mode A)                            │
│  • validateEnvironment()          (bot + server vars)               │
│  • createUpstashFromEnv()  → redis                                  │
│  • new ConfigStore() + new StateStore()   ← shared singletons       │
│  • createBot(configStore, stateStore)     ← real botClient          │
│  • createServer({ botClient, ... })       ← dashboard sees bot      │
│  • loginWithRetry() → app.listen() → startKeepalive()              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ src/index.bot.js  ← BOT ENTRY (Mode B)                             │
│  • validateBotEnvironment()                                         │
│  • createUpstashFromEnv() → sharedRedis                             │
│  • new ConfigStore() + new StateStore()                             │
│  • createBot(configStore, stateStore)                               │
│  • loginWithRetry() — no HTTP server, no keepalive                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ src/index.server.js  ← DASHBOARD ENTRY (Mode B)                    │
│  • validateServerEnvironment()                                      │
│  • createUpstashFromEnv() → sharedRedis  (same Redis instance)     │
│  • new ConfigStore() + new StateStore()                             │
│  • createServer({ botClient: null, ... })                           │
│    → /api/guild-data, /api/members read guild_cache from Redis  │
│    → /api/slash-sync pushes to slash_sync_queue (no 503)        │
│    → /api/config, /api/guilds, /api/state work normally             │
│  • app.listen(PORT)                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Deploy Modes

### Why two modes?

| Concern | Mode A (Monolith) | Mode B (2-process) |
|---------|-------------------|--------------------|
| Render Free plan | ✅ 1 web service | ❌ Worker not supported |
| Music memory leak crashes dashboard | ❌ Same process | ✅ Isolated |
| Restart bot without dropping users | ❌ | ✅ |
| Deployment simplicity | ✅ | More complex |
| Dashboard sees bot guild cache | ✅ Direct | ✅ Via Redis guild_cache (Phase 1) |

### Mode B limitations (botClient = null in dashboard process)

> Phase 1 + Phase 2 (PLAN.md) are complete — the three previously-broken routes now work via Redis.

| Route | Mode B |
|-------|--------|
| `GET /api/guild-data` | ✅ reads `guild_cache:{guildId}` from Redis; **503** only on cache miss |
| `GET /api/members` | ✅ reads `guild_cache:{guildId}` from Redis; **503** only on cache miss |
| `POST /api/slash-sync` | ✅ pushes job to `slash_sync_queue` Redis list; bot picks up within 5 s |
| `GET /api/guilds` | ✅ (OAuth) |
| `GET /api/config` | ✅ (Redis) |
| `PUT /api/config` | ✅ (Redis, slash-sync skipped if botClient null) |
| `GET /api/state` | ✅ (stateStore directly via Redis) |

### Inter-process communication (Mode B)

No direct IPC. Everything flows through Redis:
```
Bot writes → Redis ← Dashboard reads
             (ConfigStore, StateStore, SessionStore)
```

---

## 4. Boot Flow

### Monolith (`src/index.js`)

```
1. sodium.ready              (voice encryption)
2. validateEnvironment()     (bot + server env vars)
3. createUpstashFromEnv()    → redis
4. new ConfigStore()         → guild configs
5. new StateStore()          → ready (Redis mode)
6. createBot(...)            → Discord Client (not yet logged in)
7. createServer({ botClient, ... })   → Express app (not yet listening)
8. loginWithRetry()          → client.login(token)
   └─ 10 attempts, backoff 5s→30s, retry transient errors only
9. app.listen(PORT)          → HTTP server open
10. startKeepalive(port)     → ping /health every 5 minutes

After ClientReady:
  ├─ initLavalink()
  ├─ purgeStaleGameSessions()
  ├─ syncGuildCommands() per guild
  └─ setInterval(reminderWorker, 60s)
```

### Bot process (`src/index.bot.js`)

```
1. sodium.ready
2. validateBotEnvironment()  (DISCORD_TOKEN + Redis in prod)
3. createUpstashFromEnv() + ConfigStore + StateStore
4. createBot()
5. loginWithRetry()
   ↳ No HTTP server, no keepalive
```

### Dashboard process (`src/index.server.js`)

```
1. validateServerEnvironment()  (OAuth + SESSION_SECRET)
2. createUpstashFromEnv() + ConfigStore + StateStore
3. createServer({ botClient: null, ... })
4. app.listen(PORT)   ← default 10000
```

---

## 5. Backend — src/

### 5.1 Entry Points

| File | Used for | HTTP? | Keepalive? |
|------|----------|-------|------------|
| `src/index.js` | Monolith (1 process) | ✅ | ✅ |
| `src/index.bot.js` | Bot-only (2-process) | ❌ | ❌ |
| `src/index.server.js` | Dashboard-only (2-process) | ✅ | ❌ |

#### `src/env.js` — Environment Validator

| Export | Used by | Validates |
|--------|---------|-----------|
| `validateBotEnvironment()` | `index.bot.js` | `DISCORD_TOKEN`, Redis (prod) |
| `validateServerEnvironment()` | `index.server.js` | OAuth vars, `SESSION_SECRET` ≥32 chars, Redis (prod) |
| `validateEnvironment()` | `index.js` (monolith) | Both sets above |

---

### 5.2 HTTP Server & Auth

#### `src/server.js` — Express Application

`createServer({ configStore, stateStore, botClient, redis })`:

- `botClient` can be `null` (dashboard-only mode) or a real Discord Client (monolith)
- All state-reading routes use the injected `stateStore` — not `botClient.stateStore`
- Routes requiring bot cache: guarded with `if (!botClient)` → returns 503

**Middleware stack:**
```
helmet (CSP + security headers)
  ↓ expressSession (cookie "dsession", store: Upstash Redis)
  ↓ express.json (limit: 128kb)
  ↓ Rate limiters (read: 60/min, write: 20/min)
  ↓ CSRF validation (POST/PUT require X-CSRF-Token header)
  ↓ auth.requireAuth / requireGuildAccess (per route)
```

**Route summary:**

| Method | Path | Requires bot? |
|--------|------|---------------|
| GET | `/health` | ❌ |
| GET | `/auth/login`, `/callback`, `/logout`, `/me` | ❌ |
| GET | `/api/csrf-token` | ❌ |
| GET | `/api/status` | ❌ (returns heartbeats + stats counters from Redis) |
| GET | `/api/guilds` | ❌ (OAuth) |
| GET | `/api/config` | ❌ |
| PUT | `/api/config` | ❌ (slash-sync skipped if null) |
| POST | `/api/slash-sync` | ⚡ Redis queue fallback (no 503 in split mode) |
| GET | `/api/state` | ❌ (stateStore directly) |
| GET | `/api/guild-data` | ⚡ Redis `guild_cache` fallback; 503 only on cache miss |
| GET | `/api/members` | ⚡ Redis `guild_cache` fallback; 503 only on cache miss |
| GET | `/api/invite-url` | ❌ |
| GET | `/api/keepalive-status` | ❌ |

---

#### `src/auth.js` — Discord OAuth2

`requireGuildAccess` uses `botClient?.guilds?.cache` (optional chaining) — safe when `botClient = null`.

Fallback permission check: if Discord OAuth unavailable → try bot guild cache (if present) → 403.

---

#### `src/bot.js` — Discord Client Factory + keepalive

- `createBot(configStore, stateStore, redis?)` → Discord Client
  - `redis` param is optional — when present, enables guild cache writing and slash sync queue worker
  - On `ClientReady`: writes `guild_cache:{guildId}` (meta) + `guild_cache:{guildId}:members` for all guilds, sets 10-min refresh interval
  - On `GuildCreate` / `GuildUpdate`: immediately refreshes both keys
  - Slash sync queue: polls `slash_sync_queue` every 5 s via `setInterval` (only when `redis` present)
- `startKeepalive(port)` → **separate export**, only called from `index.js` after the HTTP server is listening

---

### 5.3 Data Layer

#### `src/stateStore.js` — Runtime State (granular Redis keys)

`stateStore` is injected into both `createBot` and `createServer`. In 2-process mode, the dashboard uses `stateStore` directly over Redis — no bot process required.

**`/api/state` reads from:**
- `stateStore.getLeaderboard()` → ranked user count
- `stateStore._rGet(ticketCounter)` → next ticket number

#### `src/configStore.js` — Guild Config (Redis)

All config is stored in Redis. The JSON file (`CONFIG_PATH`) is a fallback for local dev only (when Redis env vars are not set).

`riotApiKey` / `tftApiKey` are never persisted to Redis — in-memory only.

---

## 6. Frontend — dashboard/

React SPA (Vite) → build → `public-react/` → served by Express.

```
dashboard/src/
  api.js           ← apiFetch + auto CSRF attachment + 401 redirect
  contexts/
    AuthContext     ← useAuth() — /auth/me
    GuildContext    ← useGuild() — config, guildData, save
  components/
    ServerRail      ← guild icon list (72px sidebar)
    PluginNav       ← nav sidebar (220px)
    ui.jsx          ← SaveBar, Toggle, ChannelSelect, RoleSelect, ...
  pages/
    Login, Overview, Members, Commands, Economy, Moderation, Lol
```

`api.saveConfig` → `PUT /api/config` (matches `app.put` in server.js)

### Dev workflow

```bash
# Terminal 1: Express API
node src/index.server.js   # :10001

# Terminal 2: Vite dev server
pnpm dev:ui                # :5173 (proxies /api → :10001)
```

---

## 7. Redis Key Scheme

```
# Config
config:_index                            → JSON string[]
config:guild:{guildId}                   → JSON config object

# Guild cache (bot writes, dashboard reads — Split mode Phase 1)
guild_cache:{guildId}                    → JSON { name, iconURL, channels[], roles[], memberCount, updatedAt }
                                           Small (~5–20 KB). TTL: 900 s (15 min).
                                           Read by /api/guild-data (channels + roles for dashboard dropdowns).
guild_cache:{guildId}:members            → JSON members[] — separate key to avoid Upstash 1MB limit
                                           Scales with guild size (~200 B × member count).
                                           Read only by /api/members. TTL: 900 s (15 min).
                                           Bot refreshes both keys every 10 min on setInterval,
                                           and immediately on GuildCreate / GuildUpdate events.

# Slash sync queue (dashboard writes, bot polls — Split mode Phase 2)
slash_sync_queue                         → Redis list of JSON { guildId, requestedAt }
                                           Bot polls via lpop every 5 s.

# Observability counters (bot increments, /api/status reads — Phase 3.3)
stats:slash_sync_processed               → integer — total slash sync jobs completed by bot worker
stats:guild_cache_refresh                → integer — total successful guild cache writes
stats:discord_errors                     → integer — total ShardError + Error events

# Economy
guild:{guildId}:economy:{userId}         → JSON { silver, gold, diamond, lastDailyAt, lastDailyDay }
guild:{guildId}:economy:_members         → Set<userId>

# Levels / XP
guild:{guildId}:levels:{userId}          → JSON { xp, level, lastMessageAt }
guild:{guildId}:levels:_members          → Set<userId>

# Moderation
guild:{guildId}:warnings:{userId}        → JSON Warning[]

# Tickets
guild:{guildId}:tickets:nextNumber       → string number (INCR-safe)

# Games
guild:{guildId}:game:{type}:{messageId}  → JSON session

# Riot Accounts
guild:{guildId}:lolAccount:{userId}      → JSON { riotId, puuid, region, linkedAt }
guild:{guildId}:tftAccount:{userId}      → JSON { riotId, puuid, region, linkedAt }

# Guild index
guild:index                              → Set<guildId>

# Distributed locks
lock:economy:{guildId}:{userId}          → token (EX 15s)
lock:warnings:{guildId}:{userId}         → token (EX 15s)
lock:ticket:{guildId}                    → token (EX 15s)
lock:game:{type}:{guildId}:{messageId}   → token (EX 30s)

# Sessions
sess:{sessionId}                         → JSON session data (EX 7d)

# Rate limiting
rl:read:{ip}:{userId}                    → counter (EX 60s)
rl:write:{ip}:{userId}                   → counter (EX 60s)

# Config locks
config:lock:{guildId}                    → lock token
```

---

## 8. Deployment

### Render.com — Mode A (Monolith, Free plan)

One **Web** service:
```
Build:  pnpm install --no-frozen-lockfile && pnpm build:ui
Start:  node src/index.js
Health: /health
```

All env vars required (bot + dashboard + Redis).

### Render.com — Mode B (2 services, Starter plan)

See `render.yaml`. No persistent disk — all state flows through Redis.

```yaml
services:
  - type: worker   # Bot
    startCommand: node src/index.bot.js
  - type: web      # Dashboard
    startCommand: node src/index.server.js
    healthCheckPath: /health
```

> **Important:** Do not set `CONFIG_PATH` or `STATE_PATH` on Render. Both services must share the same Upstash Redis instance as the single source of truth.

### PM2 (VPS)

```bash
pm2 start pm2.config.cjs        # 2 separate processes
# or
node src/index.js               # monolith
```

### Environment Variables

| Var | Monolith | Bot | Dashboard |
|-----|----------|-----|-----------|
| `DISCORD_TOKEN` | ✅ | ✅ | — |
| `DISCORD_CLIENT_ID` | ✅ | — | ✅ |
| `DISCORD_CLIENT_SECRET` | ✅ | — | ✅ |
| `DISCORD_REDIRECT_URI` | ✅ | — | ✅ |
| `SESSION_SECRET` | ✅ | — | ✅ |
| `UPSTASH_REDIS_REST_URL` | ✅ | ✅ | ✅ |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | ✅ | ✅ |
| `RIOT_API_KEY` | ✅ | ✅ | — |
| `TFT_API_KEY` | ✅ | ✅ | — |
| `LAVALINK_HOST/PORT/PASSWORD/SECURE` | ✅ | ✅ | — |
| `KEEPALIVE_CHANNEL_ID` | ✅ | ✅ | — |
| `PORT` | ✅ | — | ✅ |
| `NODE_ENV` | ✅ | ✅ | ✅ |

---

## 9. Feature Data Flows

### Economy Transaction

```
User: "!blackjack 100"
  → MessageCreate → runBuiltInCommand()
    → handleEconomy() → parseBetCommand() → { bet: 100, currency: 'silver' }
    → stateStore.tryDebitBalance(guildId, userId, 'silver', 100)
      → _withEconomyLock() → withRedisLock()
      → SET guild:{id}:economy:{userId}
    → reply(blackjackEmbed + buttons)
    → setGameSession() → SET guild:{id}:game:blackjack:{msgId}

User clicks "Hit":
  → InteractionCreate → handleBlackjackButton()
    → withGameSessionLock() → deal card
    → on win: adjustBalance(+win) → SET guild:{id}:economy:{userId}
    → deleteGameSession() → DEL guild:{id}:game:blackjack:{msgId}
```

### Config Save from Dashboard

```
Admin changes prefix → clicks Save
  → GuildContext.saveConfig()
  → api.saveConfig(guildId, config)           (PUT /api/config)
  → configStore.updateGuildConfig()           → SET config:guild:{guildId}
  → botClient?.syncGuildCommands()            (skipped if null — Mode B)
  → res.json({ ...config, slashSync })
```

---

## 10. Dependency Map

```
src/index.js  (monolith)
  ├── src/env.js                (validateEnvironment)
  ├── src/upstash.js
  ├── src/configStore.js
  ├── src/stateStore.js
  ├── src/bot.js                (createBot + startKeepalive)
  └── src/server.js

src/index.bot.js
  ├── src/env.js                (validateBotEnvironment)
  ├── src/upstash.js            → sharedRedis (passed to createBot for guild_cache + slash_sync_queue)
  ├── src/configStore.js
  ├── src/stateStore.js
  └── src/bot.js                (createBot(configStore, stateStore, sharedRedis) — startKeepalive not called)

src/index.server.js
  ├── src/env.js                (validateServerEnvironment)
  ├── src/upstash.js
  ├── src/configStore.js
  ├── src/stateStore.js
  └── src/server.js
        ├── src/auth.js         (botClient optional — null-safe)
        ├── src/csrf.js
        ├── src/rateLimit.js
        └── src/sessionStore.js

src/bot.js
  ├── src/cooldowns.js
  ├── src/commandAccess.js
  ├── src/bot/commands/index.js
  │     ├── src/bot/commands/runtime.js
  │     └── handlers/ (8 files)
  │           └── riot.js → lolCommands.js + tftCommands.js
  ├── src/bot/interactions.js
  │     ├── src/bot/games.js
  │     └── src/bot/help.js
  ├── src/bot/music/lavalink.js
  └── src/bot/slash.js
```