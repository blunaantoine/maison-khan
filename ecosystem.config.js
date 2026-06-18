
module.exports = {

  apps: [{

    name: 'maison-khan',

    script: '/root/.bun/bin/bun',

    args: 'run start',

    cwd: '/var/www/maison-khan',

    env: {

      PORT: 3003,

      HOSTNAME: '0.0.0.0',

      NODE_ENV: 'production'

    }

  }]

}

