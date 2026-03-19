module.exports = {
  apps: [
    {
      name: 'enveral-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/root/yt-shorts-generator',
      env: {
        PATH: '/root/yt-shorts-generator/.venv/bin:' + process.env.PATH,
        PYTHON: '/root/yt-shorts-generator/.venv/bin/python'
      }
    }
  ]
}

