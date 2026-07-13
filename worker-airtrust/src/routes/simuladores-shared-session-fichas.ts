import { buildOperationalFichaManobras } from '../constants/notechs';
import { modelosSessaoManobrasHasTripulante } from './simuladores-shared';

export async function loadFichaManobrasForModelo(
  db: D1Database,
  modeloSessaoId: number,
): Promise<
  Array<{
    codigo: string;
    nome: string;
    descricao: string | null;
    categoria: string | null;
    ordem: number;
    tripulante: string | null;
  }>
> {
  const hasTripulante = await modelosSessaoManobrasHasTripulante(db);
  const tripulanteSql = hasTripulante ? "COALESCE(msm.tripulante, 'AB')" : "'AB'";
  const manobras = await db
    .prepare(
      `SELECT
         m.codigo,
         COALESCE(m.nome, m.descricao) AS nome,
         m.descricao,
         m.categoria,
         msm.ordem,
         msm.observacoes,
         ${tripulanteSql} AS tripulante
       FROM modelos_sessao_manobras msm
       INNER JOIN manobras m
         ON m.id = msm.manobra_id
        AND m.deleted_at IS NULL
       WHERE msm.modelo_id = ?
         AND msm.deleted_at IS NULL
       ORDER BY msm.ordem ASC`,
    )
    .bind(modeloSessaoId)
    .all<{
      codigo: string;
      nome: string;
      descricao: string | null;
      categoria: string | null;
      ordem: number;
      tripulante: string | null;
      observacoes: string | null;
    }>();

  return buildOperationalFichaManobras(manobras.results || []);
}

export function assertModeloSessaoTemManobras(
  modeloSessaoId: number,
  manobras: Array<unknown>,
) {
  if (manobras.length === 0) {
    throw new Error(
      `Ficha sem manobras: modelo de sessão ${modeloSessaoId} não possui manobras ativas.`,
    );
  }
}
