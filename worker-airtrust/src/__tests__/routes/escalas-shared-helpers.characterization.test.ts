import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  gerarEventosBase,
  getEscalaVerificada,
  getEscalaVerificadaParaMutacao,
  parseBody,
  removerEventosAutoGerados,
  TripulacaoSchema,
} from '../../routes/escalas-shared';

// Caracterização dos helpers compartilhados de Escalas antes de tirá-los de routes/.
// SQLite real, dois tenants, soft delete.

type EventoRow = {
  id: string;
  tipo_evento: string;
  data_inicio: string;
  data_fim: string;
  turno: string;
  local: string | null;
  aeronave: string | null;
  gerado_automaticamente: number;
  motivo_automatico: string | null;
  status: string;
  origem: string | null;
  created_by: string | null;
  deleted_at: string | null;
  funcionario_id: string;
  tripulacao_id: string | null;
};

let sqlite: SqliteD1Database;

function createSchema() {
  sqlite.database.exec(`
    CREATE TABLE escalas_mensais (
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT, deleted_at TEXT
    );
    CREATE TABLE escala_eventos (
      id TEXT PRIMARY KEY, escala_id TEXT NOT NULL, tripulacao_id TEXT, funcionario_id TEXT NOT NULL,
      tipo_evento TEXT NOT NULL, data_inicio TEXT NOT NULL, data_fim TEXT NOT NULL, turno TEXT,
      local TEXT, aeronave TEXT, gerado_automaticamente INTEGER NOT NULL DEFAULT 0,
      motivo_automatico TEXT, status TEXT, origem TEXT, created_by TEXT, created_at TEXT,
      updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO escalas_mensais (id, empresa_id, status, deleted_at) VALUES
      ('esc-1', 1, 'rascunho', NULL),
      ('esc-pub', 1, 'publicada', NULL),
      ('esc-del', 1, 'rascunho', '2026-01-01'),
      ('esc-other', 2, 'rascunho', NULL);
  `);
}

function insertManual(
  id: string,
  escalaId: string,
  funcionarioId: string,
  inicio: string,
  fim: string,
  deletedAt: string | null = null,
) {
  sqlite.database
    .prepare(
      `INSERT INTO escala_eventos (id, escala_id, funcionario_id, tipo_evento, data_inicio, data_fim,
         gerado_automaticamente, deleted_at)
       VALUES (?, ?, ?, 'trabalho', ?, ?, 0, ?)`,
    )
    .run(id, escalaId, funcionarioId, inicio, fim, deletedAt);
}

function autoEvents(escalaId: string, tripulacaoId: string): EventoRow[] {
  return sqlite.database
    .prepare(
      `SELECT * FROM escala_eventos WHERE escala_id = ? AND tripulacao_id = ?
       AND gerado_automaticamente = 1 ORDER BY data_inicio`,
    )
    .all(escalaId, tripulacaoId) as EventoRow[];
}

const base = {
  escala_id: 'esc-1',
  tripulacao_id: 'trip-1',
  funcionario_id: 'func-1',
  created_by: 'user-9',
};

beforeEach(() => {
  sqlite = new SqliteD1Database();
  createSchema();
});

afterEach(() => sqlite.close());

