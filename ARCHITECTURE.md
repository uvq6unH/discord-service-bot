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
Communication: Upstash Redis (shared state, config, sessions, event queues)
```

```
┌──────────────────────┐      Redis (Upstash)      ┌─────────────────────────┐
│   discord-bot        │ ◄───── shared state ──────► │   discord-dashboard     │
│   (index.bot.js)     │       configs               │   (index.server.js)     │
│                      │       sessions              │                         │
│  • Discord Gateway   │       event queues          │  • Express + OAuth2     │
│  • Slash commands    │       heartbeats            │  • REST API             │
│  • Music (Lavalink)  │       stats counters        │  • React SPA (Vite)     │
│  • Economy / Games   │                             │  • Guild config UI      │
│  • Riot / TFT API    │                             │                         │
└──────────────────────┘                             └─────────────────────────┘
```

**Design principles:**

- **Redis-first persistence:** All persistent state lives in Upstash Redis. Local JSON files (`data/configs.json`, `data/state.json`) are local-dev fallbacks only — never used in production.
- **Granular Redis keys:** Each subsystem uses its own namespaced key (e.g. `guild:{id}:economy:{userId}`) to avoid contention on concurrent writes.
- **Distributed locking:** `withRedisLock()` in Redis mode, `asyncMutex` in single-process mode. Safe to scale horizontally.
- **Per-guild isolation:** All config and runtime state is keyed by `guildId`.
- **`botClient` optional in dashboard:** `createServer()` accepts `botClient = null`. Guild data routes read from Redis `guild_cache`; the 503 only fires on a cold cache miss with no bot present.

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
│  • new ConfigStore() + new StateStore()                             │
│  • createBot(configStore, stateStore, redis)                        │
│  • createServer({ botClient, configStore, stateStore, redis })      │
│  • loginWithRetry() → app.listen() → startKeepalive()              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ src/index.bot.js  ← BOT ENTRY (Mode B)                             │
│  • validateBotEnvironment()                                         │
│  • createUpstashFromEnv() → sharedRedis                             │
│  • new ConfigStore() + new StateStore()                             │
│  • createBot(configStore, stateStore, sharedRedis)                  │
│  • HTTP health server binds BEFORE login (Render port detection)    │
│  • loginWithRetry()                                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ src/index.server.js  ← DASHBOARD ENTRY (Mode B)                    │
│  • validateServerEnvironment()                                      │
│  • createUpstashFromEnv() → sharedRedis                             │
│  • new ConfigStore() + new StateStore()                             │
│  • createServer({ botClient: null, ... })                           │
│    → /api/guild-data, /api/members  read guild_cache from Redis     │
│    → /api/slash-sync               pushes to slash_sync_queue       │
│  • app.listen(PORT)                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Deploy Modes

### Why two modes?

| Concern | Mode A (Monolith) | Mode B (Split) |
|---------|-------------------|----------------|
| Render Free plan | ✅ 1 web service | ❌ Worker not supported |
| Music memory leak isolated from dashboard | ❌ Same process | ✅ Separate processes |
| Restart bot without dropping dashboard | ❌ | ✅ |
| Deployment simplicity | ✅ | More complex |
| Dashboard sees live guild data | ✅ Direct | ✅ Via Redis guild_cache |

### Mode B — botClient = null in dashboard process

All three previously-problematic routes are fully resolved via Redis:

| Route | Mode B behaviour |
|-------|-----------------|
| `GET /api/guild-data` | ✅ reads `guild_cache:{guildId}`; **503** only on cold cache miss |
| `GET /api/members` | ✅ reads `guild_cache:{guildId}:members`; **503** only on cold cache miss |
| `POST /api/slash-sync` | ✅ pushes job to `slash_sync_queue` Redis list; bot picks up within 5 s |
| `GET /api/guilds` | ✅ (OAuth) |
| `GET /api/config` | ✅ (Redis via ConfigStore) |
| `PUT /api/config` | ✅ (Redis; slash-sync skipped if botClient null) |
| `GET /api/state` | ✅ (StateStore directly via Redis) |
| `GET /api/status` | ✅ (reads heartbeat:bot + heartbeat:dashboard + stats counters) |

### Inter-process communication (Mode B)

No direct IPC. Everything flows through Redis:
```
Bot writes  → guild_cache, heartbeat:bot, stats:*
Bot reads   ← slash_sync_queue (polled every 5 s)
Dashboard writes → slash_sync_queue, config:guild:*
Dashboard reads  ← guild_cache, heartbeat:*, stats:*, config:*
```

---

## 4. Boot Flow

### Monolith (`src/index.js`)

```
1. sodium.ready              (voice encryption pre-requisite)
2. validateEnvironment()     (bot + server vars)
3. createUpstashFromEnv()    → redis
4. new ConfigStore()         → guild configs (Redis-backed)
5. new StateStore()          → runtime state (Redis-backed)
6. createBot(...)            → Discord Client (not yet logged in)
7. createServer({ botClient, ... }) → Express app (not yet listening)
8. loginWithRetry()          → client.login(token)
   └─ up to 10 attempts, exponential backoff 5 s → 30 s, transient errors only
