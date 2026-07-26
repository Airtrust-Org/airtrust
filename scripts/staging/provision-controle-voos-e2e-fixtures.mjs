#!/usr/bin/env node

// source_reference: provisiona fixtures 100% sinteticas para o E2E autenticado
// real de Controle de Voos em staging (dois tenants, cinco usuarios, catalogos,
// aeronave, funcionarios). Segue o mesmo padrao de guarda de
// scripts/seed-staging-smoke-user.mjs (target D1 travado por nome, --apply
// obrigatorio, senha nunca impressa/logada).
// operational_decision: usa escrita D1 direta (nao a rota HTTP POST /api/empresas)
// porque criar uma empresa via API exige um JWT de admin da tenant plataforma
// "airtrust", credencial que este processo nao possui e nao deve solicitar.
// dry_run_required: sem --apply, so imprime o que seria feito.
// rollback_plan_required: cleanup-controle-voos-e2e-fixtures.mjs remove tudo
// que este script cria, usando o mesmo manifest.

import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const require = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const BLOCKED_D1_SUBSTRINGS = ['prod', 'production'];
const WORKER_DIR = new URL('../../worker-airtrust/', import.meta.url).pathname;

function validateD1Target(name) {
  const trimmed = String(name).trim();
  if (!trimmed) throw new Error('STAGING_D1_NAME vazio.');
  const lower = trimmed.toLowerCase();
  if (BLOCKED_D1_SUBSTRINGS.some((s) => lower.includes(s))) {
    throw new Error(`D1 alvo "${trimmed}" contem substring bloqueada de producao.`);
  }
  if (trimmed !== ALLOWED_D1_NAME) {
    throw new Error(`D1 alvo "${trimmed}" != esperado "${ALLOWED_D1_NAME}".`);
  }
  return trimmed;
}

function randomToken(bytes = 6) {
  return randomBytes(bytes).toString('hex');
}

