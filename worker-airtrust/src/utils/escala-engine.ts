/**
 * ESCALA ENGINE — Funções utilitárias para o módulo de Escala
 *
 * Funções puras para:
 *   - Verificação de conflitos de alocação
 *   - Detecção automática de CMA próximo ao vencimento
 *   - Geração de alertas CMA para uma escala
 */

let historicoTipoColumnCache: string | null = null;
let historicoVencimentoColumnCache: string | null = null;

async function resolveHistoricoTipoColumn(db: D1Database): Promise<string> {
  if (historicoTipoColumnCache) return historicoTipoColumnCache;

  const cols = await db
    .prepare(`PRAGMA table_info(qualificacoes_historico)`)
    .all<{ name?: string }>();

  const names = new Set((cols.results || []).map((c) => String(c.name || '').toLowerCase()));

  const candidate = ['qualificacao_tipo_id', 'qualificacao_id', 'tipo_id'].find((col) =>
    names.has(col),
  );

  if (!candidate) {
    throw new Error(
      'Schema incompatível: qualificacoes_historico sem coluna de tipo de qualificação',
    );
  }

  historicoTipoColumnCache = candidate;
  return candidate;
}

async function resolveHistoricoVencimentoColumn(db: D1Database): Promise<string> {
  if (historicoVencimentoColumnCache) return historicoVencimentoColumnCache;

  const cols = await db
    .prepare(`PRAGMA table_info(qualificacoes_historico)`)
    .all<{ name?: string }>();

  const names = new Set((cols.results || []).map((c) => String(c.name || '').toLowerCase()));

  const candidate = ['data_vencimento', 'validade'].find((col) => names.has(col));

  if (!candidate) {
    throw new Error('Schema incompatível: qualificacoes_historico sem coluna de vencimento');
  }

  historicoVencimentoColumnCache = candidate;
  return candidate;
}

// ================================================================
// VERIFICAR CONFLITOS DE ALOCAÇÃO
// ================================================================
export async function verificarConflitosEscala(
  db: D1Database,
  params: {
    escala_id: string;
    funcionario_id: string;
    data_inicio: string;
    data_fim: string;
    excluir_tipos?: string[];
    excluir_evento_id?: string;
  },
): Promise<Record<string, unknown>[]> {
  let query = `
    SELECT ee.*, f.nome as funcionario_nome
    FROM escala_eventos ee
    JOIN funcionarios f ON ee.funcionario_id = f.id
    WHERE ee.escala_id = ?
      AND ee.funcionario_id = ?
      AND ee.deleted_at IS NULL
      AND ee.status != 'cancelado'
      AND ee.data_inicio <= ?
      AND ee.data_fim >= ?
  `;
  const bindParams: unknown[] = [
    params.escala_id,
    params.funcionario_id,
    params.data_fim,
    params.data_inicio,
  ];

  if (params.excluir_tipos?.length) {
    query += ` AND ee.tipo_evento NOT IN (${params.excluir_tipos.map(() => '?').join(',')})`;
    bindParams.push(...params.excluir_tipos);
  }

  if (params.excluir_evento_id) {
    query += ` AND ee.id != ?`;
    bindParams.push(params.excluir_evento_id);
  }

  const result = await db
    .prepare(query)
    .bind(...bindParams)
    .all();
  return result.results as Record<string, unknown>[];
}

