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

Nếu không access được `/api/status` → dashboard bị down.

---

## Redis key diagnostic

Các key cần check thủ công (qua Upstash console hoặc REST):

```bash
# Heartbeat bot — TTL 90s, mất = bot offline
GET heartbeat:bot

# Heartbeat dashboard
GET heartbeat:dashboard

# Audit logs của một guild
GET guild:{id}:audit_logs

# Guild cache (thay {id} bằng guild ID thực)
GET guild_cache:{id}
GET guild_cache:{id}:members

# Slash sync queue — nếu > 0 sau vài phút là queue bị stuck
LLEN slash_sync_queue

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
   - Render: xem logs tab của service `discord-bot`
   - Tìm dòng `[bot:uncaughtException]` hoặc `[bot:login] Fatal`

2. **DISCORD_TOKEN sai hoặc revoked:**
   - Log sẽ có: `[bot:login] Fatal on attempt 1: TokenInvalid`
   - Fix: tạo token mới trong Discord Developer Portal, cập nhật env var trên Render

3. **Redis không kết nối được:**
   - Log sẽ có lỗi từ Upstash (thường `Upstash timeout` hoặc `401`)
   - Check `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`

4. **`heartbeat:bot` key tồn tại nhưng `lastSeenMs` > 90000:**
   - Bot đang chạy nhưng heartbeat bị treo. Manual restart bot trên Render.

---

### Lavalink Node bị lỗi 403 / 301 / ENOTFOUND

**Triệu chứng:** Log hiển thị `[lavalink] ❌ Node "main" error: Unexpected server response: 403` hoặc `301`.

**Nguyên nhân:**
- Server Lavalink công cộng hoặc tự host bị đổi password, ép cổng mã hóa WSS (443), hoặc dừng dịch vụ.

**Cách khắc phục:**
- Hệ thống đã tích hợp **Multi-Node Failover pool** (`main`, `public-darren`, `public-jirayu`).
- `lavalink-client` v2 sẽ tự động chuyển mạch sang Node dự phòng tiếp theo mà không làm crash Bot.
- Nếu muốn dùng Node riêng: cập nhật `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`, `LAVALINK_SECURE=true` trên Render.

---

### Dashboard OAuth2 Redirect Error

**Triệu chứng:** Đăng nhập Dashboard qua Discord bị báo `invalid_redirect_uri`.

**Khắc phục:**
1. Check `DISCORD_REDIRECT_URI` trên Render:
   `https://<dashboard-domain>.onrender.com/auth/callback`
2. Cập nhật URI này trong Discord Developer Portal → OAuth2 → Redirects.

---

## Log patterns quan trọng

| Log line | Ý nghĩa |
|----------|---------|
| `[bot:login] Fatal on attempt N` | Token sai hoặc network lỗi nghiêm trọng |
| `[bot] ❌ Failed to sync commands for GuildName` | Discord API reject slash sync — thường tạm thời |
| `[guild-cache] ❌ Failed to write cache for {id}` | Redis write thất bại |
| `[lavalink] 🔄 Node "X" reconnecting…` | Lavalink đang chuyển mạch hoặc tự kết nối lại |
| `[slash-queue] Retry N/3 queued for {id}` | Slash sync đang retry — bình thường |
| `[heartbeat] Bot heartbeat started` | Bot heartbeat bình thường |