function randomPassword() {
  return `E2e${randomBytes(18).toString('base64url')}!9`;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function execD1(dbName, sql, { apply }) {
  if (!apply) {
    log(`[dry-run] SQL:\n${sql}`);
    return null;
  }
  const tmpFile = join(mkdtempSync(join(tmpdir(), 'cv-e2e-provision-')), 'stmt.sql');
  writeFileSync(tmpFile, sql, { mode: 0o600 });
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--env', 'staging', '--remote', '--file', tmpFile, '--json'],
    { cwd: WORKER_DIR, encoding: 'utf8' },
  );
  rmSync(tmpFile, { force: true });
  if (result.status !== 0) {
    throw new Error(`D1 execute falhou: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function queryD1(dbName, sql) {
  const tmpFile = join(mkdtempSync(join(tmpdir(), 'cv-e2e-query-')), 'stmt.sql');
  writeFileSync(tmpFile, sql, { mode: 0o600 });
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--env', 'staging', '--remote', '--file', tmpFile, '--json'],
    { cwd: WORKER_DIR, encoding: 'utf8' },
  );
  rmSync(tmpFile, { force: true });
  if (result.status !== 0) {
    throw new Error(`D1 query falhou: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed[0]?.results ?? [];
}

function log(msg) {
  process.stderr.write(`[provision-cv-e2e] ${msg}\n`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const dbName = validateD1Target(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME);

  const runId = randomToken(4);
  const codigoA = `cv_e2e_synth_a_${runId}`;
  const codigoB = `cv_e2e_synth_b_${runId}`;
  const nomeA = `CV E2E Synthetic Tenant A (${runId})`;
  const nomeB = `CV E2E Synthetic Tenant B (${runId})`;

  const users = [
    { key: 'adminA', email: `cv.e2e.admin.a.${runId}@synthetic.invalid`, nome: `CV E2E Synthetic Admin A ${runId}`, role: 'admin', tenant: 'A' },
    { key: 'coordA', email: `cv.e2e.coord.a.${runId}@synthetic.invalid`, nome: `CV E2E Synthetic Coordenador A ${runId}`, role: 'manager', tenant: 'A' },
    { key: 'aprovA', email: `cv.e2e.aprov.a.${runId}@synthetic.invalid`, nome: `CV E2E Synthetic Aprovador A ${runId}`, role: 'manager', tenant: 'A' },
    { key: 'viewerA', email: `cv.e2e.viewer.a.${runId}@synthetic.invalid`, nome: `CV E2E Synthetic Viewer A ${runId}`, role: 'viewer', tenant: 'A' },
    { key: 'adminB', email: `cv.e2e.admin.b.${runId}@synthetic.invalid`, nome: `CV E2E Synthetic Admin B ${runId}`, role: 'admin', tenant: 'B' },
  ];

  for (const u of users) {
    u.password = randomPassword();
    u.passwordHash = bcrypt.hashSync(u.password, bcrypt.genSaltSync(10));
  }

  log(`runId=${runId} apply=${apply} db=${dbName}`);

  // 1. Empresas
  const empresaSql = `
    INSERT INTO empresas (nome, codigo, plano, ativo)
    VALUES (${sqlString(nomeA)}, ${sqlString(codigoA)}, 'basic', 1);
    INSERT INTO empresas (nome, codigo, plano, ativo)
    VALUES (${sqlString(nomeB)}, ${sqlString(codigoB)}, 'basic', 1);
  `;
  execD1(dbName, empresaSql, { apply });

  if (!apply) {
    log('dry-run concluido — nenhuma escrita realizada. Rode com --apply para provisionar de verdade.');
    return;
  }

  const empresaRows = queryD1(
    dbName,
    `SELECT id, codigo FROM empresas WHERE codigo IN (${sqlString(codigoA)}, ${sqlString(codigoB)});`,
  );
  const empresaAId = empresaRows.find((r) => r.codigo === codigoA)?.id;
  const empresaBId = empresaRows.find((r) => r.codigo === codigoB)?.id;
  if (!empresaAId || !empresaBId) throw new Error('Falha ao localizar empresas recem-criadas.');
  log(`empresaA.id=${empresaAId} empresaB.id=${empresaBId}`);

  // 2. Usuarios + vinculo usuarios_empresas
  const userSqlParts = [];
  for (const u of users) {
    const empresaId = u.tenant === 'A' ? empresaAId : empresaBId;
    userSqlParts.push(`
      INSERT INTO usuarios (email, password_hash, nome, perfil, active)
      VALUES (${sqlString(u.email)}, ${sqlString(u.passwordHash)}, ${sqlString(u.nome)}, 'USUARIO', 1);
    `);
  }
  execD1(dbName, userSqlParts.join('\n'), { apply });

  const emailList = users.map((u) => sqlString(u.email)).join(', ');
  const userRows = queryD1(dbName, `SELECT id, email FROM usuarios WHERE email IN (${emailList});`);
  for (const u of users) {
    u.id = userRows.find((r) => r.email === u.email)?.id;
    if (!u.id) throw new Error(`Falha ao localizar usuario recem-criado: ${u.email}`);
  }

  const linkSqlParts = users.map((u) => {
    const empresaId = u.tenant === 'A' ? empresaAId : empresaBId;
    return `INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary) VALUES (${u.id}, ${empresaId}, ${sqlString(u.role)}, 1);`;
  });
  execD1(dbName, linkSqlParts.join('\n'), { apply });

  // 3. Funcionarios (dados de tripulacao sintetica) — 2 por tenant
  const funcionarios = [
    { key: 'funcA1', tenant: 'A', nome: `CV E2E Synthetic Crew A1 ${runId}`, codigo_anac: `E2E-A1-${runId}` },
    { key: 'funcA2', tenant: 'A', nome: `CV E2E Synthetic Crew A2 ${runId}`, codigo_anac: `E2E-A2-${runId}` },
    { key: 'funcB1', tenant: 'B', nome: `CV E2E Synthetic Crew B1 ${runId}`, codigo_anac: `E2E-B1-${runId}` },
  ];
  const funcSql = funcionarios
    .map((f) => {
      const empresaId = f.tenant === 'A' ? empresaAId : empresaBId;
      return `INSERT INTO funcionarios (nome, empresa_id, codigo_anac, status, ativo) VALUES (${sqlString(f.nome)}, ${empresaId}, ${sqlString(f.codigo_anac)}, 'ATIVO', 1);`;
    })
    .join('\n');
  execD1(dbName, funcSql, { apply });
  const funcRows = queryD1(
    dbName,
    `SELECT id, nome FROM funcionarios WHERE nome IN (${funcionarios.map((f) => sqlString(f.nome)).join(', ')});`,
  );
  for (const f of funcionarios) {
    f.id = funcRows.find((r) => r.nome === f.nome)?.id;
  }

  // 4. Catalogos Controle de Voos (por tenant). Nao inclui aeronave/modelo:
  //    esses sao cadastros CANONICOS do AirTrust (aeronaves, modelos_aeronave,
  //    Configuracoes), com rotas HTTP oficiais (POST /api/modelos-aeronave,
  //    POST /api/aeronaves). Controle de Voos so referencia aeronave_id — nao
  //    duplica o cadastro. run-controle-voos-e2e.mjs cria o modelo+aeronave
  //    sinteticos via essas rotas oficiais, autenticado como adminA, antes de
  //    criar o voo.
  const catalogSql = ['A', 'B']
    .map((tenant) => {
      const empresaId = tenant === 'A' ? empresaAId : empresaBId;
      const suffix = `${tenant}${runId}`;
      return `
        INSERT INTO cv_aeroportos (empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
        VALUES (${empresaId}, ${sqlString('OR' + suffix)}, ${sqlString('OR' + suffix)}, ${sqlString('E2E Origem ' + tenant)}, 'aeroporto', 1, 1);
        INSERT INTO cv_aeroportos (empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
        VALUES (${empresaId}, ${sqlString('DE' + suffix)}, ${sqlString('DE' + suffix)}, ${sqlString('E2E Destino ' + tenant)}, 'aeroporto', 1, 2);
        INSERT INTO cv_tipos_voo (empresa_id, codigo, nome, ativo, ordem)
        VALUES (${empresaId}, ${sqlString('TV' + suffix)}, ${sqlString('E2E Tipo Voo ' + tenant)}, 1, 1);
        INSERT INTO cv_naturezas_voo (empresa_id, codigo, nome, ativo, ordem)
        VALUES (${empresaId}, ${sqlString('NV' + suffix)}, ${sqlString('E2E Natureza ' + tenant)}, 1, 1);
        INSERT INTO cv_motivos_operacionais (empresa_id, codigo, nome, tipo, ativo, ordem)
        VALUES (${empresaId}, ${sqlString('MO' + suffix)}, ${sqlString('E2E Motivo Cancelamento ' + tenant)}, 'cancelamento', 1, 1);
      `;
    })
    .join('\n');
  execD1(dbName, catalogSql, { apply });

  const catalogRows = {};
  for (const [table, key] of [
    ['cv_aeroportos', 'codigo'],
    ['cv_tipos_voo', 'codigo'],
    ['cv_naturezas_voo', 'codigo'],
    ['cv_motivos_operacionais', 'codigo'],
  ]) {
    catalogRows[table] = queryD1(dbName, `SELECT id, ${key} AS codigo, empresa_id FROM ${table} WHERE ${key} LIKE ${sqlString('%' + runId)};`);
  }

  function findCatalog(table, codigoPrefix, tenant) {
    const empresaId = tenant === 'A' ? empresaAId : empresaBId;
    return catalogRows[table].find((r) => r.codigo.startsWith(codigoPrefix) && r.codigo.endsWith(tenant + runId) && r.empresa_id === empresaId)?.id;
  }

  const manifest = {
    runId,
    createdAt: new Date().toISOString(),
    dbName,
    empresaA: { id: empresaAId, codigo: codigoA, nome: nomeA },
    empresaB: { id: empresaBId, codigo: codigoB, nome: nomeB },
    users: Object.fromEntries(
      users.map((u) => [u.key, { id: u.id, email: u.email, password: u.password, role: u.role, tenant: u.tenant }]),
    ),
    funcionarios: Object.fromEntries(funcionarios.map((f) => [f.key, { id: f.id, tenant: f.tenant }])),
    catalogA: {
      origemId: findCatalog('cv_aeroportos', 'OR', 'A'),
      destinoId: findCatalog('cv_aeroportos', 'DE', 'A'),
      tipoVooId: findCatalog('cv_tipos_voo', 'TV', 'A'),
      naturezaVooId: findCatalog('cv_naturezas_voo', 'NV', 'A'),
      motivoCancelamentoId: findCatalog('cv_motivos_operacionais', 'MO', 'A'),
    },
    catalogB: {
      origemId: findCatalog('cv_aeroportos', 'OR', 'B'),
      destinoId: findCatalog('cv_aeroportos', 'DE', 'B'),
      tipoVooId: findCatalog('cv_tipos_voo', 'TV', 'B'),
      naturezaVooId: findCatalog('cv_naturezas_voo', 'NV', 'B'),
      motivoCancelamentoId: findCatalog('cv_motivos_operacionais', 'MO', 'B'),
    },
  };

  const manifestDir = mkdtempSync(join(tmpdir(), 'cv-e2e-manifest-'));
  const manifestPath = join(manifestDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  chmodSync(manifestPath, 0o600);

  log(`Manifest (contem senhas — nunca commitado, chmod 0600): ${manifestPath}`);
  process.stdout.write(`${manifestPath}\n`);
}

main().catch((err) => {
  log(`ERRO: ${err.message}`);
  process.exitCode = 1;
});
