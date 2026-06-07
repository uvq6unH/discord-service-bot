/**
 * pm2.config.cjs
 *
 * 2 process riêng biệt:
 *   discord-bot       — Discord client (index.bot.js)
 *   discord-dashboard — Express dashboard (index.server.js)
 *
 * Lợi ích:
 *   - Memory leak trong music/games KHÔNG crash dashboard
 *   - Restart bot mà không ngắt người dùng đang dùng web
 *   - Có thể scale dashboard độc lập nếu cần
 *
 * Run:
 *   pm2 start pm2.config.cjs          # khởi động cả 2
 *   pm2 restart discord-bot           # restart bot riêng
 *   pm2 restart discord-dashboard     # restart dashboard riêng
 *   pm2 logs discord-bot              # xem log bot
 */

module.exports = {
  apps: [
    // ── Bot process ────────────────────────────────────────────────────────
    {
      name: 'discord-bot',
      script: './src/index.bot.js',

      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,

      // Bot nặng hơn vì có voice/music (Lavalink client, audio buffers)
      max_memory_restart: '350M',

      out_file:      './logs/bot-out.log',
      error_file:    './logs/bot-err.log',
      merge_logs:    true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type:      'json',

      kill_timeout:    5000,
      listen_timeout: 10000,
      shutdown_with_message: true,

      env: {
        NODE_ENV: 'production',
        // BOT_PORT không cần thiết — bot không mở HTTP server
      },
    },

    // ── Dashboard process ──────────────────────────────────────────────────
    {
      name: 'discord-dashboard',
      script: './src/index.server.js',

      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,

      // Dashboard nhẹ hơn (chỉ Express + session)
      max_memory_restart: '150M',

      out_file:      './logs/dashboard-out.log',
      error_file:    './logs/dashboard-err.log',
      merge_logs:    true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type:      'json',

      kill_timeout:  3000,
      listen_timeout: 8000,
      shutdown_with_message: true,

      env: {
        NODE_ENV: 'production',
        DASHBOARD_PORT: 10001,
      },
    },
  ],
};
