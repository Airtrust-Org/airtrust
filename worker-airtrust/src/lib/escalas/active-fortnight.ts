import type { D1Database } from '@cloudflare/workers-types';

export interface ActiveFortnightRange {
  numero: 1 | 2;
  data_inicio: string;
  data_fim: string;
}

function parseFuncionarioQuinzena(value: string | null | undefined): 1 | 2 | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (['primeira', '1', '1q', 'q1', '1ª', '1a', 'primeira quinzena'].includes(normalized)) {
    return 1;
  }

  if (['segunda', '2', '2q', 'q2', '2ª', '2a', 'segunda quinzena'].includes(normalized)) {
    return 2;
  }

  return null;
}

export async function resolveFuncionarioActiveFortnightForDate(
  db: D1Database,
  funcionarioId: string | number,
  dataReferencia: string,
): Promise<ActiveFortnightRange | null> {
  const quinzenasResult = await db
    .prepare(
      `SELECT
         f.quinzena AS funcionario_quinzena,
         eq.numero,
         eq.data_inicio,
         eq.data_fim
       FROM funcionarios f
       JOIN escalas_quinzenas eq
         ON eq.empresa_id = f.empresa_id
        AND eq.ano = CAST(strftime('%Y', ?) AS INTEGER)
        AND eq.mes = CAST(strftime('%m', ?) AS INTEGER)
        AND eq.deleted_at IS NULL
       WHERE CAST(f.id AS TEXT) = ?
         AND f.deleted_at IS NULL
         AND eq.data_inicio <= ?
         AND eq.data_fim >= ?`,
    )
    .bind(dataReferencia, dataReferencia, String(funcionarioId), dataReferencia, dataReferencia)
    .all<{
      funcionario_quinzena: string | null;
      numero: number | null;
      data_inicio: string | null;
      data_fim: string | null;
    }>();

  const quinzenas = quinzenasResult.results || [];
  const quinzenaNumero = parseFuncionarioQuinzena(quinzenas[0]?.funcionario_quinzena);
  const quinzena =
    quinzenaNumero == null
      ? null
      : quinzenas.find((item) => item.numero === quinzenaNumero) ?? null;

  if (
    !quinzena ||
    (quinzena.numero !== 1 && quinzena.numero !== 2) ||
    !quinzena.data_inicio ||
    !quinzena.data_fim
  ) {
    return null;
  }

  return {
    numero: quinzena.numero,
    data_inicio: quinzena.data_inicio,
    data_fim: quinzena.data_fim,
  };
}

export function isDateWithinActiveFortnight(
  range: ActiveFortnightRange | null | undefined,
  dataReferencia: string,
): boolean {
  return Boolean(
    range &&
      dataReferencia >= range.data_inicio &&
      dataReferencia <= range.data_fim &&
      (range.numero === 1 || range.numero === 2),
  );
}

export function resolveTripulanteActiveFortnightFromMonth(
  tripulanteQuinzena: number | null | undefined,
  diaIso: string,
  quinzenas: Array<{ numero: number; data_inicio: string; data_fim: string }>,
): ActiveFortnightRange | null {
  if (tripulanteQuinzena !== 1 && tripulanteQuinzena !== 2) {
    return null;
  }

  const range = quinzenas.find(
    (quinzena) =>
      quinzena.numero === tripulanteQuinzena &&
      diaIso >= quinzena.data_inicio &&
      diaIso <= quinzena.data_fim,
  );

  if (!range) return null;

  return {
    numero: tripulanteQuinzena,
    data_inicio: range.data_inicio,
    data_fim: range.data_fim,
  };
}

export { parseFuncionarioQuinzena };
