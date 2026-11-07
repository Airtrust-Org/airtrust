/**
 * Consultas de tendência do SGSO (GET /kpi/tendencias) e catálogo de
 * categorias ADREP. As consultas de tendência filtram por empresa_id; o
 * catálogo ADREP é global (sem tenant) e só lista categorias ativas.
 */

type Row = Record<string, unknown>;

export interface SgsoTrends {
  relatosPorMes: Row[];
  ncsPorMes: Row[];
  topAeronaves: Row[];
  categoriasAdrep: Row[];
  matrizDensidade: Row[];
}

export async function loadSgsoTrends(db: D1Database, empresaId: number): Promise<SgsoTrends> {
  // Relatos por mês (últimos 12 meses)
  const relatosMes = await db
    .prepare(
      `SELECT strftime('%Y-%m', data_ocorrencia) AS mes, COUNT(*) AS total,
              SUM(CASE WHEN tipo = 'INCIDENTE' THEN 1 ELSE 0 END) AS incidentes,
              SUM(CASE WHEN tipo = 'ACIDENTE' THEN 1 ELSE 0 END) AS acidentes,
              SUM(CASE WHEN anonimo = 1 THEN 1 ELSE 0 END) AS anonimos
       FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL
         AND date(data_ocorrencia) >= date('now', '-12 months')
       GROUP BY mes
       ORDER BY mes ASC`,
    )
    .bind(empresaId)
    .all<Record<string, unknown>>();

  // NCs abertas por mês
  const ncsMes = await db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS mes, COUNT(*) AS total,
              SUM(CASE WHEN tipo = 'MAJOR' THEN 1 ELSE 0 END) AS major,
              SUM(CASE WHEN tipo = 'MINOR' THEN 1 ELSE 0 END) AS minor
       FROM sgso_nao_conformidades
       WHERE empresa_id = ? AND deleted_at IS NULL
         AND date(created_at) >= date('now', '-12 months')
       GROUP BY mes
       ORDER BY mes ASC`,
    )
    .bind(empresaId)
    .all<Record<string, unknown>>();

  // Top 5 aeronaves com mais relatos
  const topAeronaves = await db
    .prepare(
      `SELECT aeronave_matricula, aeronave_modelo, COUNT(*) AS total
       FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL AND aeronave_matricula IS NOT NULL
       GROUP BY aeronave_matricula
       ORDER BY total DESC
       LIMIT 5`,
    )
    .bind(empresaId)
    .all<Record<string, unknown>>();

  // Distribuição por categoria ADREP
  const categorias = await db
    .prepare(
      `SELECT categoria_adrep, COUNT(*) AS total
       FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL AND categoria_adrep IS NOT NULL
       GROUP BY categoria_adrep
       ORDER BY total DESC
       LIMIT 10`,
    )
    .bind(empresaId)
    .all<Record<string, unknown>>();

  // Densidade da matriz de risco (para heatmap)
  const matrizDensidade = await db
    .prepare(
      `SELECT probabilidade, severidade, COUNT(*) AS total
       FROM sgso_avaliacao_risco
       WHERE empresa_id = ? AND deleted_at IS NULL AND tipo_avaliacao = 'INICIAL'
       GROUP BY probabilidade, severidade`,
    )
    .bind(empresaId)
    .all<Record<string, unknown>>();

  return {
    relatosPorMes: relatosMes.results,
    ncsPorMes: ncsMes.results,
    topAeronaves: topAeronaves.results,
    categoriasAdrep: categorias.results,
    matrizDensidade: matrizDensidade.results,
  };
}

export interface CategoriaAdrep {
  id: number;
  codigo: string;
  nome_pt: string;
  nome_en: string;
}

export async function listCategoriasAdrepAtivas(db: D1Database): Promise<CategoriaAdrep[]> {
  const rows = await db
    .prepare(
      'SELECT id, codigo, nome_pt, nome_en FROM sgso_categorias_adrep WHERE ativo = 1 ORDER BY nome_pt ASC',
    )
    .all<CategoriaAdrep>();
  return rows.results;
}
