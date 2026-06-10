# Deployment Guide

> **Architecture:** Split mode — 2 process độc lập giao tiếp qua Upstash Redis.  
> Bot crash không kéo dashboard, dashboard restart không ảnh hưởng bot.

---

## Tổng quan

```
┌─────────────────────┐     Upstash Redis     ┌──────────────────────┐
│   discord-bot       │ ◄── shared state ───► │  discord-dashboard   │
│   index.bot.js      │    config, cache,      │  index.server.js     │
│                     │    queue, heartbeat    │                      │
│   PORT: 10000       │                        │   PORT: 10001 (VPS)  │
│   /health           │                        │   PORT: 10000 (Render)│
└─────────────────────┘                        └──────────────────────┘
         │                                               │
   Discord Gateway                               React SPA (built)
   Lavalink (audio)                              OAuth2 / Sessions
```

**Không có disk persistent.** Mọi state đều nằm trong Redis. Không set `CONFIG_PATH` hay `STATE_PATH` trên production.

---

## Service 1 — discord-bot

**Entry point:** `node src/index.bot.js`

**Chức năng:**
- Kết nối Discord Gateway (slash commands, messages, interactions)
- Lavalink (music)
- Ghi `guild_cache` vào Redis
- Poll `slash_sync_queue` mỗi 5 s
- Ghi `heartbeat:bot` mỗi 30 s

**Environment variables:**

| Biến | Bắt buộc | Ghi chú |
|------|----------|---------|
| `DISCORD_TOKEN` | ✅ | Bot token từ Discord Developer Portal |
| `DISCORD_CLIENT_ID` | ✅ | Application ID (dùng để build slash commands) |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash → REST API → Endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash → REST API → Read/Write token |
| `RIOT_API_KEY` | tùy | Cần nếu dùng lệnh `/lol-*` |
| `TFT_API_KEY` | tùy | Cần nếu dùng lệnh `/tft-*` |
| `LAVALINK_HOST` | tùy | Cần nếu dùng music commands |
| `LAVALINK_PORT` | tùy | Mặc định: `2333` |
| `LAVALINK_PASSWORD` | tùy | |
| `LAVALINK_SECURE` | tùy | `true` / `false`, mặc định `false` |
| `KEEPALIVE_CHANNEL_ID` | tùy | Channel ID để bot gửi tin giữ kết nối |
| `NODE_ENV` | ✅ | Luôn `production` |
| `PORT` | ✅ | Port cho HTTP health server. Render: `10000` |
| `COMMAND_COOLDOWN_MS` | — | Mặc định: `3000` |
| `RIOT_COMMAND_COOLDOWN_MS` | — | Mặc định: `15000` |
| `GAME_COMMAND_COOLDOWN_MS` | — | Mặc định: `5000` |
| `DAILY_RESET_UTC_OFFSET_MINUTES` | — | Offset múi giờ để reset daily. VN: `420` |

**Boot sequence:**
```
1. sodium.ready                          (voice encryption)
2. validateBotEnvironment()
3. createUpstashFromEnv()
4. ConfigStore + StateStore init
5. createBot()
6. http.createServer().listen(PORT)      ← port bind TRƯỚC khi login
   → /health trả 200 ngay (bot tag null cho đến khi login xong)
7. loginWithRetry()                      ← tối đa 10 lần, backoff tới 30s
```

**Expected boot logs (thứ tự):**
```
[bot:health] HTTP health server listening on port 10000
[bot] Logged in to Discord.
Discord bot logged in as BotName#0000
[bot] Syncing slash commands for N guild(s)...
[bot] ✅ Synced X commands → GuildName (id)
[bot] Command sync complete: N/N guilds OK
[guild-cache] Writing initial cache for N guild(s)...
[guild-cache] ✅ GuildName (id) — meta 12KB, members 48 (8KB)
[slash-queue] Worker started — polling every 5s, max 3 retries
[heartbeat] Bot heartbeat started — writing every 30s
[keepalive] Started — pinging /health every 5 min on port 10000
```

---

## Service 2 — discord-dashboard

**Entry point:** `node src/index.server.js`  
**Build step (bắt buộc trước deploy):** `pnpm install --no-frozen-lockfile && pnpm build:ui`

**Chức năng:**
- Express API server
- Serve React SPA từ `public-react/`
- Discord OAuth2 (`/auth/login`, `/auth/callback`)
- Session management qua Upstash Redis
- Ghi `heartbeat:dashboard` mỗi 30 s

**Environment variables:**

