const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Keep the downloaded browser with this checkout, using the same location for
// installation and tests on Windows, macOS and Linux.
const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || path.resolve(__dirname, '../.cache/ms-playwright'),
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
