/**
 * ESCALAS — Alocações internas helpers
 * Extracted from escalas-alocacoes.ts for readability.
 */

import type {
  FuncaoAlocacao,
  SituacaoTipoCodigo,
  SituacaoTipoRow,
  AlocacaoDetalhadaRow,
} from './escalas-alocacoes-schemas';

export type SobreposicaoFuncionarioDetalhe = {
  id: string;
  escala_id: string;
  aeronave_id: number | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  data_inicio: string;
  data_fim: string;
  funcao: string | null;
  quinzena_numero: number | null;
  situacao_tipo: string | null;
  situacao_nome: string | null;
};

export function getUserId(c: { get: (k: string) => unknown }): string {
  return String(c.get('userId') || '');
}

export function escalasClientError(
  error: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return {
    success: false,
    error,
    code,
    ...(extra ?? {}),
  };
}

function formatarDataCurtaIso(value: string | null | undefined): string {
  const texto = String(value || '').slice(0, 10);
  const [ano, mes, dia] = texto.split('-');
  if (!ano || !mes || !dia) return texto;
  return `${dia}/${mes}/${ano}`;
}

export function formatarDescricaoSobreposicao(
  conflito: Pick<
    SobreposicaoFuncionarioDetalhe,
    | 'aeronave_prefixo'
    | 'aeronave_modelo'
    | 'data_inicio'
    | 'data_fim'
    | 'funcao'
    | 'quinzena_numero'
    | 'situacao_tipo'
    | 'situacao_nome'
  >,
): string {
  const quinzena =
    conflito.quinzena_numero === 1 ? '1Q' : conflito.quinzena_numero === 2 ? '2Q' : null;
  const origem =
    conflito.situacao_nome ||
    conflito.situacao_tipo ||
    conflito.aeronave_prefixo ||
    conflito.aeronave_modelo ||
    'Sem aeronave';

  const descricao = [quinzena, conflito.funcao, origem].filter(Boolean).join(' · ');
  return `${descricao || origem} de ${formatarDataCurtaIso(conflito.data_inicio)} a ${formatarDataCurtaIso(conflito.data_fim)}`;
}

export async function getSituacaoTipo(
  db: D1Database,
  codigo: SituacaoTipoCodigo,
): Promise<SituacaoTipoRow | null> {
  return db
    .prepare(
      `SELECT id, codigo, nome, cor, icone, bloqueia_alocacao, ativo, ordem
         FROM escala_situacao_tipos
        WHERE codigo = ?
          AND deleted_at IS NULL
          AND ativo = 1
        LIMIT 1`,
    )
    .bind(codigo)
    .first<SituacaoTipoRow>();
}

