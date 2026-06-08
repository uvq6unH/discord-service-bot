# Discord Bot — Architecture Roadmap

> **Current state:** Split Architecture Phase 1 + 2 complete.  
> Bot và Dashboard chạy độc lập qua Redis data bus.

---

## Status legend
- ✅ Done
- 🔄 In progress
- ⬜ Not started

---

## Phase 1 — Guild Cache Layer ✅

### 1.1 Guild Cache Writer (bot side)
**File:** `src/bot.js`  
**Status:** ✅ Done

Bot writes guild cache to Redis on:
- `ClientReady` — initial write for all guilds
- `GuildCreate` — when bot joins a new guild
- `GuildUpdate` — when guild name/icon changes
- `setInterval` — refresh every 10 minutes

**Redis keys (split to avoid 1MB Upstash limit):**
- `guild_cache:{guildId}` → meta: `{ name, iconURL, channels[], roles[], memberCount, updatedAt }`
- `guild_cache:{guildId}:members` → `members[]` only (scales with guild size)

**TTL:** 15 minutes (900 s) on both keys.

---

### 1.2 Dashboard reads guild_cache (server side)
**File:** `src/server.js`  
**Status:** ✅ Done

Routes:
- `GET /api/guild-data` — reads `guild_cache:{guildId}` (meta key, channels + roles)
- `GET /api/members` — reads `guild_cache:{guildId}:members` (members key)

Fallback: `503` with hint when both Redis cache AND botClient are unavailable.

---

## Phase 2 — Slash Sync Queue ✅

### 2.1 Queue writer (dashboard side)
**File:** `src/server.js` | **Status:** ✅ Done

`POST /api/slash-sync`: pushes `{ guildId, requestedAt }` to Redis list `slash_sync_queue`.  
When `botClient` present (monolith): syncs directly for instant feedback.

### 2.2 Queue worker (bot side)
**File:** `src/bot.js` | **Status:** ✅ Done

Bot polls `slash_sync_queue` every 5 s via `setInterval`.  
On job found: calls `syncGuildCommands(guildId, config)`.

---

## Phase 3 — Stability & Observability

### 3.1 Split members out of guild_cache
**Status:** ✅ Done

`guild_cache:{guildId}` no longer contains `members[]`.  
Members moved to `guild_cache:{guildId}:members` — separate key, separate TTL.  
Prevents 1MB Upstash REST limit breach on guilds with 5,000+ members.

---

### 3.2 Heartbeat
**Status:** ✅ Done  
**Files:** `src/bot.js`, `src/server.js`

Both services write to Redis every 30 s. TTL = 90 s (missing = offline).

| Key | Writer | Payload |
|-----|--------|---------|
| `heartbeat:bot` | `bot.js` | `{ ts, uptimeS, guilds, ready }` |
| `heartbeat:dashboard` | `server.js` | `{ ts, uptimeS }` |

`GET /api/status` reads both keys and returns:
```json
{
  "botReady": true,
  "bot": { "online": true, "uptimeS": 3600, "guilds": 5, "lastSeenMs": 8000, "ts": "..." },
  "dashboard": { "uptimeS": 7200, "ts": "..." }
}
```

---

### 3.3 Observability / metrics
**Status:** ✅ Done  
**Files:** `src/bot.js`, `src/server.js`, `src/upstash.js`, `dashboard/src/pages/System.jsx`

Redis counters incremented by bot (fire-and-forget, non-fatal):

| Key | Incremented on |
|-----|----------------|
| `stats:slash_sync_processed` | Bot completes a slash sync job from queue |
| `stats:guild_cache_refresh` | Bot successfully writes both guild cache keys |
| `stats:discord_errors` | `ShardError` or `Error` event fires on Discord client |

`GET /api/status` now returns `stats` object + `stats.slashQueueLength` (via `LLEN slash_sync_queue`).

Dashboard **Hệ thống** tab (`/system`) shows:
- Bot / Dashboard online status with uptime and last heartbeat age
- Slash sync queue length (warn if >0, danger if >5)
- Cumulative stats counters since last Redis key reset

---

## Phase 4 — Event System (future)

**Status:** ⬜ Not started  
**Trigger:** When slash_sync_queue pattern needs to expand to other event types

Standardise all inter-service communication through a single `event_queue`:
```json
{ "type": "sync_commands", "guildId": "..." }
{ "type": "refresh_guild",  "guildId": "..." }
{ "type": "purge_sessions" }
```

Dashboard sends events, bot reacts. No direct RPC.

---

## Phase 5 — Internal API (future)

**Status:** ⬜ Not started  
**Trigger:** Guild size exceeds ~50,000 members where Redis cache is no longer practical

```
Dashboard → GET /internal/members → Bot → Discord
Dashboard → GET /internal/presence → Bot → Discord
```

Redis remains for cache. Internal API for realtime/on-demand data.

---

## Phase 6 — Replace polling with Redis Streams (future)

**Status:** ⬜ Not started  
**Trigger:** Slash sync queue backlog or multiple bot instances needed

Current `setInterval(..., 5000)` is fine for current scale.  
Redis Streams or Pub/Sub when throughput actually warrants it.

---

## Phase 7 — Sharding (future)

**Status:** ⬜ Not started  
**Trigger:** 500–1,000+ guilds

Redis-first architecture is already shard-ready — no shared in-process state.

---

## Priority order

```
✅ P1  Guild cache split (members key)
✅ P2  Heartbeat (bot + dashboard)
✅ P3  Observability / stats counters + System page
⬜ P4  Event system normalisation
⬜ P5  Internal API
⬜ P6  Redis Streams/PubSub
⬜ P7  Sharding
```

---

*Last updated: Phase 1–3.3 complete. Observability layer live — bot/dashboard heartbeat + stats counters + System dashboard page.*