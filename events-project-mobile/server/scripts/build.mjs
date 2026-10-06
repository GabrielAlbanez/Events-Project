import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [process.env.WEB_PROJECT_PATH, path.resolve(serverRoot, '../../Events-Project'), 'C:/Users/gabri/Events-Project'].filter(Boolean);
let webRoot;
for (const candidate of candidates) {
  try { await fs.access(path.join(candidate, 'prisma/schema.prisma')); await fs.access(path.join(candidate, 'lib/services/authContext.ts')); await fs.access(path.join(candidate, 'app/api/party-connections/[eventId]/route.ts')); webRoot = path.resolve(candidate); break; } catch {}
}
if (!webRoot) throw new Error('Configure WEB_PROJECT_PATH apontando para o projeto web existente.');
const webRequire = createRequire(path.join(webRoot, 'package.json'));
webRequire.resolve('@prisma/client');
const config = {
  compilerOptions: {
    target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'CommonJS', moduleResolution: 'Node',
    strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true, jsx: 'preserve',
    baseUrl: webRoot, paths: { '@/*': ['./*'], '*': [path.join(webRoot, 'node_modules/*'), path.join(serverRoot, 'node_modules/*')] },
    typeRoots: [path.join(serverRoot, 'node_modules/@types'), path.join(webRoot, 'node_modules/@types')],
    types: ['node'],
  },
  include: [path.join(serverRoot, 'src/**/*.ts')],
};
await fs.writeFile(path.join(serverRoot, 'tsconfig.generated.json'), JSON.stringify(config, null, 2));
if (process.argv.includes('--typecheck')) {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const checked = spawnSync(process.execPath, [tsc, '--project', path.join(serverRoot, 'tsconfig.generated.json')], { cwd: serverRoot, stdio: 'inherit' });
  process.exit(checked.status ?? 1);
}
await build({
  entryPoints: [path.join(serverRoot, 'src/server.ts')], outfile: path.join(serverRoot, 'dist/server.cjs'),
  platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external',
  define: { __WEB_PROJECT_PATH__: JSON.stringify(webRoot), __SERVER_ROOT__: JSON.stringify(serverRoot) },
  tsconfig: path.join(serverRoot, 'tsconfig.generated.json'),
  banner: { js: `const _nativeRequire = require; const _webRequire = require('node:module').createRequire(${JSON.stringify(path.join(webRoot, 'package.json'))}); const _dotenv = _nativeRequire('dotenv'); for (const _envFile of ${JSON.stringify([path.join(serverRoot, '.env'), path.join(webRoot, '.env.local'), path.join(webRoot, '.env')])}) _dotenv.config({ path: _envFile, quiet: true }); process.chdir(${JSON.stringify(webRoot)}); require = (id) => { try { return _webRequire(id); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; return _nativeRequire(id); } };` },
  plugins: [{ name: 'request-context', setup(builder) {
    builder.onResolve({ filter: /^next\/headers$/ }, () => ({ path: path.join(serverRoot, 'src/request-context.ts') }));
    builder.onResolve({ filter: /^[^./]/ }, args => args.path.startsWith('@/') || path.isAbsolute(args.path) ? undefined : ({ path: args.path, external: true }));
    builder.onResolve({ filter: /^@\// }, args => { const target = path.join(webRoot, args.path.slice(2)); for (const candidate of [target + '.ts', target + '.tsx', path.join(target, 'index.ts')]) if (existsSync(candidate)) return { path: candidate }; return { path: target }; });
  } }],
});
console.log('API nativa compilada; projeto web reutilizado sem alterações de código.');