9. app.listen(PORT)          → HTTP server open
10. startKeepalive(port)     → pings /health every 5 minutes

After ClientReady:
  ├─ initLavalink()
  ├─ purgeStaleGameSessions()
  ├─ syncGuildCommands() per guild
  ├─ writeGuildCache() for all guilds → guild_cache:* (Redis)
  ├─ setInterval(writeGuildCache, 10 min)
  ├─ setInterval(pollSlashSyncQueue, 5 s)
  ├─ setInterval(heartbeatWriter, 30 s)  → heartbeat:bot (TTL 90 s)
  └─ setInterval(reminderWorker, 60 s)
```

### Bot process (`src/index.bot.js`)

```
1. sodium.ready
2. validateBotEnvironment()
3. createUpstashFromEnv() + ConfigStore + StateStore
4. createBot(configStore, stateStore, sharedRedis)
5. http.createServer().listen(PORT)    ← binds BEFORE login (Render port detection)
   └─ /health responds 200 immediately; bot tag populated after login
6. loginWithRetry()
   └─ same retry logic as monolith
```

> **Why HTTP before login?** Render's zero-downtime deploy scans for an open port immediately after process start. Binding after `client.login()` (~4–5 s) causes Render to miss the port, triggering a SIGTERM.

### Dashboard process (`src/index.server.js`)

```
1. validateServerEnvironment()   (OAuth vars, SESSION_SECRET ≥ 32 chars, Redis in prod)
2. createUpstashFromEnv() + ConfigStore + StateStore
3. createServer({ botClient: null, ... })
4. app.listen(PORT)              ← default 10000
```

---

## 5. Backend — src/

### 5.1 Entry Points

| File | Purpose | HTTP | Keepalive |
|------|---------|------|-----------|
| `src/index.js` | Monolith (1 process) | ✅ Express | ✅ |
| `src/index.bot.js` | Bot-only (split mode) | ✅ minimal health server | ✅ |
| `src/index.server.js` | Dashboard-only (split mode) | ✅ Express | ❌ |

#### `src/env.js` — Environment Validator

| Export | Used by | Validates |
|--------|---------|-----------|
| `validateBotEnvironment()` | `index.bot.js` | `DISCORD_TOKEN`, Redis (prod) |
| `validateServerEnvironment()` | `index.server.js` | OAuth vars, `SESSION_SECRET` ≥ 32 chars, Redis (prod) |
| `validateEnvironment()` | `index.js` | Both sets combined |

---

### 5.2 HTTP Server & Auth

#### `src/server.js` — Express Application

`createServer({ configStore, stateStore, botClient, redis })`

- `botClient` may be `null` (split-mode dashboard) or a live Discord Client (monolith).
- State-reading routes use injected `stateStore`, never `botClient.stateStore`.
- Routes requiring live bot data are guarded by Redis cache fallback first, then 503.

**Middleware stack (in order):**
```
helmet (CSP + security headers)
  ↓ expressSession (cookie "dsession" → Upstash Redis store)
  ↓ express.json (limit: 128 kb)
  ↓ rate limiters (read: 60/min, write: 20/min, keyed by IP + userId)
  ↓ CSRF validation (POST/PUT require X-CSRF-Token header)
  ↓ auth.requireAuth / requireGuildAccess (per route)