describe('gerarEventosBase', () => {
  it('preenche o mês inteiro: VOO dentro do período alocado, FOL no resto', async () => {
    const total = await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 1,
      ...base,
      data_inicio: '2026-03-10',
      data_fim: '2026-03-12',
      padrao_escala_id: null,
      aeronave: 'PR-ABC',
      base: 'SBJR',
    });

    expect(total).toBe(31);
    const rows = autoEvents('esc-1', 'trip-1');
    expect(rows).toHaveLength(31);
    expect(rows[0].data_inicio).toBe('2026-03-01');
    expect(rows[30].data_inicio).toBe('2026-03-31');

    const voos = rows.filter((r) => r.tipo_evento === 'voo').map((r) => r.data_inicio);
    expect(voos).toEqual(['2026-03-10', '2026-03-11', '2026-03-12']);
    expect(rows.filter((r) => r.tipo_evento === 'folga')).toHaveLength(28);

    const voo = rows.find((r) => r.data_inicio === '2026-03-10')!;
    expect(voo).toMatchObject({
      data_fim: '2026-03-10',
      turno: 'dia_todo',
      local: 'SBJR',
      aeronave: 'PR-ABC',
      gerado_automaticamente: 1,
      motivo_automatico: 'Auto-gerado — VOO dentro do período alocado',
      status: 'confirmado',
      origem: 'auto_quinzena',
      created_by: 'user-9',
      funcionario_id: 'func-1',
    });
    const folga = rows.find((r) => r.data_inicio === '2026-03-01')!;
    expect(folga.motivo_automatico).toBe('Auto-gerado — FOL fora do período alocado');
    expect(new Set(rows.map((r) => r.id)).size).toBe(31);
  });

  it('inclui o padrão de escala no motivo e grava null quando base/aeronave faltam', async () => {
    await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 1,
      ...base,
      data_inicio: '2026-03-01',
      data_fim: '2026-03-01',
      padrao_escala_id: '14x14',
    });

    const rows = autoEvents('esc-1', 'trip-1');
    expect(rows[0].motivo_automatico).toBe('Auto-gerado — VOO dentro do período alocado (padrão 14x14)');
    expect(rows[1].motivo_automatico).toBe('Auto-gerado — FOL fora do período alocado (padrão 14x14)');
    expect(rows[0].local).toBeNull();
    expect(rows[0].aeronave).toBeNull();
  });

  it('pula as datas cobertas por evento manual do mesmo funcionário na mesma escala', async () => {
    insertManual('m-1', 'esc-1', 'func-1', '2026-03-11', '2026-03-13');
    insertManual('m-outro-func', 'esc-1', 'func-2', '2026-03-20', '2026-03-20');
    insertManual('m-outra-escala', 'esc-pub', 'func-1', '2026-03-21', '2026-03-21');
    insertManual('m-apagado', 'esc-1', 'func-1', '2026-03-22', '2026-03-22', '2026-03-01');

    const total = await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 1,
      ...base,
      data_inicio: '2026-03-10',
      data_fim: '2026-03-12',
    });

    expect(total).toBe(28); // 31 dias - 3 cobertos pelo manual m-1
    const datas = autoEvents('esc-1', 'trip-1').map((r) => r.data_inicio);
    expect(datas).not.toContain('2026-03-11');
    expect(datas).not.toContain('2026-03-12');
    expect(datas).not.toContain('2026-03-13');
    expect(datas).toContain('2026-03-10');
    expect(datas).toContain('2026-03-20'); // manual de outro funcionário não bloqueia
    expect(datas).toContain('2026-03-21'); // manual de outra escala não bloqueia
    expect(datas).toContain('2026-03-22'); // manual apagado não bloqueia
  });

  it('só considera eventos manuais de escalas do tenant informado', async () => {
    insertManual('m-1', 'esc-1', 'func-1', '2026-03-11', '2026-03-11');

    const totalOutroTenant = await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 2,
      ...base,
      data_inicio: '2026-03-10',
      data_fim: '2026-03-12',
    });
    // esc-1 pertence à empresa 1: para a empresa 2 o evento manual não conta, nada é pulado
    expect(totalOutroTenant).toBe(31);
  });

  it('sem empresa_id não filtra por tenant (comportamento atual)', async () => {
    insertManual('m-1', 'esc-1', 'func-1', '2026-03-11', '2026-03-11');

    const total = await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: null,
      ...base,
      data_inicio: '2026-03-10',
      data_fim: '2026-03-12',
    });
    expect(total).toBe(30);
  });

  it('cobre todos os meses tocados quando a alocação cruza o mês', async () => {
    const total = await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 1,
      ...base,
      data_inicio: '2026-03-30',
      data_fim: '2026-04-02',
    });

    expect(total).toBe(61); // março (31) + abril (30)
    const rows = autoEvents('esc-1', 'trip-1');
    expect(rows[0].data_inicio).toBe('2026-03-01');
    expect(rows[60].data_inicio).toBe('2026-04-30');
    expect(rows.filter((r) => r.tipo_evento === 'voo').map((r) => r.data_inicio)).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ]);
  });

  it('respeita ano bissexto em fevereiro', async () => {
    const total = await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 1,
      ...base,
      data_inicio: '2028-02-10',
      data_fim: '2028-02-10',
    });
    expect(total).toBe(29);
  });
});

