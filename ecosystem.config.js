module.exports = {
  apps: [
    {
      name: 'vibezBot',
      script: './polaris.js',
      watch: true,
      ignore_watch: [
        'node_modules',
        'logs',
        'json',
        'dashboard',
        '.git'
      ],
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
