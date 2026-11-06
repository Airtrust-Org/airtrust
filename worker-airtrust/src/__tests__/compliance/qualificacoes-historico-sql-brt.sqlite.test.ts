/**
 * Auditoria de Compliance (2ª rodada) — filtros SQL do Histórico no mesmo dia civil do status exibido.
 *
 * O status derivado de cada linha usa `getTodayIsoSaoPaulo()`. Os filtros VALIDA / VENCENDO_30 / VENCIDA
 * (e a ordenação por status) eram SQL com `date('now')`, que é UTC: entre 21h e 24h BRT o filtro
 * discordava da linha exibida. Aqui os predicados REAIS rodam em SQLite, com o relógio fixado por
 * parâmetro (`saoPauloTodaySqlAt`), nas fronteiras 20:59, 22:30, 23:59 e 00:00 BRT.
 */
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  SAO_PAULO_TODAY_SQL,
  invalidateMaterializedStats,
  buildOrderByClause,
  buildVencimentoStatusPredicates,
  saoPauloTodaySqlAt,
} from '../../services/qualificacoes/historico-helpers';
import { getTodayIsoSaoPaulo } from '../../utils/qualificacoes-alerta-config';

let sqlite: SqliteD1Database;
let db: DatabaseSync;

const VENCIMENTOS: Array<string | null> = [
  '2026-11-03', // venceu ontem
  '2026-11-04', // vence hoje (dia civil BRT do 22:30)
  '2026-11-05',
  '2026-12-04', // hoje + 30
  '2026-12-05', // hoje + 31
  null,
];

beforeEach(() => {
  sqlite = new SqliteD1Database();
  db = sqlite.database;
  db.exec('DROP TABLE IF EXISTS q; CREATE TABLE q (id INTEGER PRIMARY KEY, venc TEXT)');
  const insert = db.prepare('INSERT INTO q (id, venc) VALUES (?, ?)');
  VENCIMENTOS.forEach((venc, index) => insert.run(index + 1, venc));
});
afterEach(() => sqlite.close());

/** Instante UTC (formato SQLite) e o dia civil BRT correspondente. */
const FRONTEIRAS = [
  { label: '20:59 BRT (23:59Z)', sqlInstant: "'2026-11-04 23:59:00'", iso: '2026-11-04T23:59:00Z', today: '2026-11-04' },
  { label: '22:30 BRT (01:30Z do dia 05)', sqlInstant: "'2026-11-05 01:30:00'", iso: '2026-11-05T01:30:00Z', today: '2026-11-04' },
  { label: '23:59 BRT (02:59Z do dia 05)', sqlInstant: "'2026-11-05 02:59:00'", iso: '2026-11-05T02:59:00Z', today: '2026-11-04' },
  { label: '00:00 BRT do dia 05 (03:00Z)', sqlInstant: "'2026-11-05 03:00:00'", iso: '2026-11-05T03:00:00Z', today: '2026-11-05' },
] as const;

function idsWhere(predicate: string): number[] {
  return (db.prepare(`SELECT id FROM q WHERE ${predicate} ORDER BY id`).all() as Array<{ id: number }>).map(
    (row) => row.id,
  );
}

/** Classificação por linha, idêntica à do handler (historico.ts): `< hoje`, `<= hoje+30`, senão válida. */
function rowStatus(venc: string | null, today: string): 'VENCIDA' | 'VENCENDO_30' | 'VALIDA' {
  if (venc === null) return 'VALIDA'; // sem vencimento entra no filtro VALIDA
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 30);
  if (venc < today) return 'VENCIDA';
  if (venc <= limit.toISOString().slice(0, 10)) return 'VENCENDO_30';
  return 'VALIDA';
}

