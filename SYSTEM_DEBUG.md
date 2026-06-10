# System Debug Guide

> Tài liệu này dành cho khi bot/dashboard hoạt động bất thường trên production.  
> Mỗi mục ghi rõ: triệu chứng → nguyên nhân khả năng → cách kiểm tra → cách fix.

---

## Kiểm tra nhanh trạng thái hệ thống

```bash
# Xem bot + dashboard có online không
curl https://<dashboard-url>/api/status

# Expected response khi mọi thứ OK:
{
  "botReady": true,
  "bot": {
    "online": true,
    "uptimeS": 3600,
    "guilds": 5,
    "lastSeenMs": 8000     ← thời gian kể từ heartbeat cuối, < 90000 là OK
  },
  "dashboard": {
    "online": true,
    "uptimeS": 7200,
    "lastSeenMs": 12000
  },
  "stats": {
    "slashSyncProcessed": 12,
    "guildCacheRefresh": 48,
    "discordErrors": 0,
    "slashQueueLength": 0   ← > 0 nghĩa là có job đang chờ; > 5 là vấn đề
  }
}
```

Nếu không access được `/api/status` → dashboard bị down, xem mục [Dashboard không start được](#dashboard-không-start-được).

---

## Redis key diagnostic

Các key cần check thủ công (qua Upstash console hoặc REST):

```bash
# Heartbeat bot — TTL 90s, mất = bot offline
GET heartbeat:bot

# Heartbeat dashboard
GET heartbeat:dashboard

# Guild cache (thay {id} bằng guild ID thực)
GET guild_cache:{id}
GET guild_cache:{id}:members

# Slash sync queue — nếu > 0 sau vài phút là queue bị stuck
LLEN slash_sync_queue

# Stats counters
GET stats:slash_sync_processed
GET stats:guild_cache_refresh
GET stats:discord_errors

# Config của một guild
GET config:guild:{id}
```

---

## Các lỗi phổ biến

---

### Bot không online

**Triệu chứng:** `/api/status` trả `"bot": { "online": false }` hoặc `botReady: false`.

**Nguyên nhân và cách check:**

1. **Bot process bị crash:**
   - PM2: `pm2 logs discord-bot --lines 50`
   - Render: xem logs tab của service `discord-bot`
   - Tìm dòng `[bot:uncaughtException]` hoặc `[bot:login] Fatal`

2. **DISCORD_TOKEN sai hoặc revoked:**
   - Log sẽ có: `[bot:login] Fatal on attempt 1: TokenInvalid`
   - Fix: tạo token mới trong Discord Developer Portal, cập nhật env var

3. **Redis không kết nối được:**
   - Log sẽ có lỗi từ Upstash (thường `Upstash timeout` hoặc `401`)
   - Check `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`

4. **`heartbeat:bot` key tồn tại nhưng `lastSeenMs` > 90000:**
   - Bot đang chạy nhưng heartbeat bị treo. Restart bot.

---

### Dashboard không start được

**Triệu chứng:** URL dashboard trả 502/503, hoặc `/health` không phản hồi.

**Nguyên nhân và cách check:**

1. **`SESSION_SECRET` quá ngắn:**
   - Log sẽ có: `SESSION_SECRET must be at least 32 characters`
   - Fix: tạo string ngẫu nhiên ≥ 32 ký tự, cập nhật env

2. **OAuth vars thiếu:**
   - `validateServerEnvironment()` sẽ throw và process exit ngay lúc boot
   - Check: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`

3. **`pnpm build:ui` chưa chạy:**
   - Dashboard sẽ start nhưng trả 404 khi vào trang web
   - Fix: chạy lại build, redeploy

4. **Port conflict (VPS):**
   - `EADDRINUSE` trong logs
   - Fix: `pm2 delete discord-dashboard`, sửa `PORT` trong `.env`, start lại

---

### `/api/guild-data` hoặc `/api/members` trả 503

**Triệu chứng:** Dashboard hiện lỗi khi load channel/role dropdowns hoặc danh sách members.

**Nguyên nhân:** Redis cache lạnh (key hết TTL) và bot không online để refresh.

**Cách check:**
```bash
# Check cache còn không
GET guild_cache:{guildId}          # null = hết TTL hoặc chưa có
GET guild_cache:{guildId}:members  # null = tương tự

# Check bot còn online không
GET heartbeat:bot                  # null = bot offline
```

**Cách fix:**

- Nếu bot offline → fix bot trước (xem [Bot không online](#bot-không-online))
- Nếu bot online nhưng cache null → bot sẽ tự refresh trong vòng 10 phút. Hoặc trigger ngay bằng cách restart bot (ClientReady sẽ ghi cache ngay)
- Nếu cache tồn tại nhưng dashboard vẫn 503 → kiểm tra `UPSTASH_REDIS_REST_URL` của dashboard có đúng instance không

---

### Slash commands không cập nhật

**Triệu chứng:** Sau khi thay đổi config, slash commands vẫn cũ.

**Cách check:**
```bash
# Queue có bị stuck không?
LLEN slash_sync_queue

# So sánh: số job đã xử lý có tăng không?
GET stats:slash_sync_processed

# Nếu queue > 0 và processed không tăng → bot không đang poll queue
GET heartbeat:bot
```

**Nguyên nhân và fix:**

1. **Bot offline** → fix bot, queue sẽ được xử lý khi bot restart
2. **Discord API lỗi tạm thời** → bot có retry tối đa 3 lần với backoff. Đợi hoặc trigger slash-sync lại từ dashboard
3. **Slash sync queue bị flood** (nhiều guild cùng lúc) → đợi bot xử lý tuần tự. Mỗi job mất 1-3s
4. **Queue key bị stuck** → Xóa thủ công và trigger lại:
   ```bash
   DEL slash_sync_queue
   # Sau đó bấm "Sync Commands" trong dashboard
   ```

---

### OAuth2 login không hoạt động

**Triệu chứng:** Click "Login with Discord" → lỗi hoặc redirect về trang trắng.

**Cách check:**

1. **DISCORD_REDIRECT_URI sai:**
   - Phải khớp chính xác (kể cả trailing slash) với URI trong Discord Developer Portal
   - Render: `https://<dashboard>.onrender.com/auth/callback`
   - VPS: `https://<domain>/auth/callback`

2. **CLIENT_SECRET sai:**
   - Discord sẽ trả `error: invalid_client`
   - Regenerate secret trong Developer Portal

3. **Cookie/session lỗi:**
   - Xóa cookie `dsession` trong browser, thử lại
   - Nếu vẫn lỗi: `DEL sess:*` trong Redis (xóa tất cả sessions — người dùng sẽ phải login lại)

---

### Bot vào guild nhưng không respond commands

**Triệu chứng:** Bot online, guild có trong `/api/status`, nhưng slash commands không hoạt động trong guild đó.

**Cách check:**

1. **Slash commands chưa sync cho guild đó:**
   - Log bot có `[bot] ✅ Synced X commands → GuildName` không?
   - Nếu không → vào dashboard, bấm "Sync Commands"

2. **Bot thiếu permission:**
   - Bot cần permission: `application.commands` scope khi invite
   - Kiểm tra `/api/invite-url` để lấy URL invite đúng

3. **Command bị tắt trong config:**
   - Kiểm tra `GET config:guild:{guildId}` — field `commands[].enabled`

---

### Memory leak / bot bị restart liên tục (PM2)

**Triệu chứng:** `pm2 status` cho thấy `discord-bot` restart count tăng, hoặc memory > 350 MB.

**Nguyên nhân thường gặp:**
- Music/voice session không được cleanup đúng cách
- Guild có nhiều người dùng đồng thời nhiều game sessions

**Cách debug:**
```bash
pm2 monit                  # Xem memory realtime
pm2 logs discord-bot       # Tìm pattern lỗi trước mỗi restart
```

**Fix tạm thời:** `pm2 restart discord-bot`  
**Fix dài hạn:** Kiểm tra `purgeStaleGameSessions()` có chạy đúng không; Lavalink connection có cleanup khi bot rời voice không.

---

## Upstash console

Truy cập [console.upstash.com](https://console.upstash.com) → chọn database → tab **Data Browser** để:
- Xem tất cả keys đang tồn tại
- Check TTL của từng key
- Xóa key thủ công khi cần

Hoặc dùng REST API trực tiếp:
```bash
curl https://<UPSTASH_URL>/get/heartbeat:bot \
  -H "Authorization: Bearer <UPSTASH_TOKEN>"
```

---

## Log patterns quan trọng

| Log line | Ý nghĩa |
|----------|---------|
| `[bot:login] Fatal on attempt N` | Token sai hoặc network lỗi nghiêm trọng |
| `[bot] ❌ Failed to sync commands for GuildName` | Discord API reject slash sync — thường tạm thời |
| `[guild-cache] ❌ Failed to write cache for {id}` | Redis write thất bại |
| `[slash-queue] Retry N/3 queued for {id}` | Slash sync đang retry — bình thường |
| `[slash-queue] Giving up on {id} after 3 retries` | Slash sync thất bại hoàn toàn — cần trigger lại thủ công |
| `[bot] Shard N disconnected (code X)` | Discord ngắt kết nối — Discord.js tự reconnect |
| `[bot] Client error: ...` | Lỗi Discord client — thường tự phục hồi |
| `[keepalive] /health → 200` | Bình thường, bot tự ping mỗi 5 phút |
