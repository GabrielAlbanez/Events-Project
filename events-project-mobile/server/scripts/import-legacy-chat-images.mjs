import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(serverRoot, 'dist/import-legacy-chat-images.cjs');
await build({
  entryPoints: [path.join(serverRoot, 'independent/src/legacy-chat-image-import.ts')],
  outfile: output,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  bundle: true,
  packages: 'external',
});
const result = spawnSync(process.execPath, [output, ...process.argv.slice(2)], {
  cwd: serverRoot,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
