import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReadOnlyD1 } from '../../../../scripts/production/lib/frms-checkin-obligation-validation.mjs';
import { evaluateChain, listDays } from '../../../../scripts/production/lib/frms-sigvoos-chain-validation.mjs';
import { collectFacts } from '../../../../scripts/production/frms-sigvoos-chain-readonly.mjs';
import type { Sqlite } from './helpers/checkin-obligation-fixture';

/**
 * As consultas da sonda rodam contra o DDL REAL das migrations (0387, 0410, 0411, 0451), não contra
 * tabelas inventadas: um nome de coluna errado falharia aqui e não na produção.
 */
const here = dirname(fileURLToPath(import.meta.url));
const migration = (name: string) => readFileSync(resolve(here, '../../../migrations', name), 'utf8');

let sqlite: Sqlite;
const TODAY = '2026-11-16';
const FROM = '2026-11-01';
const TO = '2026-11-15';

beforeEach(() => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  sqlite = new DatabaseSync(':memory:') as Sqlite;
  for (const file of [
    '0387_integracoes_sigvoos_base_tables.sql', '0410_controle_voos_n1_schema.sql',
    '0411_controle_voos_sigvoos_integration_schema.sql', '0451_cron_job_resilience_state.sql',
  ]) sqlite.exec(migration(file));
  sqlite.exec(`
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
    CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, tripulante_id INTEGER, data TEXT, origem TEXT,
      hora_apresentacao TEXT, hora_termino TEXT, horas_voo_minutos INTEGER, duracao_jornada_minutos INTEGER, deleted_at TEXT);
    INSERT INTO funcionarios (id, empresa_id) VALUES (101, 6), (102, 6), (901, 9);
  `);
});
afterEach(() => sqlite.close());

const db = () => createReadOnlyD1((sql, params) => sqlite.prepare(sql).all(...params as []));
const facts = () => collectFacts(db(), { tenantId: 6, from: FROM, to: TO, today: TODAY });
const codes = (result: { findings: Array<{ code: string; severity: string }> }, severity?: string) =>
  result.findings.filter((f) => !severity || f.severity === severity).map((f) => f.code);

function seedHealthy() {
  sqlite.exec(`
    INSERT INTO cron_job_state (job_name, scope_key, watermark_to, consecutive_failures, metadata_json)
      VALUES ('sigvoos-ingest', 'empresa:6', '2026-11-15', 0, '{"stage":"COMPLETE","lastReviewedOperationalDate":"2026-11-16"}');
    INSERT INTO cv_aeroportos (id, empresa_id, codigo, nome) VALUES (1, 6, 'SBJR', 'Base');
    INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome) VALUES (1, 6, 'T', 'T');
    INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome) VALUES (1, 6, 'N', 'N');
    INSERT INTO cv_voos (id, empresa_id, prefixo, data_programacao, origem_id, destino_id, tipo_voo_id, natureza_voo_id,
        horario_previsto_partida, horario_previsto_chegada, horario_real_partida, status)
      VALUES (1, 6, 'PRXX', '2026-11-10', 1, 1, 1, 1, '07:00', '10:00', '07:05', 'concluido_operacionalmente');
    INSERT INTO cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao) VALUES (6, 1, 101, 'PIC');
    INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa, origem_dados, sigvoos_content_hash) VALUES (6, 1, 1, 'SIGVOOS', 'h1');
    INSERT INTO frms_jornada (id, tripulante_id, data, origem, hora_apresentacao, horas_voo_minutos)
      VALUES ('j1', 101, '2026-11-10', 'SIGVOOS', '06:30', 180);
  `);
  const insert = sqlite.prepare(`INSERT INTO integracoes_sigvoos_eventos (id, empresa_id, tipo_evento, status, payload_json, created_at, updated_at)
    VALUES (?, 6, 'FRMS_COVERAGE_DAY', 'CONSOLIDADO', ?, '2026-11-16 08:00:00', '2026-11-16 08:00:00')`);
  for (const day of listDays(FROM, TO)) insert.run(`frms_coverage_day:6:${day}`, JSON.stringify({ day }));
}

