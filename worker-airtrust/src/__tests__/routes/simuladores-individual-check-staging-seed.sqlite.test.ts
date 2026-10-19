import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { buildManifestSql, buildRollbackSql, buildSeedSql } from '../../../../scripts/staging/seed-qa-simulator-individual-check.mjs';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', Number(c.env.__userId));
    c.set('userRole', 'ADMIN');
    c.set('empresaId', Number(c.env.__empresaId));
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: Number(c.get('empresaId')) }),
}));
vi.mock('../../services/operational-domain-access', () => ({
  requireOperationalAccess: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import checks from '../../routes/simuladores-checks-individuais';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as new (l: string) => any;
const root = resolve(process.cwd(), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const CODE = 'QA-SIM-IND-123456';
const MARKER = 'QA_ONLY_SIMULATOR_INDIVIDUAL_CHECK_123456';
const QA_EMAIL = 'qa-examiner-admin@staging.airtrust.invalid';

/** Esquema real do repositório (schema-local.sql) + Schema V2 0554/0560 + ledger governado. */
function buildDb(withLedger = true) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(read('scripts/schema-local.sql'));
  // schema-local.sql antecede a atribuição curricular de simuladores; staging/produção já possuem estes
  // objetos. Shim mínimo exigido pela consulta de gerarQualificacaoDaFicha (sem alterar regras de negócio).
  const addMissing = (table: string, column: string) => {
    const has = (raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
      .some((c) => c.name === column);
    if (!has) raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER`);
  };
  addMissing('fichas_sessao', 'atribuicao_curricular_id');
  addMissing('modelos_sessao', 'empresa_id');
  addMissing('modelos_sessao', 'qualificacao_tipo_id');
  addMissing('modelos_sessao', 'tipo_sessao_id');
  addMissing('tipos_sessao', 'empresa_id');
  addMissing('funcionarios', 'setor_id');
  addMissing('qualificacoes_categorias', 'empresa_id');
  addMissing('qualificacoes_tipos', 'categoria_id');
  raw.exec(`
    CREATE TABLE IF NOT EXISTS simulador_atribuicoes_curriculares (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, modelo_sessao_id INTEGER, deleted_at TEXT);
  `);
  raw.exec(read('worker-airtrust/schema-v2/changes/0554_simulator_individual_check_evidence.sql'));
  raw.exec(read('worker-airtrust/schema-v2/changes/0560_simulator_individual_check_delete_guard.sql'));
  if (withLedger) {
    raw.exec(`
      CREATE TABLE IF NOT EXISTS airtrust_schema_changes_v2 (
        change_id TEXT PRIMARY KEY, baseline_id TEXT NOT NULL, file_hash TEXT NOT NULL, plan_hash TEXT NOT NULL);
      INSERT INTO airtrust_schema_changes_v2 VALUES
        ('simulator-individual-check-evidence-0554','production-d1-baseline-v2-20260714',
         'bcbdcf8bd78c3a3d6393624e62ae70e691190e3ae2d35c0951c0bc56470b4bf5',
         '47b79c542348749d865425a5487f72689444f30553187778f51366b89bbcd0b6'),
        ('simulator-individual-check-delete-guard-0560','production-d1-baseline-v2-20260714',
         '5fe67c81dda03681d9a73eec4cc51989bd92270e4eca6b41b1eb1028b58b9e56',
         'b00948f0821692fb322cd18dc795769d8f03b057db7af9c9b729747d9d2b1463');
    `);
  }
  raw.exec(`
    INSERT INTO empresas(id,nome,codigo,ativo) VALUES (77,'QA Examiner Training','qa_examiner_training',1);
    INSERT INTO usuarios(id,email,password_hash,nome,perfil,deleted_at,active)
      VALUES (900,'${QA_EMAIL}','x','QA Admin','ADMIN',NULL,1);
    INSERT INTO usuarios_empresas(usuario_id,empresa_id,role,is_primary) VALUES (900,77,'admin',1);
  `);
  const d1 = new SqliteD1Database();
  d1.database.close();
  (d1 as any).database = raw;
  return { d1, raw };
}

describe('Frente 7 — seed de homologação staging para checks individuais (SQLite real, schema do repositório)', () => {
  let handle: { d1: SqliteD1Database; raw: any } | null = null;
  afterEach(() => { try { handle?.raw.close(); } catch { /* já fechado */ } handle = null; });

  const seed = () => handle!.raw.exec(buildSeedSql(CODE, MARKER, QA_EMAIL));
  const call = (id: number, body?: Record<string, unknown>, userId = 900, empresaId = 77) =>
    checks.fetch(
      new Request(`http://localhost/fichas/${id}/checks-individuais`, body === undefined
        ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      { DB: handle!.d1.asD1(), __userId: userId, __empresaId: empresaId } as unknown as Env,
      {} as ExecutionContext,
    );
  const manifest = () => {
    const rows = handle!.raw.prepare(buildManifestSql(CODE, QA_EMAIL)).all() as Array<{ cenario: string; ficha_id: number; sessao_check_id: number }>;
    return Object.fromEntries(rows.map((r) => [r.cenario, r]));
  };

  it('semeia exatamente o fixture sintético e o manifesto contém apenas IDs numéricos', () => {
    handle = buildDb();
    seed();
    const m = manifest();
    expect(Object.keys(m).sort()).toEqual(['A', 'B', 'C', 'D']);
    for (const row of Object.values(m)) {
      expect(Object.keys(row).sort()).toEqual(['cenario', 'ficha_id', 'funcionario_id', 'sessao_check_id']);
      expect(Number.isInteger(row.ficha_id) && Number.isInteger(row.sessao_check_id) && Number.isInteger((row as any).funcionario_id)).toBe(true);
    }
  });

  it('recusa semear sem os dois changes 0554 e 0560 no ledger físico', () => {
    handle = buildDb(false);
    expect(() => handle!.raw.exec(buildSeedSql(CODE, MARKER, QA_EMAIL))).toThrow();
    expect(handle.raw.prepare('SELECT COUNT(*) AS n FROM funcionarios').get().n).toBe(0);
  });

  it('é rejeitado para identificadores fora do padrão e para login que não é QA sintético', () => {
    expect(() => buildSeedSql('PROD-1', MARKER, QA_EMAIL)).toThrow('QA_SIM_IND_CODE_INVALID');
    expect(() => buildSeedSql(CODE, 'x', QA_EMAIL)).toThrow('QA_SIM_IND_MARKER_INVALID');
  });

  it('A=aprovado, B=reprovado (revoga FAP prematura com auditoria), C=pendente — via rotas reais', async () => {
    handle = buildDb();
    seed();
    const m = manifest();

    // Estado inicial: ninguém aprovado por evidência; B tem FAP prematura.
    for (const k of ['A', 'B', 'C', 'D']) {
      const body = (await (await call(m[k].ficha_id)).json()) as any;
      expect(body.data[0]).toMatchObject({ situacao: 'PENDENTE_AVALIACAO', aprovado_comprovado: false });
    }
    expect(handle.raw.prepare("SELECT COUNT(*) AS n FROM qualificacoes_historico WHERE deleted_at IS NULL").get().n).toBe(1);

    // Fichas A e B ainda não finalizadas pelo instrutor → servidor recusa evidência (assinatura obrigatória).
    expect((await call(m.A.ficha_id, { sessao_check_id: m.A.sessao_check_id, aprovado: true })).status).toBe(409);

    // Instrutor assina (simula o fim do fluxo modal/inline); somente então a evidência é aceita.
    handle.raw.exec(`UPDATE fichas_sessao SET assinatura_instrutor_timestamp=datetime('now'),
      status='APROVADO', aprovado=1 WHERE id IN (${m.A.ficha_id},${m.B.ficha_id})`);
    expect((await call(m.A.ficha_id, { sessao_check_id: m.A.sessao_check_id, aprovado: true, observacoes: 'ok' })).status).toBe(201);
    expect((await call(m.B.ficha_id, { sessao_check_id: m.B.sessao_check_id, aprovado: false, observacoes: 'falha' })).status).toBe(201);
    expect((await call(m.D.ficha_id, { sessao_check_id: m.D.sessao_check_id, aprovado: true })).status).toBe(201);

    const a = (await (await call(m.A.ficha_id)).json()) as any;
    const b = (await (await call(m.B.ficha_id)).json()) as any;
    const c = (await (await call(m.C.ficha_id)).json()) as any;
    expect(a.data[0]).toMatchObject({ situacao: 'APROVADO', aprovado_comprovado: true });
    expect(a.data[0].data_vencimento).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(b.data[0]).toMatchObject({ situacao: 'REPROVADO', aprovado_comprovado: false });
    expect(c.data[0]).toMatchObject({ situacao: 'PENDENTE_AVALIACAO', aprovado_comprovado: false });

    const hist = handle.raw.prepare(
      `SELECT funcionario_id, status, deleted_at FROM qualificacoes_historico ORDER BY id`).all();
    const bEmployee = handle.raw.prepare('SELECT colaborador_id_aluno AS id FROM fichas_sessao WHERE id=?').get(m.B.ficha_id).id;
    const cEmployee = handle.raw.prepare('SELECT colaborador_id_aluno AS id FROM fichas_sessao WHERE id=?').get(m.C.ficha_id).id;
    // FAP prematura de B revogada (nunca apagada fisicamente) e auditada.
    const bRow = hist.find((r: any) => r.funcionario_id === bEmployee);
    expect(bRow).toMatchObject({ status: 'CANCELADA' });
    expect(bRow.deleted_at).not.toBeNull();
    // C jamais recebe histórico/FAP.
    expect(hist.some((r: any) => r.funcionario_id === cEmployee)).toBe(false);
    expect(handle.raw.prepare("SELECT COUNT(*) AS n FROM auditoria_avancada_v2 WHERE tabela='qualificacoes_historico' AND acao='DELETE'").get().n)
      .toBeGreaterThanOrEqual(1);

    // Evidência confirmada é imutável e não pode ser apagada fisicamente.
    expect(() => handle!.raw.exec('DELETE FROM sessoes_checks_resultados_individuais')).toThrow(/INDIVIDUAL_CHECK_DELETE_FORBIDDEN/);
    expect(() => handle!.raw.exec('UPDATE sessoes_checks_resultados_individuais SET aprovado=1-aprovado'))
      .toThrow(/INDIVIDUAL_CHECK_CONFIRMED_IMMUTABLE/);
  });

  it('rollback faz somente soft-delete, desvincula o login QA e é idempotente', () => {
    handle = buildDb();
    seed();
    expect(handle.raw.prepare('SELECT funcionario_id FROM usuarios WHERE id=900').get().funcionario_id).not.toBeNull();
    handle.raw.exec(buildRollbackSql(CODE, MARKER, QA_EMAIL));
    handle.raw.exec(buildRollbackSql(CODE, MARKER, QA_EMAIL));
    expect(handle.raw.prepare('SELECT funcionario_id FROM usuarios WHERE id=900').get().funcionario_id).toBeNull();
    expect(handle.raw.prepare('SELECT COUNT(*) AS n FROM funcionarios WHERE deleted_at IS NULL').get().n).toBe(0);
    expect(handle.raw.prepare('SELECT COUNT(*) AS n FROM funcionarios').get().n).toBe(5);
    expect(handle.raw.prepare('SELECT COUNT(*) AS n FROM fichas_sessao').get().n).toBe(4);
  });
});
