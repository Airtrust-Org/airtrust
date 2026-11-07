// Empacota e executa a API sintetica local (ver server.ts). Sem rede externa.
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '../../..');
const out = mkdtempSync(join(tmpdir(), 'lms-exam-api-'));
const file = join(out, 'server.mjs');
await build({
  entryPoints: [join(root, 'e2e/ci/lms-exam/server.ts')],
  outfile: file, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: ['node:*'], logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  nodePaths: [join(root, 'worker-airtrust/node_modules'), join(root, 'node_modules')],
});
const child = spawn(process.execPath, ['--no-warnings', file], {
  cwd: join(root, 'worker-airtrust'), stdio: 'inherit', env: process.env,
});
const stop = (sig) => { child.kill(sig); };
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
child.on('exit', (code) => { rmSync(out, { recursive: true, force: true }); process.exit(code ?? 0); });
