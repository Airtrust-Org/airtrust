import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Controle de Voos tem leitura própria (services/controle-voos); aqui o teste
// controla apenas os registros que ela devolve. As demais fontes são SQL real.
const cvRecords: unknown[] = [];
vi.mock('../../lib/frms/controle-voos-source', () => ({
  fetchControleVoosOperationalRecords: vi.fn(async (_db: unknown, empresaId: number) =>
    cvRecords.filter((record) => (record as { empresaId: number }).empresaId === empresaId)),
}));
import { loadDailyCheckinObligations } from '../../lib/frms/checkin-obligation';
import { loadDailyFatigueTeamRoster } from '../../lib/frms/daily-fatigue-team-roster';
import { createCheckinObligationFixture, sqliteAsD1, type Sqlite } from './helpers/checkin-obligation-fixture';

/**
 * Matriz de aceitação da obrigação de check-in contra SQLite real (mesmas
 * colunas usadas em produção). Tenant 7 é o avaliado; tenant 8 tenta vazar.
 * Q1 = 01–15/11, Q2 = 16–30/11.
 */
let sqlite: Sqlite;
const statements: Array<{ sql: string; args: unknown[] }> = [];

function makeDb(): D1Database {
  return sqliteAsD1(sqlite, statements);
}

beforeAll(() => {
  sqlite = createCheckinObligationFixture();
});

afterAll(() => sqlite?.close());

async function obligationsOn(date: string) {
  return loadDailyCheckinObligations(makeDb(), 7, date);
}

