import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { runFrmsIntegrityAudit } from '../../lib/frms/integrity-audit';

// Auditoria diária de integridade: jornada lançada sem escala de trabalho correspondente.
// Ausência programada (folga, férias, afastamento) não é escala de trabalho.
const Db = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (s: string): DatabaseSync };
const opened: DatabaseSync[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

function fixture() {
  const sqlite = new Db(':memory:');
  opened.push(sqlite);
  sqlite.exec(`
    CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, tripulante_id INTEGER, data TEXT, hora_apresentacao TEXT,
      hora_termino TEXT, horas_voo_minutos INTEGER, duracao_jornada_minutos INTEGER, deleted_at TEXT);
    CREATE TABLE frms_fatorizacao_jornada (id TEXT PRIMARY KEY, jornada_id TEXT, deleted_at TEXT);
    CREATE TABLE frms_acumulo_rolling (id TEXT PRIMARY KEY, tripulante_id INTEGER, data_referencia TEXT, deleted_at TEXT);
    CREATE TABLE escala_alocacoes (id TEXT PRIMARY KEY, funcionario_id TEXT, aeronave_id INTEGER, quinzena_id INTEGER,
      situacao_tipo TEXT, data_inicio TEXT, data_fim TEXT, status TEXT DEFAULT 'confirmado', deleted_at TEXT);
  `);
  const jornada = sqlite.prepare("INSERT INTO frms_jornada VALUES (?, ?, ?, '07:00', '12:00', 90, 300, NULL)");
  const factor = sqlite.prepare('INSERT INTO frms_fatorizacao_jornada VALUES (?, ?, NULL)');
  const allocStmt = sqlite.prepare('INSERT INTO escala_alocacoes (id, funcionario_id, aeronave_id, quinzena_id, situacao_tipo, data_inicio, data_fim, status) VALUES (?,?,?,?,?,?,?,?)');
  const alloc = (...args: unknown[]) => allocStmt.run(...args as []);
  const add = (id: string, crew: number, data: string) => { jornada.run(id, crew, data); factor.run(`f-${id}`, id); };
  const d1 = {
    prepare: (sql: string) => ({
      first: async () => sqlite.prepare(sql).get() ?? null,
      bind: (...args: unknown[]) => ({ first: async () => sqlite.prepare(sql).get(...args as []) ?? null }),
    }),
  } as unknown as D1Database;
  return { d1, add, alloc };
}

describe('auditoria diária de integridade FRMS: jornada fora da escala de trabalho', () => {
  it('conta jornada em ausência programada, com ou sem quinzena resolvida, e jornada sem alocação', async () => {
    const { d1, add, alloc } = fixture();
    add('ok-aeronave', 1, '2026-11-05'); alloc('a1', '1', 1, null, null, '2026-11-01', '2026-11-15', 'confirmado');
    add('ok-quinzena', 2, '2026-11-05'); alloc('a2', '2', null, 1, null, '2026-11-01', '2026-11-15', 'confirmado');
    add('ok-stb', 3, '2026-11-05'); alloc('a3', '3', null, null, 'STB', '2026-11-05', '2026-11-05', 'confirmado');
    add('ok-tolerancia-2d', 4, '2026-11-17'); alloc('a4', '4', 1, null, null, '2026-11-01', '2026-11-15', 'confirmado');

    add('ferias', 5, '2026-11-05'); alloc('a5', '5', null, 1, 'FERIAS', '2026-11-01', '2026-11-15', 'confirmado');
    add('med', 6, '2026-11-05'); alloc('a6', '6', null, 1, 'MED', '2026-11-01', '2026-11-15', 'confirmado');
    add('aft', 7, '2026-11-05'); alloc('a7', '7', null, null, 'AFT', '2026-11-01', '2026-11-15', 'confirmado');
    add('folga', 8, '2026-11-05'); alloc('a8', '8', null, 1, 'FOLGA', '2026-11-01', '2026-11-15', 'confirmado');
    add('sem-alocacao', 9, '2026-11-05');
    add('cancelada', 10, '2026-11-05'); alloc('a10', '10', 1, null, null, '2026-11-01', '2026-11-15', 'cancelado');
    add('longe', 11, '2026-11-25'); alloc('a11', '11', 1, null, null, '2026-11-01', '2026-11-15', 'confirmado');

    const audit = await runFrmsIntegrityAudit(d1);
    // ferias, med, aft, folga, sem-alocacao, cancelada e longe.
    expect(audit.jornadasLancadasForaQuinzena).toBe(7);
    expect(audit.jornadasSemFatorizacao).toBe(0);
  });

  it('ausência com alocação operacional no mesmo dia continua dentro da escala', async () => {
    const { d1, add, alloc } = fixture();
    add('mista', 1, '2026-11-05');
    alloc('ferias', '1', null, 1, 'FERIAS', '2026-11-05', '2026-11-05', 'confirmado');
    alloc('voo', '1', 1, null, null, '2026-11-05', '2026-11-05', 'confirmado');
    const audit = await runFrmsIntegrityAudit(d1);
    expect(audit.jornadasLancadasForaQuinzena).toBe(0);
  });
});
