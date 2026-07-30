const { execFileSync } = require('node:child_process');
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-b', '--pretty', 'false'], { stdio: 'inherit' });
console.log('TypeScript regression check passed');