```

**Route summary:**

| Method | Path | Bot required? |
|--------|------|--------------|
| GET | `/health` | ❌ |
| GET | `/auth/login`, `/callback`, `/logout`, `/me` | ❌ |
| GET | `/api/csrf-token` | ❌ |
| GET | `/api/status` | ❌ (reads heartbeat + stats counters from Redis) |
| GET | `/api/guilds` | ❌ (OAuth) |
| GET | `/api/config` | ❌ (ConfigStore / Redis) |
| PUT | `/api/config` | ❌ (slash-sync skipped if botClient null) |
| POST | `/api/slash-sync` | ⚡ queued to Redis; instant if botClient present |
| GET | `/api/state` | ❌ (StateStore / Redis) |
| GET | `/api/guild-data` | ⚡ Redis `guild_cache` fallback; 503 on cold miss only |
| GET | `/api/members` | ⚡ Redis `guild_cache:members` fallback; 503 on cold miss only |
| GET | `/api/invite-url` | ❌ |
| GET | `/api/keepalive-status` | ❌ |

---

#### `src/auth.js` — Discord OAuth2

- `requireGuildAccess` uses optional chaining on `botClient?.guilds?.cache` — null-safe.
- Permission fallback order: Discord OAuth token → bot guild cache (if present) → 403.

---

#### `src/bot.js` — Discord Client Factory

`createBot(configStore, stateStore, redis?)`

- `redis` is optional; when present it enables guild cache writes and the slash-sync queue worker.
- On `ClientReady`: writes `guild_cache:{guildId}` (meta) and `guild_cache:{guildId}:members` for every guild; starts 10-min refresh interval.
- On `GuildCreate` / `GuildUpdate`: immediately refreshes both keys.
- Slash sync queue: polls `slash_sync_queue` via `lpop` every 5 s (only when `redis` present).
- Heartbeat: writes `heartbeat:bot` every 30 s with `{ ts, uptimeS, guilds, ready }`. TTL = 90 s.
- Stats counters: increments `stats:slash_sync_processed`, `stats:guild_cache_refresh`, `stats:discord_errors` (fire-and-forget, non-fatal).

`startKeepalive(port)` — separate export, called only from `index.js` and `index.bot.js` after HTTP binds.

---

### 5.3 Data Layer

#### `src/stateStore.js` — Runtime State

Granular Redis key-per-entity model. Each subsystem (economy, levels, tickets, games, Riot accounts) has its own key space.

In split mode, the dashboard reads from `stateStore` directly over Redis — no bot process needed.

Key operations exposed: `tryDebitBalance`, `adjustBalance`, `getLeaderboard`, `setGameSession`, `withGameSessionLock`, `addWarning`, `getWarnings`.

#### `src/configStore.js` — Guild Config

Redis-backed (`config:guild:{guildId}`). Local JSON file is a local-dev fallback only.

`riotApiKey` and `tftApiKey` are never persisted to Redis — in-memory only, cleared on process restart.

`configPatch.js` exports `pickBoolean` and `pickFlag` helpers to safely merge partial API patches without clobbering existing values.

#### `src/upstash.js` — Redis Client

Minimal hand-rolled Upstash REST client (no SDK dependency). Supports: `get`, `set`, `del`, `incr`, `expire`, `smembers`, `sadd`, `eval`, `lpop`, `rpush`, `llen`, `pipeline`. Each request has a built-in 8 s timeout and up to 2 automatic retries with 200 ms / 400 ms backoff.

#### `src/distributedLock.js` / `src/asyncMutex.js`

`withRedisLock(redis, key, ttlS, fn)` — Redis-based distributed lock using `EVAL` + Lua for atomic acquire/release.

`asyncMutex` — in-process fallback for local dev when Redis is unavailable.

---

### 5.4 Command System

#### `src/bot/commands/index.js` — Command Router

Chains through an ordered list of domain handlers:

```
handleHelp → handleGeneral → handleModeration → handleLevels
  → handleEconomy → handlePanels → handleRiot