describe('"hoje" do SQL é o mesmo dia civil de getTodayIsoSaoPaulo()', () => {
  it('cruza a expressão SQL com o helper TS em uma varredura de instantes (inclui virada de ano e bissexto)', () => {
    const select = db.prepare('SELECT ' + saoPauloTodaySqlAt('?') + ' AS d');
    const start = Date.parse('2026-12-30T00:00:00Z');
    const mismatches: string[] = [];
    // De 30 em 30 minutos por 14 dias, mais uma janela de 29/fev/2028.
    const instants: number[] = [];
    for (let i = 0; i < 14 * 48; i += 1) instants.push(start + i * 30 * 60_000);
    const leap = Date.parse('2028-02-28T20:00:00Z');
    for (let i = 0; i < 12 * 4; i += 1) instants.push(leap + i * 30 * 60_000);
    for (const ms of instants) {
      const sqlite = (select.get(new Date(ms).toISOString().replace('T', ' ').slice(0, 19)) as { d: string }).d;
      const ts = getTodayIsoSaoPaulo(new Date(ms));
      if (sqlite !== ts) mismatches.push(`${new Date(ms).toISOString()} sql=${sqlite} ts=${ts}`);
    }
    // Se o Brasil voltar a ter horário de verão, este teste acusa a divergência do offset fixo.
    expect(mismatches).toEqual([]);
  });

  it('a constante usada nos módulos é avaliada pelo SQLite a cada consulta (não congelada)', () => {
    expect(SAO_PAULO_TODAY_SQL).toBe("date('now','-3 hours')");
    const row = db.prepare(`SELECT ${SAO_PAULO_TODAY_SQL} AS d`).get() as { d: string };
    expect(row.d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('filtros SQL do Histórico nas fronteiras de 21h–24h BRT (SQLite real)', () => {
  it.each(FRONTEIRAS)('$label: partição exata e igual à classificação da linha', ({ sqlInstant, iso, today }) => {
    const predicates = buildVencimentoStatusPredicates('q.venc', saoPauloTodaySqlAt(sqlInstant));
    expect(today).toBe(getTodayIsoSaoPaulo(new Date(iso)));

    const vencida = idsWhere(predicates.vencida);
    const vencendo = idsWhere(predicates.vencendo);
    const valida = idsWhere(predicates.valida);

    // partição: nenhuma linha em dois filtros, nenhuma fora de todos
    expect([...vencida, ...vencendo, ...valida].sort()).toEqual(VENCIMENTOS.map((_, i) => i + 1));

    const expected = (status: string) =>
      VENCIMENTOS.map((venc, index) => ({ id: index + 1, status: rowStatus(venc, today) }))
        .filter((row) => row.status === status)
        .map((row) => row.id);
    expect(vencida).toEqual(expected('VENCIDA'));
    expect(vencendo).toEqual(expected('VENCENDO_30'));
    expect(valida).toEqual(expected('VALIDA'));
  });

  it('22:30 BRT: o item que vence hoje (dia 04) está em VENCENDO_30 e fora de VENCIDA', () => {
    const predicates = buildVencimentoStatusPredicates('q.venc', saoPauloTodaySqlAt("'2026-11-05 01:30:00'"));
    expect(idsWhere(predicates.vencendo)).toContain(2);
    expect(idsWhere(predicates.vencida)).toEqual([1]);
  });

  it('00:00 BRT do dia seguinte: o mesmo item passa a VENCIDA', () => {
    const predicates = buildVencimentoStatusPredicates('q.venc', saoPauloTodaySqlAt("'2026-11-05 03:00:00'"));
    expect(idsWhere(predicates.vencida)).toEqual([1, 2]);
  });

  it('contraste: com a data UTC antiga (date(instante)), às 22:30 BRT o item de hoje iria para VENCIDA', () => {
    const utcToday = "date('2026-11-05 01:30:00')";
    const legacy = buildVencimentoStatusPredicates('q.venc', utcToday);
    expect(idsWhere(legacy.vencida)).toEqual([1, 2]); // 04 já seria "vencido" — o defeito corrigido
  });
});

describe('contadores agregados e filtros partilham a classificação por dia civil', () => {
  it.each(FRONTEIRAS)('$label: soma dos grupos reproduz a classificação individual', ({ sqlInstant, today }) => {
    const predicates = buildVencimentoStatusPredicates('q.venc', saoPauloTodaySqlAt(sqlInstant));
    const counts = db.prepare(`SELECT
      SUM(CASE WHEN ${predicates.valida} THEN 1 ELSE 0 END) AS validas,
      SUM(CASE WHEN (${predicates.vencendo}) THEN 1 ELSE 0 END) AS vencendo,
      SUM(CASE WHEN ${predicates.vencida} THEN 1 ELSE 0 END) AS vencidas
      FROM q`).get() as { validas: number; vencendo: number; vencidas: number };
    const expected = {
      validas: VENCIMENTOS.filter((expiry) => rowStatus(expiry, today) === 'VALIDA').length,
      vencendo: VENCIMENTOS.filter((expiry) => rowStatus(expiry, today) === 'VENCENDO_30').length,
      vencidas: VENCIMENTOS.filter((expiry) => rowStatus(expiry, today) === 'VENCIDA').length,
    };
    expect(counts).toEqual(expected);
    expect(counts.validas + counts.vencendo + counts.vencidas).toBe(VENCIMENTOS.length);
  });
});

describe('invalidação da estatística materializada', () => {
  it('usa a mesma data civil de São Paulo da gravação e das contagens', async () => {
    const statements: string[] = [];
    const stubDb = {
      prepare: (statement: string) => {
        statements.push(statement);
        return { run: async () => ({ success: true }) };
      },
    } as unknown as D1Database;
    await invalidateMaterializedStats(stubDb);
    expect(statements).toEqual([
      `DELETE FROM qualificacoes_historico_stats_daily WHERE day = ${SAO_PAULO_TODAY_SQL}`,
    ]);
  });
});

describe('ordenação por status/vencimento não usa mais date(\'now\') em UTC', () => {
  it.each(['status', 'data_vencimento', 'vencimento'])('ORDER BY %s', (orderBy) => {
    const clause = buildOrderByClause(orderBy, 'ASC');
    expect(clause).not.toMatch(/date\('now'\)/);
    expect(clause).not.toMatch(/date\('now','\+30 days'\)/);
    expect(clause).toContain(SAO_PAULO_TODAY_SQL);
  });
});