describe('cadeia SIGVOOS -> Controle de Voos -> FRMS (DDL real das migrations)', () => {
  it('cadeia saudável: nenhuma sonda indisponível, nenhuma violação, e o relatório quantifica o que viu', async () => {
    seedHealthy();
    const result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(codes(result, 'ADVISORY')).toEqual([]);
    expect(result.violations).toBe(0);
    const find = (code: string) => result.findings.find((f) => f.code === code) as Record<string, unknown>;
    expect(find('INGEST_STATE')).toMatchObject({ lag_days_vs_yesterday: 1 - 1, review_lag_days: 0, stage: 'COMPLETE' });
    expect(find('COVERAGE_LEDGER')).toMatchObject({ closed_days: 15, consolidated: 15, failed: 0, missing: 0 });
    expect(find('RECONCILIATION')).toMatchObject({ days_both: 1, days_only_cv: 0, days_only_frms_jornada: 0 });
    expect(find('INTEGRITY_COUNTS')).toMatchObject({ crew_unique_index_present: true, duplicate_jornada_groups: 0 });
  });

  it('ingestão parada, sem rechecagem retroativa e com falhas consecutivas é violação', async () => {
    seedHealthy();
    sqlite.exec(`UPDATE cron_job_state SET watermark_to = '2026-11-10', consecutive_failures = 3,
      metadata_json = '{"lastReviewedOperationalDate":"2026-11-10"}'`);
    const result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(codes(result, 'VIOLATION')).toEqual(expect.arrayContaining([
      'INGEST_WATERMARK_STALE', 'RETROACTIVE_REVIEW_NOT_RUNNING', 'INGEST_CONSECUTIVE_FAILURES']));
  });

  it('estado de ingestão ausente é violação; ledger vazio é aviso (tenant não habilitado), não falsa conformidade', async () => {
    const result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(codes(result, 'VIOLATION')).toContain('INGEST_STATE_ABSENT');
    expect(codes(result, 'ADVISORY')).toContain('COVERAGE_LEDGER_INACTIVE_FOR_TENANT');
  });

  it('dia com ledger FALHOU, sem consolidação, é violação; dias sem atestação são aviso', async () => {
    seedHealthy();
    sqlite.exec(`UPDATE integracoes_sigvoos_eventos SET status = 'FALHOU' WHERE id = 'frms_coverage_day:6:2026-11-05'`);
    let result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(codes(result, 'VIOLATION')).toContain('COVERAGE_DAYS_FAILED');
    sqlite.exec(`UPDATE integracoes_sigvoos_eventos SET status = 'CONSOLIDADO' WHERE id = 'frms_coverage_day:6:2026-11-05';
      DELETE FROM integracoes_sigvoos_eventos WHERE id = 'frms_coverage_day:6:2026-11-06'`);
    result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(codes(result, 'VIOLATION')).not.toContain('COVERAGE_DAYS_FAILED');
    expect(codes(result, 'ADVISORY')).toContain('COVERAGE_DAYS_NOT_ATTESTED');
  });

  it('duplicação, órfãos e linhas de outra empresa são violações', async () => {
    seedHealthy();
    // As migrations já instalam gatilhos que impedem estes estados em escrita nova; a sonda existe para
    // dados anteriores aos gatilhos ou alterados por fora, então os gatilhos saem só neste cenário.
    const triggers = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>);
    expect(triggers.length).toBeGreaterThan(0);
    for (const { name } of triggers) sqlite.exec(`DROP TRIGGER ${name}`);
    sqlite.exec('PRAGMA foreign_keys = OFF');
    sqlite.exec(`
      INSERT INTO frms_jornada (id, tripulante_id, data, origem, hora_apresentacao) VALUES ('j1b', 101, '2026-11-10', 'SIGVOOS', '06:30');
      INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa, origem_dados, sigvoos_content_hash) VALUES (6, 999, 1, 'SIGVOOS', 'h1');
      INSERT INTO cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao) VALUES (6, 999, 102, 'PIC');
      INSERT INTO cv_voos (id, empresa_id, prefixo, data_programacao, origem_id, destino_id, tipo_voo_id, natureza_voo_id,
        horario_previsto_partida, horario_previsto_chegada, status) VALUES (50, 8, 'OUTRA', '2026-11-11', 1, 1, 1, 1, '07:00', '08:00', 'planejado');
      INSERT INTO cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao) VALUES (6, 50, 102, 'SIC');
    `);
    const result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(codes(result, 'VIOLATION')).toEqual(expect.arrayContaining([
      'FRMS_DUPLICATE_JORNADA_GROUPS', 'CV_ORPHAN_ETAPAS', 'CV_ORPHAN_TRIPULANTES',
      'CV_CROSS_TENANT_ROWS', 'CV_SAME_CONTENT_HASH_IN_DIFFERENT_VOOS']));
  });

  it('jornada SIGVOOS sem dia no CV é aviso; dia só no CV é informação esperada', async () => {
    seedHealthy();
    sqlite.exec(`
      INSERT INTO frms_jornada (id, tripulante_id, data, origem, horas_voo_minutos) VALUES ('j2', 102, '2026-11-12', 'SIGVOOS', 90);
      UPDATE cv_voos SET data_programacao = '2026-11-13' WHERE id = 1;`);
    const result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(codes(result, 'ADVISORY')).toContain('FRMS_JORNADA_WITHOUT_CV_DAY');
    expect(codes(result, 'INFO')).toContain('CV_DAY_WITHOUT_FRMS_JORNADA_ROW');
  });

  it('sonda indisponível vira aviso e não derruba as demais; a sonda é somente leitura', async () => {
    seedHealthy();
    sqlite.exec('DROP TABLE cron_job_state');
    const result = evaluateChain(await facts(), { today: TODAY, from: FROM, to: TO });
    expect(result.findings.find((f) => f.code === 'PROBE_UNAVAILABLE')).toMatchObject({ probe: 'cron' });
    expect(codes(result, 'INFO')).toContain('COVERAGE_LEDGER');
    const writes: string[] = [];
    const watching = createReadOnlyD1((sql, params) => { writes.push(sql); return sqlite.prepare(sql).all(...params as []); });
    await collectFacts(watching, { tenantId: 6, from: FROM, to: TO, today: TODAY });
    expect(writes.length).toBeGreaterThan(8);
    expect(writes.every((sql) => /^\s*(SELECT|WITH)\b/i.test(sql))).toBe(true);
  });

  it('janela inválida ou excessiva é recusada', () => {
    expect(() => listDays('2026-11-15', '2026-11-01')).toThrow('WINDOW_INVALID');
    expect(() => listDays('2026-01-01', '2026-12-31')).toThrow('WINDOW_TOO_LARGE');
  });
});
