# Discord Bot — Roadmap

> **Current state:** Phases 1–3 complete. Bot and dashboard run independently via Redis data bus.  
> Riot/TFT API updated to puuid-based endpoints (League-v4, Match-v5, Mastery-v4).

---

## Status legend

- ✅ Done
- ⬜ Not started

---

## Phase 1 — Guild Cache Layer ✅

Bot writes guild data to Redis so the dashboard can read it without a direct bot connection.

**Bot side (`src/bot.js`):** Writes on `ClientReady`, `GuildCreate`, `GuildUpdate`, and every 10 minutes.

Two separate Redis keys to avoid Upstash's 1 MB per-request limit:
- `guild_cache:{guildId}` → meta: `{ name, iconURL, channels[], roles[], memberCount, ownerId, updatedAt }` (≤ 20 KB)
- `guild_cache:{guildId}:members` → `members[]` only (scales with guild size)

Both keys have a 15-minute TTL. Bot refreshes every 10 minutes.

**Dashboard side (`src/server.js`):**
- `GET /api/guild-data` — reads meta key (channels + roles for config dropdowns)
- `GET /api/members` — reads members key
- `503` only when Redis cache is cold **and** `botClient` is null

---

## Phase 2 — Slash Sync Queue ✅

Allows the dashboard to trigger slash command re-registration without a live bot connection.

**Dashboard (`src/server.js`):** `POST /api/slash-sync` pushes `{ guildId, requestedAt }` to the `slash_sync_queue` Redis list. When `botClient` is present (monolith mode), it syncs directly instead.

**Bot (`src/bot.js`):** Polls `slash_sync_queue` every 5 s via `lpop`. On job found: calls `syncGuildCommands(guildId, config)`, increments `stats:slash_sync_processed`.

---

## Phase 3 — Stability & Observability ✅

### 3.1 Members key split ✅

`guild_cache:{guildId}` no longer contains `members[]`. Members live in `guild_cache:{guildId}:members` — separate key, separate TTL. Prevents 1 MB Upstash REST limit breach on large guilds.

### 3.2 Heartbeat ✅

Both services write to Redis every 30 s. TTL = 90 s — absence means offline.

| Key | Writer | Payload |
|-----|--------|---------|
| `heartbeat:bot` | `src/bot.js` | `{ ts, uptimeS, guilds, ready }` |
| `heartbeat:dashboard` | `src/server.js` | `{ ts, uptimeS }` |

`GET /api/status` returns:
```json
{
  "botReady": true,
  "bot": { "online": true, "uptimeS": 3600, "guilds": 5, "lastSeenMs": 8000 },
  "dashboard": { "uptimeS": 7200 },
  "stats": { "slashSyncProcessed": 12, "guildCacheRefresh": 48, "discordErrors": 0, "slashQueueLength": 0 }
}
```

### 3.3 Stats counters ✅

Bot increments Redis counters (fire-and-forget, non-fatal):

| Key | Incremented on |
|-----|----------------|
| `stats:slash_sync_processed` | Bot completes a slash sync job |
| `stats:guild_cache_refresh` | Bot writes both guild cache keys successfully |
| `stats:discord_errors` | `ShardError` or `Error` event on the Discord client |

Dashboard **System** page (`/system`) shows bot/dashboard online status, uptime, heartbeat age, slash queue length (warn > 0, danger > 5), and cumulative stats since last key reset.

### 3.4 Riot API — puuid migration ✅

All Riot/TFT API calls migrated to puuid-based endpoints:
- `League-v4` now uses `/by-puuid/{puuid}` (summoner ID endpoint deprecated 2024)
- `Champion-Mastery-v4` now uses `/by-puuid/{puuid}`
- Stored account records use `{ riotId, puuid, region, linkedAt }` — no summonerId stored

Region routing uses two separate maps: `accountRouting` for Account-v1 (VN2 → asia), `routing` for Match-v5 (VN2 → sea).

---

## Phase 4 — Real-time Event Queue & Queue Optimization (BLPOP) ⬜

**Mục tiêu:** Tối ưu hóa độ trễ đồng bộ và giảm tải CPU thăm dò (polling wakeups).
- Thay thế `setInterval` + `lpop` (thăm dò 5 giây) bằng cơ chế blocking pop `BLPOP` hoặc Redis Streams/PubSub để bot phản hồi tức thì khi có lệnh từ dashboard.
- Chuẩn hóa toàn bộ giao tiếp liên tiến trình (IPC) qua một danh sách `event_queue` Redis duy nhất:
  ```json
  { "type": "sync_commands", "guildId": "..." }
  { "type": "refresh_guild",  "guildId": "..." }
  { "type": "purge_sessions" }
  ```

