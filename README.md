# Discord Service Bot & Community Operations Platform

> Một hệ thống bot Discord đa chức năng và bảng quản trị (Dashboard) trực quan giúp tự động hóa và vận hành máy chủ Discord hiệu quả.

Hệ thống được thiết kế theo kiến trúc **mô-đun hóa 2 tiến trình độc lập (Split-Mode Architecture)** và **dữ liệu tập trung qua Upstash Redis**, đảm bảo tính ổn định tối đa và khả năng mở rộng không giới hạn.

---

## 🚀 Tính năng nổi bật

- **Quản trị server (Moderation)**: Cảnh cáo, kick, ban, xóa tin nhắn (purge), tự động kiểm duyệt link/từ cấm (Anti-spam/AutoMod), và hệ thống Ticket hỗ trợ thành viên.
- **Nhật ký quản trị (Audit Logs)**: Ghi vết toàn bộ lịch sử thay đổi cấu hình, bật/tắt lệnh từ Admin trên Dashboard.
- **Kinh tế & Giải trí (Economy & Games)**: Đồng bạc (Silver), vàng (Gold) và kim cương (Diamond), quà tặng hàng ngày (`/daily`), cá cược giải trí (Blackjack, Coinflip, Slots, Video Poker).
- **Hệ thống cấp độ (XP & Leveling)**: Tự động cộng XP nguyên tử (atomic Lua scripts) khi tương tác trong kênh chat và hiển thị bảng xếp hạng trực tiếp.
- **Tích hợp Riot Games (League & TFT)**: Liên kết tài khoản bằng Riot ID (`puuid`), kiểm tra lịch sử đấu, thông tin người chơi, và game đố vui LoLdle.
- **Hệ thống nhạc cao cấp (Music & Lavalink v4)**:
  - Nghe nhạc chất lượng cao với Lavalink v4.
  - Tự động kết nối **Multi-Node Pool** (tự động chuyển sang Node dự phòng khi Node chính gặp sự cố).
  - Giao diện Embed nhạc tùy biến hiển thị thanh tiến trình phát nhạc và **danh sách hàng chờ queue** phía dưới.
  - Nút bấm điều khiển tương tác trực tiếp (Pause/Resume, Skip, Stop, Shuffle, Vol+).
- **Bảng điều khiển trực quan (Dashboard SPA & PWA)**:
  - Cấu hình bot, quản lý thành viên, xem thông số vận hành (Telemetry, Heartbeat, Slash command sync status).
  - Hỗ trợ PWA (Progressive Web App) cài đặt mượt mà trên thiết bị di động.

---

## 🛠️ Công nghệ sử dụng

- **Core Engine**: Node.js 20+ (ESM), Discord.js v14
- **Database / Cache**: Upstash Redis (REST client tự thiết kế qua `fetch`, không phụ thuộc TCP socket)
- **Dashboard Backend**: Express.js v5, Helmet (CSP whitelists), Session Store qua Redis
- **Dashboard Frontend**: React 18 (SPA), Vite, Vanilla CSS với Design System tokenized (Telemetry Theme), Framer Motion, PWA Manifest
- **Audio Engine**: Lavalink Client v2 / Lavalink v4 Node Pool
- **Testing & CI/CD**: Vitest, GitHub Actions Workflow (`.github/workflows/ci.yml`)

---

## 📐 Kiến trúc hệ thống

Dự án hỗ trợ hai chế độ chạy linh hoạt:

1. **Mode A — Monolith (1 process)**: Thích hợp cho môi trường local dev.
   - Chạy cả Bot và Dashboard API trong cùng 1 process (`src/index.js`).
2. **Mode B — Split (2 processes)**: Đề xuất cho Production (Render.com, Cloud VPS).
   - **Bot service** (`src/index.bot.js`): Phụ trách Gateway Discord, Slash commands, XP handler, và Audio pipeline.
   - **Dashboard service** (`src/index.server.js`): Đóng vai trò Web Server phục vụ REST API và React SPA Frontend.
   - **Giao tiếp bất đồng bộ qua Redis**: Mọi cấu hình, session, guild cache và queue đồng bộ slash (`slash_sync_queue`) được truyền tải mượt qua Upstash Redis.
   - **Keep-alive**: Sử dụng UptimeRobot để duy trì 24/7 (loại bỏ hoàn toàn PM2 và script self-ping).

---

## 💻 Hướng dẫn khởi chạy Local

### 1. Chuẩn bị môi trường

- Cài đặt **Node.js** 20+ và **pnpm** (`npm i -g pnpm`).
- Bản sao cấu hình biến môi trường:
  ```bash
  cp .env.example .env
  ```
  *Mở file `.env` và điền đầy đủ thông tin (Discord Token, Upstash URL/Token, Client ID/Secret).*

### 2. Cài đặt Dependencies
```bash
pnpm install --no-frozen-lockfile
```

### 3. Build giao diện Dashboard
```bash
pnpm build:ui
```

### 4. Khởi chạy dự án

#### Chạy Monolith (Chung 1 process - Khuyên dùng khi dev nhanh):
```bash
pnpm dev
```

#### Chạy Split Mode (Tách biệt bot và server):
- **Terminal 1 (Bot service)**:
  ```bash
  pnpm dev:bot
  ```
- **Terminal 2 (Server API)**:
  ```bash
  pnpm dev:server
  ```
- **Terminal 3 (Frontend dev server với Hot Reload)**:
  ```bash
  pnpm dev:ui
  ```

### 5. Kiểm thử & Kiểm tra mã nguồn (Testing & Check)
```bash
# Kiểm tra cú pháp mã nguồn
pnpm check

# Chạy Unit Tests bằng Vitest
pnpm test
```

---

## 📦 Triển khai Production (Render.com)

Để tối ưu chi phí 100% miễn phí trên Render (750 giờ/tháng):
- **Tài khoản A**: Triển khai `discord-bot` (`node src/index.bot.js`).
- **Tài khoản B**: Triển khai `discord-dashboard` (`node src/index.server.js`).
- **UptimeRobot**: Cài đặt HTTP Monitor trỏ tới URL của 2 Web Services để giữ cho Bot và Dashboard luôn sống.
