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

## Phase 4 — Event System ⬜

**Trigger:** When `slash_sync_queue` pattern needs to expand to other cross-process event types.

Standardise all inter-service communication through a single `event_queue` Redis list:
```json
{ "type": "sync_commands", "guildId": "..." }
{ "type": "refresh_guild",  "guildId": "..." }
{ "type": "purge_sessions" }
```

Bot consumes events and reacts. No direct RPC. Replaces the current dedicated `slash_sync_queue` key.

---

## Phase 5 — Internal Bot API ⬜

**Trigger:** Guild size exceeds ~50,000 members where Redis cache is no longer practical.

```
Dashboard → GET /internal/members  → Bot → Discord (live fetch)
Dashboard → GET /internal/presence → Bot → Discord (live fetch)
```

Redis remains the primary cache. Internal API handles on-demand realtime data.

---

## Phase 6 — Redis Streams ⬜

**Trigger:** Slash sync queue backlog, or multiple bot instances needed.

Replace `setInterval` + `lpop` polling (currently 5 s interval) with Redis Streams or Pub/Sub for lower latency and better multi-consumer support.

Current polling is fine at current scale. Revisit when throughput warrants it.

---

## Phase 7 — Sharding ⬜

**Trigger:** 500–1,000+ guilds.

Redis-first architecture is already shard-ready — no shared in-process state. Add Discord.js `ShardingManager` and partition guild cache writes by shard.

---

## Priority order

```
✅ P1  Guild cache (meta + members split)
✅ P2  Slash sync queue
✅ P3  Heartbeat + observability counters + System page
✅ P4  Riot API puuid migration (League-v4, Mastery-v4, Match-v5)
⬜ P5  Event system normalisation
⬜ P6  Internal bot API
⬜ P7  Redis Streams / Pub/Sub
⬜ P8  Sharding
```

---

*Last updated: Phases 1–3 complete + Riot puuid migration. Split architecture stable in production.*