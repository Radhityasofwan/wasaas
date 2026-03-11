module.exports = {
  apps: [
    {
      name: 'wasaas-api',
      cwd: '/var/www/wasaas/apps/api',
      script: 'dist/src/index.js',
      interpreter: '/usr/bin/node',
      node_args: '--max-old-space-size=256',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      kill_timeout: 15000,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta',
        VAPID_SUBJECT: 'mailto:admin@hookjourney.com',
        VAPID_PUBLIC_KEY: 'BFm1NesGz2Q0ktTtrhLwXaY9CwRG9iVzrtgBqJX3bJqBh7biAgnd8ADENZXceLWa-1cENgTlNw2Bdw0pmL-iS-s',
        VAPID_PRIVATE_KEY: '7GeMo15k2MITYmdQqf4Q9j5edwhjQVTF0UqdKHkUzag',
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_NAME: 'wa_saas',
        DB_USER: 'wasaas',
        DB_PASSWORD: 'wa_pass'
      },
      error_file: '/var/log/pm2/wasaas-api-error.log',
      out_file: '/var/log/pm2/wasaas-api-out.log',
      merge_logs: true,
      time: true
    }
  ]
}
