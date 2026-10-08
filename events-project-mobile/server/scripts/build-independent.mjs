import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const typecheck = spawnSync(process.execPath, [
  tsc,
  '--project',
  path.join(serverRoot, 'independent/tsconfig.json'),
], { cwd: serverRoot, stdio: 'inherit' });
if (typecheck.status !== 0) process.exit(typecheck.status ?? 1);

await build({
  entryPoints: [path.join(serverRoot, 'independent/src/server.ts')],
  outfile: path.join(serverRoot, 'dist/independent-api.cjs'),
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  bundle: true,
  packages: 'external',
});
console.log('Independent mobile auth API compiled without resolving the web project.');
