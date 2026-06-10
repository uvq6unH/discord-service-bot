# Changelog

Format: `[vX.Y] — Mô tả ngắn` → chi tiết thay đổi.

---

## [v1.3] — Riot API puuid migration + Documentation freeze

**Riot/TFT API:**
- Migrate toàn bộ endpoints sang puuid-based: `League-v4 /by-puuid`, `Champion-Mastery-v4 /by-puuid`, `Match-v5 /by-puuid`
- Loại bỏ summonerId khỏi stored account records — chỉ lưu `{ riotId, puuid, region, linkedAt }`
- Region routing tách thành hai map: `accountRouting` (Account-v1, VN2→asia) và `routing` (Match-v5, VN2→sea)

**Bot (`src/index.bot.js`):**
- HTTP health server bind trước `client.login()` — bắt buộc để Render detect port ngay khi process start
- Graceful shutdown: `SIGINT`/`SIGTERM` → destroy Discord client → `process.exit(0)`

**Dashboard (`src/pages/Lol.jsx`):**
- API key status badge (đã cấu hình / chưa cài)
- Command reference card cho LoL và TFT commands

**Documentation:**
- `ARCHITECTURE.md` — rewrite đầy đủ, bổ sung Riot integration, command system, data flows
- `PLAN.md` — cập nhật priority order, thêm operational framing (monolith vs split trade-off)
- `DEPLOYMENT.md` — tài liệu vận hành mới: env vars, boot sequence, expected logs, checklist
- `SYSTEM_DEBUG.md` — debug guide mới: 7 failure scenarios, Redis diagnostic commands, log patterns
- `render.yaml` — bot đổi từ `type: worker` sang `type: web` (canonical, không còn điều kiện)
- `CHANGELOG.md` — file này
- `ADR.md` — Architecture Decision Records
- `BACKUP.md` — Backup và recovery strategy

---

## [v1.2] — Heartbeat + Observability

**Bot (`src/bot.js`):**
- `heartbeat:bot` — ghi Redis mỗi 30 s, TTL 90 s, payload `{ ts, uptimeS, guilds, ready }`
- Stats counters: `stats:slash_sync_processed`, `stats:guild_cache_refresh`, `stats:discord_errors`

**Dashboard (`src/server.js`):**
- `heartbeat:dashboard` — ghi Redis mỗi 30 s
- `GET /api/status` — trả về bot/dashboard online status + stats + `slashQueueLength`

**Dashboard UI (`src/pages/System.jsx`):**
- System page mới: bot/dashboard online indicator, uptime, heartbeat age, slash queue length, stats counters

---

## [v1.1] — Slash Sync Queue + Members Key Split

**Slash sync queue (`src/bot.js`, `src/server.js`):**
- `POST /api/slash-sync` → `rpush slash_sync_queue { guildId, requestedAt }` (thay vì 503 khi botClient null)
- Bot poll `lpop slash_sync_queue` mỗi 5 s
- Monolith mode: sync trực tiếp, bỏ qua queue

**Members key split (`src/bot.js`):**
- `guild_cache:{guildId}` — không còn chứa `members[]`
- `guild_cache:{guildId}:members` — key riêng, TTL riêng
- Tránh giới hạn 1 MB của Upstash REST trên guild lớn

**Dashboard (`src/server.js`):**
- `GET /api/members` đọc `guild_cache:{guildId}:members` thay vì botClient
- `GET /api/guild-data` đọc `guild_cache:{guildId}` (meta only)

---

## [v1.0] — Split Architecture + Guild Cache Layer

**Kiến trúc:**
- Tách monolith (`src/index.js`) thành 2 process:
  - `src/index.bot.js` — Discord client
  - `src/index.server.js` — Express dashboard
- Giao tiếp qua Upstash Redis (không có direct IPC)

**Guild cache (`src/bot.js`):**
- Bot ghi `guild_cache:{guildId}` khi `ClientReady`, `GuildCreate`, `GuildUpdate`, và mỗi 10 phút
- Dashboard đọc cache — không còn phụ thuộc `botClient.guilds.cache`

**Redis-first data layer:**
- `ConfigStore` — config lưu Redis, JSON file chỉ là local-dev fallback
- `StateStore` — state lưu Redis (economy, levels, warnings, tickets, games)
- `UpstashSessionStore` — sessions lưu Redis thay vì memory

**Auth (`src/auth.js`):**
- `requireGuildAccess` dùng optional chaining `botClient?.guilds?.cache` — null-safe

**Infra:**
- `render.yaml` — 3 services: discord-bot, discord-dashboard, lavalink
- `pm2.config.cjs` — 2 processes, memory limits, log rotation
- `src/distributedLock.js` — Redis-based distributed lock (Lua atomic)
- `src/asyncMutex.js` — in-process fallback cho local dev
