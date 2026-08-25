#!/usr/bin/env node
/**
 * Governed, idempotent backfill of qualificacoes_historico.validacao_hash.
 *
 * Default is dry-run. Does not contact remote D1. Apply is local sqlite only
 * after an explicit --apply flag and must remain tenant/row scoped.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(message) {
  throw new Error(`Backfill validacao_hash recusado: ${message}`);
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

export function generateCertificateValidationHashSync(input) {
  const cpf = String(input.funcionarioCpf || '').replace(/\D/g, '');
  const qualificacaoCodigo = String(input.qualificacaoCodigo || '').trim();
  const dataConclusao = String(input.dataConclusao || '').trim().split('T')[0];
  const numeroCertificado = String(input.numeroCertificado || '').trim();
  if (!cpf || !qualificacaoCodigo || !dataConclusao || !numeroCertificado) {
    throw new Error('CERTIFICATE_VALIDATION_HASH_INPUT_INCOMPLETE');
  }
  const canonical = `${cpf}${qualificacaoCodigo}${dataConclusao}${numeroCertificado}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16).toUpperCase();
}

function sqliteJson(dbPath, sql) {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const trimmed = output.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function sqliteExec(dbPath, sql) {
  execFileSync('sqlite3', [dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main() {
  const dbPath = arg('--db');
  const apply = hasFlag('--apply');
  const empresaId = arg('--empresa-id');
  if (!dbPath) fail('uso: --db <sqlite> [--empresa-id <id>] [--apply]');
  if (!fs.existsSync(dbPath)) fail(`sqlite inexistente: ${dbPath}`);

  const columns = sqliteJson(dbPath, `PRAGMA table_info(qualificacoes_historico)`);
  if (!columns.some((column) => column.name === 'validacao_hash')) {
    fail('coluna validacao_hash ausente; 0470 não aplicada neste sqlite');
  }

  const tenantPredicate = empresaId ? `AND empresa_id = ${Number(empresaId)}` : '';
  if (empresaId && !Number.isInteger(Number(empresaId))) fail('empresa-id inválido');

  const candidates = sqliteJson(
    dbPath,
    `SELECT id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, numero_certificado, validacao_hash
       FROM qualificacoes_historico
      WHERE deleted_at IS NULL
        AND certificado_arquivo_id IS NOT NULL
        AND numero_certificado IS NOT NULL
        ${tenantPredicate}`,
  );

  const report = {
    dryRun: !apply,
    eligible: 0,
    incomplete: 0,
    alreadyHashed: 0,
    toUpdate: 0,
    collisions: [],
    incompleteRows: [],
  };
  const hashOwners = new Map();

  for (const row of candidates) {
    report.eligible += 1;
    const funcionario = sqliteJson(
      dbPath,
      `SELECT cpf FROM funcionarios WHERE id = ${Number(row.funcionario_id)} AND deleted_at IS NULL LIMIT 1`,
    )[0];
    try {
      const hash = generateCertificateValidationHashSync({
        funcionarioCpf: funcionario?.cpf || '',
        qualificacaoCodigo: row.qualificacao_codigo,
        dataConclusao: row.data_conclusao,
        numeroCertificado: row.numero_certificado,
      });
      const owners = hashOwners.get(hash) || [];
      owners.push({ id: row.id, empresa_id: row.empresa_id });
      hashOwners.set(hash, owners);
      if (row.validacao_hash === hash) {
        report.alreadyHashed += 1;
        continue;
      }
      report.toUpdate += 1;
      if (apply) {
        sqliteExec(
          dbPath,
          `UPDATE qualificacoes_historico
              SET validacao_hash = '${hash}'
            WHERE id = ${Number(row.id)}
              AND empresa_id = ${Number(row.empresa_id)}
              AND (validacao_hash IS NULL OR validacao_hash != '${hash}')`,
        );
      }
    } catch {
      report.incomplete += 1;
      report.incompleteRows.push({ id: row.id, empresa_id: row.empresa_id });
    }
  }

  for (const [hash, owners] of hashOwners.entries()) {
    const uniqueTenants = new Set(owners.map((owner) => `${owner.empresa_id}:${hash}`));
    if (owners.length > 1) {
      report.collisions.push({ hash, rows: owners });
    }
    void uniqueTenants;
  }

  const remaining = sqliteJson(
    dbPath,
    `SELECT COUNT(*) AS missing
       FROM qualificacoes_historico
      WHERE deleted_at IS NULL
        AND certificado_arquivo_id IS NOT NULL
        AND numero_certificado IS NOT NULL
        AND (validacao_hash IS NULL OR validacao_hash = '')
        ${tenantPredicate}`,
  )[0];

  console.log(
    JSON.stringify(
      {
        ok: report.incomplete === 0 && report.collisions.length === 0 && Number(remaining?.missing || 0) === (apply ? 0 : remaining?.missing),
        db: path.resolve(dbPath),
        ...report,
        remainingMissing: Number(remaining?.missing || 0),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
