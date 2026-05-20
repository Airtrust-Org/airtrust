#!/usr/bin/env node
/**
 * Auto-select a free port for wrangler dev (prefer 8787, fallback 8888, 8989).
 * Updates .env.local VITE_API_URL accordingly if file exists.
 */
import { createServer } from 'net';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORTS = [8787, 8888, 8989];

function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function pickPort() {
  for (const p of PORTS) {
    const free = await checkPort(p); // sequential check is fine for few ports
    if (free) return p;
  }
  return PORTS[PORTS.length - 1];
}

function updateEnvLocal(port) {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  const apiLine = /VITE_API_URL=.*/;
  if (apiLine.test(content)) {
    content = content.replace(apiLine, `VITE_API_URL=http://localhost:${port}`);
  } else {
    content += `\nVITE_API_URL=http://localhost:${port}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`✅ Atualizado .env.local: VITE_API_URL=http://localhost:${port}`);
}

(async () => {
  const port = await pickPort();
  console.log(`🔍 Porta selecionada para backend local: ${port}`);
  updateEnvLocal(port);
  console.log('🚀 Iniciando wrangler dev...');
  const workerDir = path.join(process.cwd(), 'worker-airtrust');
  const child = spawn('npx', ['wrangler', 'dev', '--port', String(port)], {
    stdio: 'inherit',
    cwd: workerDir,
  });
  child.on('exit', (code) => {
    console.log(`Wrangler finalizado (code ${code}).`);
  });
})();