export async function sincronizarFuncionarioFerias(
  db: D1Database,
  params: {
    funcionarioId: string;
    dataInicio: string;
    dataFim: string;
    tipo: string;
    observacoes?: string | null;
    escalaAlocacaoId?: string | null;
    criadoPor: string;
  },
): Promise<void> {
  const existente = params.escalaAlocacaoId
    ? await db
        .prepare(
          `SELECT id FROM funcionario_ferias
            WHERE escala_alocacao_id = ?
              AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(params.escalaAlocacaoId)
        .first<{ id: string }>()
    : null;

  if (existente) {
    await db
      .prepare(
        `UPDATE funcionario_ferias
            SET funcionario_id = ?,
                data_inicio = ?,
                data_fim = ?,
                tipo = ?,
                observacoes = ?,
                updated_at = datetime('now'),
                deleted_at = NULL
          WHERE id = ?`,
      )
      .bind(
        params.funcionarioId,
        params.dataInicio,
        params.dataFim,
        params.tipo,
        params.observacoes || null,
        existente.id,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO funcionario_ferias
       (id, funcionario_id, data_inicio, data_fim, tipo, observacoes, escala_alocacao_id, criado_por, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      crypto.randomUUID(),
      params.funcionarioId,
      params.dataInicio,
      params.dataFim,
      params.tipo,
      params.observacoes || null,
      params.escalaAlocacaoId || null,
      params.criadoPor,
    )
    .run();
}

export async function removerFuncionarioFeriasPorAlocacao(
  db: D1Database,
  escalaAlocacaoId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE funcionario_ferias
          SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE escala_alocacao_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(escalaAlocacaoId)
    .run();
}

/**
 * Após alocar um tripulante numa quinzena (Q1 ou Q2), cria automaticamente
 * uma FOLGA na quinzena oposta SE o tripulante não tiver nenhuma alocação lá.
 */
export async function criarFolgaAutomaticaQuinzenaOposta(
  db: D1Database,
  params: {
    escalaId: string;
    funcionarioId: string;
    quinzenaId: number;
    userId: string;
  },
): Promise<string | null> {
  const quinzenaAlocada = await db
    .prepare(
      `SELECT numero, empresa_id, ano, mes FROM escalas_quinzenas WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(params.quinzenaId)
    .first<{ numero: number; empresa_id: number; ano: number; mes: number }>();

  if (!quinzenaAlocada) return null;

  const numeroOposto = quinzenaAlocada.numero === 1 ? 2 : 1;

  const quinzenaOposta = await db
    .prepare(
      `SELECT id, data_inicio, data_fim FROM escalas_quinzenas
       WHERE empresa_id = ? AND ano = ? AND mes = ? AND numero = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(quinzenaAlocada.empresa_id, quinzenaAlocada.ano, quinzenaAlocada.mes, numeroOposto)
    .first<{ id: number; data_inicio: string; data_fim: string }>();

  if (!quinzenaOposta) return null;

  const existente = await db
    .prepare(
      `SELECT id FROM escala_alocacoes
       WHERE funcionario_id = ? AND escala_id = ?
         AND quinzena_id = ? AND deleted_at IS NULL
         AND status != 'cancelado'
       LIMIT 1`,
    )
    .bind(params.funcionarioId, params.escalaId, quinzenaOposta.id)
    .first<{ id: string }>();

  if (existente) return null;

  const folgaTipo = await db
    .prepare(
      `SELECT codigo, cor FROM escala_situacao_tipos
       WHERE codigo = 'FOLGA' AND deleted_at IS NULL AND ativo = 1 LIMIT 1`,
    )
    .first<{ codigo: string; cor: string }>();

  if (!folgaTipo) return null;

  const folgaId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO escala_alocacoes
       (id, escala_id, funcionario_id, aeronave_id, funcao, situacao_tipo, situacao_cor,
        quinzena_id, data_inicio, data_fim, status, observacoes, auto_gerado,
        created_by, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, 'FOLGA', ?, ?, ?, ?, 'planejado',
               'Folga automática (quinzena oposta)', 1, ?, ?, ?)`,
    )
    .bind(
      folgaId,
      params.escalaId,
      params.funcionarioId,
      folgaTipo.cor,
      quinzenaOposta.id,
      quinzenaOposta.data_inicio,
      quinzenaOposta.data_fim,
      params.userId,
      now,
      now,
    )
    .run();

  return folgaId;
}

export async function removerFolgaAutomaticaSeExiste(
  db: D1Database,
  params: {
    escalaId: string;
    funcionarioId: string;
    quinzenaId: number;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE escala_alocacoes SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE funcionario_id = ? AND escala_id = ? AND quinzena_id = ?
         AND deleted_at IS NULL AND status != 'cancelado'
         AND auto_gerado = 1 AND situacao_tipo = 'FOLGA'`,
    )
    .bind(params.funcionarioId, params.escalaId, params.quinzenaId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function cancelarFolgasSobrepostas(
  db: D1Database,
  params: {
    escalaId: string;
    funcionarioId: string;
    dataInicio: string;
    dataFim: string;
    ignorarAlocacaoId?: string;
  },
): Promise<string[]> {
  const folgas = await db
    .prepare(
      `SELECT id
         FROM escala_alocacoes
        WHERE escala_id = ?
          AND CAST(funcionario_id AS TEXT) = ?
          AND deleted_at IS NULL
          AND status != 'cancelado'
          AND situacao_tipo IS NOT NULL
          AND UPPER(situacao_tipo) = 'FOLGA'
          AND (? IS NULL OR id != ?)
          AND NOT (data_fim < ? OR data_inicio > ?)`,
    )
    .bind(
      params.escalaId,
      params.funcionarioId,
      params.ignorarAlocacaoId ?? null,
      params.ignorarAlocacaoId ?? null,
      params.dataInicio,
      params.dataFim,
    )
    .all<{ id: string }>();

  const ids = (folgas.results || []).map((folga) => folga.id);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(', ');
  await db
    .prepare(
      `UPDATE escala_alocacoes
          SET status = 'cancelado', updated_at = datetime('now')
        WHERE id IN (${placeholders})`,
    )
    .bind(...ids)
    .run();

  await db
    .prepare(
      `UPDATE funcionario_ferias
          SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE escala_alocacao_id IN (${placeholders})
          AND deleted_at IS NULL`,
    )
    .bind(...ids)
    .run();

  return ids;
}

export async function resolverQuinzenaPadraoPorPeriodo(
  db: D1Database,
  params: {
    empresaId: number;
    ano: number;
    mes: number;
    dataInicio: string;
    dataFim: string;
  },
): Promise<number | null> {
  const quinzena = await db
    .prepare(
      `SELECT id
         FROM escalas_quinzenas
        WHERE empresa_id = ?
          AND ano = ?
          AND mes = ?
          AND data_inicio = ?
          AND data_fim = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.empresaId, params.ano, params.mes, params.dataInicio, params.dataFim)
    .first<{ id: number }>();

  return quinzena?.id ?? null;
}

export async function checarSobreposicaoFuncionario(
  db: D1Database,
  funcionarioId: string,
  dataInicio: string,
  dataFim: string,
  ignorarId?: string,
  aeronaveIdPrioritaria?: number | null,
): Promise<SobreposicaoFuncionarioDetalhe | null> {
  const filtroBloqueio = `
          AND (
            ea.aeronave_id IS NOT NULL
            OR (
              ea.situacao_tipo IS NOT NULL
              AND UPPER(ea.situacao_tipo) != 'FOLGA'
              AND COALESCE(est.bloqueia_alocacao, 1) = 1
            )
            OR (? IS NULL AND ea.aeronave_id IS NULL AND ea.situacao_tipo IS NULL)
          )`;
  const sql = ignorarId
    ? `SELECT ea.id,
              CAST(ea.escala_id AS TEXT) AS escala_id,
              ea.aeronave_id,
              a.prefixo AS aeronave_prefixo,
              a.modelo AS aeronave_modelo,
              ea.data_inicio,
              ea.data_fim,
              ea.funcao,
              eq.numero AS quinzena_numero,
              ea.situacao_tipo,
              est.nome AS situacao_nome
         FROM escala_alocacoes ea
         JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
         LEFT JOIN aeronaves a ON a.id = ea.aeronave_id
         LEFT JOIN escalas_quinzenas eq ON eq.id = ea.quinzena_id AND eq.deleted_at IS NULL
         LEFT JOIN escala_situacao_tipos est
           ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
          AND est.deleted_at IS NULL
        WHERE ea.funcionario_id = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
          AND ea.id != ?
${filtroBloqueio}
          AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
        LIMIT 1`
    : `SELECT ea.id,
            CAST(ea.escala_id AS TEXT) AS escala_id,
            ea.aeronave_id,
            a.prefixo AS aeronave_prefixo,
            a.modelo AS aeronave_modelo,
            ea.data_inicio,
            ea.data_fim,
            ea.funcao,
            eq.numero AS quinzena_numero,
            ea.situacao_tipo,
            est.nome AS situacao_nome
         FROM escala_alocacoes ea
         JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
         LEFT JOIN aeronaves a ON a.id = ea.aeronave_id
          LEFT JOIN escalas_quinzenas eq ON eq.id = ea.quinzena_id AND eq.deleted_at IS NULL
         LEFT JOIN escala_situacao_tipos est
           ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
          AND est.deleted_at IS NULL
        WHERE ea.funcionario_id = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
${filtroBloqueio}
          AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
        LIMIT 1`;

  return ignorarId
    ? db
        .prepare(sql)
        .bind(funcionarioId, ignorarId, aeronaveIdPrioritaria ?? null, dataInicio, dataFim)
        .first()
    : db
        .prepare(sql)
        .bind(funcionarioId, aeronaveIdPrioritaria ?? null, dataInicio, dataFim)
        .first();
}

export function shouldAllowSameEscalaOperationalReassignment(
  conflito:
    | {
        id?: string | null;
        escala_id?: string | null;
        aeronave_id?: string | number | null;
        situacao_tipo?: string | null;
      }
    | null
    | undefined,
  escalaId: string | null | undefined,
): boolean {
  if (!conflito || !escalaId) return false;

  return (
    String(conflito.escala_id || '') === String(escalaId) &&
    conflito.aeronave_id !== null &&
    conflito.aeronave_id !== undefined &&
    String(conflito.aeronave_id) !== '' &&
    !conflito.situacao_tipo
  );
}

export async function checarSobreposicaoSlot(
  db: D1Database,
  escalaId: string,
  aeronaveId: number,
  funcao: FuncaoAlocacao,
  dataInicio: string,
  dataFim: string,
  ignorarId?: string,
): Promise<{ id: string; funcionario_nome: string; data_inicio: string; data_fim: string } | null> {
  const sql = ignorarId
    ? `SELECT ea.id, f.nome AS funcionario_nome, ea.data_inicio, ea.data_fim
         FROM escala_alocacoes ea
         LEFT JOIN funcionarios f
           ON f.id = ea.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        WHERE ea.escala_id = ?
          AND ea.aeronave_id = ?
          AND ea.funcao = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
          AND ea.id != ?
          AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
        LIMIT 1`
    : `SELECT ea.id, f.nome AS funcionario_nome, ea.data_inicio, ea.data_fim
         FROM escala_alocacoes ea
         LEFT JOIN funcionarios f
           ON f.id = ea.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        WHERE ea.escala_id = ?
          AND ea.aeronave_id = ?
          AND ea.funcao = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
          AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
        LIMIT 1`;

  return ignorarId
    ? db.prepare(sql).bind(escalaId, aeronaveId, funcao, ignorarId, dataInicio, dataFim).first()
    : db.prepare(sql).bind(escalaId, aeronaveId, funcao, dataInicio, dataFim).first();
}

export async function verificarHabilitacaoModelo(
  db: D1Database,
  funcionarioId: string,
  aeronaveId: number,
  empresaId: number,
): Promise<{ habilitado: boolean; motivo?: string }> {
  const aeronave = await db
    .prepare(
      `SELECT prefixo, modelo FROM aeronaves
        WHERE id = ?
          AND deleted_at IS NULL
          AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
        LIMIT 1`,
    )
    .bind(aeronaveId)
    .first<{ prefixo: string; modelo: string | null }>();

  if (!aeronave) return { habilitado: false, motivo: 'Aeronave não encontrada' };

  const piloto = await db
    .prepare(
      `SELECT modelo_aeronave_id FROM funcionarios
        WHERE id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
          AND (empresa_id IS NULL OR empresa_id = ?)
        LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ modelo_aeronave_id: string | null }>();

  if (!piloto) return { habilitado: false, motivo: 'Funcionário não encontrado' };

  if (!piloto.modelo_aeronave_id) return { habilitado: true };

  const modeloAeronave = String(aeronave.modelo || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

  const tokens = String(piloto.modelo_aeronave_id)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (!tokens.length) return { habilitado: true };

  const placeholders = tokens.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT modelo, codigo FROM modelos_aeronave WHERE CAST(id AS TEXT) IN (${placeholders})`,
    )
    .bind(...tokens)
    .all<{ modelo: string; codigo: string }>();

  const habilitacoes = [
    ...tokens,
    ...(rows.results || []).flatMap((r) => [
      String(r.modelo || '')
        .toUpperCase()
        .replace(/[\s-]+/g, ''),
      String(r.codigo || '')
        .toUpperCase()
        .replace(/[\s-]+/g, ''),
    ]),
  ].filter(Boolean);

  const modelosAeronave = [modeloAeronave];
  if (modeloAeronave === 'SK76') modelosAeronave.push('S76');
  if (modeloAeronave === 'S76') modelosAeronave.push('SK76');

  const habilitado = modelosAeronave.some((m) => habilitacoes.includes(m));

  if (!habilitado) {
    return {
      habilitado: false,
      motivo: `Funcionário não habilitado para ${aeronave.prefixo} (${aeronave.modelo || 'modelo não informado'})`,
    };
  }

  return { habilitado: true };
}

export async function auditarAlocacao(
  db: D1Database,
  params: {
    escala_id: string;
    acao: string;
    alocacao_id: string;
    realizado_por: string;
    valor_anterior?: string;
    valor_novo?: string;
    justificativa?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO escala_auditoria (id, escala_id, evento_id, acao, campo_alterado, valor_anterior, valor_novo, justificativa, realizado_por, realizado_em)
       VALUES (?, ?, ?, ?, 'alocacao', ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      crypto.randomUUID(),
      params.escala_id,
      params.alocacao_id,
      params.acao,
      params.valor_anterior || null,
      params.valor_novo || null,
      params.justificativa || null,
      params.realizado_por,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos, usuario_id, origem, created_at)
       VALUES ('escala_alocacoes', ?, ?, ?, ?, ?, 'api', datetime('now'))`,
    )
    .bind(
      params.acao,
      params.alocacao_id,
      params.valor_anterior || null,
      params.valor_novo || null,
      params.realizado_por,
    )
    .run();
}

export async function buscarAlocacoesDetalhadas(
  db: D1Database,
  params: {
    escalaId: string;
    aeronaveId?: number;
    funcao?: string | null;
    data?: string | null;
    alocacaoId?: string;
  },
): Promise<AlocacaoDetalhadaRow[]> {
  const conditions: string[] = [
    'ea.escala_id = ?',
    'ea.deleted_at IS NULL',
    "ea.status != 'cancelado'",
  ];
  const bindings: Array<string | number> = [params.escalaId];

  if (params.aeronaveId !== undefined) {
    conditions.push('ea.aeronave_id = ?');
    bindings.push(params.aeronaveId);
  }
  if (params.funcao) {
    conditions.push('ea.funcao = ?');
    bindings.push(params.funcao);
  }
  if (params.data) {
    conditions.push('ea.data_inicio <= ? AND ea.data_fim >= ?');
    bindings.push(params.data, params.data);
  }
  if (params.alocacaoId) {
    conditions.push('ea.id = ?');
    bindings.push(params.alocacaoId);
  }

  const result = await db
    .prepare(
      `SELECT
         ea.id,
         ea.escala_id,
         CAST(ea.funcionario_id AS TEXT) AS funcionario_id,
         ea.aeronave_id,
         ea.funcao,
        ea.situacao_tipo,
        COALESCE(ea.situacao_cor, est.cor) AS situacao_cor,
        est.nome AS situacao_nome,
        est.icone AS situacao_icone,
        est.bloqueia_alocacao AS situacao_bloqueia_alocacao,
         ea.quinzena_id,
         ea.data_inicio,
         ea.data_fim,
         ea.padrao_escala_id,
         ea.base,
         ea.observacoes,
         ea.status,
         ea.created_by,
         ea.created_at,
         ea.updated_at,
         f.nome AS funcionario_nome,
         f.guerra AS funcionario_guerra,
         f.matricula AS funcionario_matricula,
         COALESCE(f.funcao, f.cargo) AS funcionario_role,
         f.quinzena AS funcionario_quinzena,
         COALESCE(f.is_instrutor, 0) AS funcionario_is_instrutor,
         a.prefixo AS aeronave_prefixo,
         a.modelo AS aeronave_modelo,
         COALESCE(ea.modelo_aeronave, a.modelo) AS modelo_aeronave,
         COALESCE(
           (
             SELECT GROUP_CONCAT(modelo_label, ' / ')
             FROM (
               SELECT DISTINCT
                 COALESCE(
                   NULLIF(TRIM(ma2.codigo), ''),
                   NULLIF(TRIM(ma2.modelo), ''),
                   NULLIF(TRIM(ma2.nome), '')
                 ) AS modelo_label
               FROM modelos_aeronave ma2
               WHERE ma2.deleted_at IS NULL
                 AND (
                   instr(
                     ',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',',
                     ',' || CAST(ma2.id AS TEXT) || ','
                   ) > 0
                   OR UPPER(COALESCE(f.modelo_aeronave_id, '')) = UPPER(COALESCE(ma2.codigo, ma2.modelo, ma2.nome, ''))
                   OR UPPER(COALESCE(f.aeronave, '')) = UPPER(COALESCE(ma2.codigo, ma2.modelo, ma2.nome, ''))
                 )
               ORDER BY modelo_label
             ) modelos_resolvidos
           ),
           NULLIF(TRIM(f.aeronave), ''),
           NULLIF(TRIM(f.modelo_aeronave_id), '')
         ) AS funcionario_modelo_aeronave
       FROM escala_alocacoes ea
       LEFT JOIN funcionarios f ON f.id = ea.funcionario_id AND f.deleted_at IS NULL
       LEFT JOIN aeronaves a ON a.id = ea.aeronave_id AND a.deleted_at IS NULL
       LEFT JOIN escala_situacao_tipos est
         ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
        AND est.deleted_at IS NULL
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(a.prefixo, 'ZZZ'), COALESCE(ea.funcao, ea.situacao_tipo), ea.data_inicio, f.nome`,
    )
    .bind(...bindings)
    .all<AlocacaoDetalhadaRow>();

  return result.results || [];
}

export function mapAlocacaoDetalhada(row: AlocacaoDetalhadaRow) {
  return {
    id: row.id,
    escala_id: row.escala_id,
    funcao: row.funcao,
    situacao_tipo: row.situacao_tipo,
    situacao_cor: row.situacao_cor,
    situacao_nome: row.situacao_nome,
    situacao_icone: row.situacao_icone,
    situacao_bloqueia_alocacao: row.situacao_bloqueia_alocacao,
    quinzena_id: row.quinzena_id,
    data_inicio: row.data_inicio,
    data_fim: row.data_fim,
    padrao_escala_id: row.padrao_escala_id,
    base: row.base,
    observacoes: row.observacoes,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    funcionario: {
      id: row.funcionario_id,
      nome: row.funcionario_nome,
      nome_guerra: row.funcionario_guerra,
      matricula: row.funcionario_matricula,
      role: row.funcionario_role,
    },
    aeronave: {
      id: row.aeronave_id,
      prefixo: row.aeronave_prefixo,
      modelo: row.aeronave_modelo,
    },
    funcionario_id: row.funcionario_id,
    funcionario_nome: row.funcionario_nome,
    funcionario_guerra: row.funcionario_guerra,
    funcionario_matricula: row.funcionario_matricula,
    funcionario_role: row.funcionario_role,
    funcionario_quinzena: row.funcionario_quinzena ?? null,
    funcionario_is_instrutor: row.funcionario_is_instrutor === 1,
    aeronave_id: row.aeronave_id,
    aeronave_prefixo: row.aeronave_prefixo,
    aeronave_modelo: row.aeronave_modelo,
    modelo_aeronave: row.modelo_aeronave ?? row.aeronave_modelo ?? null,
    funcionario_modelo_aeronave: row.funcionario_modelo_aeronave ?? null,
  };
}
