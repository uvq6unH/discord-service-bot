# Migration Guide — v1 → v2

## 3 thay đổi lớn

| # | Thay đổi | Tác động |
|---|----------|----------|
| 1 | Bot và Dashboard tách thành 2 process | PM2 / Render cần cấu hình mới |
| 2 | Redis key scheme: `guild:{id}:economy:{userId}` thay vì blob | Migration tự động lần đầu |
| 3 | Frontend chuyển sang React + Vite | Cần build trước khi deploy |

---

## 1. Process separation

### PM2 (local / VPS)

```bash
# Khởi động cả 2 process
pm2 start pm2.config.cjs

# Xem status
pm2 status

# Bot riêng
pm2 restart discord-bot
pm2 logs discord-bot

# Dashboard riêng
pm2 restart discord-dashboard
pm2 logs discord-dashboard
```

Lợi ích: memory leak trong music/games **không còn crash dashboard**.

### Render.com

- Bot: deploy as **Worker** (`src/index.bot.js`) — không cần health check
- Dashboard: deploy as **Web** (`src/index.server.js`) — health check `/health`
- Cả 2 đều cần cùng `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`

### Monolith vẫn dùng được

`src/index.js` **không bị thay đổi** — vẫn chạy cả bot lẫn dashboard trong 1 process như cũ. Chỉ cần thêm `--` flag hoặc không thay đổi gì.

---

## 2. Redis key migration

### Scheme cũ (v1)
```
guild:{guildId}  →  JSON blob toàn bộ guild data
```

### Scheme mới (v2)
```
guild:{guildId}:economy:{userId}        →  JSON user economy
guild:{guildId}:economy:_members        →  Set userId (cho leaderboard)
guild:{guildId}:levels:{userId}         →  JSON user xp/level
guild:{guildId}:levels:_members         →  Set userId (cho leaderboard)
guild:{guildId}:warnings:{userId}       →  JSON array warnings
guild:{guildId}:tickets:nextNumber      →  string number
guild:{guildId}:game:{type}:{msgId}     →  JSON game session
guild:{guildId}:lolAccount:{userId}     →  JSON riot account
guild:{guildId}:tftAccount:{userId}     →  JSON riot account
guild:index                             →  Set guildId
```

### Migration tự động

Khi bot khởi động và gặp blob cũ (`guild:{id}`), `StateStore` sẽ:

1. Đọc blob cũ
2. Ghi từng granular key
3. Backup blob → `guild:{id}:migrated_backup` (TTL 24h)
4. Xóa blob cũ

**Không cần làm gì thủ công.**

### Rollback

Nếu cần rollback về v1:
```bash
# Khôi phục backup blob (trong vòng 24h)
redis-cli RESTORE guild:GUILDID 0 "$(redis-cli GET guild:GUILDID:migrated_backup)"
```

---

## 3. React Frontend

### Build

```bash
# Lần đầu / sau khi thay đổi UI
pnpm build:ui

# Output: public-react/
# Express tự detect và serve từ đây thay vì public/
```

### Dev mode

```bash
# Terminal 1: Express API server
node src/index.server.js

# Terminal 2: Vite dev server với HMR
pnpm dev:ui
# → http://localhost:5173
# → Proxy /api và /auth tự động sang localhost:10001
```

### Cấu trúc

```
dashboard/
  src/
    main.jsx              # Entry point
    App.jsx               # Layout shell + routing
    api.js                # Centralized fetch client (CSRF + auth)
    contexts/
      AuthContext.jsx      # useAuth() — user info
      GuildContext.jsx     # useGuild() — selected guild + config
    components/
      ServerRail.jsx       # Thanh icon guild bên trái
      PluginNav.jsx        # Nav item (Overview, Members, …)
      ui.jsx               # SaveBar, Toggle, ChannelSelect, … (shared)
    pages/
      Overview.jsx         # Cài đặt chung
      Members.jsx          # Danh sách thành viên
      Commands.jsx         # Lệnh + auto reply
      Economy.jsx          # Tiền ảo + game
      Moderation.jsx       # AutoMod + Ticket + Role
      Lol.jsx              # LoL & TFT API
      Login.jsx            # Trang login
    styles/
      globals.css          # Toàn bộ CSS (port từ styles.css cũ)
```

### Thêm page mới

```jsx
// 1. Tạo file mới: dashboard/src/pages/MyPage.jsx
import React from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { SectionCard, Toggle } from '../components/ui.jsx';

export default function MyPage() {
  const { config, updateConfig } = useGuild();
  return (
    <div className="page">
      <h1 className="page-title">My Feature</h1>
      <SectionCard title="Settings" icon="ti-settings">
        <Toggle
          label="Enable feature"
          checked={config.myFeatureEnabled ?? false}
          onChange={v => updateConfig({ myFeatureEnabled: v })}
        />
      </SectionCard>
    </div>
  );
}

// 2. Thêm vào App.jsx Routes
// 3. Thêm vào PluginNav.jsx NAV_ITEMS
```

---

## Checklist triển khai

- [ ] `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN` set trên cả 2 service
- [ ] Bot service: `DISCORD_TOKEN` set
- [ ] Dashboard service: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `SESSION_SECRET` set
- [ ] Chạy `pnpm build:ui` trước khi deploy dashboard
- [ ] Kiểm tra `/health` trả `{"status":"ok"}` sau khi deploy
- [ ] Lần đầu sau deploy: login dashboard, chọn guild → migration Redis tự động chạy

---

## Files thay đổi

| File | Thay đổi |
|------|----------|
| `src/index.js` | Không thay đổi (monolith vẫn dùng được) |
| `src/index.bot.js` | **Mới** — Bot-only entry |
| `src/index.server.js` | **Mới** — Dashboard-only entry |
| `src/env.js` | Tách thành `validateBotEnvironment()` và `validateServerEnvironment()` |
| `src/stateStore.js` | **Viết lại** — Granular Redis keys + auto migration |
| `src/server.js` | Patch — handle `botClient === null`, serve React build, SPA fallback |
| `pm2.config.cjs` | **Viết lại** — 2 app: `discord-bot` + `discord-dashboard` |
| `render.yaml` | **Viết lại** — Worker + Web service |
| `dashboard/` | **Mới** — React + Vite app |
| `pnpm-workspace.yaml` | Thêm `dashboard` workspace |