describe('removerEventosAutoGerados', () => {
  it('apaga (soft delete) só os eventos automáticos da tripulação indicada', async () => {
    await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 1,
      ...base,
      data_inicio: '2026-03-10',
      data_fim: '2026-03-10',
    });
    await gerarEventosBase({
      db: sqlite.asD1(),
      empresa_id: 1,
      ...base,
      tripulacao_id: 'trip-2',
      funcionario_id: 'func-2',
      data_inicio: '2026-03-10',
      data_fim: '2026-03-10',
    });
    insertManual('m-1', 'esc-1', 'func-1', '2026-03-11', '2026-03-11');

    const removidos = await removerEventosAutoGerados(sqlite.asD1(), 'esc-1', 'trip-1');

    expect(removidos).toBe(31);
    const vivos = sqlite.database
      .prepare(`SELECT tripulacao_id, gerado_automaticamente, COUNT(*) AS n FROM escala_eventos
                WHERE deleted_at IS NULL GROUP BY 1, 2 ORDER BY 1, 2`)
      .all() as Array<{ tripulacao_id: string | null; gerado_automaticamente: number; n: number }>;
    expect(vivos).toEqual([
      { tripulacao_id: null, gerado_automaticamente: 0, n: 1 },
      { tripulacao_id: 'trip-2', gerado_automaticamente: 1, n: 31 },
    ]);

    // idempotente: segunda chamada não encontra nada vivo
    expect(await removerEventosAutoGerados(sqlite.asD1(), 'esc-1', 'trip-1')).toBe(0);
  });
});

describe('getEscalaVerificada / getEscalaVerificadaParaMutacao', () => {
  it('só devolve escala do próprio tenant e não apagada', async () => {
    const db = sqlite.asD1();
    expect(await getEscalaVerificada(db, 'esc-1', 1)).toMatchObject({ id: 'esc-1', empresa_id: 1 });
    expect(await getEscalaVerificada(db, 'esc-1', 2)).toBeNull();
    expect(await getEscalaVerificada(db, 'esc-other', 1)).toBeNull();
    expect(await getEscalaVerificada(db, 'esc-del', 1)).toBeNull();
    expect(await getEscalaVerificada(db, 'nao-existe', 1)).toBeNull();
    expect(await getEscalaVerificada(db, 'esc-1', 0)).toBeNull();
  });

  it('para mutação: 400 sem empresa, 404 fora do tenant/apagada, 409 se publicada, ok caso contrário', async () => {
    const db = sqlite.asD1();
    expect(await getEscalaVerificadaParaMutacao(db, 'esc-1', 0)).toEqual({
      error: 'Empresa não identificada',
      status: 400,
    });
    expect(await getEscalaVerificadaParaMutacao(db, 'esc-other', 1)).toEqual({
      error: 'Escala não encontrada',
      status: 404,
    });
    expect(await getEscalaVerificadaParaMutacao(db, 'esc-del', 1)).toEqual({
      error: 'Escala não encontrada',
      status: 404,
    });
    expect(await getEscalaVerificadaParaMutacao(db, 'esc-pub', 1)).toEqual({
      error: 'Escala publicada não pode ser modificada diretamente. Inicie uma nova revisão primeiro.',
      status: 409,
    });
    const ok = await getEscalaVerificadaParaMutacao(db, 'esc-1', 1);
    expect(ok).toMatchObject({ escala: { id: 'esc-1', status: 'rascunho' } });
  });
});

describe('parseBody + TripulacaoSchema', () => {
  it('normaliza ids, aceita data BR e rejeita SIC igual ao PIC', () => {
    const ok = parseBody(TripulacaoSchema, {
      pic_id: 7,
      sic_id: ' 8 ',
      data_inicio: '10/03/2026',
      data_fim: '2026-03-12',
    });
    expect(ok).toMatchObject({
      ok: true,
      data: { pic_id: '7', sic_id: '8', data_inicio: '2026-03-10', data_fim: '2026-03-12' },
    });

    const mesmo = parseBody(TripulacaoSchema, {
      pic_id: '7',
      sic_id: 7,
      data_inicio: '2026-03-10',
      data_fim: '2026-03-12',
    });
    expect(mesmo).toEqual({ ok: false, error: 'SIC não pode ser o mesmo piloto que o PIC' });

    const ruim = parseBody(TripulacaoSchema, { pic_id: '', data_inicio: 'x', data_fim: '2026-03-12' });
    expect(ruim.ok).toBe(false);
  });
});