```

First handler to return a non-`undefined` value wins. Falls through to the configured `command.response` template.

#### `src/bot/commands/runtime.js` — Command Context

`createCommandContext({ client, config, command, source, args })` normalises slash interactions and legacy prefix messages into a single `ctx` object with `{ guild, channel, user, reply, isInteraction, actorMember, permissions, ... }`.

Permission check (`memberCanUseCommand`) runs before any handler. Auto-defer fires for command types listed in `AUTO_DEFER_COMMAND_TYPES`.

#### Handler files (`src/bot/commands/handlers/`)

| File | Commands handled |
|------|-----------------|
| `help.js` | `/help` |
| `general.js` | `/ping`, `/config`, `/server`, `/user`, `/avatar`, `/say`, `/remindme` |
| `moderation.js` | `/warn`, `/warnings`, `/clearwarnings`, `/kick`, `/ban`, `/purge`, `/ticket` |
| `levels.js` | `/level`, `/leaderboard` |
| `economy.js` | `/balance`, `/daily`, `/transfer`, `/blackjack`, `/coinflip`, `/slots` |
| `panels.js` | `/panel` |
| `riot.js` | `/lol-link`, `/lol-profile`, `/lol-match`, `/tft-link`, `/tft-profile` |

---

### 5.5 Riot / League of Legends Integration

#### `src/lolApi.js` — Riot API + Data Dragon Wrapper

Covers: Account-v1, Summoner-v4, League-v4, Match-v5, Champion-Mastery-v4, Data Dragon (champions, items, runes, patch version).

- All Riot API calls go through a throttled queue (20 req/s, 100 req/2 min — free tier).
- Static DDragon data cached in-memory with 1-hour TTL.
- Profile and match history responses cached 2 minutes.
- All endpoints use puuid-based paths (summoner ID endpoints are deprecated as of 2024).
- Region routing: uses `accountRouting` map for Account-v1 (VN2 → asia), `routing` map for Match-v5 (VN2 → sea).

#### `src/tftApi.js` — TFT API Wrapper

Same structure as `lolApi.js` but for TFT endpoints (TFT-Summoner-v1, TFT-League-v1, TFT-Match-v1, TFT-Champion-Mastery-v1).

#### `src/riot/helpers.js` — Shared Riot Utilities

Format helpers shared by both `lolCommands.js` and `tftCommands.js`.

#### Riot account storage (Redis)

```
guild:{guildId}:lolAccount:{userId}  → { riotId, puuid, region, linkedAt }
guild:{guildId}:tftAccount:{userId}  → { riotId, puuid, region, linkedAt }
```

Accounts are linked per user per guild. The `puuid` (not the deprecated summoner ID) is the persistent identifier.

---

### 5.6 Music

`src/bot/music/lavalink.js` — Lavalink client wrapper. Manages player lifecycle (join, play, skip, stop, queue). Lavalink server runs as a separate Java process (see `lavalink/` directory and `lavalink/fly.toml` for Fly.io deploy).

---

### 5.7 Remaining Utilities

| File | Purpose |
|------|---------|
| `src/cooldowns.js` | Per-command cooldown tracking (in-memory Map) |
| `src/commandAccess.js` | `memberCanUseCommand` — role/channel/permission checks |
| `src/bot/interactions.js` | Button/select-menu interaction router |
| `src/bot/games.js` | Blackjack, coinflip, slots game logic |
| `src/bot/help.js` | Dynamic help text generation |
| `src/bot/slash.js` | Slash command registration builder |
| `src/bot/embeds.js` | Shared Discord embed helpers |
| `src/bot/responses.js` | Template renderer (`{ping}`, `{userId}`, etc.) |
| `src/bot/logging.js` | `sendLog()` — sends formatted log to guild log channel |
| `src/bot/constants.js` | `AUTO_DEFER_COMMAND_TYPES` and other constants |
| `src/safeJson.js` | JSON parse that returns null on error |
| `src/csrf.js` | CSRF token generation and validation |
| `src/rateLimit.js` | Express rate limiter middleware |
| `src/sessionStore.js` | `UpstashSessionStore` for express-session |

---

## 6. Frontend — dashboard/

React SPA (Vite) → built to `public-react/` → served by Express as static files.

```
dashboard/src/
  api.js              ← apiFetch wrapper: auto-attaches CSRF token, redirects on 401
  contexts/
    AuthContext.jsx   ← useAuth() — wraps /auth/me
    GuildContext.jsx  ← useGuild() — config, guildData, updateConfig, saveConfig
  components/
    ServerRail.jsx    ← 72 px guild icon sidebar
    PluginNav.jsx     ← 220 px feature nav sidebar
    ui.jsx            ← SaveBar, Toggle, ChannelSelect, RoleSelect, Spinner, SectionCard
  pages/
    Login.jsx         ← Discord OAuth entry point
    Overview.jsx      ← Guild summary + welcome config
    Members.jsx       ← Member list
    Commands.jsx      ← Custom command editor
    Economy.jsx       ← Economy settings
    Moderation.jsx    ← Moderation settings
    Lol.jsx           ← LoL / TFT API key config + command reference
    System.jsx        ← Bot/dashboard heartbeat, slash queue length, stats counters
