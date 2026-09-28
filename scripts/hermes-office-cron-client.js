'use strict';

const hermesOffice = require('./hermes-office-client');

hermesOffice.tick()
  .then(summary => {
    process.stdout.write(JSON.stringify({
      ok: true,
      ...summary
    }) + '\n');
    if (summary.profiles_failed) process.exitCode = 1;
  })
  .catch(error => {
    process.stderr.write('Hermes cron pulse failed: ' + String(error.message || error).replace(/[\\r\\n]/g, ' ').slice(0, 500) + '\n');
    process.exitCode = 1;
  });