// ================================================================
// CMA AUTOMÁTICO — Regra de Negócio Central
// Se CMA do tripulante vencer na janela de 45 dias durante a missão,
// programa automaticamente exame médico para o ÚLTIMO DIA da missão
// ================================================================
export async function verificarCMAAutomatico(
  db: D1Database,
  params: {
    escala_id: string;
    tripulacao_id: string;
    funcionario_id: string;
    data_inicio: string;
    data_fim: string;
    created_by: string;
  },
): Promise<{ criado: boolean; alerta?: boolean; data_exame?: string; motivo?: string }> {
  const tipoCol = await resolveHistoricoTipoColumn(db);
  const vencCol = await resolveHistoricoVencimentoColumn(db);

  // Buscar qualificação CMA ativa do tripulante (via qualificacoes_historico)
  const cmaQuery = `
    SELECT qh.*, qh.${vencCol} as cma_data_vencimento, qt.codigo
    FROM qualificacoes_historico qh
    JOIN qualificacoes_tipos qt ON CAST(qh.${tipoCol} AS TEXT) = CAST(qt.id AS TEXT)
      AND qt.empresa_id = qh.empresa_id
      AND qt.deleted_at IS NULL
    WHERE qh.funcionario_id = ?
      AND qt.codigo = 'CMA'
      AND qh.deleted_at IS NULL
    ORDER BY qh.${vencCol} DESC
    LIMIT 1
  `;

  const cma = (await db.prepare(cmaQuery).bind(params.funcionario_id).first()) as Record<
    string,
    unknown
  > | null;

  if (!cma || !cma.cma_data_vencimento) return { criado: false };

  const hoje = new Date();
  const dataVencCMA = new Date(cma.cma_data_vencimento as string);
  const dataInicioMissao = new Date(params.data_inicio);
  const dataFimMissao = new Date(params.data_fim);

  // Janela de 45 dias: o CMA vence dentro dos próximos 45 dias?
  const diasParaVencer = Math.ceil(
    (dataVencCMA.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
  );
  const venceNaJanelaDe45Dias = diasParaVencer <= 45 && diasParaVencer >= 0;

  if (!venceNaJanelaDe45Dias) return { criado: false };

  // O vencimento ocorre DURANTE a missão?
  const venceDuranteMissao = dataVencCMA >= dataInicioMissao && dataVencCMA <= dataFimMissao;
  if (!venceDuranteMissao && dataVencCMA > dataFimMissao) return { criado: false };

  // REGRA: Alertar para exame CMA no ÚLTIMO DIA da missão (sem criar evento automaticamente)
  const dataExame = params.data_fim;

  const motivo = `CMA vence em ${cma.cma_data_vencimento} (${diasParaVencer} dias). Agende exame médico para o período da missão.`;

  return { criado: false, alerta: true, data_exame: dataExame, motivo };
}

// ================================================================
// GERAR RELATÓRIO DE ALERTAS CMA PARA UMA ESCALA
// ================================================================
export async function gerarAlertasCMA(
  db: D1Database,
  escala_id: string,
): Promise<Record<string, unknown>[]> {
  const tipoCol = await resolveHistoricoTipoColumn(db);
  const vencCol = await resolveHistoricoVencimentoColumn(db);

  // D1 não suporta julianday subtraction reliably, so compute in JS
  const query = `
    SELECT
      ee.*,
      f.nome as funcionario_nome,
      f.matricula,
      qh.${vencCol} as cma_vencimento
    FROM escala_eventos ee
    JOIN funcionarios f ON ee.funcionario_id = f.id
    LEFT JOIN qualificacoes_historico qh ON qh.funcionario_id = ee.funcionario_id
      AND qh.empresa_id = f.empresa_id
      AND qh.deleted_at IS NULL
      AND CAST(qh.${tipoCol} AS TEXT) IN (
        SELECT CAST(id AS TEXT) FROM qualificacoes_tipos WHERE codigo = 'CMA' AND empresa_id = f.empresa_id AND deleted_at IS NULL
      )
    WHERE ee.escala_id = ?
      AND ee.tipo_evento = 'medico'
      AND ee.gerado_automaticamente = 1
      AND ee.deleted_at IS NULL
    ORDER BY ee.data_inicio ASC
  `;

  const rows = (await db.prepare(query).bind(escala_id).all()).results as Record<string, unknown>[];

  const hoje = Date.now();
  return rows.map((r) => {
    const venc = r.cma_vencimento ? new Date(r.cma_vencimento as string).getTime() : null;
    return {
      ...r,
      dias_para_vencer: venc ? Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24)) : null,
    };
  });
}