describe('obrigação de check-in — matriz de quinzenas (SQLite)', () => {
  it('quinzena ativa com alocação: check-in exigido', async () => {
    expect((await obligationsOn('2026-11-05')).get(101)).toMatchObject({ status: 'PENDENTE', base: 'ALOCACAO_OPERACIONAL' });
  });

  it('fora da quinzena e sem atividade: nenhuma pendência', async () => {
    expect((await obligationsOn('2026-11-25')).get(101)).toMatchObject({ status: 'NAO_APLICAVEL', exigivel: false });
  });

  it('quinzena quebrada: obrigação só nos dias alocados; o intervalo não herda a quinzena', async () => {
    expect((await obligationsOn('2026-11-03')).get(103)?.status).toBe('PENDENTE');
    expect((await obligationsOn('2026-11-07')).get(103)).toMatchObject({ status: 'NAO_APLICAVEL', base: 'SEM_PROGRAMACAO' });
    expect((await obligationsOn('2026-11-12')).get(103)?.status).toBe('PENDENTE');
  });

  it('férias dentro da quinzena-base: dispensado', async () => {
    expect((await obligationsOn('2026-11-05')).get(104)).toMatchObject({ status: 'DISPENSADO', base: 'AUSENCIA_PROGRAMADA' });
  });

  it('atividade real em folga: exige check-in só naquele dia e registra divergência', async () => {
    expect((await obligationsOn('2026-11-20')).get(105)).toMatchObject({
      status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA', divergencias: ['ATIVIDADE_EM_AUSENCIA'],
    });
    expect((await obligationsOn('2026-11-21')).get(105)).toMatchObject({ status: 'DISPENSADO' });
  });

  it('horas lançadas fora da quinzena (retroativo/duplicado): um dia, sem estender a quinzena', async () => {
    const day20 = (await obligationsOn('2026-11-20')).get(102);
    expect(day20).toMatchObject({ status: 'PENDENTE', divergencias: ['ATIVIDADE_FORA_DA_ESCALA'] });
    expect((await obligationsOn('2026-11-21')).get(102)?.status).toBe('NAO_APLICAVEL');
    // Linha de folga em frms_jornada, sem dado operacional, não é atividade.
    expect((await obligationsOn('2026-11-22')).get(102)?.status).toBe('NAO_APLICAVEL');
  });

  it('simulador concluído sem jornada: exige check-in (mesma evidência do snapshot)', async () => {
    expect((await obligationsOn('2026-11-25')).get(115)).toMatchObject({
      status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA', divergencias: ['ATIVIDADE_FORA_DA_ESCALA'],
    });
    expect((await obligationsOn('2026-11-26')).get(115)?.status).toBe('NAO_APLICAVEL');
  });

  it('voo do Controle de Voos sem frms_jornada: exige check-in; registro de outra empresa não vaza', async () => {
    const base = {
      identificadorInterno: 'cv-1', identificadorExterno: null, identificadorExternoTripulante: null,
      origem: 'CONTROLE_VOOS', origemDados: 'manual_interno', tripulanteId: 116, funcao: 'PIC',
      horaApresentacao: '06:30', horaDispensa: '12:00', horaMotorLigado: '07:00', horaDecolagem: '07:10',
      horaPouso: '11:00', horaMotorDesligado: '11:10', timezone: null, timezoneFonte: 'INDISPONIVEL',
      vooId: 1, etapaId: 1, aeronaveIdentificador: null, origemIcao: null, destinoIcao: null,
      minutosVoo: 230, minutosTotal: 240, cancelado: false, statusOperacional: 'CONFIRMADO', qualidadeDado: 'ok',
    };
    cvRecords.push(
      { ...base, empresaId: 7, dataOperacional: '2026-11-27' },
      { ...base, empresaId: 8, identificadorInterno: 'cv-foreign', dataOperacional: '2026-11-28' },
    );
    try {
      expect((await obligationsOn('2026-11-27')).get(116)).toMatchObject({ status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA' });
      expect((await obligationsOn('2026-11-28')).get(116)?.status).toBe('NAO_APLICAVEL');
    } finally {
      cvRecords.length = 0;
    }
  });

  it('jornada fora da fonte canônica não cria obrigação (mesma política do snapshot)', async () => {
    expect((await obligationsOn('2026-11-23')).get(102)?.status).toBe('NAO_APLICAVEL');
  });

  it('voo cancelado não gera obrigação; voo publicado gera', async () => {
    expect((await obligationsOn('2026-11-05')).get(106)?.status).toBe('NAO_APLICAVEL');
    expect((await obligationsOn('2026-11-06')).get(106)).toMatchObject({ status: 'PENDENTE', base: 'VOO_PROGRAMADO' });
  });

  it('substituição: obrigação acompanha o tripulante atualmente escalado', async () => {
    const map = await obligationsOn('2026-11-05');
    expect(map.get(111)?.status).toBe('PENDENTE');
    expect(map.get(110)?.status).toBe('NAO_APLICAVEL');
  });

  it('check-in já realizado e escala corrigida para folga: evidência preservada', async () => {
    expect((await obligationsOn('2026-11-05')).get(107)).toMatchObject({ status: 'RECEBIDO', exigivel: false });
  });

  it('folga manual dentro da alocação dispensa; folga auto-gerada não sobrepõe a alocação', async () => {
    expect((await obligationsOn('2026-11-08')).get(108)?.status).toBe('DISPENSADO');
    expect((await obligationsOn('2026-11-12')).get(108)?.status).toBe('PENDENTE');
  });

  it('quinzena-base sem escala publicada: incerteza, não pendência (alocação cancelada não conta)', async () => {
    expect((await obligationsOn('2026-11-05')).get(109)).toMatchObject({ status: 'INDETERMINADO', base: 'QUINZENA_BASE_SEM_ESCALA' });
  });

  it('afastamento sobreposto a alocação: divergência a reconciliar', async () => {
    expect((await obligationsOn('2026-11-07')).get(112)).toMatchObject({ status: 'INDETERMINADO', divergencias: ['ESCALA_CONFLITANTE'] });
  });

  it('tripulante inativo e de outra empresa ficam fora; dados do tenant 8 não vazam', async () => {
    const map = await obligationsOn('2026-11-05');
    expect(map.has(114)).toBe(false);
    expect(map.has(801)).toBe(false);
    // EVD, jornada e folga do tenant 8 apontando para tripulantes do tenant 7 são ignoradas.
    expect(map.get(109)?.status).toBe('INDETERMINADO');
    expect(map.get(101)?.status).toBe('PENDENTE');
  });

  it('consulta individual respeita o filtro de funcionário', async () => {
    const map = await loadDailyCheckinObligations(makeDb(), 7, '2026-11-05', { funcionarioId: 101 });
    expect([...map.keys()]).toEqual([101]);
  });

  it('todas as consultas ancoram empresa_id no primeiro bind', async () => {
    statements.length = 0;
    await obligationsOn('2026-11-05');
    expect(statements.length).toBeGreaterThanOrEqual(4);
    for (const { sql } of statements) expect(sql).toMatch(/empresa_id = \?/);
  });
});

describe('roster diário da equipe inclui alocação fora da quinzena-base e EVD', () => {
  it('lista tripulante escalado na EVD sem quinzena-base e omite inativo', async () => {
    const rows = await loadDailyFatigueTeamRoster({
      db: makeDb(), empresaId: 7, date: '2026-11-06',
      sectorScope: { clause: '1 = 1', bindings: [] }, limit: 100, offset: 0,
    });
    const ids = rows.map((row) => Number(row.funcionario_id));
    expect(ids).toContain(106);
    expect(ids).not.toContain(114);
    expect(ids).not.toContain(801);
  });
});
