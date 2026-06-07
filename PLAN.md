# Split Architecture — Completion Plan

> **Goal:** Hoàn thiện Split mode (Mode B) để dashboard không còn phụ thuộc `botClient` trực tiếp.  
> **Server size:** ~100 members, growing — full member cache is acceptable.

---

## Status legend
- ✅ Done
- 🔄 In progress
- ⬜ Not started

---

## Phase 1 — Guild Cache Layer

### 1.1 Guild Cache Writer (bot side)
**File:** `src/bot.js`  
**Status:** ✅ Done

Bot writes `guild_cache:{guildId}` to Redis on:
- `ClientReady` — initial write for all guilds
- `GuildCreate` — when bot joins a new guild
- `GuildUpdate` — when guild name/icon changes
- `setInterval` — refresh every 10 minutes

**Redis key:** `guild_cache:{guildId}`  
**Payload:** `{ name, iconURL, channels[], roles[], members[], memberCount, updatedAt }`  
**TTL:** 15 minutes (900 seconds)

---

### 1.2 Dashboard reads guild_cache (server side)
**Files:** `src/server.js`  
**Status:** ✅ Done

Routes updated:
- `GET /api/guild-data` — reads `guild_cache:{guildId}` from Redis instead of `botClient.guilds.cache`
- `GET /api/members` — reads members array from `guild_cache:{guildId}`

Fallback behavior when cache is missing:
- Returns `503` with message: `"Guild cache not available. Bot may be offline or guild not yet cached."`
- Cache age is included in response: `{ cachedAt: ISO, staleAfterMs: 900000 }`

---

## Phase 2 — Slash Sync Queue

### 2.1 Queue writer (dashboard side)
**File:** `src/server.js`  
**Status:** ✅ Done

`POST /api/slash-sync` no longer returns 503 when `botClient = null`.  
Instead: pushes a job `{ guildId, requestedAt }` to Redis list `slash_sync_queue`.  
Returns `{ queued: true, message: "Slash sync queued. Bot will process within 5 seconds." }`.

When `botClient` is present (monolith): still syncs directly for instant feedback.

---

### 2.2 Queue worker (bot side)
**File:** `src/bot.js`  
**Status:** ✅ Done

Bot polls `slash_sync_queue` every 5 seconds via `setInterval`.  
On job found: calls `syncGuildCommands(guildId, config)` and logs result.  
On error: logs but does not crash — queue job is consumed regardless.

---

## Phase 3 — Members & Guild Data (future)

### 3.1 Pagination for large guilds
**Status:** ⬜ Not started  
**Trigger:** When member count exceeds ~1,000

When needed:
- Split members out of `guild_cache` into separate paginated keys
- Add `GET /api/members?page=N&limit=100` backed by Redis

Not needed yet at current server size.

---

### 3.2 Bot heartbeat / online status in dashboard
**Status:** ⬜ Not started

Bot writes `bot_heartbeat` key to Redis every 30 seconds.  
Dashboard `/api/status` reads it to show real bot online/offline state in split mode.

---

## Summary

| Component | Status |
|-----------|--------|
| Guild Cache Writer (bot) | ✅ Done |
| Dashboard reads guild_cache | ✅ Done |
| Slash Sync Queue (dashboard side) | ✅ Done |
| Slash Sync Worker (bot side) | ✅ Done |
| Members pagination (large guilds) | ⬜ Not started |
| Bot heartbeat | ⬜ Not started |

---

*Last updated: Phase 1 + Phase 2 complete — Split mode now fully functional for servers under ~1,000 members.*
