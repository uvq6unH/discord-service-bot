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
   - [Entry Points](#51-entry-points)
   - [HTTP Server & Auth](#52-http-server--auth)
   - [Bot Engine](#53-bot-engine)
   - [Command System](#54-command-system)
   - [Music System](#55-music-system)
   - [Riot Games Integration](#56-riot-games-integration)
   - [Data Layer](#57-data-layer)
6. [Frontend — dashboard/](#6-frontend--dashboard)
7. [Redis Key Scheme](#7-redis-key-scheme)
8. [Deployment](#8-deployment)
9. [Data Flow theo tính năng](#9-data-flow-theo-tính-năng)
10. [Dependency Map](#10-dependency-map)

---

## 1. Tổng quan hệ thống

Bot Discord đa chức năng chạy **2 process độc lập**, giao tiếp qua Redis:

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
         │                                                      │
         ▼                                                      ▼
  Discord Gateway                                    public-react/
  (WebSocket)                                        (Vite build output)
         │
         ▼
  Lavalink Server
  (Java, audio)
```

**Nguyên tắc thiết kế:**
- **2-process, shared Redis:** Bot và Dashboard không chia sẻ RAM — giao tiếp qua Redis. Crash bot không ảnh hưởng Dashboard, và ngược lại.
- **Redis-first persistence:** Mọi state đều lưu Upstash Redis. File JSON chỉ là fallback cho local dev.
- **Granular Redis keys:** Mỗi subsystem dùng key riêng (`guild:{id}:economy:{userId}`) thay vì blob toàn guild — tránh contention khi concurrent write.
- **Distributed locking:** Toàn bộ write operations dùng `withRedisLock()` (Redis) hoặc `asyncMutex` (single-process). An toàn để scale ngang.
- **Per-guild isolation:** Config và state đều key theo `guildId` — guilds không ảnh hưởng nhau.

---

## 2. Sơ đồ kiến trúc

```
Discord API ◄──────────────────────────────────► Lavalink Server
     │ WebSocket (Gateway)        REST/WS         (Java, âm nhạc)
     │ REST (API calls)
     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ src/index.bot.js  ← BOT ENTRY                                        │
│  • validateBotEnvironment()                                          │
│  • createUpstashFromEnv() → sharedRedis                             │
│  • new ConfigStore()                                                 │
│  • new StateStore()  ←── granular Redis keys                        │
│  • createBot(configStore, stateStore)  ──────► src/bot.js           │
│  • loginWithRetry() (exponential backoff, max 10 lần)               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ src/index.server.js  ← DASHBOARD ENTRY                               │
│  • validateServerEnvironment()                                       │
│  • createUpstashFromEnv() → sharedRedis  (cùng instance Redis)      │
│  • new ConfigStore()  (read + write config)                         │
│  • new StateStore()   (read state cho dashboard)                    │
│  • createServer({ configStore, stateStore, botClient: null })       │
│  • app.listen(port)                                                  │
└──────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │ src/bot.js — Discord Client                  │
                    │                                              │
                    │  Events:                                     │
                    │  ClientReady → init Lavalink, sync slash,    │
                    │                purge sessions, start timers  │
                    │  MessageCreate → automod, XP, commands,      │
                    │                  music prefix, auto-reply    │
                    │  InteractionCreate → slash, buttons, selects │
                    │  GuildMemberAdd → welcome message            │
                    └──────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │ src/server.js — Express App                  │
                    │                                              │
                    │  botClient === null khi dashboard-only mode  │
                    │  Các route cần bot trả 503 thay vì crash     │
                    │                                              │
                    │  Routes:                                     │
                    │  GET  /health                                │
                    │  GET  /auth/login, /callback, /logout, /me  │
                    │  GET  /api/csrf-token                        │
                    │  GET  /api/status                            │
                    │  GET  /api/guilds                            │
                    │  GET  /api/guild-data                        │
                    │  GET  /api/config?guildId=                   │
                    │  POST /api/config?guildId=                   │
                    │  POST /api/slash-sync?guildId=               │
                    │  GET  /api/state?guildId=                    │
                    │  GET  /api/invite-url                        │
                    │  GET  /*   → React SPA (public-react/)       │
                    └──────────────────────────────────────────────┘
```

---

## 3. Process Architecture

### Tại sao tách 2 process?

| Vấn đề (monolith) | Giải pháp (2-process) |
|---|---|
| Memory leak trong Music → Node heap đầy → Dashboard crash | Bot crash không ảnh hưởng Dashboard |
| Restart bot → Dashboard ngắt kết nối users | Restart độc lập từng service |
| Dashboard và Bot cùng giới hạn 400MB RAM | Mỗi process có limit riêng (350MB + 150MB) |
| Scale ngang bot → Dashboard cũng phải scale | Scale độc lập |

### Giao tiếp giữa 2 process

Không có IPC trực tiếp. Tất cả qua Redis:

```
Bot writes →  Redis  ← Dashboard reads
              (ConfigStore, StateStore, SessionStore)
```

Khi Dashboard save config → Redis. Bot đọc config từ Redis cho lần xử lý kế tiếp.  
Slash sync cần bot online: Dashboard gọi `POST /api/slash-sync` → trả 503 nếu bot không trong cùng process.

### PM2 setup

```bash
pm2 start pm2.config.cjs        # Khởi động cả 2
pm2 restart discord-bot         # Restart bot riêng
pm2 restart discord-dashboard   # Restart dashboard riêng
pm2 logs discord-bot            # Log bot
```

---

## 4. Boot Flow

### Bot (`src/index.bot.js`)

```
1. sodium.ready             (libsodium, cần cho voice encryption)
2. validateBotEnvironment() (DISCORD_TOKEN bắt buộc; Redis bắt buộc nếu production)
3. createUpstashFromEnv()   → UpstashClient
4. new ConfigStore()        → load guild configs từ Redis
5. new StateStore()         → ready ngay (Redis mode)
6. createBot()              → Discord Client (chưa login)
7. loginWithRetry()         → client.login(token)
   └─ retry 10 lần, exponential backoff 5s→30s
   └─ chỉ retry transient errors (ECONNRESET, ETIMEDOUT)

Sau ClientReady:
  ├─ initLavalink()                      (kết nối music server)
  ├─ purgeStaleGameSessions()            (dọn game cũ > 6h)
  ├─ syncGuildCommands() mỗi guild       (đăng ký slash commands)
  ├─ setInterval(reminderWorker, 60s)    (nhắc nhở)
  └─ startKeepalive()                    (self-ping /health mỗi 5 phút)
```

### Dashboard (`src/index.server.js`)

```
1. validateServerEnvironment() (OAuth + SESSION_SECRET bắt buộc)
2. createUpstashFromEnv()
3. new ConfigStore() + new StateStore()
4. createServer({ ..., botClient: null })
5. app.listen(DASHBOARD_PORT)  ← mặc định 10001
```

---

## 5. Backend — src/

### 5.1 Entry Points

#### `src/index.bot.js` — Bot Entry (70 dòng)
Khởi động Discord client. Không chạy HTTP server.  
Dùng `validateBotEnvironment()` — chỉ cần `DISCORD_TOKEN` và Redis (production).

#### `src/index.server.js` — Dashboard Entry (55 dòng)
Khởi động Express server. Không import Discord.js.  
Dùng `validateServerEnvironment()` — cần OAuth secrets và `SESSION_SECRET`.

#### `src/env.js` — Environment Validator (85 dòng)

| Export | Dùng bởi | Validate |
|--------|----------|----------|
| `validateBotEnvironment()` | `index.bot.js` | `DISCORD_TOKEN`, Redis (prod) |
| `validateServerEnvironment()` | `index.server.js` | OAuth vars, `SESSION_SECRET` ≥32 chars, Redis (prod) |
| `validateEnvironment()` | Legacy | Cả 2 bộ trên |

---

### 5.2 HTTP Server & Auth

#### `src/server.js` — Express Application (380 dòng)

**Middleware stack:**
```
helmet (CSP + security headers)
  ↓ expressSession (cookie "dsession", store: Upstash Redis)
  ↓ express.json (limit: 128kb)
  ↓ Rate limiters (read: 60/min, write: 20/min, keyed IP+userId)
  ↓ CSRF validation (POST phải có X-CSRF-Token)
  ↓ auth.requireAuth / requireGuildAccess (per route)
```

**Quan trọng — `botClient === null` handling:**  
Dashboard process chạy với `botClient: null`. Các route cần bot:
- `/api/guild-data` → 503 (channels/roles cần bot cache)
- `/api/slash-sync` → 503 (cần bot Discord connection)
- `/api/status` → trả `botReady: false` thay vì crash
- `/api/guilds` → trả guilds từ OAuth (không cần bot cache)

**Static files:**  
Serve từ `public-react/` (Vite build output).  
SPA catch-all: mọi route không phải `/api` hoặc `/auth` → `index.html`.

---

#### `src/auth.js` — Discord OAuth2 (355 dòng)

```
GET /auth/login
  → session.regenerate()
  → redirect Discord OAuth (state param)

GET /auth/callback?code=&state=
  → validate state
  → POST /oauth2/token → access_token
  → GET /users/@me → user info
  → session.regenerate() (prevent session fixation)
  → redirect returnTo (hoặc /)

GET /auth/logout → session.destroy() → redirect /login
```

**`requireGuildAccess` middleware:**
1. Fetch user guilds qua OAuth (cache 5 phút per user)
2. Check `permissions` bitmask: `ADMINISTRATOR (0x8)` hoặc `MANAGE_GUILD (0x20)`
3. Fallback: `guild.members.fetch(userId)` qua bot cache

**Dev mode** (`ALLOW_DEV_AUTH=true`): bỏ qua OAuth, auto-login. Chỉ dùng local dev.

---

#### `src/csrf.js` — CSRF Protection (45 dòng)
Double-submit pattern: token trong session, client attach vào header `X-CSRF-Token`.

#### `src/sessionStore.js` — Redis Session Store (58 dòng)
Adapter `express-session` ↔ Upstash Redis. Key: `sess:{sid}`, TTL 7 ngày.

#### `src/rateLimit.js` — Rate Limiter (68 dòng)
- Redis backend: `INCR key + EXPIRE` — atomic, shared across instances
- Key: `${prefix}:${ip}:${userId}`
- Read routes: 60 req/min · Write routes: 20 req/min

---

### 5.3 Bot Engine

#### `src/bot.js` — Discord Client Factory (530 dòng)

**Intents:** `Guilds, GuildMessages, GuildMembers, GuildVoiceStates, MessageContent`

**MessageCreate flow:**
```
message đến
  ├─ Bỏ qua: DM, bot, guild disabled
  ├─ AutoMod: bad words + anti-link → xóa/warn
  ├─ Mention react: emoji khi bot bị mention
  ├─ Music prefix (e.g. "hb play ...") → handleMusicCommand()
  ├─ Command prefix (e.g. "!ban @user") → runBuiltInCommand()
  ├─ XP: +xp mỗi 60s per user (nếu levelsEnabled)
  └─ Auto-reply: keyword match → trả lời
```

**InteractionCreate:**
```
slash command → runBuiltInCommand()
button click  → handleComponentInteraction()
  ├─ bj:*          → Blackjack button
  ├─ vp:*          → Poker button
  ├─ ticket:create → tạo ticket channel
  ├─ ticket:close  → xóa ticket channel
  └─ selfrole:*    → toggle role
select menu   → help group navigation
```

**Background workers:**
- Reminder worker: mỗi 60s — check + gửi reminders (hourly/daily/weekly)
- Keepalive: ping `/health` mỗi 5 phút

---

#### `src/commandAccess.js` — Permission Logic (129 dòng)

3 tầng kiểm tra:
1. `memberCanUseCommand()` — entry point; check `allowedRoles` hoặc staff permission
2. `hasStaffDiscordPermission()` — check Discord permission bits
3. `canModerateMember()` — role hierarchy check (không moderate người role cao hơn)

`sanitizeAnnouncementText()` — thay `@everyone`/`@here` bằng zero-width space.

---

#### `src/cooldowns.js` — Command Cooldowns (53 dòng)

| Loại | Cooldown |
|------|----------|
| Riot commands | 15 giây |
| Game commands | 5 giây |
| Admin commands | 2 giây |
| Mọi command khác | 3 giây |

Admin (`Administrator`/`ManageGuild`) bypass cooldown. Cleanup interval 60s.

---

### 5.4 Command System

#### `src/bot/commands/index.js` — Command Dispatcher (95 dòng)

```
runBuiltInCommand(params)
  ├─ createCommandContext() — validate permissions, build ctx
  ├─ COMMAND_REGISTRY.get(type) → O(1) lookup (47 entries)
  │     hit  → gọi handler trực tiếp
  │     miss → HANDLERS chain fallback
  └─ renderCommandResponse() cho custom commands
```

#### `src/bot/commands/runtime.js` — Context Builder (55 dòng)
Normalize slash interaction + prefix message thành cùng `ctx` object.  
`reply(payload)` — smart: `editReply()` nếu deferred, `followUp()` nếu đã replied.

#### Handlers (`src/bot/commands/handlers/`)

| File | Commands |
|------|----------|
| `general.js` | custom, ping, config, server, user, avatar, say, announce |
| `moderation.js` | purge, warn, kick, ban, timeout, warnings, clearwarns |
| `levels.js` | rank, leaderboard |
| `economy.js` | balance, daily, economyleaderboard, blackjack, poker, coinflip, dice, slots, ecoadd, ecoset, ecoremove |
| `panels.js` | ticketpanel, rolepanel |
| `riot.js` | delegate → lolCommands.js + tftCommands.js |
| `music.js` | play, skip, stop, pause, resume, queue, np, loop, volume |
| `help.js` | help (interactive select menu) |

#### `src/bot/slash.js` — Slash Command Builder (262 dòng)
`buildSlashCommands(config)` → `ApplicationCommand[]` để register với Discord.  
Được gọi khi: ClientReady + sau mỗi `POST /api/config`.

#### `src/bot/games.js` — Game Engine (668 dòng)
Logic Blackjack, Poker, Coinflip, Dice, Slots.  
In-memory `blackjackSessions` + `pokerSessions` Maps.  
Session được persist vào Redis để survive restart.

#### `src/bot/interactions.js` — Button/Select Handler (127 dòng)
Xử lý tất cả component interactions: game buttons, ticket buttons, selfrole buttons, help selects.

---

### 5.5 Music System

#### `src/bot/music/lavalink.js` — Lavalink Manager (221 dòng)

```
Discord Voice Gateway ←── sendToShard() ──── LavalinkManager
                                                    │
                                          Lavalink Server (Java)
                                          (youtube-source plugin)
                                          (LavaSrc: Spotify)
```

Bot **không xử lý audio** — Lavalink làm hết. CPU giảm cực mạnh.  
Config: `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`, `LAVALINK_SECURE`  
Retry: 20 lần, delay 10s.

---

### 5.6 Riot Games Integration

#### `src/lolApi.js` — LoL API Client (530 dòng)

**Rate limiting:**  
`_riotBucket` — global token bucket, giới hạn toàn bộ Riot live API calls ≤90 req/2min.  
Ngăn 429 khi nhiều guild members dùng Riot commands đồng thời.

**Static data cache** (từ Data Dragon CDN, in-memory TTL):
- Champions, items, runes, summoner spells, patch version

**Live data** (cần API key):
- Account by Riot ID, summoner by PUUID, ranked info, match history, match detail, top mastery

#### `src/tftApi.js` — TFT API Client (283 dòng)
TFT-specific endpoints + Community Dragon static data (traits, augments, items, champions).

#### `src/lolCommands.js` + `src/tftCommands.js` — Command Handlers
9 LoL commands (`lsd`, `lolprofile`, `lolmatch`, `lolchamp`, `lolitem`, `lolrunes`, `lolpatch`, `lollink`, `lolunlink`)  
5 TFT commands (`tftlsd`, `tftprofile`, `tftmatch`, `tftlink`, `tftunlink`)

#### `src/riot/helpers.js` — Shared Riot Utilities (76 dòng)
Error formatting, smart reply helper, summoner input resolver.

---

### 5.7 Data Layer

#### `src/configStore.js` — Guild Config Store (451 dòng)

**Redis keys:**
```
config:_index           → JSON array of guildIds
config:guild:{guildId}  → JSON config object
```

**Đặc biệt:**  
`riotApiKey` và `tftApiKey` **không bao giờ lưu vào Redis** — chỉ trong `_runtimeSecrets` Map (in-memory). Env vars là global default.

**Normalization** (chạy khi read + write):
- `normalizeCommands()` — deduplicate, validate types
- `normalizeAutoReplies()` — trim, filter empty, limit 50
- `normalizeReminders()` — validate, migrate legacy `userId` → `userIds[]`
- `normalizeSelfRoles()` — validate snowflake, limit 25
- Block prototype pollution (`__proto__`, `constructor`, `prototype`)

---

#### `src/stateStore.js` — Runtime State Store (790 dòng)

**Dual backend:** Redis (production) hoặc JSON file (local dev).

**Public API:**

| Method | Mô tả |
|--------|-------|
| `getBalance(guildId, userId)` | Số dư |
| `adjustBalance(guildId, userId, currency, delta)` | Cộng/trừ (atomic) |
| `tryDebitBalance(guildId, userId, currency, amount)` | Trừ hoặc fail nếu không đủ |
| `setBalance(...)` | Set tuyệt đối (admin) |
| `claimDaily(...)` | Daily reward với cooldown |
| `getEconomyLeaderboard(guildId, currency, limit)` | Top users |
| `addXp(guildId, userId, amount)` | Cộng XP, tự tính level up |
| `getRank(guildId, userId)` | XP + level |
| `getLeaderboard(guildId, limit)` | Top by XP |
| `addWarning(...)` | Thêm warning |
| `getWarnings(guildId, userId)` | Xem warnings |
| `clearWarnings(guildId, userId)` | Xóa warnings |
| `nextTicketNumber(guildId)` | Counter atomic |
| `linkLolAccount(...)` / `unlinkLolAccount(...)` | LoL linking |
| `linkTftAccount(...)` / `unlinkTftAccount(...)` | TFT linking |
| `getGameSession(...)` / `setGameSession(...)` / `deleteGameSession(...)` | Game sessions |
| `withGameSessionLock(guildId, type, messageId, fn)` | Distributed lock cho game buttons |

**Distributed locks** (dùng `withRedisLock()` khi Redis configured):
- `_withEconomyLock(guildId, userId)` — economy + XP
- `_withWarningsLock(guildId, userId)` — warnings
- `_withTicketLock(guildId)` — ticket counter
- `withGameSessionLock(guildId, type, messageId)` — game sessions

**Auto migration từ blob cũ:**  
Nếu tìm thấy `guild:{id}` blob (v1 format) → tự phân tách → granular keys → backup 24h → xóa blob.

---

#### `src/upstash.js` — Redis Client (138 dòng)
Minimal HTTP REST client cho Upstash. Không dùng TCP socket.  
Methods: `get`, `set`, `del`, `incr`, `expire`, `smembers`, `sadd`, `eval`, `pipeline`.  
Retry 2 lần khi lỗi network, timeout 8s.

#### `src/distributedLock.js` — Redis Distributed Lock (45 dòng)
`withRedisLock(redis, lockKey, ttlSec, fn)`:
- Acquire: `SET key token NX EX ttl` (atomic)
- Release: Lua `check-and-delete` (ngăn release nhầm lock)
- Poll mỗi 25ms, timeout 5 giây

#### `src/asyncMutex.js` — In-process Mutex (30 dòng)
Fallback khi không có Redis. Promise chain per-key.

#### `src/configDefaults.js` — Default Config (353 dòng)
Default values, `COMMAND_TYPES` Set, `builtInTypesByName` Map, default bad words list.

#### `src/configPatch.js`, `src/safeJson.js` — Helpers nhỏ
Config merge helpers, safe JSON file reader với size limit.

---

## 6. Frontend — dashboard/

React SPA được build bởi Vite → output vào `public-react/` → Express serve.

```
dashboard/
├── index.html                    ← Vite entry HTML
├── vite.config.js                ← Build → public-react/, dev proxy → :10001
├── package.json
└── src/
    ├── main.jsx                  ← createRoot, BrowserRouter, Routes
    ├── App.jsx                   ← Layout shell: AuthProvider + GuildProvider + routes
    ├── api.js                    ← Centralized fetch (CSRF auto-attach, 401 redirect)
    ├── contexts/
    │   ├── AuthContext.jsx       ← useAuth() — user info, auth check
    │   └── GuildContext.jsx      ← useGuild() — selected guild, config, save
    ├── components/
    │   ├── ServerRail.jsx        ← Thanh icon guild trái (72px)
    │   ├── PluginNav.jsx         ← Nav sidebar (220px) với NavLink
    │   └── ui.jsx                ← Shared: SaveBar, Toggle, ChannelSelect,
    │                               RoleSelect, SectionCard, Spinner, ...
    ├── pages/
    │   ├── Login.jsx             ← Trang login, link → /auth/discord
    │   ├── Overview.jsx          ← Cài đặt chung, welcome, announcements, music
    │   ├── Members.jsx           ← Danh sách thành viên (paginated, search)
    │   ├── Commands.jsx          ← Enable/disable commands + auto-reply editor
    │   ├── Economy.jsx           ← Tiền ảo (3 currencies) + 5 game settings
    │   ├── Moderation.jsx        ← AutoMod, Ticket system, Self-role panel
    │   └── Lol.jsx               ← Riot API key + info về LoL/TFT commands
    └── styles/
        └── globals.css           ← Toàn bộ CSS (~550 dòng, CSS variables)
```

### State management

```
AuthContext          → user session (fetch /auth/me khi mount)
GuildContext         → selectedGuild, config, guildData (channels/roles)
                       updateConfig(patch) → mark dirty
                       saveConfig() → POST /api/config
```

### API client (`src/api.js`)

- Auto-attach `X-CSRF-Token` cho POST/PUT/DELETE
- Retry một lần nếu 403 (CSRF expired)
- Auto-redirect `/login` khi 401
- Typed helpers: `api.me()`, `api.guilds()`, `api.config(guildId)`, `api.saveConfig(guildId, config)`, `api.guildData(guildId)`, `api.members(guildId, page, search)`

### Dev workflow

```bash
# Terminal 1: Express API
node src/index.server.js          # chạy trên :10001

# Terminal 2: Vite dev server với HMR
pnpm dev:ui                        # chạy trên :5173
# → Proxy /api và /auth tự động sang :10001
```

### Build & Deploy

```bash
pnpm build:ui     # Build React → public-react/
# Deploy dashboard service, Express tự serve từ public-react/
```

### Thêm page mới

```jsx
// 1. Tạo dashboard/src/pages/MyPage.jsx
import { useGuild } from '../contexts/GuildContext.jsx';
import { SectionCard, Toggle } from '../components/ui.jsx';
export default function MyPage() {
  const { config, updateConfig } = useGuild();
  return (
    <div className="page">
      <h1 className="page-title">My Feature</h1>
      <SectionCard title="Settings" icon="ti-settings">
        <Toggle
          label="Bật tính năng"
          checked={config.myFeatureEnabled ?? false}
          onChange={v => updateConfig({ myFeatureEnabled: v })}
        />
      </SectionCard>
    </div>
  );
}

// 2. Thêm Route vào App.jsx
// 3. Thêm NavLink vào PluginNav.jsx
```

---

## 7. Redis Key Scheme

```
# Config
config:_index                            → JSON string[]   (danh sách guildId)
config:guild:{guildId}                   → JSON config

# State — Economy
guild:{guildId}:economy:{userId}         → JSON { silver, gold, diamond, lastDailyAt, lastDailyDay }
guild:{guildId}:economy:_members         → Redis Set (userId) ← cho leaderboard

# State — Levels / XP
guild:{guildId}:levels:{userId}          → JSON { xp, level, lastMessageAt }
guild:{guildId}:levels:_members          → Redis Set (userId) ← cho leaderboard

# State — Moderation
guild:{guildId}:warnings:{userId}        → JSON Warning[]

# State — Tickets
guild:{guildId}:tickets:nextNumber       → string number

# State — Games
guild:{guildId}:game:{type}:{messageId}  → JSON session

# State — Riot Accounts
guild:{guildId}:lolAccount:{userId}      → JSON { riotId, puuid, region, linkedAt }
guild:{guildId}:tftAccount:{userId}      → JSON { riotId, puuid, region, linkedAt }

# Guild index
guild:index                              → Redis Set (guildId)

# Distributed locks
lock:economy:{guildId}:{userId}          → lock token (EX 15s)
lock:warnings:{guildId}:{userId}         → lock token (EX 15s)
lock:ticket:{guildId}                    → lock token (EX 15s)
lock:game:{type}:{guildId}:{messageId}   → lock token (EX 30s)

# Sessions
sess:{sessionId}                         → JSON session data (EX 7d)

# Rate limiting
rl:read:{ip}:{userId}                    → counter (EX 60s)
rl:write:{ip}:{userId}                   → counter (EX 60s)

# Config locks
config:lock:{guildId}                    → lock token

# Migration compat (24h backup, tự xóa)
guild:{guildId}:migrated_backup          → JSON blob cũ (EX 86400)
```

---

## 8. Deployment

### Render.com (2 services)

```yaml
# render.yaml
services:
  - type: worker          # Bot — không expose HTTP
    name: discord-bot
    startCommand: node src/index.bot.js
    envVars:
      - DISCORD_TOKEN
      - UPSTASH_REDIS_REST_URL / TOKEN
      - LAVALINK_HOST/PORT/PASSWORD/SECURE
      - RIOT_API_KEY / TFT_API_KEY (optional)

  - type: web             # Dashboard — expose HTTP
    name: discord-dashboard
    buildCommand: pnpm install && pnpm build:ui
    startCommand: node src/index.server.js
    healthCheckPath: /health
    envVars:
      - DISCORD_CLIENT_ID / SECRET / REDIRECT_URI
      - SESSION_SECRET (≥32 chars)
      - UPSTASH_REDIS_REST_URL / TOKEN
      - PORT (10000)
```

### PM2 (VPS)

```
pm2.config.cjs → 2 apps:
  discord-bot       (max 350MB, logs/bot-*.log)
  discord-dashboard (max 150MB, logs/dashboard-*.log)
```

### Environment Variables

| Var | Bot | Dashboard | Mô tả |
|-----|-----|-----------|-------|
| `DISCORD_TOKEN` | ✅ | — | Bot token |
| `DISCORD_CLIENT_ID` | — | ✅ | OAuth App ID |
| `DISCORD_CLIENT_SECRET` | — | ✅ | OAuth secret |
| `DISCORD_REDIRECT_URI` | — | ✅ | OAuth callback URL |
| `SESSION_SECRET` | — | ✅ | ≥32 chars |
| `UPSTASH_REDIS_REST_URL` | ✅ | ✅ | Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | ✅ | Redis token |
| `RIOT_API_KEY` | ✅ | — | Optional global |
| `TFT_API_KEY` | ✅ | — | Optional global |
| `LAVALINK_HOST/PORT/PASSWORD/SECURE` | ✅ | — | Music server |
| `KEEPALIVE_CHANNEL_ID` | ✅ | — | Self-ping channel |
| `ALLOW_DEV_AUTH` | — | dev only | Bỏ qua OAuth |
| `NODE_ENV` | both | both | production/development |
| `PORT` | — | ✅ | Default 10000 |
| `DASHBOARD_PORT` | — | ✅ | Default 10001 (PM2) |

### Lavalink

Chạy riêng trên Fly.io (xem `lavalink/`).  
`lavalink/fly.toml` + `lavalink/Dockerfile` + youtube-source + LavaSrc plugins.

---

## 9. Data Flow theo tính năng

### Economy Transaction

```
User: "!blackjack 100"
  → MessageCreate → runBuiltInCommand()
    → handleEconomy()
      → parseBetCommand() → { bet: 100, currency: 'silver' }
      → validateGameBet()
        → stateStore.tryDebitBalance(guildId, userId, 'silver', 100)
          → _withEconomyLock() → withRedisLock()
          → check balance >= 100
          → SET guild:{id}:economy:{userId} (balance - 100)
      → createDeck() + session
      → reply(blackjackEmbed + buttons)
      → setGameSession() → SET guild:{id}:game:blackjack:{msgId}

User clicks "Hit":
  → InteractionCreate → handleBlackjackButton()
    → withGameSessionLock(guildId, 'blackjack', messageId)
      → deal card → check bust/blackjack
      → on win: adjustBalance(+winAmount)
              → SET guild:{id}:economy:{userId} (balance + win)
      → deleteGameSession() → DEL guild:{id}:game:blackjack:{msgId}
    → interaction.update(updatedEmbed)
```

### Config Save từ Dashboard

```
Admin → thay đổi prefix → click "Lưu thay đổi"
  → GuildContext.saveConfig()
  → api.saveConfig(guildId, config)
  → POST /api/config { guildId, prefix: ".", ... }
  → Express middleware: session → guild access → CSRF → rate limit
  → configStore.updateGuildConfig(guildId, body)
    → normalize + validate → SET config:guild:{guildId}
  → botClient?.syncGuildCommands() (503 nếu dashboard-only process)
  → res.json({ ...config, slashSync })
  → GuildContext: dirty=false, saveStatus='saved'
```

---

## 10. Dependency Map

```
src/index.bot.js
  ├── src/env.js            (validateBotEnvironment)
  ├── src/upstash.js        ◄── dùng bởi mọi store
  ├── src/configStore.js
  │     ├── src/configDefaults.js
  │     ├── src/configPatch.js
  │     └── src/asyncMutex.js
  ├── src/stateStore.js
  │     ├── src/asyncMutex.js
  │     ├── src/distributedLock.js
  │     └── src/safeJson.js
  └── src/bot.js
        ├── src/cooldowns.js
        ├── src/commandAccess.js
        ├── src/bot/commands/index.js
        │     ├── src/bot/commands/runtime.js
        │     └── handlers/ (8 files)
        │           └── riot.js → lolCommands.js → lolApi.js
        │                      → tftCommands.js → tftApi.js
        ├── src/bot/interactions.js
        │     ├── src/bot/games.js
        │     └── src/bot/help.js
        ├── src/bot/music/lavalink.js
        ├── src/bot/logging.js
        ├── src/bot/embeds.js
        ├── src/bot/responses.js
        └── src/bot/slash.js

src/index.server.js
  ├── src/env.js            (validateServerEnvironment)
  ├── src/upstash.js
  ├── src/configStore.js
  ├── src/stateStore.js
  └── src/server.js
        ├── src/auth.js
        ├── src/csrf.js
        ├── src/rateLimit.js
        └── src/sessionStore.js

dashboard/src/
  main.jsx → App.jsx
    ├── contexts/AuthContext.jsx  (api.me())
    ├── contexts/GuildContext.jsx (api.config, api.saveConfig)
    ├── components/ServerRail.jsx
    ├── components/PluginNav.jsx
    ├── components/ui.jsx
    └── pages/ (7 pages)
          └─ tất cả dùng useGuild() + components/ui.jsx
```

---

*Document cập nhật sau refactor v2: tách 2 process, granular Redis keys, chuyển frontend sang React + Vite.*
