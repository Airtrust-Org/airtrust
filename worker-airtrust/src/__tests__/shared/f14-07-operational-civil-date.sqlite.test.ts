import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { D1Database } from '@cloudflare/workers-types';
import {
  getTripulanteOperacional,
  getTripulantesOperacionaisTodos,
  getTripulantesOperacionaisPorModelo,
  getFrmsOperationalState,
} from '../../shared/getTripulanteOperacional';
import { getTodayIsoSaoPaulo } from '../../utils/qualificacoes-alerta-config';

type SqlValue = string | number | null;
type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...args: SqlValue[]): Record<string, unknown> | undefined;
    all(...args: SqlValue[]): Array<Record<string, unknown>>;
  };
  close(): void;
};
const Sqlite = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (filename: string) => SqliteDb;

function createFixture() {
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id TEXT PRIMARY KEY, nome TEXT, guerra TEXT, matricula TEXT,
      empresa_id INTEGER, funcao TEXT, cargo TEXT, modelo_aeronave_id TEXT,
      aeronave TEXT, deleted_at TEXT, ativo INTEGER
    );
    CREATE TABLE qualificacoes_tipos (id INTEGER, empresa_id INTEGER, deleted_at TEXT, codigo TEXT, validade INTEGER);
    CREATE TABLE qualificacoes_historico (
      id INTEGER, funcionario_id TEXT, empresa_id INTEGER, deleted_at TEXT, status TEXT,
      qualificacao_id INTEGER, qualificacao_codigo TEXT,
      validade_meses INTEGER, data_conclusao TEXT, data_vencimento TEXT
    );
    CREATE TABLE frms_jornada (tripulante_id TEXT, data TEXT, horas_voo_minutos INTEGER, deleted_at TEXT, created_at TEXT);
    CREATE TABLE frms_alerta (tripulante_id TEXT, deleted_at TEXT, resolvido INTEGER, nivel TEXT);
    CREATE TABLE simulador_agendamentos (id INTEGER, status TEXT, deleted_at TEXT, data TEXT);
    CREATE TABLE sessoes_participantes (funcionario_id TEXT, sessao_id INTEGER, deleted_at TEXT);
    CREATE TABLE funcionarios_aeronaves (funcionario_id TEXT, aeronave_id INTEGER, deleted_at TEXT, ativo INTEGER, data_fim TEXT);
    CREATE TABLE aeronaves (id INTEGER, modelo TEXT, prefixo TEXT, codigo TEXT, deleted_at TEXT);
    CREATE TABLE modelos_aeronave (id INTEGER, codigo TEXT, modelo TEXT, nome TEXT, deleted_at TEXT);
    CREATE TABLE escala_tripulacoes (escala_id TEXT, deleted_at TEXT, pic_id TEXT, sic_id TEXT);
    CREATE TABLE escala_alocacoes (escala_id TEXT, deleted_at TEXT, status TEXT, funcionario_id TEXT);

    INSERT INTO funcionarios VALUES
      ('1','Pessoa Teste','Pessoa','A001',6,'COMANDANTE',NULL,NULL,NULL,NULL,1),
      ('2','Outro Tenant','Outro','A002',7,'COMANDANTE',NULL,NULL,NULL,NULL,1);
    INSERT INTO qualificacoes_tipos VALUES (10,6,NULL,'CMA',12);
    INSERT INTO qualificacoes_historico VALUES
      (1,'1',6,NULL,'CONCLUIDA',10,'CMA',12,'2025-11-14','2026-11-14'),
      (2,'2',7,NULL,'CONCLUIDA',10,'CMA',12,'2025-11-14','2026-11-14');
    INSERT INTO simulador_agendamentos VALUES (10,'AGENDADO',NULL,'2026-11-14');
    INSERT INTO sessoes_participantes VALUES ('1',10,NULL);
    INSERT INTO aeronaves VALUES (20,'AW139','PT-TST','AW139',NULL);
    INSERT INTO funcionarios_aeronaves VALUES ('1',20,NULL,1,'2026-11-14');
    INSERT INTO frms_jornada VALUES ('1','2026-11-07',60,NULL,'2026-11-07T17:00:00Z');
  `);
  const prepare = (sql: string) => ({
    bind: (...args: SqlValue[]) => ({
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    }),
  });
  return { sqlite, db: { prepare } as unknown as D1Database };
}

describe('F14-07 — mesma data civil America/Sao_Paulo em consumidores operacionais', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('às 23h30 BRT: CMA, simulador, habilitação e FRMS ainda enxergam o dia 14', async () => {
    vi.setSystemTime(new Date('2026-11-15T02:30:00Z'));
    expect(getTodayIsoSaoPaulo()).toBe('2026-11-14');
    const { db, sqlite } = createFixture();
    try {
      const c = await getTripulanteOperacional(db, '1', 6);
      expect(c).not.toBeNull();
      expect(c?.cma_valido).toBe(true);
      expect(c?.cma_dias_restantes).toBe(0);
      expect(c?.status_operacional).toBe('ATENCAO_CMA');
      expect(c?.pode_ser_alocado).toBe(true);
      expect(c?.simuladores_pendentes).toBe(1);
      expect(c?.proximo_simulador_data).toBe('2026-11-14');
      expect(c?.habilitacoes.map((x) => x.modelo_codigo)).toContain('AW139');

      const todos = await getTripulantesOperacionaisTodos(db, 6);
      expect(todos).toHaveLength(1);
      expect(todos[0].status_operacional).toBe(c?.status_operacional);
      const porModelo = await getTripulantesOperacionaisPorModelo(db, 6, 'AW139');
      expect(porModelo.map((x) => x.funcionario_id)).toEqual(['1']);
      const frms = await getFrmsOperationalState(db, '1');
      expect(frms.frms_score).toBe(4);
      expect(await getTripulanteOperacional(db, '2', 6)).toBeNull();
    } finally { sqlite.close(); }
  });

  it('após meia-noite BRT: CMA vencido não vira APTO, simulador e habilitação expiram', async () => {
    vi.setSystemTime(new Date('2026-11-15T03:30:00Z'));
    expect(getTodayIsoSaoPaulo()).toBe('2026-11-15');
    const { db, sqlite } = createFixture();
    try {
      const c = await getTripulanteOperacional(db, '1', 6);
      expect(c?.cma_valido).toBe(false);
      expect(c?.status_operacional).toBe('BLOQUEADO_CMA');
      expect(c?.pode_ser_alocado).toBe(false);
      expect(c?.simuladores_pendentes).toBe(0);
      expect(c?.habilitacoes).toEqual([]);
      const porModelo = await getTripulantesOperacionaisPorModelo(db, 6, 'AW139');
      expect(porModelo).toHaveLength(0);
      const frms = await getFrmsOperationalState(db, '1');
      expect(frms.frms_score).toBe(2);
    } finally { sqlite.close(); }
  });
});
