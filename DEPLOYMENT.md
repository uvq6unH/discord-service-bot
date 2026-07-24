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
│   PORT: 10000       │                        │   PORT: 10000 (Render)│
│   /health           │                        │                      │
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
- Lavalink Multi-Node Pool (music)
- Ghi `guild_cache` vào Redis
- Tiêu thụ sự kiện liên tiến trình từ `event_queue` thời gian thực (`BLPOP` / Fast-drain 0ms latency)
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
| `LAVALINK_HOST` | tùy | Host Lavalink chính |
| `LAVALINK_PORT` | tùy | Port Lavalink (mặc định: `443` nếu secure, `2333` nếu http) |
| `LAVALINK_PASSWORD` | tùy | Mật khẩu kết nối Lavalink |
| `LAVALINK_SECURE` | tùy | `true` / `false` (mặc định `true`) |
| `NODE_ENV` | ✅ | Luôn `production` |
| `PORT` | ✅ | Port cho HTTP health server (`10000`) |

---

## Service 2 — discord-dashboard

**Entry point:** `node src/index.server.js`

**Chức năng:**
- Phục vụ React SPA Frontend
- REST API Server (`/api/config`, `/api/guilds/:id/audit-logs`, `/api/guilds/:id/command-toggle`, `/api/slash-sync`)
- Discord OAuth2 Login (`/auth/login`, `/auth/callback`)
- Ghi `heartbeat:dashboard` mỗi 30 s

**Environment variables:**

| Biến | Bắt buộc | Ghi chú |
|------|----------|---------|
| `DISCORD_CLIENT_ID` | ✅ | Application ID |
| `DISCORD_CLIENT_SECRET` | ✅ | Application Secret |
| `DISCORD_REDIRECT_URI` | ✅ | `https://<dashboard-domain>/auth/callback` |
| `SESSION_SECRET` | ✅ | Chuỗi ngẫu nhiên dài ít nhất 32 ký tự |
| `UPSTASH_REDIS_REST_URL` | ✅ | Giống hệt Bot Service |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Giống hệt Bot Service |
| `NODE_ENV` | ✅ | Luôn `production` |
| `PORT` | ✅ | Port Web Server (`10000` trên Render) |

---

## Triển khai Render Split-Account (100% Free Tier)

Để tránh cạn kiệt 750 giờ miễn phí hàng tháng của Render:

1. **Tài khoản Render A (`discord-bot`)**:
   - Web Service Name: `discord-bot`
   - Build Command: `pnpm install --no-frozen-lockfile`
   - Start Command: `node src/index.bot.js`
   - Bind Port: `10000`

2. **Tài khoản Render B (`discord-dashboard`)**:
   - Web Service Name: `discord-dashboard`
   - Build Command: `pnpm install --no-frozen-lockfile && pnpm build:ui`
   - Start Command: `node src/index.server.js`
   - Bind Port: `10000`

3. **UptimeRobot Keep-alive**:
   - Thêm Monitor 1 (HTTP 5 min): `https://<bot-service>.onrender.com/health`
   - Thêm Monitor 2 (HTTP 5 min): `https://<dashboard-service>.onrender.com/api/status`

---

## Lavalink Multi-Node Failover

Hệ thống tự động sử dụng mảng Node Pool:
1. `main` (Cấu hình từ biến môi trường `LAVALINK_HOST`)
2. `public-darren` (`lavalink.darrennathanael.com:443`, secure: true)
3. `public-jirayu` (`lavalink.jirayu.net:13592`, secure: false)

Nếu Node chính bị lỗi `403 Forbidden` hoặc ngắt kết nối, `lavalink-client` v2 sẽ tự động Failover sang Node dự phòng đang hoạt động.

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
□ UptimeRobot HTTP monitors đã được tạo cho cả 2 services
```