```

`GuildContext.saveConfig()` → `PUT /api/config` → `configStore.updateGuildConfig()` → `SET config:guild:{guildId}` in Redis.

### Dev workflow

```bash
# Terminal 1: Express API (no bot)
node src/index.server.js   # :10001

# Terminal 2: Vite dev server
pnpm dev:ui                # :5173 (proxies /api → :10001)
```

---

## 7. Redis Key Scheme

```
# Config
config:_index                            → JSON string[] (all guild IDs with config)
config:guild:{guildId}                   → JSON config object

# Guild cache (bot writes → dashboard reads)
guild_cache:{guildId}                    → JSON { name, iconURL, channels[], roles[], memberCount, ownerId, updatedAt }
                                           TTL: 900 s (15 min). Used by /api/guild-data.
guild_cache:{guildId}:members            → JSON members[] (separate key — avoids Upstash 1 MB limit)
                                           TTL: 900 s (15 min). Used by /api/members.

# Slash sync queue (dashboard writes → bot polls)
slash_sync_queue                         → Redis list of JSON { guildId, requestedAt }
                                           Bot polls via lpop every 5 s.

# Heartbeats (TTL 90 s — absence = offline)
heartbeat:bot                            → JSON { ts, uptimeS, guilds, ready }
heartbeat:dashboard                      → JSON { ts, uptimeS }

# Stats counters (bot increments, /api/status reads)
stats:slash_sync_processed               → integer
stats:guild_cache_refresh                → integer
stats:discord_errors                     → integer

# Economy
guild:{guildId}:economy:{userId}         → JSON { silver, gold, diamond, lastDailyAt, lastDailyDay }
guild:{guildId}:economy:_members         → Set<userId>

# Levels / XP
guild:{guildId}:levels:{userId}          → JSON { xp, level, lastMessageAt }
guild:{guildId}:levels:_members          → Set<userId>

# Moderation
guild:{guildId}:warnings:{userId}        → JSON Warning[]

# Tickets
guild:{guildId}:tickets:nextNumber       → string (INCR-safe counter)

# Games
guild:{guildId}:game:{type}:{messageId}  → JSON session (TTL 30 s)

# Riot accounts
guild:{guildId}:lolAccount:{userId}      → JSON { riotId, puuid, region, linkedAt }
guild:{guildId}:tftAccount:{userId}      → JSON { riotId, puuid, region, linkedAt }

# Guild index
guild:index                              → Set<guildId>

# Distributed locks
lock:economy:{guildId}:{userId}          → token (EX 15 s)
lock:warnings:{guildId}:{userId}         → token (EX 15 s)
lock:ticket:{guildId}                    → token (EX 15 s)
lock:game:{type}:{guildId}:{messageId}   → token (EX 30 s)
config:lock:{guildId}                    → token

# Sessions
sess:{sessionId}                         → JSON session data (EX 7 d)

# Rate limiting
rl:read:{ip}:{userId}                    → counter (EX 60 s)
rl:write:{ip}:{userId}                   → counter (EX 60 s)
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

### Render.com — Mode B (Split, Starter plan)

See `render.yaml`. No persistent disk — all state flows through Redis.

```yaml
services:
  - type: web      # Bot (needs port for Render health check)
    startCommand: node src/index.bot.js
    healthCheckPath: /health
  - type: web      # Dashboard
    startCommand: node src/index.server.js
    healthCheckPath: /health
```

> **Important:** Do not set `CONFIG_PATH` or `STATE_PATH` on Render. Both services must point to the same Upstash Redis instance as the single source of truth.