| Biến | Bắt buộc | Ghi chú |
|------|----------|---------|
| `DISCORD_CLIENT_ID` | ✅ | Application ID |
| `DISCORD_CLIENT_SECRET` | ✅ | OAuth2 Client Secret |
| `DISCORD_REDIRECT_URI` | ✅ | Phải khớp với OAuth2 redirect trong Developer Portal |
| `SESSION_SECRET` | ✅ | Tối thiểu 32 ký tự, random string |
| `UPSTASH_REDIS_REST_URL` | ✅ | Cùng instance với bot |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Cùng token với bot |
| `NODE_ENV` | ✅ | Luôn `production` |
| `PORT` | ✅ | Render: `10000`. VPS (PM2): `10001` |

**Boot sequence:**
```
1. validateServerEnvironment()    (kiểm tra OAuth vars + SESSION_SECRET ≥ 32 chars)
2. createUpstashFromEnv()
3. ConfigStore + StateStore init  (kết nối Redis, không cần Discord)
4. createServer({ botClient: null, ... })
5. app.listen(PORT)
```

**Expected boot logs:**
```
[server] Dashboard running at http://localhost:10001
[heartbeat] Dashboard heartbeat started — writing every 30s
```

---

## Deploy trên Render.com

### Yêu cầu

- Render Starter plan ($7/tháng/service) cho cả hai service
- 1 Upstash Redis instance (free tier đủ dùng)
- Cùng một repo GitHub

### Cấu hình (`render.yaml` đã có sẵn)

Cả hai service deploy dưới dạng `type: web` với `healthCheckPath: /health`.

Bot bind HTTP port ngay khi process start (trước `client.login()`) — đây là yêu cầu bắt buộc để Render detect port và không kill process trong quá trình boot.

**Bước deploy:**

```bash
git push origin main
```

Render tự build và deploy cả hai service theo `render.yaml`.

**DISCORD_REDIRECT_URI phải là:**
```
https://<tên-dashboard-service>.onrender.com/auth/callback
```

Cập nhật URI này trong Discord Developer Portal → OAuth2 → Redirects.

---

## Deploy trên VPS (PM2)

### Yêu cầu

- Node.js 20+
- pnpm
- PM2 (`npm install -g pm2`)

### Lần đầu setup

```bash
git clone <repo>
cd discord-service-bot
cp .env.example .env
# Điền đầy đủ biến môi trường vào .env

pnpm install --no-frozen-lockfile
pnpm build:ui

mkdir -p logs
pm2 start pm2.config.cjs
pm2 save
pm2 startup    # Tạo systemd service để auto-start khi reboot
```

### Các lệnh thường dùng

```bash
pm2 status                        # Xem trạng thái cả 2 process
pm2 logs discord-bot              # Log bot real-time
pm2 logs discord-dashboard        # Log dashboard real-time
pm2 restart discord-bot           # Restart bot không ảnh hưởng dashboard
pm2 restart discord-dashboard     # Restart dashboard không ảnh hưởng bot
pm2 restart all                   # Restart cả hai
```

### Update code

```bash
git pull origin main
pnpm install --no-frozen-lockfile
pnpm build:ui                     # Chỉ cần nếu dashboard có thay đổi
pm2 restart all
```

---

## Memory limits (PM2)

| Process | Limit | Lý do |
|---------|-------|-------|
| `discord-bot` | 350 MB | Voice/music buffers, Lavalink client |
| `discord-dashboard` | 150 MB | Chỉ Express + sessions |

Khi vượt ngưỡng, PM2 tự restart process đó — không ảnh hưởng process còn lại.

---

## Lavalink (Music)

Lavalink chạy như một service riêng (Java). Hai lựa chọn:

**Option A — Self-host trên Fly.io (có `lavalink/fly.toml`):**
```bash
cd lavalink
flyctl deploy
```

**Option B — Public node (chỉ dùng để test):**
```
LAVALINK_HOST=lavalink.darrennathanael.com
LAVALINK_PORT=80
LAVALINK_PASSWORD=LL.darrennathanael.com
LAVALINK_SECURE=false
```

Nếu không cần music, bỏ qua toàn bộ Lavalink env vars — bot sẽ skip init Lavalink mà không crash.

---

## Checklist deploy mới

```
□ DISCORD_REDIRECT_URI khớp với OAuth2 redirect trong Developer Portal
□ SESSION_SECRET dài ít nhất 32 ký tự
□ UPSTASH_REDIS_REST_URL và _TOKEN giống nhau trên cả 2 service
□ pnpm build:ui đã chạy trước khi deploy dashboard
□ Không set CONFIG_PATH hay STATE_PATH trên production
□ NODE_ENV=production trên cả 2 service
□ Bot boot log có: "Command sync complete" và "[heartbeat] Bot heartbeat started"
□ Dashboard boot log có: "[server] Dashboard running"
□ /api/status trả về botReady: true sau khoảng 30s
```