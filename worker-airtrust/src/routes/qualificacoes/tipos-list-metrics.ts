/** Aggregates for the visible page of qualification types, scoped by tenant and selected IDs. */
export type TipoListMetric = {
  total_no_historico: number;
  setores_json: string;
  setores_count: number;
};

// Load aggregates only for the types returned by the already tenant/RBAC-scoped
// listing. The former derived-table GROUP BY scanned all tenants' histories
// and sector links even when the requested page contained only a few models.
// Passing IDs through json_each(?) also avoids D1's SQL bind-variable ceiling.
export async function loadTipoListMetrics(
  db: D1Database,
  empresaId: number,
  tipoIds: Array<number | string>,
  hasQualificacoesTiposSetores: boolean,
): Promise<Map<string, TipoListMetric>> {
  const ids = [...new Set(tipoIds.map((id) => String(id)).filter(Boolean))];
  const metrics = new Map<string, TipoListMetric>();
  if (ids.length === 0) return metrics;

  const idsJson = JSON.stringify(ids);
  type HistoryMetric = { tipo_id: number | string; total_no_historico: number };
  type SectorMetric = { tipo_id: number | string; setores_json: string; setores_count: number };

  const [history, sectors] = await Promise.all([
    db.prepare(
      `SELECT qh.qualificacao_id AS tipo_id, COUNT(*) AS total_no_historico
         FROM qualificacoes_historico qh
        WHERE qh.empresa_id = ?
          AND qh.deleted_at IS NULL
          AND qh.qualificacao_id IN (SELECT value FROM json_each(?))
        GROUP BY qh.qualificacao_id`,
    )
      .bind(empresaId, idsJson)
      .all<HistoryMetric>(),
    hasQualificacoesTiposSetores
      ? db.prepare(
          `SELECT qts.tipo_id AS tipo_id,
                  json_group_array(json_object('id', s.id, 'nome', s.nome)) AS setores_json,
                  COUNT(*) AS setores_count
             FROM qualificacoes_tipos_setores qts
             INNER JOIN setores s
               ON s.id = qts.setor_id
              AND s.empresa_id = qts.empresa_id
              AND s.deleted_at IS NULL
            WHERE qts.empresa_id = ?
              AND qts.deleted_at IS NULL
              AND qts.tipo_id IN (SELECT value FROM json_each(?))
            GROUP BY qts.tipo_id`,
        )
          .bind(empresaId, idsJson)
          .all<SectorMetric>()
      : Promise.resolve({ results: [] as SectorMetric[] }),
  ]);

  for (const id of ids) {
    metrics.set(id, { total_no_historico: 0, setores_json: '[]', setores_count: 0 });
  }
  for (const row of history.results || []) {
    const key = String(row.tipo_id);
    const current = metrics.get(key);
    if (current) current.total_no_historico = Number(row.total_no_historico) || 0;
  }
  for (const row of sectors.results || []) {
    const key = String(row.tipo_id);
    const current = metrics.get(key);
    if (current) {
      current.setores_json = row.setores_json || '[]';
      current.setores_count = Number(row.setores_count) || 0;
    }
  }
  return metrics;
}

