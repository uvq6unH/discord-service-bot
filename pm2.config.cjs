// PM2 ecosystem config
// Run:  pm2 start pm2.config.cjs
// Stop: pm2 stop discord-service-bot
// Logs: pm2 logs discord-service-bot
// Save across reboots: pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'discord-service-bot',
      script: './src/index.js',

      // Restart behaviour
      autorestart: true,         // restart on crash
      max_restarts: 20,          // after 20 back-to-back crashes, give up
      min_uptime: '10s',         // must stay up ≥10s to count as "stable"
      restart_delay: 3000,       // wait 3s between restarts
      exp_backoff_restart_delay: 100, // exponential backoff up to restart_delay

      // Resource limits
      max_memory_restart: '400M', // restart if RAM > 400MB (tune to your server)

      // Logging
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type: 'json',

      // Environment
      env: {
        NODE_ENV: 'production',
      },

      // Graceful shutdown
      kill_timeout: 5000,          // wait 5s for SIGTERM before SIGKILL
      listen_timeout: 10000,       // wait 10s for app to signal ready
      shutdown_with_message: true, // send 'shutdown' message before SIGINT
    },
  ],
};
