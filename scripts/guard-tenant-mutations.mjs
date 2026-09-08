#!/usr/bin/env node
import fs from 'fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 1. Derivar inventário de tabelas tenant-scoped das migrations/schema
const schema = fs.readFileSync(path.join(ROOT, 'scripts/schema-local.sql'), 'utf8');
const tenantTables = new Set();
const tableBlocks = schema.split(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i).slice(1);
for (const block of tableBlocks) {
  const tableNameMatch = block.match(/^([a-zA-Z0-9_"']+)/);
  if (!tableNameMatch) continue;
  let tableName = tableNameMatch[1].replace(/["']/g, '');
  if (/\bempresa_id\b/i.test(block)) {
    tenantTables.add(tableName.toLowerCase());
  }
}

// 2. Procurar queries de mutação no código
const result = spawnSync('git', ['ls-files', '--', 'worker-airtrust/src/**/*.ts'], { cwd: ROOT, encoding: 'utf8' });
const files = result.stdout.trim().split('\n').filter(Boolean);

const violations = new Set();
const queryRegex = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)[\s\S]{1,200}/gi;

for (const file of files) {
  if (file.includes('__tests__') || file.includes('e2e')) continue;
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  let match;
  while ((match = queryRegex.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    if (tenantTables.has(table)) {
      let snippet = match[0];
      const ends = [snippet.indexOf('`', 10), snippet.indexOf('"', 10), snippet.indexOf("'", 10)].filter(x => x > 0);
      if (ends.length > 0) {
        snippet = snippet.substring(0, Math.min(...ends) + 1);
      }
      
      const contextStart = Math.max(0, match.index - 50);
      const contextEnd = Math.min(content.length, match.index + snippet.length + 150);
      const context = content.substring(contextStart, contextEnd).toLowerCase();

      if (!context.includes('empresa_id') && !context.includes('empresaid')) {
        violations.add(`${file}:${table}`);
      }
    }
  }
}

const baselinePath = path.join(ROOT, '.tenant-mutations-baseline.json');
let baseline = new Set();
if (fs.existsSync(baselinePath)) {
  baseline = new Set(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
}

if (process.env.UPDATE_BASELINE === '1') {
  fs.writeFileSync(baselinePath, JSON.stringify(Array.from(violations).sort(), null, 2));
  console.log(`Baseline atualizado com ${violations.size} violações conhecidas.`);
  process.exit(0);
}

const newViolations = [];
for (const v of violations) {
  if (!baseline.has(v)) {
    newViolations.push(v);
  }
}

if (newViolations.length > 0) {
  console.error('❌ Guard falhou: Detectados novos INSERT/UPDATE/DELETE sem empresa_id (tenant guard).');
  console.error('Tabelas tenant-scoped exigem contexto de empresa explícito na query.');
  newViolations.forEach(v => console.error(`  - ${v}`));
  process.exit(1);
}

console.log('✅ Tenant mutations statement/query guard OK');
process.exit(0);
