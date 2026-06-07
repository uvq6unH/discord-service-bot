# Discord Service Bot — Architecture Document

> **Runtime:** Node.js ESM · **Deploy:** Render.com (Starter) hoặc PM2 trên VPS
> **Backend:** ~85 files · **Frontend:** React + Vite (dashboard/)

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Sơ đồ kiến trúc](#2-sơ-đồ-kiến-trúc)
3. [Process Architecture](#3-process-architecture)
4. [Boot Flow](#4-boot-flow)
5. [Backend — src/](#5-backend--src)
6. [Frontend — dashboard/](#6-frontend--dashboard)
7. [Redis Key Scheme](#7-redis-key-scheme)
8. [Deployment](#8-deployment)
9. [Data Flow theo tính năng](#9-data-flow-theo-tính-năng)
10. [Dependency Map](#10-dependency-map)

---

## 1. Tổng quan hệ thống

Bot Discord đa chức năng với **2 chế độ deploy**:

**Chế độ A — Monolith (1 process, Render Free / VPS đơn giản):**
```
src/index.js → bot + dashboard trong cùng 1 process
```

**Chế độ B — 2 process (Render Starter / PM2 trên VPS):**
```
src/index.bot.js    → Discord client process
src/index.server.js → Express dashboard process
Giao tiếp: Upstash Redis (shared state, config, sessions)
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

**Nguyên tắc thiết kế:**
- **Redis-first persistence:** Tất cả state lưu Upstash Redis. File JSON chỉ là fallback cho local dev.
- **Granular Redis keys:** Mỗi subsystem dùng key riêng (`guild:{id}:economy:{userId}`) — tránh contention khi concurrent write.
- **Distributed locking:** `withRedisLock()` (Redis) hoặc `asyncMutex` (single-process). An toàn để scale ngang.
- **Per-guild isolation:** Config và state đều key theo `guildId`.
- **botClient optional:** `server.js` nhận `botClient` (có thể `null`). Các route cần bot trả 503 gracefully thay vì crash.

---

## 2. Sơ đồ kiến trúc

```
Discord API ◄──────────────────────────────────► Lavalink Server
     │ WebSocket (Gateway)        REST/WS         (Java, âm nhạc)
     │ REST (API calls)
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ src/index.js  ← MONOLITH ENTRY (Chế độ A)                          │
│  • validateEnvironment()          (bot + server vars)               │
│  • createUpstashFromEnv()  → redis                                  │
│  • new ConfigStore() + new StateStore()   ← shared singletons       │
│  • createBot(configStore, stateStore)     ← botClient thật          │
│  • createServer({ botClient, ... })       ← dashboard thấy bot      │
│  • loginWithRetry() → app.listen() → startKeepalive()              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ src/index.bot.js  ← BOT ENTRY (Chế độ B)                           │
│  • validateBotEnvironment()                                         │
│  • createUpstashFromEnv() → sharedRedis                             │
│  • new ConfigStore() + new StateStore()                             │
│  • createBot(configStore, stateStore)                               │
│  • loginWithRetry() — không mở HTTP server, không keepalive         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ src/index.server.js  ← DASHBOARD ENTRY (Chế độ B)                  │
│  • validateServerEnvironment()                                      │
│  • createUpstashFromEnv() → sharedRedis  (cùng instance Redis)     │
│  • new ConfigStore() + new StateStore()                             │
│  • createServer({ botClient: null, ... })                           │
│    → /api/guild-data, /api/members, /api/slash-sync trả 503         │
│    → /api/config, /api/guilds, /api/state hoạt động bình thường    │
│  • app.listen(PORT)                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Process Architecture

### Tại sao có 2 chế độ?

| Vấn đề | Chế độ A (Monolith) | Chế độ B (2-process) |
|--------|---------------------|----------------------|
| Render Free plan | ✅ 1 web service | ❌ Worker không hỗ trợ |
| Memory leak music → crash dashboard | ❌ Cùng process | ✅ Isolated |
| Restart bot mà không ngắt users | ❌ | ✅ |
| Đơn giản để deploy | ✅ | Phức tạp hơn |
| Dashboard thấy bot guild cache | ✅ Trực tiếp | ❌ 503 cho guild-data/members |

### Giới hạn của Chế độ B (2-process)

Khi `botClient: null` trong dashboard process:
- `GET /api/guild-data` → **503** (channels/roles cần Discord cache)
- `GET /api/members` → **503** (cần bot cache)
- `POST /api/slash-sync` → **503** (cần bot connection)
- `GET /api/guilds` → hoạt động (dùng OAuth)
- `GET /api/config` → hoạt động (dùng Redis)
- `PUT /api/config` → hoạt động (lưu Redis, slash-sync skipped)
- `GET /api/state` → hoạt động (dùng stateStore trực tiếp qua Redis)

### Giao tiếp giữa 2 process (Chế độ B)

Không có IPC trực tiếp. Tất cả qua Redis:
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
6. createBot(...)            → Discord Client (chưa login)
7. createServer({ botClient, ... })   → Express app (chưa listen)
8. loginWithRetry()          → client.login(token)
   └─ 10 lần, backoff 5s→30s, chỉ retry transient errors
9. app.listen(PORT)          → HTTP server open
10. startKeepalive(port)     → ping /health mỗi 5 phút

Sau ClientReady:
  ├─ initLavalink()
  ├─ purgeStaleGameSessions()
  ├─ syncGuildCommands() mỗi guild
  └─ setInterval(reminderWorker, 60s)
```

### Bot process (`src/index.bot.js`)

```
1. sodium.ready
2. validateBotEnvironment()  (DISCORD_TOKEN + Redis in prod)
3. createUpstashFromEnv() + ConfigStore + StateStore
4. createBot()
5. loginWithRetry()
   ↳ Không có HTTP server, không keepalive
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

| File | Dùng cho | HTTP? | Keepalive? |
|------|----------|-------|------------|
| `src/index.js` | Monolith (1 process) | ✅ | ✅ |
| `src/index.bot.js` | Bot-only (2-process) | ❌ | ❌ |
| `src/index.server.js` | Dashboard-only (2-process) | ✅ | ❌ |

#### `src/env.js` — Environment Validator

| Export | Dùng bởi | Validate |
|--------|----------|----------|
| `validateBotEnvironment()` | `index.bot.js` | `DISCORD_TOKEN`, Redis (prod) |
| `validateServerEnvironment()` | `index.server.js` | OAuth vars, `SESSION_SECRET` ≥32 chars, Redis (prod) |
| `validateEnvironment()` | `index.js` (monolith) | Cả 2 bộ trên |

---

### 5.2 HTTP Server & Auth

#### `src/server.js` — Express Application

`createServer({ configStore, stateStore, botClient, redis })`:

- `botClient` có thể là `null` (dashboard-only mode) hoặc Discord Client thật (monolith)
- **Tất cả route đọc state** dùng `stateStore` được inject — không qua `botClient.stateStore`
- Route cần bot cache: guard `if (!botClient)` → trả 503

**Middleware stack:**
```
helmet (CSP + security headers)
  ↓ expressSession (cookie "dsession", store: Upstash Redis)
  ↓ express.json (limit: 128kb)
  ↓ Rate limiters (read: 60/min, write: 20/min)
  ↓ CSRF validation (POST/PUT phải có X-CSRF-Token)
  ↓ auth.requireAuth / requireGuildAccess (per route)
```

**Route summary:**

| Method | Path | Cần bot? |
|--------|------|----------|
| GET | /health | ❌ |
| GET | /auth/login, /callback, /logout, /me | ❌ |
| GET | /api/csrf-token | ❌ |
| GET | /api/status | ❌ (trả `botReady: false` nếu null) |
| GET | /api/guilds | ❌ (OAuth) |
| GET | /api/config | ❌ |
| PUT | /api/config | ❌ (slash-sync skipped nếu null) |
| POST | /api/slash-sync | ✅ → 503 |
| GET | /api/state | ❌ (stateStore trực tiếp) |
| GET | /api/guild-data | ✅ → 503 |
| GET | /api/members | ✅ → 503 |
| GET | /api/invite-url | ❌ |
| GET | /api/keepalive-status | ❌ |

---

#### `src/auth.js` — Discord OAuth2

`requireGuildAccess` dùng `botClient?.guilds?.cache` (optional chaining) — an toàn khi `botClient = null`.

Fallback permission check: nếu Discord OAuth unavailable → thử bot guild cache (nếu có) → 403.

---

#### `src/bot.js` — Discord Client Factory + keepalive

- `createBot(configStore, stateStore)` → Discord Client
- `startKeepalive(port)` → **export riêng**, chỉ được gọi từ `index.js` sau khi HTTP server đã listen

---

### 5.3 Data Layer — quan trọng

#### `src/stateStore.js` — Runtime State (granular Redis keys)

`stateStore` được inject vào cả `createBot` và `createServer`. Trong 2-process mode, dashboard dùng `stateStore` trực tiếp (Redis) — không cần bot process.

**`/api/state` đọc từ:**
- `stateStore.getLeaderboard()` → ranked users count
- `stateStore._rGet(ticketCounter)` → next ticket number
- warnings: không có guild-level index trong granular scheme → trả 0 (acceptable)

#### `src/configStore.js` — Guild Config (Redis)

Tất cả config lưu Redis. File JSON (`CONFIG_PATH`) chỉ là fallback khi dev local (không set Redis env).
`riotApiKey` / `tftApiKey` không bao giờ persist vào Redis — in-memory only.

---

## 6. Frontend — dashboard/

React SPA (Vite) → build → `public-react/` → Express serve.

```
dashboard/src/
  api.js           ← apiFetch + CSRF auto-attach + 401 redirect
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

`api.saveConfig` → `PUT /api/config` (method đúng, khớp với `app.put` trong server.js)

### Dev workflow

```bash
# Terminal 1: Express API
node src/index.server.js   # :10001

# Terminal 2: Vite dev server
pnpm dev:ui                # :5173 (proxy /api → :10001)
```

---

## 7. Redis Key Scheme

```
# Config
config:_index                            → JSON string[]
config:guild:{guildId}                   → JSON config object

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

### Render.com — Chế độ A (Monolith, Free plan)

Dùng 1 **Web** service:
```
Build:  pnpm install --no-frozen-lockfile && pnpm build:ui
Start:  node src/index.js
Health: /health
```

Env vars cần: tất cả (bot + dashboard + Redis).

### Render.com — Chế độ B (2 services, Starter plan)

Xem `render.yaml`. Không dùng persistent disk — tất cả state qua Redis.

```yaml
services:
  - type: worker   # Bot
    startCommand: node src/index.bot.js
  - type: web      # Dashboard
    startCommand: node src/index.server.js
    healthCheckPath: /health
```

### PM2 (VPS)

```bash
pm2 start pm2.config.cjs        # 2 process riêng
# hoặc
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

## 9. Data Flow theo tính năng

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

### Config Save từ Dashboard

```
Admin → thay đổi prefix → click "Lưu"
  → GuildContext.saveConfig()
  → api.saveConfig(guildId, config)           (PUT /api/config)
  → configStore.updateGuildConfig()           → SET config:guild:{guildId}
  → botClient?.syncGuildCommands()            (skipped nếu null → 2-process mode)
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
  ├── src/upstash.js
  ├── src/configStore.js
  ├── src/stateStore.js
  └── src/bot.js                (createBot — startKeepalive không gọi)

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

---

*Cập nhật: refactor hoàn thiện — monolith entry thực sự, keepalive tách khỏi createBot, botClient null-safe, stateStore inject đúng chỗ, Redis-only cho production.*
