const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "inkwell-ocr",
      script: "serve",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      restart_delay: 2000,
      env_production: {
        NODE_ENV: "production",
        PM2_SERVE_PATH: path.join(__dirname, "dist"),
        PM2_SERVE_PORT: process.env.PORT || 3000,
        PM2_SERVE_SPA: "true",
        PM2_SERVE_HOMEPAGE: "/index.html",
      },
    },
  ],
};