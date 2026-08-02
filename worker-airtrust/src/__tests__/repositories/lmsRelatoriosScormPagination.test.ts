import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { getScormConclusaoInconsistenteRows } from '../../repositories/lmsRelatoriosRepository';

type QueryCall = { query: string; args: unknown[] };

type LightRow = {
  matricula_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcao: string | null;
  curso_id: number;
  curso_titulo: string;
  status: string;
  progresso_pct: number;
  scorm_mastery_score: number | null;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_max: number | null;
  score_scaled: number | null;
  session_time: string | null;
  total_time: string | null;
  last_commit_at: string | null;
  cursor_last_commit_at: string;
  cursor_matricula_updated_at: string;
};

function makeLightRow(id: number, status = 'EM_ANDAMENTO'): LightRow {
  return {
    matricula_id: id,
    funcionario_id: 1000 + id,
    funcionario_nome: `Aluno ${id}`,
    funcao: 'Piloto',
    curso_id: 10,
    curso_titulo: 'SCORM Teste',
    status,
    progresso_pct: 100,
    scorm_mastery_score: 70,
    lesson_status: 'incomplete',
    completion_status: 'incomplete',
    success_status: 'unknown',
    score_raw: 100,
    score_max: 100,
    score_scaled: 1,
    session_time: 'PT10M',
    total_time: 'PT10M',
    last_commit_at: `2026-08-02 00:0${id}:00`,
    cursor_last_commit_at: `2026-08-02 00:0${id}:00`,
    cursor_matricula_updated_at: `2026-08-02 00:0${id}:30`,
  };
}

function createDb(lightRows: LightRow[], payloadRows: Array<Record<string, unknown>>) {
  const calls: QueryCall[] = [];
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ query, args });
        return {
          all: async () =>
            query.includes('FROM lms_matriculas')
              ? { results: lightRows }
              : { results: payloadRows },
        };
      },
    })),
  } as unknown as D1Database;
  return { db, calls };
}

describe('getScormConclusaoInconsistenteRows lightweight pagination', () => {
  it('aplica tenant, filtros e limite antes de carregar payloads em um único lote', async () => {
    const largeSuspendData = 'x'.repeat(65_000);
    const lightRows = [
      makeLightRow(3, 'EM_ANDAMENTO'),
      makeLightRow(2, 'NAO_INICIADO'),
      makeLightRow(1, 'REPROVADO'),
      makeLightRow(0, 'CONCLUIDO'),
    ];
    const { db, calls } = createDb(lightRows, [
      {
        matricula_id: 3,
        suspend_data: largeSuspendData,
        cmi_json: JSON.stringify({ 'cmi.location': '10/10' }),
      },
      { matricula_id: 2, suspend_data: '', cmi_json: '' },
      { matricula_id: 1, suspend_data: null, cmi_json: null },
    ]);

    const page = await getScormConclusaoInconsistenteRows(db, 77, [4, 9], { limit: 3 });

    expect(calls).toHaveLength(2);
    const lightQuery = calls[0]!.query;
    const lightProjection = lightQuery.slice(
      lightQuery.indexOf('SELECT'),
      lightQuery.indexOf('FROM lms_matriculas'),
    );
    expect(lightProjection).not.toContain('p.suspend_data');
    expect(lightProjection).not.toContain('p.cmi_json');
    expect(lightQuery).toContain('WHERE m.empresa_id = ?');
    expect(lightQuery).toContain('p.empresa_id = m.empresa_id');
    expect(lightQuery).toContain("m.status <> 'CONCLUIDO'");
    expect(lightQuery).toContain('lcs_f.setor_id IN (?,?)');
    expect(lightQuery).toContain('LIMIT ?');
    expect(calls[0]!.args).toEqual([77, 4, 9, 4, 9, 4]);

    const payloadQuery = calls[1]!.query;
    expect(payloadQuery).toContain('SELECT matricula_id, suspend_data, cmi_json');
    expect(payloadQuery).toContain('WHERE empresa_id = ?');
    expect(payloadQuery).toContain('matricula_id IN (?,?,?)');
    expect(calls[1]!.args).toEqual([77, 3, 2, 1]);
    expect(page.rows.map((row) => row.status)).toEqual([
      'EM_ANDAMENTO',
      'NAO_INICIADO',
      'REPROVADO',
    ]);
    expect(JSON.stringify(page.rows)).not.toContain(largeSuspendData);
    expect(page.nextCursor).not.toBeNull();
  });

  it('pagina por cursor estável sem duplicar nem perder matrículas', async () => {
    const firstDb = createDb(
      [makeLightRow(3), makeLightRow(2)],
      [{ matricula_id: 3, suspend_data: 'state-3', cmi_json: '{"cmi.location":"3/3"}' }],
    );
    const firstPage = await getScormConclusaoInconsistenteRows(firstDb.db, 77, [], {
      limit: 1,
    });

    expect(firstPage.rows.map((row) => row.matricula_id)).toEqual([3]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondDb = createDb(
      [makeLightRow(2)],
      [{ matricula_id: 2, suspend_data: 'state-2', cmi_json: '{"cmi.location":"2/2"}' }],
    );
    const secondPage = await getScormConclusaoInconsistenteRows(secondDb.db, 77, [], {
      limit: 1,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.rows.map((row) => row.matricula_id)).toEqual([2]);
    expect([...firstPage.rows, ...secondPage.rows].map((row) => row.matricula_id)).toEqual([3, 2]);
    expect(
      new Set([...firstPage.rows, ...secondPage.rows].map((row) => row.matricula_id)).size,
    ).toBe(2);
    expect(secondDb.calls[0]!.query).toContain("COALESCE(p.last_commit_at, '') < ?");
    expect(secondDb.calls[0]!.args.slice(-7)).toEqual([
      '2026-08-02 00:03:00',
      '2026-08-02 00:03:00',
      '2026-08-02 00:03:30',
      '2026-08-02 00:03:00',
      '2026-08-02 00:03:30',
      3,
      2,
    ]);
  });

  it('rejeita cursor inválido antes de consultar D1', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;

    await expect(
      getScormConclusaoInconsistenteRows(db, 77, [], { cursor: 'cursor-invalido' }),
    ).rejects.toMatchObject({ code: 'INVALID_SCORM_CURSOR' });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('não executa consulta de payload quando o pré-filtro não encontra linhas', async () => {
    const { db, calls } = createDb([], []);

    const page = await getScormConclusaoInconsistenteRows(db, 77, [], { limit: 25 });

    expect(page).toEqual({ rows: [], nextCursor: null });
    expect(calls).toHaveLength(1);
  });
});

const matriculasSource = readFileSync(
  new URL('../../routes/lms-matriculas.ts', import.meta.url).pathname,
  'utf8',
);
const progressoSource = readFileSync(
  new URL('../../routes/lms-progresso.ts', import.meta.url).pathname,
  'utf8',
);

describe('SCORM detail payload contract', () => {
  it('preserva detalhe e retomada com suspend_data e cmi_json', () => {
    expect(matriculasSource).toContain('scorm_progresso: progressoScorm');
    expect(matriculasSource).toContain('suspend_data:');
    expect(matriculasSource).toContain('cmi_json:');
    expect(progressoSource).toContain(
      'SELECT suspend_data, cmi_json, lesson_status, completion_status, success_status',
    );
  });
});
