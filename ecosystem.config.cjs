/**
 * PM2 process definition for Over Strudel (standalone Next.js server behind Nginx).
 *
 *   pm2 start ecosystem.config.cjs --only over-strudel
 *   pm2 save
 *
 * Only this app is described here, so starting/reloading it never touches other PM2 processes.
 * Nginx proxies https://<your-domain> to http://127.0.0.1:4244 (see docs/DEPLOYMENT.md).
 */
module.exports = {
  apps: [
    {
      name: "over-strudel",
      cwd: __dirname,
      script: ".next/standalone/server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: 4244,
        HOSTNAME: "127.0.0.1", // only reachable through the reverse proxy
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
};
