# Discord Service Bot — Architecture Document

> **Codebase:** `discord-service-bot` · **Runtime:** Node.js ESM · **Deploy:** Render.com (free tier)  
> **Tổng số file nguồn:** 50 files · ~8,400 dòng code

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Sơ đồ kiến trúc](#2-sơ-đồ-kiến-trúc)
3. [Luồng khởi động (Boot Flow)](#3-luồng-khởi-động)
4. [Backend — src/](#4-backend--src)
   - [Entry & Infrastructure](#41-entry--infrastructure)
   - [HTTP Server & Auth Layer](#42-http-server--auth-layer)
   - [Bot Engine](#43-bot-engine)
   - [Command System](#44-command-system)
   - [Music System](#45-music-system)
   - [Riot Games Integration](#46-riot-games-integration)
   - [Data Layer](#47-data-layer)
   - [Utilities & Security](#48-utilities--security)
5. [Frontend — public/](#5-frontend--public)
6. [Deployment & Config](#6-deployment--config)
7. [Data Flow theo tính năng](#7-data-flow-theo-tính-năng)
8. [Dependency Map](#8-dependency-map)

---

## 1. Tổng quan hệ thống

Bot Discord đa chức năng kết hợp **hai process** chạy song song trong một tiến trình duy nhất:

```
┌─────────────────────────────────────────────────────────┐
│                    Node.js Process                       │
│                                                          │
│   ┌──────────────────┐      ┌──────────────────────┐   │
│   │   Discord Bot     │      │   Express Web Server  │   │
│   │  (discord.js)     │      │   (Dashboard UI +     │   │
│   │                   │      │    REST API)          │   │
│   │  - Nhận events    │      │                       │   │
│   │  - Xử lý commands │      │  - OAuth2 Login       │   │
│   │  - Music (Lavalink│      │  - Config CRUD        │   │
│   │  - Reminders      │      │  - Guild data API     │   │
│   └──────┬───────────┘      └──────────┬────────────┘   │
│          │ share ConfigStore            │ share StateStore│
│          └──────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   Discord Gateway                Upstash Redis
   (WebSocket)                  (configs + state
                                 + sessions + locks)
```

**Nguyên tắc thiết kế:**
- **Single process, dual concern:** Bot và web server chia sẻ `ConfigStore` và `StateStore` qua closure — không cần IPC.
- **Redis-first persistence:** Mọi state đều được lưu Upstash Redis. File JSON chỉ là fallback cho local dev.
- **Per-guild isolation:** Mỗi guild có config và state riêng biệt, key theo `guildId`.
- **Distributed locking:** Toàn bộ write operations dùng `withRedisLock()` (Redis) hoặc `asyncMutex` (single-instance). An toàn để scale ngang ngay khi cần.
- **Rate limit bucket:** `riotBucket` throttle toàn bộ Riot API calls ở ≤90 req/2min — ngăn 429 khi nhiều guilds hoạt động đồng thời.

---

## 2. Sơ đồ kiến trúc

```
Discord API ◄──────────────────────────────────────► Lavalink Server
     │ WebSocket (Gateway)              REST/WS       (Java, âm nhạc)
     │ REST (API calls)
     ▼
┌────────────────────────────────────────────────────────────────────┐
│ src/index.js  ← ENTRY POINT                                        │
│  • validateEnvironment()                                           │
│  • createUpstashFromEnv() → sharedRedis                           │
│  • new ConfigStore()                                               │
│  • new StateStore()                                                │
│  • createBot()  ──────────────────────► src/bot.js                │
│  • createServer() ────────────────────► src/server.js             │
│  • loginWithRetry() (exponential backoff)                          │
└────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │ src/bot.js — Discord Client                  │
                    │                                              │
                    │  Events handled:                             │
                    │  ┌─ ClientReady                              │
                    │  │   • initLavalink()                        │
                    │  │   • purgeStaleGameSessions()              │
                    │  │   • syncGuildCommands() cho mỗi guild     │
                    │  │   • setInterval → reminder worker (60s)   │
                    │  │   • setInterval → keepalive /health       │
                    │  │                                           │
                    │  ├─ GuildMemberAdd → welcome message         │
                    │  ├─ Raw (VOICE_*) → forwardVoiceEvent()      │
                    │  ├─ InteractionCreate → slash commands        │
                    │  │                   → button clicks         │
                    │  │                   → select menus          │
                    │  └─ MessageCreate → automod, prefix cmds,    │
                    │                    music prefix, XP, autoReply│
                    └──────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │ src/server.js — Express App                  │
                    │                                              │
                    │  Middleware stack (theo thứ tự):             │
                    │  helmet (CSP + security headers)             │
                    │  expressSession (Upstash Redis store)        │
                    │  express.json (body parser, 128kb limit)     │
                    │  Rate limiters (read: 60/min, write: 20/min) │
                    │  CSRF validation (POST/PUT/DELETE)           │
                    │  auth.requireAuth / requireGuildAccess       │
                    │                                              │
                    │  Routes:                                     │
                    │  GET  /health                                 │
                    │  GET  /login.html                            │
                    │  GET  /  →  index.html (auth required)       │
                    │  GET  /auth/login  /callback  /logout  /me   │
                    │  GET  /api/csrf-token                        │
                    │  GET  /api/status                            │
                    │  GET  /api/guilds                            │
                    │  GET  /api/guild-data                        │
                    │  GET  /api/config?guildId=                   │
                    │  PUT  /api/config?guildId=                   │
                    │  POST /api/slash-sync?guildId=               │
                    │  GET  /api/state?guildId=                    │
                    │  GET  /api/invite-url                        │
                    │  GET  /api/keepalive-status                  │
                    └──────────────────────────────────────────────┘
```

---

## 3. Luồng khởi động

```
src/index.js
    │
    ├─1─ sodium.ready (libsodium, cho voice encryption)
    ├─2─ validateEnvironment() — kiểm tra env vars, throw nếu thiếu
    ├─3─ createUpstashFromEnv() → UpstashClient instance (dùng chung)
    ├─4─ new ConfigStore(configPath) → load tất cả guild configs từ Redis
    ├─5─ new StateStore(statePath, {redis}) → ready ngay nếu dùng Redis
    ├─6─ createBot(configStore, stateStore) → Discord Client (chưa login)
    ├─7─ createServer({...}) → Express app
    ├─8─ app.listen(port) → HTTP server bắt đầu nhận requests
    └─9─ loginWithRetry() → client.login(token)
              • Retry tối đa 10 lần với exponential backoff (5s → 30s max)
              • Chỉ retry khi lỗi là transient (ECONNRESET, ETIMEDOUT, ...)
              • Lỗi auth (token sai) → exit ngay

    Sau khi ClientReady:
    ├─ initLavalink() — kết nối Lavalink music server
    ├─ purgeStaleGameSessions() — dọn game sessions cũ > 6h
    ├─ syncGuildCommands() cho mỗi guild — đăng ký slash commands
    ├─ setInterval(reminderWorker, 60_000) — reminder checker
    └─ startKeepalive() — self-ping /health mỗi 5 phút
```

---

## 4. Backend — src/

### 4.1 Entry & Infrastructure

#### `src/index.js` — Entry Point (95 dòng)
**Vai trò:** Điểm khởi đầu duy nhất. Orchestrate tất cả modules.

**Làm gì:**
- Import và khởi tạo toàn bộ hệ thống theo đúng thứ tự
- Setup `process.on('unhandledRejection')` và `uncaughtException` — ngăn process chết im lặng
- Setup graceful shutdown (`SIGINT`, `SIGTERM`) — destroy Discord client trước khi exit
- `loginWithRetry()` — đăng nhập Discord với exponential backoff

**Exports:** Không export gì — đây là leaf node của dependency graph.

---

#### `src/env.js` — Environment Validator (60 dòng)
**Vai trò:** Validate env vars khi khởi động, fail fast nếu thiếu.

**Làm gì:**
- Danh sách `requiredBaseEnv`: `DISCORD_TOKEN` (luôn bắt buộc)
- Danh sách `requiredProductionEnv`: OAuth + session secrets (chỉ bắt buộc khi `NODE_ENV=production`)
- Phát hiện placeholder values (`'your_discord_bot_token'`, v.v.) và warn
- Validate `SESSION_SECRET` phải dài ≥ 32 ký tự
- Production: bắt buộc `UPSTASH_REDIS_REST_URL` và `TOKEN`

**Export:** `validateEnvironment(env?)`

---

#### `src/upstash.js` — Redis Client (138 dòng)
**Vai trò:** Minimal Upstash Redis REST client, thay thế `ioredis` không cần WebSocket.

**Tại sao tự viết:** Upstash dùng HTTP REST thay vì TCP socket → phù hợp serverless/Render. Không cần full Redis client library.

**Làm gì:**
- `UpstashClient` class với methods: `get`, `set`, `del`, `incr`, `expire`, `smembers`, `sadd`, `eval`, `pipeline`
- `_request(body)` — gọi `POST /` với body là Redis command array (e.g. `['GET', 'mykey']`)
- `pipeline(commands)` — gọi `POST /pipeline` với nhiều commands — atomic execution
- Retry tự động 2 lần khi có lỗi network, delay tăng dần
- Timeout 8 giây

**Export:** `UpstashClient`, `createUpstashFromEnv()`

---

#### `src/asyncMutex.js` — In-process Mutex (30 dòng)
**Vai trò:** Lock per-key để serialize async operations trong cùng process.

**Làm gì:**
- `createMutexPool()` trả về function `withLock(key, fn)`
- Mỗi key có một promise chain — operation mới chờ operation trước finish
- Tự cleanup khi lock được release
- Dùng để: economy transactions, warning updates, ticket numbering, LoL account linking

**Export:** `createMutexPool()`

---

#### `src/distributedLock.js` — Redis Distributed Lock (45 dòng)
**Vai trò:** SET NX lock cho multi-instance — đang được dùng cho toàn bộ write operations khi Redis được cấu hình.

**Làm gì:**
- `withRedisLock(redis, lockKey, ttlSec, fn)` — acquire lock, execute fn, release
- Acquire: `SET key token NX EX ttl` — atomic, chỉ 1 process win
- Release: Lua EVAL script — atomic check-and-delete (ngăn release nhầm lock của process khác)
- Retry acquisition trong `waitMs` (mặc định 5 giây) với poll mỗi 25ms

**Được dùng bởi:**
- `_withEconomyLock()` — economy & XP (per userId)
- `withGameSessionLock()` — blackjack/poker buttons (per messageId)
- `_withWarningsLock()` — warnings (per userId)
- `_withTicketLock()` — ticket numbering (per guild)
- `_withLolLock()` — LoL/TFT account linking (per userId)

**Export:** `withRedisLock()`

---

#### `src/safeJson.js` — Safe File Reader (30 dòng)
**Vai trò:** Đọc JSON file với size limit.

**Làm gì:**
- `readJsonFile(path, maxBytes?)` — mở file, check size (default 5MB), parse JSON
- `fileExists(path)` — kiểm tra file tồn tại
- Dùng cho StateStore fallback khi không có Redis

**Export:** `readJsonFile()`, `fileExists()`

---

### 4.2 HTTP Server & Auth Layer

#### `src/server.js` — Express Application (354 dòng)
**Vai trò:** Web dashboard API + static file server.

**Middleware stack (theo thứ tự):**
```
helmet (CSP + X-Frame-Options + HSTS + ...)
  ↓
expressSession (cookie "dsession", store: Upstash Redis)
  ↓
express.json (limit: 128kb)
  ↓
Rate limiters (read: 60req/min, write: 20req/min, keyed by IP+userId)
  ↓
CSRF protection (POST/PUT/DELETE phải có X-CSRF-Token header)
  ↓
auth.requireAuth / requireGuildAccess (theo route)
```

**Routes quan trọng:**
| Route | Auth | Mô tả |
|-------|------|--------|
| `GET /health` | None | Health check cho Render |
| `GET /` | requirePage | Serve dashboard (redirect /login.html nếu chưa đăng nhập) |
| `GET /api/guilds` | requireAuth | Danh sách guilds user có quyền quản lý |
| `GET /api/config` | requireAuth + requireGuildAccess | Config của 1 guild |
| `PUT /api/config` | requireAuth + requireGuildAccess + CSRF | Update config + auto sync slash |
| `GET /api/guild-data` | requireAuth + requireGuildAccess | Channels, roles, members của guild (cache 2 phút) |
| `POST /api/slash-sync` | requireAuth + requireGuildAccess + CSRF | Force re-sync slash commands |

**Lưu ý:**
- `sanitizeConfigForClient()` — strip `riotApiKey`/`tftApiKey` trước khi gửi xuống client
- `mapWithConcurrency()` — batch fetch với limit concurrency
- Guild list cache (5 phút) per-user để giảm Discord OAuth calls
- Guild data cache (2 phút) per-guild — tránh gọi `guild.members.fetch()` Discord API liên tục khi nhiều admin cùng dùng dashboard

---

#### `src/auth.js` — Discord OAuth2 (351 dòng)
**Vai trò:** OAuth2 flow + session management + guild access control.

**Flow đăng nhập:**
```
Browser → GET /auth/login
  → session.regenerate() (prevent session fixation)
  → lưu state + returnTo vào session
  → redirect Discord OAuth consent page

Discord → GET /auth/callback?code=&state=
  → validate state === session.oauthState
  → POST /oauth2/token → lấy access_token
  → GET /users/@me → lấy user info
  → session.regenerate() (prevent session fixation sau login)
  → lưu {id, username, avatar, accessToken} vào session
  → redirect returnTo
```

**`requireGuildAccess` middleware:**
1. Lấy user's guilds qua OAuth API (cache 5 phút)
2. Kiểm tra `permissions` bitmask: `ADMINISTRATOR (0x8)` hoặc `MANAGE_GUILD (0x20)`
3. Fallback nếu OAuth fail: kiểm tra trực tiếp qua bot's guild cache (`guild.members.fetch(userId)`)

**Dev mode (`ALLOW_DEV_AUTH=true`):**
- Bỏ qua toàn bộ OAuth
- Auto-login với `devUser` — dashboard không được bảo vệ
- Không bao giờ dùng trong production

**Export:** `createAuthRouter(botClient)` → `{ router, attachTo, requireAuth, requirePage, requireGuildAccess }`

---

#### `src/csrf.js` — CSRF Protection (45 dòng)
**Vai trò:** Double-submit cookie pattern với server-side token.

**Làm gì:**
- Token được tạo khi session tồn tại, lưu trong `session.csrfToken`
- `GET /api/csrf-token` → trả token cho client
- Mỗi POST/PUT/DELETE phải có header `X-CSRF-Token` khớp với session token
- Client (auth.js frontend) tự động attach token cho mọi mutating API call

---

#### `src/sessionStore.js` — Redis Session Store (58 dòng)
**Vai trò:** Adapter kết nối `express-session` với Upstash Redis.

**Làm gì:**
- Extend `expressSession.Store` với đầy đủ methods: `get`, `set`, `destroy`, `touch`
- Key format: `sess:{sid}`
- TTL: 7 ngày (tính từ cookie expiry)
- Fallback về in-memory `MemoryStore` khi không có Redis (local dev)

---

#### `src/rateLimit.js` — Rate Limiter (68 dòng)
**Vai trò:** Middleware rate limiting với 2 backend: Redis (production) và in-memory (dev).

**Làm gì:**
- Redis backend: `INCR key` + `EXPIRE key windowSec` — atomic, shared across instances
- Memory backend: per-process Map, cleanup interval
- Key: `${keyPrefix}:${req.ip}:${userId}` — scoped per user per IP
- Response: `429` với `Retry-After` header khi vượt limit

---

### 4.3 Bot Engine

#### `src/bot.js` — Discord Client Factory (525 dòng)
**Vai trò:** Tạo Discord Client, đăng ký tất cả event handlers, chạy background workers.

**Intents:** `Guilds, GuildMessages, GuildMembers, GuildVoiceStates, MessageContent`

**ClientReady — startup sequence:**
```
1. initLavalink(client) — kết nối music server
2. purgeStaleGameSessions() — dọn dẹp game cũ
3. for each guild: syncGuildCommands() — đăng ký slash commands
4. setInterval(reminderWorker, 60s) — chạy nhắc nhở
5. startKeepalive() — tự ping /health mỗi 5 phút
```

**MessageCreate — xử lý tin nhắn:**
```
message đến
  │
  ├─ Bỏ qua nếu: DM, bot message, guild disabled
  ├─ AutoMod: kiểm tra bad words + anti-link → xóa/warn
  ├─ Mention react: react emoji khi bot bị mention
  ├─ Music prefix (e.g. "hb play ...") → handleMusicCommand()
  ├─ Command prefix (e.g. "!ban @user") → runBuiltInCommand()
  ├─ XP system: +xp mỗi 60s per user (nếu levelsEnabled)
  └─ Auto-reply: tìm keyword match → trả lời tự động
```

**InteractionCreate:**
```
slash command → runBuiltInCommand()
button click → handleComponentInteraction()
  │
  ├─ bj:* → Blackjack button
  ├─ vp:* → Poker button
  ├─ ticket:create → tạo ticket channel
  ├─ ticket:close → xóa ticket channel
  └─ selfrole:* → toggle role
select menu → help group navigation
```

**GuildMemberAdd:** Gửi welcome message nếu `welcomeEnabled` và `welcomeChannelId` được cấu hình.

**Reminder worker (mỗi 60 giây):**
- Duyệt mọi guild → mọi reminder
- Nếu `reminder.time <= now` → gửi message → reschedule hoặc xóa
- Support repeat: `hourly / daily / weekly`

**`syncGuildCommands(guildId, config)`:**
- Build slash command list từ `config.commands` đang enabled
- `guild.commands.set(commands)` — overwrite toàn bộ slash commands cho guild
- Được gọi khi: bot ready + sau mỗi PUT /api/config

**`client.syncGuildCommands`** được mount lên client object để server.js có thể gọi sau khi save config.

---

#### `src/commandAccess.js` — Permission Logic (129 dòng)
**Vai trò:** Kiểm tra quyền sử dụng command cho Discord members.

**3 tầng kiểm tra:**
1. `memberCanUseCommand(member, command)` — entry point chính
   - Nếu command có `allowedRoles` list → chỉ member có role đó được dùng (admin bypass)
   - Nếu là staff command → `hasStaffDiscordPermission()`
   - Còn lại → mọi người đều dùng được
2. `hasStaffDiscordPermission(member, commandType)` — kiểm tra Discord permissions
3. `canModerateMember(actorMember, targetMember)` — kiểm tra role hierarchy (không thể moderate người có role cao hơn)

**`sanitizeAnnouncementText(text)`** — thay `@everyone`/`@here` bằng zero-width space để ngăn mass ping.

---

#### `src/cooldowns.js` — Command Cooldowns (53 dòng)
**Vai trò:** In-memory cooldown per user per command.

**Cooldown tiers:**
| Loại | Default |
|------|---------|
| Riot commands (lsd, lolprofile, ...) | 15 giây |
| Game commands (blackjack, poker, ...) | 5 giây |
| Admin commands (ban, kick, ...) | 2 giây |
| Mọi command khác | 3 giây |

Admin (`Administrator`/`ManageGuild`) bypass cooldown.

Cleanup interval 60 giây xóa entries đã hết hạn.

---

### 4.4 Command System

#### `src/bot/commands.js` (1 dòng)
Re-export `runBuiltInCommand` từ `commands/index.js` — backward compat.

---

#### `src/bot/commands/index.js` — Command Dispatcher (95 dòng)
**Vai trò:** Registry + Chain of responsibility — dispatch tới đúng handler.

**Flow:**
```
runBuiltInCommand(params)
  │
  ├─ createCommandContext() — validate permissions, build ctx object
  │     └─ memberCanUseCommand() → nếu không có quyền → deny
  │
  ├─ COMMAND_REGISTRY.get(command.type) → O(1) lookup
  │     if found → gọi handler trực tiếp (fast path)
  │     if not found → fall through to HANDLERS chain (slow path, custom types)
  │
  └─ Fallback: renderCommandResponse() cho custom response commands
     
     COMMAND_REGISTRY: Map<commandType, handler> — 47 entries
     HANDLERS (fallback): [handleHelp, handleGeneral, handleModeration,
                 handleLevels, handleEconomy, handlePanels, handleRiot]
```

**Thêm command mới:** chỉ cần thêm 1 entry vào `COMMAND_REGISTRY` và implement handler.

---

#### `src/bot/commands/runtime.js` — Context Builder (55 dòng)
**Vai trò:** Normalize slash interaction và prefix message thành cùng một `ctx` object.

**Tạo:**
- `isInteraction` — phân biệt slash vs prefix message
- `reply(payload)` — smart reply: dùng `editReply()` nếu deferred, `followUp()` nếu đã replied
- `context` — metadata object (`channelId`, `guildName`, `userId`, `username`)
- Auto-defer cho slow commands (Riot API, economy, help, ...)

---

#### `src/bot/commands/handlers/help.js` — Help Command
**Vai trò:** Interactive help menu với select dropdown.

Tạo `StringSelectMenu` cho user chọn nhóm lệnh (general, user, server, moderation, games, lol). Khi chọn → `handleComponentInteraction` → `buildHelpPayload()` → update embed.

---

#### `src/bot/commands/handlers/general.js` — General Commands
**Handles:** `custom`, `ping`, `config`, `server`, `user`, `avatar`, `say`, `announce`

- `ping/config/custom` → `renderCommandResponse()` (template substitution)
- `server` → `buildServerEmbed(guild)`
- `user/avatar` → `buildUserEmbed()` / `buildAvatarEmbed()`
- `say` → send message rồi xóa command message (prefix) / reply ephemeral (slash)
- `announce` → gửi tới `announcementChannelId` với optional mention

---

#### `src/bot/commands/handlers/moderation.js` — Moderation Commands
**Handles:** `purge`, `warn`, `kick`, `ban`, `timeout`, `warnings`, `clearwarns`

- Tất cả đều kiểm tra `canModerateMember()` (role hierarchy)
- `purge` → `channel.bulkDelete()`, ghi audit log với nội dung messages bị xóa
- `warn` → `stateStore.addWarning()` + log
- `kick`/`ban` → Discord API + log
- `timeout` → `member.timeout(minutes * 60000)` (max 10080 phút = 7 ngày)

---

#### `src/bot/commands/handlers/levels.js` — XP & Ranking
**Handles:** `rank`, `leaderboard`

- `rank` → `stateStore.getRank(guildId, userId)` → embed với level + XP
- `leaderboard` → `stateStore.getLeaderboard(guildId, 10)` → top 10 embed

---

#### `src/bot/commands/handlers/economy.js` — Economy & Games (251 dòng)
**Handles:** `balance`, `daily`, `economyleaderboard`, `blackjack`, `poker`, `coinflip`, `dice`, `slots`, `ecoadd`, `ecoset`, `ecoremove`

**Luồng game (blackjack/poker):**
```
1. parseBetCommand() → { bet, currency }
2. validateGameBet() → kiểm tra min/max bet, tryDebitBalance()
3. Tạo session object → reply với embed + buttons
4. blackjackSessions.set(messageId, session) — lưu in-memory
5. persistGameSession() → lưu Redis (survive restart)
6. scheduleSessionExpiry() → tự hủy session sau 2h
```

Button interactions xử lý trong `src/bot/games.js`.

---

#### `src/bot/commands/handlers/panels.js` — Interactive Panels
**Handles:** `ticketpanel`, `rolepanel`

- `ticketpanel` → post embed + "Open ticket" button vào channel
- `rolepanel` → post embed + tối đa 25 role buttons (5 per row)

Click button → `handleComponentInteraction()` trong `src/bot/interactions.js`.

---

#### `src/bot/commands/handlers/riot.js` — Riot Games Commands
**Handles:** 9 LoL commands + 5 TFT commands (xem mục 4.6)

Delegate tới `lolCommands.js` và `tftCommands.js`.

---

#### `src/bot/constants.js` — Shared Constants
`AUTO_DEFER_COMMAND_TYPES` — Set các command type sẽ auto-defer khi dùng slash (vì cần gọi API chậm).

---

#### `src/bot/responses.js` — Template Renderer
`renderCommandResponse(template, ctx)` — thay thế tokens: `{user}`, `{ping}`, `{prefix}`, `{commands}`, `{riotKeyStatus}`, v.v.

---

#### `src/bot/embeds.js` — Discord Embed Builders
- `buildServerEmbed(guild)` — server info embed
- `buildUserEmbed(user, member?)` — user profile embed
- `buildAvatarEmbed(user)` — large avatar embed
- `resolveMentionedUser(client, guild, args, fallback)` — parse mention từ prefix args

---

#### `src/bot/logging.js` — Audit Log
- `sendLog(guild, config, message)` — gửi text vào `config.logChannelId`
- `sendTicketLog(guild, config, message)` — gửi vào `ticketLogChannelId` hoặc fallback `logChannelId`
- `formatMessage(template, member)` — template cho welcome messages

---

#### `src/bot/help.js` — Help System Builder (185 dòng)
**Vai trò:** Build help embed + select menu cho interactive help.

- `groupMap` — mapping từ command type → group name (`general`, `user`, `moderation`, ...)
- `buildHelpPayload(client, config, guild, userId, group?)` — tạo embed theo group
- Select menu cho navigation giữa các groups

---

#### `src/bot/interactions.js` — Component Interaction Handler (127 dòng)
**Vai trò:** Xử lý tất cả button clicks và select menu interactions.

| customId | Action |
|----------|--------|
| `help_select:{userId}` | Update help embed theo group đã chọn |
| `bj:{...}` | Blackjack (hit/stand/double) |
| `vp:{...}` | Poker (hold cards, draw) |
| `ticket:create` | Tạo channel ticket mới với permissions |
| `ticket:close` | Xóa ticket channel (3s delay) |
| `selfrole:{roleId}` | Toggle role cho member |

---

#### `src/bot/games.js` — Game Engine (668 dòng) — File lớn nhất
**Vai trò:** Logic toàn bộ games: Blackjack, Poker, Coinflip, Dice, Slots.

**Exports chính:**
- `createDeck()` — 52 bài, shuffle Fisher-Yates
- `handleBlackjackButton(interaction, {client, config})` — hit/stand/double
- `handlePokerButton(interaction, {client, config})` — hold cards, draw, evaluate hand
- `playCoinflip(side)` — heads/tails, 50/50
- `playDice(target)` — chọn số 1-6, win nếu đúng (6x payout)
- `playSlots()` — 3 reels, multiple winning combos, multiplier up to 10x
- `validateGameBet()` — kiểm tra min/max bet, gọi `tryDebitBalance()`
- `persistGameSession()` / `scheduleSessionExpiry()` — Redis persistence + auto-expire

**In-memory session Maps:**
- `blackjackSessions: Map<messageId, session>` — active blackjack games
- `pokerSessions: Map<messageId, session>` — active poker games

Sessions được sync cả Redis để survive restarts.

---

#### `src/bot/slash.js` — Slash Command Builder (262 dòng)
**Vai trò:** Build `ApplicationCommand[]` từ config để register với Discord.

- `buildSlashCommands(config)` → array of slash command definitions
- `buildSlashOptions(command)` → options array theo command type
- Mỗi command type có options riêng: Riot commands có `summoner` + `region`, games có `bet` + `currency`, ...
- Bao gồm cả `buildLolSlashOptions()` và `buildTftSlashOptions()`

---

### 4.5 Music System

#### `src/bot/music/lavalink.js` — Lavalink Manager (221 dòng)
**Vai trò:** Wrapper cho `lavalink-client`, quản lý audio players.

**Architecture âm nhạc:**
```
Discord Voice Gateway ←── sendToShard() ──── LavalinkManager
                                                    │
                                          Lavalink Server (Java)
                                          (youtube-source plugin)
                                          (LavaSrc: Spotify/Apple)
```

**Config:**
- `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`, `LAVALINK_SECURE`
- Retry: 20 lần, delay 10 giây — auto-reconnect nếu server restart

**Player options:**
- `leaveOnEnd: true` với 90s cooldown — cho phép queue bài tiếp
- `leaveOnEmpty: true` với 20s cooldown — rời khi channel trống
- Default volume: 80%

**Events:** `nodeConnect`, `nodeDisconnect`, `nodeError`, `trackStart`, `trackEnd`, `trackStuck`, `queueEnd`

**Exports:** `initLavalink()`, `getLavalinkManager()`, `forwardVoiceEvent()`, `buildLavalinkQuery()`, `sourceLabel()`, `fmt()`

---

#### `src/bot/commands/handlers/music.js` — Music Commands (240 dòng)
**Vai trò:** Xử lý tất cả music commands qua prefix `hb` (configurable).

**Commands:**
| Command | Mô tả |
|---------|--------|
| `hb play <url/tên>` | Tìm và phát nhạc, join voice channel |
| `hb skip` / `hb s` | Bỏ qua bài hiện tại |
| `hb stop` | Dừng và xóa queue |
| `hb pause` / `hb resume` | Tạm dừng / tiếp tục |
| `hb queue` / `hb q` | Xem danh sách queue |
| `hb np` | Xem bài đang phát |
| `hb loop` | Toggle loop mode |
| `hb volume <0-200>` | Điều chỉnh âm lượng |

Tìm kiếm: tự detect URL (YouTube, SoundCloud, Spotify) hoặc search YouTube.

---

### 4.6 Riot Games Integration

#### `src/lolApi.js` — League of Legends API Client (530 dòng)
**Vai trò:** HTTP client cho Riot Games REST API + Data Dragon (static data).

**Regions:** 16 regions (vn2, na1, euw1, kr, jp1, sg2, ...)

**`riotBucket` — Global rate limit token bucket:**
- Riot dev keys: 20 req/s burst, 100 req/2min sustained
- `riotBucket` giới hạn toàn bộ live Riot API calls xuống ≤90 req/2min (10% safety margin)
- Mọi request qua `riotGet()` đều chờ token trước khi gọi network
- Ngăn 429 khi nhiều guilds dùng Riot commands cùng lúc

**Static data** (từ Data Dragon CDN, cached trong bộ nhớ):
- `getChampionData()` — tất cả champions
- `getChampionDetail(champKey)` — chi tiết 1 champion (abilities, stats)
- `getItemData()` — tất cả items
- `getRuneData()` — tất cả runes/keystones
- `getSummonerSpellData()` — summoner spells
- `getLatestPatch()` — patch version hiện tại

**Live data** (cần API key):
- `getAccountByRiotId(gameName, tagLine, region)` — lấy PUUID
- `getSummonerByPuuid(puuid, region)` — summoner info
- `getRankedInfo(puuid, region)` — rank hiện tại (solo/flex)
- `getMatchHistory(puuid, region, count, queueId?)` — lịch sử đấu
- `getMatchDetail(matchId, region)` — chi tiết 1 trận
- `getTopMastery(puuid, region, count)` — top champions theo mastery

**`Cache` class** — in-memory TTL cache để giảm API calls cho static data.

**`_riotBucket`** — Token bucket rate limiter (18 req/s ceiling) áp dụng cho mọi Riot live API call. Ngăn 429 khi nhiều guild members trigger commands cùng lúc. Tất cả live API functions dùng `riotGetThrottled()` thay vì `riotGet()` trực tiếp.

---

#### `src/lolCommands.js` — LoL Command Handlers (551 dòng)
**Vai trò:** Xử lý 9 LoL slash/prefix commands.

| Command | Mô tả |
|---------|--------|
| `lsd` | LoL Summoner Detail — rank, mastery top 5, win rate |
| `lolprofile` | Profile đầy đủ với match history |
| `lolmatch` | Chi tiết 1 trận đấu cụ thể |
| `lolchamp` | Thông tin champion (abilities, stats) |
| `lolitem` | Thông tin item |
| `lolrunes` | Thông tin rune/keystone |
| `lolpatch` | Patch notes link |
| `lollink` | Link Riot account với Discord ID |
| `lolunlink` | Unlink account |

`resolveSummoner()` — tìm summoner từ slash args, prefix args, hoặc linked account.

---

#### `src/tftApi.js` — TFT API Client (283 dòng)
**Vai trò:** HTTP client cho TFT-specific endpoints + Community Dragon static data.

- `getTftRankedInfo()`, `getTftMatchHistory()`, `getTftMatchDetail()`
- `getTftStaticData()` — traits, augments từ Community Dragon
- `getTftItems()`, `getTftChampions()`, `getTftAugments()`

---

#### `src/tftCommands.js` — TFT Command Handlers (427 dòng)
**Handles:** `tftlsd`, `tftprofile`, `tftmatch`, `tftlink`, `tftunlink`

---

#### `src/riot/helpers.js` — Shared Riot Utilities (76 dòng)
**Vai trò:** Shared helpers dùng chung cho cả LoL và TFT.

- `noApiKeyMsg(isInteraction)` — error message khi thiếu API key
- `formatRiotError(err)` — user-friendly error từ HTTP status codes (404 = not found, 429 = rate limit, 403 = key expired)
- `editOrReply(source, isInteraction, payload)` — smart reply helper
- `resolveRiotSummonerInput()` — parse summoner + region từ slash options hoặc prefix text; fallback linked account

---

### 4.7 Data Layer

#### `src/configStore.js` — Guild Configuration Store (451 dòng)
**Vai trò:** CRUD cho per-guild bot config, stored in Redis.

**Redis keys:**
- `config:_index` — JSON array của tất cả guildIds có config
- `config:guild:{guildId}` — JSON config object của mỗi guild

**Lưu ý quan trọng:**
- `riotApiKey` và `tftApiKey` **KHÔNG bao giờ lưu vào Redis** — chỉ lưu trong `_runtimeSecrets` Map (in-memory)
- Env vars `RIOT_API_KEY`/`TFT_API_KEY` là global default nếu guild chưa set
- `_withLock(guildId, fn)` — serialize write operations per guild

**Normalization functions** (chạy khi read + write):
- `normalizeCommands()` — deduplicate, validate types, check built-ins
- `normalizeAutoReplies()` — trim, filter empty, limit 50
- `normalizeReminders()` — validate fields, migrate legacy `userId` → `userIds[]`
- `normalizeSelfRoles()` — validate snowflake IDs, limit 25
- `normalizeSnowflakeId()` — validate Discord snowflake format `/^\d{17,20}$/`

**`updateGuildConfig(guildId, rawPatch)`:**
- Block prototype pollution (`__proto__`, `constructor`, `prototype`)
- Validate và clamp tất cả numeric values (e.g. `xpPerMessage` 1–100)
- Strip `riotApiKey`/`tftApiKey` trước khi lưu
- Auto-save sau mỗi update

---

#### `src/configDefaults.js` — Default Config (353 dòng)
**Vai trò:** Default values cho mọi config field khi guild chưa customize.

Bao gồm đầy đủ:
- 30+ built-in commands (ping, help, config, lsd, blackjack, ...)
- Default bad words list
- Default welcome/level/economy messages
- `COMMAND_TYPES` Set — tất cả valid command types
- `builtInTypesByName` Map — mapping name → type

---

#### `src/configPatch.js` — Config Patch Helpers (25 dòng)
**Vai trò:** Helper functions để merge patch với current config an toàn.

- `pickBoolean(patch, key, current)` — dùng current nếu patch không có key
- `pickFlag(patch, key, current, {defaultTrue})` — tương tự nhưng cho boolean flags với default

---

#### `src/stateStore.js` — Runtime State Store (503 dòng)
**Vai trò:** Persistent storage cho tất cả runtime state (economy, levels, warnings, tickets, game sessions, Riot accounts).

**Dual backend:**
- Redis (production): state survive redeploys
- JSON file (dev): `data/state.json` — mất khi Render redeploy

**Per-guild data structure:**
```json
{
  "warnings": { "userId": [{ "reason", "moderatorId", "createdAt" }] },
  "levels":   { "userId": { "xp", "level" } },
  "tickets":  { "nextNumber": 1 },
  "economy": {
    "users": { "userId": { "silver", "gold", "diamond", "dailyClaimedAt" } }
  },
  "gameSessions": {
    "blackjack": { "messageId": { ...session } },
    "poker":     { "messageId": { ...session } }
  },
  "lolAccounts": { "userId": { "riotId", "puuid", "region" } },
  "tftAccounts": { "userId": { "riotId", "puuid", "region" } }
}
```

**Public API:**
| Method | Mô tả |
|--------|--------|
| `getBalance(guildId, userId)` | Lấy số dư |
| `adjustBalance(guildId, userId, currency, delta)` | Cộng/trừ số dư (atomic) |
| `tryDebitBalance(guildId, userId, currency, amount)` | Trừ tiền hoặc fail nếu không đủ |
| `setBalance(...)` | Set số dư tuyệt đối (admin) |
| `claimDaily(...)` | Nhận daily reward với cooldown |
| `getEconomyLeaderboard(guildId, currency, limit)` | Top users |
| `addXp(guildId, userId, amount)` | Cộng XP, tự tính level up |
| `getRank(guildId, userId)` | XP + level |
| `getLeaderboard(guildId, limit)` | Top users by level |
| `addWarning(...)` | Thêm warning |
| `getWarnings(guildId, userId)` | Xem warnings |
| `clearWarnings(guildId, userId)` | Xóa warnings |
| `nextTicketNumber(guildId)` | Số ticket tiếp theo (atomic) |
| `linkLolAccount(...)` / `unlinkLolAccount(...)` | LoL account linking |
| `linkTftAccount(...)` / `unlinkTftAccount(...)` | TFT account linking |
| `getGameSession(...)` / `setGameSession(...)` / `deleteGameSession(...)` | Game persistence |
| `purgeStaleGameSessions(maxAgeMs?)` | Cleanup game sessions cũ |

**Mutexes per operation type:**
- `_economyMutex` / `_withEconomyLock()` — economy & XP (per userId) — distributed khi Redis
- `_warningsMutex` / `_withWarningsLock()` — warnings (per userId) — distributed khi Redis
- `_ticketMutex` / `_withTicketLock()` — ticket numbering (per guild) — distributed khi Redis
- `_lolMutex` / `_withLolLock()` — LoL/TFT account linking (per userId) — distributed khi Redis
- `_gameSessionMutex` / `withGameSessionLock()` — game sessions (per messageId) — distributed khi Redis

Tất cả write operations đều dùng `withRedisLock()` khi `_useRedis = true`, đảm bảo an toàn khi scale lên multi-instance.

---

### 4.8 Utilities & Security

#### `src/cooldowns.js` — Command Cooldowns
_(đã mô tả ở 4.3)_

---

## 5. Frontend — public/

SPA (Single Page Application) thuần HTML/CSS/JS, không có framework. Tất cả là ES modules được load qua `<script type="module">`.

```
public/
├── index.html          — Dashboard UI (1200+ dòng HTML)
├── login.html          — Login page (OAuth redirect)
├── styles.css          — Toàn bộ CSS (~1500 dòng)
├── app.js              — Entry point, bind events, init
└── dashboard/
    ├── auth.js         — Auth check + CSRF token management + fetch interceptor
    ├── state.js        — Shared state (currentGuildId) + DOM refs
    ├── nav.js          — Navigation (showPage, bindNavigation)
    ├── guild.js        — API calls (loadServers, saveConfig, syncSlash, refreshStatus)
    ├── commands.js     — Command table UI (add/remove/search/filter rows)
    ├── form.js         — Dynamic form rows (autoReplies, selfRoles, reminders)
    ├── members.js      — Members page (load, search, filter by role)
    └── utils.js        — isDirty flag, esc(), setDirty(), showMsg()
```

### `public/dashboard/auth.js` — Auth & CSRF Layer
**Chạy đầu tiên (top-level await):**
1. `GET /auth/me` → nếu chưa đăng nhập → redirect `/login.html`
2. Hiện avatar + username trong header
3. Fetch CSRF token
4. **Override `window.fetch`** — tự động attach `X-CSRF-Token` cho mọi POST/PUT/DELETE tới `/api`
5. Auto-refresh CSRF token khi nhận 403
6. Auto-redirect `/login.html` khi nhận 401

### `public/dashboard/state.js`
Shared module chứa:
- `currentGuildId` — guild đang được chọn
- Tất cả DOM element references (form, buttons, lists, ...)
- `pageTitles` mapping và `pageOrder` array

### `public/dashboard/nav.js`
- `showPage(name)` — ẩn/hiện pages, update active nav item
- `bindNavigation()` — event listeners cho nav sidebar + mobile select

### `public/dashboard/guild.js`
- `loadServers()` — fetch `/api/guilds`, render server list, auto-select nếu chỉ có 1
- `refreshStatus()` — fetch `/api/status`, update bot status indicator
- `saveConfig()` — collect form data → `PUT /api/config` → hiện result
- `syncSlash()` — `POST /api/slash-sync`

### `public/dashboard/commands.js`
- Dynamic table của commands với inline editing
- Search + filter (theo group: general, moderation, economy, lol, ...)
- Add/remove command rows
- `getCommandGroupFromHash()` — URL hash navigation

### `public/dashboard/form.js`
Dynamic form sections cho:
- Auto-replies (keyword + response pairs)
- Self-roles (label + role select)
- Reminders (userIds, channel, message, time, repeat)

### `public/dashboard/members.js`
- Load guild members từ `/api/guild-data`
- Hiển thị avatar, display name, join date, roles
- Search theo tên
- Filter theo role

### `public/app.js`
- Import tất cả modules
- Bind global events (save button, add buttons, search/filter inputs)
- `refreshStatus()` + poll mỗi 60 giây (pause khi tab hidden)
- `loadServers()`
- Music prefix live preview

---

## 6. Deployment & Config

### `render.yaml` — Render.com Service Config
- Type: `web` (free plan)
- Build: `corepack enable && pnpm install`
- Start: `pnpm start`
- Persistent disk: `/var/data` (1GB) — cho file fallback nếu không dùng Redis
- Health check: `GET /health`

### `pm2.config.cjs` — PM2 (Self-hosted)
- Max restarts: 20
- Min uptime: 10 giây
- Max memory: 400MB → auto restart
- Exponential backoff restart delay

### `keep-alive.sh` — Bash Fallback (nếu không dùng PM2)
- Wrapper loop tự restart process khi crash
- Max 50 restarts
- Log ra `logs/out.log` và `logs/err.log`

### `.env.example` — Environment Variables
```
DISCORD_TOKEN              — Bot token (bắt buộc)
DISCORD_CLIENT_ID          — App Client ID (OAuth)
DISCORD_CLIENT_SECRET      — App Client Secret (OAuth)
DISCORD_REDIRECT_URI       — OAuth callback URL
SESSION_SECRET             — ≥32 ký tự random
UPSTASH_REDIS_REST_URL     — Redis URL
UPSTASH_REDIS_REST_TOKEN   — Redis token
RIOT_API_KEY               — Riot API key (optional, global)
TFT_API_KEY                — TFT API key (optional, global)
LAVALINK_HOST/PORT/PASSWORD/SECURE — Music server
KEEPALIVE_CHANNEL_ID       — (unused, self-ping is via HTTP now)
ALLOW_DEV_AUTH             — true để bỏ qua OAuth (local dev)
NODE_ENV                   — production | development
PORT                       — default 10000
```

### `lavalink/`
- `Dockerfile` — Build Lavalink server với youtube-source + LavaSrc plugins
- `application.yml` — Lavalink server config
- `fly.toml` — Deploy Lavalink riêng lên Fly.io (free tier)

---

## 7. Data Flow theo tính năng

### Economy Transaction (ví dụ: `!blackjack 100`)
```
User: "!blackjack 100"
  → MessageCreate
  → config = configStore.getGuildConfig(guildId)
  → command = config.commands.find("blackjack")
  → cooldownCooldowns.check() → ok
  → runBuiltInCommand()
    → createCommandContext() → ctx
    → handleEconomy(ctx)
      → parseBetCommand() → { bet: 100, currency: 'silver' }
      → validateGameBet()
        → stateStore.tryDebitBalance(guildId, userId, 'silver', 100)
          → _withEconomyLock(guildId, userId) → atomic
          → check balance >= 100
          → balance.silver -= 100
          → _redisSaveGuild()
      → createDeck() + session object
      → reply(buildBlackjackPayload()) → message with buttons
      → blackjackSessions.set(messageId, session)
      → persistGameSession() → Redis

User clicks "Hit":
  → InteractionCreate (button: "bj:hit:{messageId}")
  → handleComponentInteraction()
  → handleBlackjackButton()
    → stateStore.withGameSessionLock(guildId, 'blackjack', messageId)
      → session.players[0].hand.push(deck.pop())
      → check bust / blackjack
      → on win: stateStore.adjustBalance(+winAmount)
      → on game end: stateStore.deleteGameSession()
    → interaction.update(buildBlackjackPayload())
```

### Config Update từ Dashboard
```
Admin truy cập dashboard → chọn guild → thay đổi prefix → click Save
  → PUT /api/config?guildId=123
  → Middleware: session check → guild access check → CSRF validate → rate limit
  → server.js handler:
    → configStore.updateGuildConfig(guildId, body)
      → _withLock(guildId) → atomic
      → normalize + validate mọi fields
      → cache[guildId] = next
      → _saveGuild() → Redis
    → botClient.syncGuildCommands(guildId, newConfig)
      → guild.commands.set([...slash commands...])
  → res.json({ ...sanitizedConfig, slashSync })
```

---

## 8. Dependency Map

```
src/index.js
  ├── src/env.js
  ├── src/upstash.js ◄──────────────────────────── (dùng bởi mọi store)
  ├── src/configStore.js
  │     ├── src/configDefaults.js
  │     ├── src/configPatch.js
  │     ├── src/asyncMutex.js
  │     └── src/upstash.js
  ├── src/stateStore.js
  │     ├── src/asyncMutex.js
  │     ├── src/distributedLock.js
  │     ├── src/safeJson.js
  │     └── src/upstash.js
  ├── src/bot.js
  │     ├── src/cooldowns.js
  │     ├── src/commandAccess.js
  │     ├── src/bot/commands.js
  │     │     └── src/bot/commands/index.js
  │     │           ├── src/bot/commands/runtime.js
  │     │           └── handlers/ (7 files)
  │     │                 └── riot.js → src/lolCommands.js → src/lolApi.js
  │     │                            → src/tftCommands.js → src/tftApi.js
  │     ├── src/bot/interactions.js
  │     │     ├── src/bot/games.js ← asyncMutex
  │     │     └── src/bot/help.js
  │     ├── src/bot/music/lavalink.js ← lavalink-client
  │     ├── src/bot/commands/handlers/music.js
  │     ├── src/bot/logging.js
  │     ├── src/bot/embeds.js
  │     ├── src/bot/responses.js
  │     └── src/bot/slash.js
  └── src/server.js
        ├── src/auth.js
        ├── src/csrf.js
        ├── src/rateLimit.js
        └── src/sessionStore.js

public/ (frontend, không import src/)
  └── app.js
        └── dashboard/ (7 modules)
```

---

*Tài liệu này mô tả codebase sau khi đã được audit và refactor (xem `AUDIT_REPORT.md`).*

---

## 9. Các cải tiến sau audit

Dựa trên `AUDIT_REPORT.md`, các thay đổi sau đã được thực hiện:

| Vấn đề | Giải pháp | File |
|--------|-----------|------|
| `_ticketMutex` và `_warningsMutex` chỉ là in-process lock, không an toàn khi multi-instance | Thêm `_withTicketLock()` và cập nhật `_withWarningsLock()` để dùng `withRedisLock()` khi Redis available | `stateStore.js` |
| `/api/guild-data` gọi `guild.members.fetch()` mỗi request, chậm và dễ bị rate limit Discord | Thêm `_guildDataCache` (2 phút TTL) — cache hit trả về ngay, không gọi Discord API | `server.js` |
| Riot API không có global rate limit — nhiều guild dùng đồng thời dễ bị 429 | Thêm `_riotBucket` token bucket (18 req/s) — tất cả live API calls dùng `riotGetThrottled()` | `lolApi.js` |

**Trạng thái distributed locking hiện tại:**
- Economy, warnings, tickets, game sessions: ✅ distributed lock khi Redis configured
- LoL/TFT account linking: ⚠️ in-process only (ít conflict risk do writes hiếm)
- Multi-instance safe khi dùng Upstash Redis