### PM2 (VPS)

```bash
pm2 start pm2.config.cjs   # Starts both bot + dashboard as separate processes
# or
node src/index.js           # Monolith
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
| `PORT` | ✅ | ✅ | ✅ |
| `NODE_ENV` | ✅ | ✅ | ✅ |

---

## 9. Feature Data Flows

### Economy Transaction (e.g. Blackjack)

```
User: "/blackjack 100"
  → InteractionCreate → runBuiltInCommand()
    → handleEconomy() → parseBetCommand() → { bet: 100, currency: 'silver' }
    → stateStore.tryDebitBalance(guildId, userId, 'silver', 100)
      → withRedisLock('lock:economy:{guildId}:{userId}')
      → SET guild:{guildId}:economy:{userId}
    → reply(blackjackEmbed + Hit/Stand buttons)
    → setGameSession() → SET guild:{guildId}:game:blackjack:{msgId} (TTL 30 s)

User clicks "Hit":
  → InteractionCreate → handleComponentInteraction()
    → withGameSessionLock() → deal card
    → on win:  adjustBalance(+winAmount) → SET guild:{guildId}:economy:{userId}
    → on bust: session ends naturally
    → deleteGameSession() → DEL guild:{guildId}:game:blackjack:{msgId}
```

### Config Save from Dashboard

```
Admin changes a setting → clicks Save
  → GuildContext.saveConfig()
  → api.saveConfig(guildId, config)            → PUT /api/config
  → configStore.updateGuildConfig(guildId, ...) → SET config:guild:{guildId}
  → botClient?.syncGuildCommands(guildId, ...)  (skipped if botClient = null)
  → res.json({ ...config, slashSync })
```

### Slash Sync (Split Mode)

```
Dashboard PUT /api/config (Mode B — botClient = null)
  → configStore.updateGuildConfig() → Redis
  → POST /api/slash-sync (or inlined)
    → redis.rpush('slash_sync_queue', JSON.stringify({ guildId, requestedAt }))

Bot (every 5 s):
  → redis.lpop('slash_sync_queue')
  → syncGuildCommands(guildId, config)
  → redis.incr('stats:slash_sync_processed')
```

### Guild Data Flow (Split Mode)

```
Bot (ClientReady / GuildCreate / every 10 min):
  → guild.channels.cache, guild.roles.cache → meta payload
  → guild.members.fetch() (8 s timeout → falls back to cache)
  → redis.set('guild_cache:{guildId}', metaJSON, 'EX', 900)
  → redis.set('guild_cache:{guildId}:members', membersJSON, 'EX', 900)
  → redis.incr('stats:guild_cache_refresh')

Dashboard GET /api/guild-data:
  → redis.get('guild_cache:{guildId}')  → channels + roles for dropdowns
  → 503 only if null (cache expired + no bot)

Dashboard GET /api/members:
  → redis.get('guild_cache:{guildId}:members')
  → 503 only if null
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
  ├── src/upstash.js
  ├── src/configStore.js
  ├── src/stateStore.js
  └── src/bot.js                (createBot + startKeepalive)

src/index.server.js
  ├── src/env.js                (validateServerEnvironment)
  ├── src/upstash.js
  ├── src/configStore.js
  ├── src/stateStore.js
  └── src/server.js
        ├── src/auth.js
        ├── src/csrf.js
        ├── src/rateLimit.js
        └── src/sessionStore.js

src/bot.js
  ├── src/cooldowns.js
  ├── src/commandAccess.js
  ├── src/bot/slash.js
  ├── src/bot/commands/index.js
  │     ├── src/bot/commands/runtime.js
  │     └── handlers/
  │           ├── help.js
  │           ├── general.js
  │           ├── moderation.js
  │           ├── levels.js
  │           ├── economy.js
  │           ├── panels.js
  │           └── riot.js
  │                 ├── src/lolCommands.js → src/lolApi.js
  │                 └── src/tftCommands.js → src/tftApi.js
  │                       └── src/riot/helpers.js (shared)
  ├── src/bot/interactions.js
  │     ├── src/bot/games.js
  │     └── src/bot/help.js
  └── src/bot/music/lavalink.js
```