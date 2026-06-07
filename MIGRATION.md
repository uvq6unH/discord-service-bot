# Migration Guide — v1 → v2

## 3 thay đổi lớn

| # | Thay đổi | Tác động |
|---|----------|----------|
| 1 | Bot và Dashboard tách thành 2 process (hoặc chạy monolith) | PM2 / Render cần cấu hình mới |
| 2 | Redis key scheme: granular `guild:{id}:economy:{userId}` thay vì blob | Migration tự động lần đầu |
| 3 | Frontend chuyển sang React + Vite | Build trước khi deploy |

---

## 1. Chọn chế độ deploy

### Chế độ A — Monolith (1 process)

Phù hợp: Render Free, VPS đơn giản, muốn dashboard thấy bot guild cache đầy đủ.

```bash
# Local dev
node src/index.js

# Render: 1 Web service
# Build:  pnpm install && pnpm build:ui
# Start:  node src/index.js
# Health: /health
```

Tất cả env vars cần set (bot + dashboard + Redis). Xem bảng trong ARCHITECTURE.md.

---

### Chế độ B — 2 process (Bot + Dashboard riêng biệt)

Phù hợp: Render Starter ($7/service), cần isolate crash bot khỏi dashboard.

**Giới hạn khi dùng 2 process:**
- `GET /api/guild-data` → 503 (channels/roles cần bot cache)
- `GET /api/members` → 503
- `POST /api/slash-sync` → 503

Những route này chỉ hoạt động đầy đủ trong Chế độ A (monolith).

```bash
# PM2
pm2 start pm2.config.cjs

# Render: dùng render.yaml (2 service: worker + web)
```

**Lưu ý quan trọng — không dùng disk persistent:**
Render không share disk giữa 2 service. Nếu dùng `CONFIG_PATH`/`STATE_PATH` trỏ vào disk riêng, mỗi service sẽ có file JSON khác nhau → desync. Production **bắt buộc** dùng Upstash Redis làm source of truth.

---

## 2. Redis key migration

### Scheme cũ (v1)
```
guild:{guildId}  →  JSON blob toàn bộ guild data
```

### Scheme mới (v2)
```
guild:{guildId}:economy:{userId}     →  JSON user economy
guild:{guildId}:economy:_members     →  Set userId
guild:{guildId}:levels:{userId}      →  JSON user xp/level
guild:{guildId}:levels:_members      →  Set userId
guild:{guildId}:warnings:{userId}    →  JSON array warnings
guild:{guildId}:tickets:nextNumber   →  string number
guild:{guildId}:game:{type}:{msgId}  →  JSON game session
guild:{guildId}:lolAccount:{userId}  →  JSON riot account
guild:{guildId}:tftAccount:{userId}  →  JSON riot account
guild:index                          →  Set guildId
```

### Migration tự động

Khi bot khởi động và gặp blob cũ (`guild:{id}`), `StateStore` sẽ:

1. Đọc blob cũ
2. Ghi từng granular key
3. Backup blob → `guild:{id}:migrated_backup` (TTL 24h)
4. Xóa blob cũ

**Không cần làm gì thủ công.**

### Rollback (trong vòng 24h)

```bash
# Lấy backup và restore (ví dụ với redis-cli)
redis-cli RESTORE guild:GUILDID 0 "$(redis-cli GET guild:GUILDID:migrated_backup)"
```

---

## 3. React Frontend

### Build

```bash
pnpm build:ui     # → public-react/
# Express tự serve từ public-react/
```

### Dev mode

```bash
# Terminal 1: Express API
node src/index.server.js    # :10001

# Terminal 2: Vite dev server (HMR)
pnpm dev:ui                 # :5173, proxy /api + /auth → :10001
```

---

## Checklist triển khai

### Monolith (Render Free / VPS)
- [ ] Set tất cả env vars (DISCORD_TOKEN, DISCORD_CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SESSION_SECRET, UPSTASH_*)
- [ ] `pnpm build:ui` trước khi deploy
- [ ] Start: `node src/index.js`
- [ ] Kiểm tra `/health` → `{"status":"ok"}`

### 2 Process (Render Starter)
- [ ] **Bot service** (Worker): DISCORD_TOKEN, UPSTASH_*, LAVALINK_* (nếu dùng)
- [ ] **Dashboard service** (Web): DISCORD_CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SESSION_SECRET, UPSTASH_*
- [ ] Cả 2 service dùng cùng UPSTASH_REDIS_REST_URL + TOKEN
- [ ] **Không** set CONFIG_PATH / STATE_PATH trong Render env (dùng Redis only)
- [ ] Dashboard: `pnpm build:ui` trong buildCommand
- [ ] Kiểm tra `/health` → `{"status":"ok"}`
- [ ] Lần đầu: login dashboard → chọn guild → migration Redis tự động chạy

---

## Files thay đổi (so với v1)

| File | Thay đổi |
|------|----------|
| `src/index.js` | **Viết lại** — monolith bootstrap thực sự (không còn 2 dòng import) |
| `src/index.bot.js` | **Mới** — Bot-only entry |
| `src/index.server.js` | **Mới** — Dashboard-only entry |
| `src/env.js` | Tách `validateBotEnvironment()` + `validateServerEnvironment()` + `validateEnvironment()` |
| `src/bot.js` | `startKeepalive` tách thành export riêng (không còn auto-chạy trong createBot) |
| `src/stateStore.js` | **Viết lại** — Granular Redis keys + auto migration |
| `src/server.js` | `/api/state` dùng stateStore trực tiếp; `botClient` null-safe; PUT thay POST cho config |
| `src/auth.js` | `requireGuildAccess` null-safe với `botClient?.guilds?.cache` |
| `pm2.config.cjs` | **Viết lại** — 2 app: discord-bot + discord-dashboard |
| `render.yaml` | **Viết lại** — Worker + Web, không có persistent disk |
| `dashboard/` | **Mới** — React + Vite app |
| `package.json` | `start` → `node src/index.js`; bỏ test scripts trỏ scripts/ |
