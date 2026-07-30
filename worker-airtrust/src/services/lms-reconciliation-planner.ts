/**
 * lms-reconciliation-planner.ts — planner read-only para religar matrículas
 * LMS CONCLUIDO sem Histórico vinculado a um Histórico já existente.
 *
 * Escopo desta peça (ver relatório de entrega para o que falta): apenas o
 * PLANNER. Não existe executor de escrita nesta sessão — nenhuma SQL de
 * UPDATE/reconciliação real foi criada ou aplicada. Sem manifest real de
 * produção para validar contra, um executor seria código especulativo.
 *
 * Regras:
 *   - somente SELECT, nunca escreve;
 *   - candidato válido = mesmo tenant + mesmo funcionário + mesma
 *     qualificação (código) + Histórico ativo (não deletado) cuja
 *     data_conclusao é compatível com a matrícula (mesma data, ou o
 *     Histórico mais recente quando a matrícula não tem data_conclusao);
 *   - candidato único → religar; mais de um candidato → ambíguo, não religa;
 *   - manifest não inclui nomes, apenas IDs técnicos;
 *   - cada entrada do manifest carrega um SHA-256 dos IDs envolvidos, para
 *     que o hash do manifest sirva de prova de integridade antes de
 *     qualquer execução futura (fora desta sessão).
 */

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface LmsReconciliationCandidate {
  matricula_id: number;
  candidate_historico_id: number;
  reason: 'EXACT_DATE_MATCH' | 'MOST_RECENT_ACTIVE';
  entry_hash: string;
}

export interface LmsReconciliationAmbiguity {
  matricula_id: number;
  candidate_historico_ids: number[];
  reason: 'MULTIPLE_CANDIDATES';
}

export interface LmsReconciliationManifest {
  tenant_id: number;
  generated_at: string;
  total_unlinked_matriculas: number;
  candidates: LmsReconciliationCandidate[];
  ambiguities: LmsReconciliationAmbiguity[];
  manifest_hash: string;
}

interface UnlinkedMatricula {
  id: number;
  funcionario_id: number;
  qualificacao_codigo: string | null;
  data_conclusao: string | null;
}

interface HistoricoCandidateRow {
  id: number;
  data_conclusao: string | null;
}

/**
 * Gera o manifest de reconciliação para um tenant. Somente leitura — nenhuma
 * escrita acontece aqui, e a função não recebe nenhum executor injetado.
 */
export async function planLmsHistoricoReconciliation(
  db: D1Database,
  tenantId: number,
): Promise<LmsReconciliationManifest> {
  const unlinked = await db
    .prepare(
      `SELECT m.id AS id, m.funcionario_id AS funcionario_id,
              COALESCE(qt.codigo, c.qualificacao_tipo_id) AS qualificacao_codigo,
              m.data_conclusao AS data_conclusao
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
         LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.deleted_at IS NULL
        WHERE m.empresa_id = ?
          AND m.status = 'CONCLUIDO'
          AND m.qualificacao_historico_id IS NULL
          AND m.deleted_at IS NULL
          AND c.gerar_qualificacao_ao_concluir = 1
          AND c.qualificacao_tipo_id IS NOT NULL`,
    )
    .bind(tenantId)
    .all<UnlinkedMatricula>();

  const candidates: LmsReconciliationCandidate[] = [];
  const ambiguities: LmsReconciliationAmbiguity[] = [];

  for (const matricula of unlinked.results ?? []) {
    if (!matricula.qualificacao_codigo) continue;

    const historicos = await db
      .prepare(
        `SELECT id, data_conclusao
           FROM qualificacoes_historico
          WHERE empresa_id = ?
            AND funcionario_id = ?
            AND qualificacao_codigo = ?
            AND deleted_at IS NULL
          ORDER BY data_conclusao DESC, id DESC`,
      )
      .bind(tenantId, matricula.funcionario_id, matricula.qualificacao_codigo)
      .all<HistoricoCandidateRow>();

    const rows = historicos.results ?? [];
    if (rows.length === 0) continue;

    const exactMatches = matricula.data_conclusao
      ? rows.filter((row) => row.data_conclusao === matricula.data_conclusao)
      : [];

    if (exactMatches.length === 1) {
      const entryHash = await sha256Hex(`${matricula.id}:${exactMatches[0].id}:EXACT_DATE_MATCH`);
      candidates.push({
        matricula_id: matricula.id,
        candidate_historico_id: exactMatches[0].id,
        reason: 'EXACT_DATE_MATCH',
        entry_hash: entryHash,
      });
      continue;
    }

    if (exactMatches.length > 1) {
      ambiguities.push({
        matricula_id: matricula.id,
        candidate_historico_ids: exactMatches.map((row) => row.id),
        reason: 'MULTIPLE_CANDIDATES',
      });
      continue;
    }

    // Sem data_conclusao na matrícula, ou nenhum match exato: só resolve se
    // houver exatamente UM Histórico ativo para esta combinação — qualquer
    // pluralidade é ambiguidade, nunca "o mais recente" adivinhado.
    if (rows.length === 1) {
      const entryHash = await sha256Hex(`${matricula.id}:${rows[0].id}:MOST_RECENT_ACTIVE`);
      candidates.push({
        matricula_id: matricula.id,
        candidate_historico_id: rows[0].id,
        reason: 'MOST_RECENT_ACTIVE',
        entry_hash: entryHash,
      });
    } else {
      ambiguities.push({
        matricula_id: matricula.id,
        candidate_historico_ids: rows.map((row) => row.id),
        reason: 'MULTIPLE_CANDIDATES',
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const manifestBody = JSON.stringify({ tenantId, generatedAt, candidates, ambiguities });
  const manifestHash = await sha256Hex(manifestBody);

  return {
    tenant_id: tenantId,
    generated_at: generatedAt,
    total_unlinked_matriculas: unlinked.results?.length ?? 0,
    candidates,
    ambiguities,
    manifest_hash: manifestHash,
  };
}