---

## Phase 5 — Phân trang & Truy vấn Thành viên Quy mô lớn ⬜

**Mục tiêu:** Giải quyết rủi ro phình bộ nhớ và băng thông của "quả bom" `guild_cache:{id}:members`.
- Triển khai phân trang cho cache thành viên trên Redis (ví dụ: `guild_cache:{id}:members:page:{num}`).
- Thiết lập cơ chế truy vấn động (on-demand live fetch) trực tiếp từ Discord API thông qua bot khi dashboard yêu cầu trang cụ thể đối với các guild có quy mô lớn (>10.000 thành viên).

---

## Phase 6 — Phân tách Domain Repository ⬜

**Mục tiêu:** Thu gọn cấu trúc phình to của `StateStore`.
- Tách file monolithic `StateStore.js` thành các lớp lưu trữ chuyên biệt (Repository Pattern) theo từng domain:
  - `EconomyRepository`
  - `LevelRepository`
  - `WarningRepository`
  - `TicketRepository`
  - `QuizRepository`
  - `RiotAccountRepository`
- Giữ `StateStore` như một Facade mỏng ở cổng vào nếu cần thiết.

---

## Phase 7 — Distributed Riot Static Cache (Redis) ⬜

**Mục tiêu:** Đồng bộ bộ nhớ đệm khi scale-up nhiều bot worker.
- Di chuyển cache tĩnh Riot DDragon (champions, items, runes) từ bộ nhớ trong (in-process memory) sang Redis (`riot:ddragon:champions`, `riot:ddragon:items`).
- Cho phép nhiều instance bot/dashboard chạy song song cùng truy cập một nguồn cache tĩnh chung, tối ưu hóa lượt gọi Riot/DDragon API.

---

## Phase 8 — Advanced System Observability & Tracing ⬜

**Mục tiêu:** Đo lường hiệu năng thực tế cấp production và truy vết lỗi liên tiến trình.
- Bổ sung chỉ số đo lường độ trễ nâng cao:
  - Request latency (p50/p95/p99)
  - Discord Gateway & API latency
  - Redis query execution duration
  - Command execution duration & error rate per command
  - Lavalink reconnect count & memory trends
  - Node.js event loop lag
- **Structured Logging & Request Tracing**:
  - Chuẩn hóa ghi log cấu trúc JSON (sử dụng Winston/Pino) để dễ dàng gom log tập trung (ELK / Grafana Loki / Sentry).
  - Tích hợp **Correlation-ID** (Request Tracing) để theo vết luồng yêu cầu đi từ Dashboard API -> đẩy vào Redis sync queue -> Bot worker xử lý, giúp dễ dàng cô lập và gỡ lỗi (debug) bất đồng bộ.

---

## Phase 9 — Background Workers & Sharding ⬜

**Mục tiêu:** Phân rã tiến trình nặng và phân mảnh (Sharding) khi có >500 guilds.
- Tách các tác vụ nền tốn tài nguyên (reminder polling worker, quiz updates, stats calculation) sang một background worker service riêng biệt.
- Sử dụng Discord.js `ShardingManager` để phân luồng xử lý các phân vùng guild độc lập.

---

## Priority order

```
✅ P1  Guild cache (meta + members split)
✅ P2  Slash sync queue
✅ P3  Heartbeat + observability counters + System page
✅ P4  Riot API puuid migration (League-v4, Mastery-v4, Match-v5)
✅ P4.5 Lavalink Multi-Node Failover & Custom Music UI
✅ P4.6 Audit Logs & Unified Commands Hub (CommandManager removal)
✅ P4.7 Vitest Automated Testing & GitHub Actions CI/CD
⬜ P5  Real-time Event Queue (BLPOP/Streams)
⬜ P6  Member Cache Pagination / On-demand Fetch
⬜ P7  Domain Repository Separation
⬜ P8  Distributed Riot Static Cache (Redis)
⬜ P9  Advanced Observability (p99 latency)
⬜ P10 Background Workers & Sharding
```

---

*Last updated: July 2026. Roadmap updated based on Solution Architect Review.*