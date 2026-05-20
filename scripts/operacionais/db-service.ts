// worker-airtrust/src/lib/sgso/db-service.ts
// ============================================================
// Serviço de persistência do módulo SGSO
// Toda SQL do módulo fica aqui — rotas chamam este serviço
// Padrão: retorna null se não encontrar, lança AppError em erros de negócio
// ============================================================

import { AppError } from '../../utils/errors';
import {
  SgsoRelato,
  SgsoAvaliacaoRisco,
  SgsoAcaoMitigacao,
  SgsoFatorHumano,
  SgsoProbabilidade,
  SgsoSeveridade,
  SgsoNivelRisco,
  SgsoRelatoStatus,
  CreateRelatoDto,
  CreateAvaliacaoRiscoDto,
  CreateAcaoDto,
  calcularNivelRisco,
  elevarProbabilidade,
  FRMS_FADIGA_THRESHOLD,
} from './types';

// Tipo do binding D1 do Cloudflare Workers
type D1Database = import('@cloudflare/workers-types').D1Database;

// ── Geração de protocolo sequencial ─────────────────────────

/**
 * Gera o próximo número de protocolo para a empresa no ano corrente.
 * Usa a tabela sgso_protocolo_sequencia com UPDATE atômico para evitar
 * race conditions (sem SELECT MAX + INSERT).
 * Formato: REL-YYYY-NNNN (ex: REL-2026-0001)
 */
export async function gerarNumeroProtocolo(
  db: D1Database,
  empresaId: number
): Promise<string> {
  const ano = new Date().getFullYear();

  // Garante linha para empresa/ano com INSERT OR IGNORE
  await db
    .prepare(
      `INSERT OR IGNORE INTO sgso_protocolo_sequencia (empresa_id, ano, ultimo_numero)
       VALUES (?, ?, 0)`
    )
    .bind(empresaId, ano)
    .run();

  // Incrementa atomicamente e retorna o novo valor
  const result = await db
    .prepare(
      `UPDATE sgso_protocolo_sequencia
       SET ultimo_numero = ultimo_numero + 1
       WHERE empresa_id = ? AND ano = ?
       RETURNING ultimo_numero`
    )
    .bind(empresaId, ano)
    .first<{ ultimo_numero: number }>();

  if (!result) {
    throw new AppError('Falha ao gerar número de protocolo', 500, 'PROTOCOLO_ERROR');
  }

  const numero = String(result.ultimo_numero).padStart(4, '0');
  return `REL-${ano}-${numero}`;
}

// ── Contexto operacional automático ─────────────────────────

/**
 * Captura o contexto operacional do tripulante na data do relato.
 * Integra FRMS, Escalas e Qualificações automaticamente.
 * Retorna objeto parcial que é mesclado ao relato.
 */
export async function capturarContextoOperacional(
  db: D1Database,
  empresaId: number,
  relatorId: number | null,
  aeronaveId: number | null,
  dataOcorrencia: string
): Promise<{
  escala_id: string | null;
  escala_quinzena: 1 | 2 | null;
  frms_jornada_id: number | null;
  efetividade_cognitiva: number | null;
  horas_acumuladas_7d: number | null;
  horas_acumuladas_28d: number | null;
  qualificacoes_vencidas: number;
  dias_embarcado: number | null;
  aeronave_matricula: string | null;
  aeronave_modelo: string | null;
}> {
  const defaultCtx = {
    escala_id: null,
    escala_quinzena: null,
    frms_jornada_id: null,
    efetividade_cognitiva: null,
    horas_acumuladas_7d: null,
    horas_acumuladas_28d: null,
    qualificacoes_vencidas: 0,
    dias_embarcado: null,
    aeronave_matricula: null,
    aeronave_modelo: null,
  } as const;

  if (!relatorId) return { ...defaultCtx };

  const dataStr = dataOcorrencia.substring(0, 10); // yyyy-mm-dd

  // 1. Dados da aeronave (desnormalização para histórico)
  const aeronave = aeronaveId
    ? await db
        .prepare(
          `SELECT a.matricula, m.nome as modelo
           FROM aeronaves a
           LEFT JOIN modelos_aeronave m ON m.id = a.modelo_aeronave_id
           WHERE a.id = ? AND a.empresa_id = ?`
        )
        .bind(aeronaveId, empresaId)
        .first<{ matricula: string; modelo: string }>()
    : null;

  // 2. Escala vigente na data
  const escala = await db
    .prepare(
      `SELECT e.id, ea.quinzena
       FROM escalas e
       JOIN escala_alocacoes ea ON ea.escala_id = e.id
       WHERE e.empresa_id = ?
         AND ea.funcionario_id = ?
         AND e.deleted_at IS NULL
         AND ea.deleted_at IS NULL
         AND e.mes = CAST(strftime('%m', ?) AS INTEGER)
         AND e.ano = CAST(strftime('%Y', ?) AS INTEGER)
         AND ea.tipo NOT IN ('FOLGA')
       ORDER BY e.published_at DESC
       LIMIT 1`
    )
    .bind(empresaId, relatorId, dataStr, dataStr)
    .first<{ id: string; quinzena: 1 | 2 }>();

  // 3. Jornada FRMS do dia
  const jornada = await db
    .prepare(
      `SELECT j.id,
              r.score_efetividade_cognitiva,
              r.horas_voo_7d,
              r.horas_voo_28d,
              j.ciclo_dia_embarcado
       FROM frms_jornada j
       LEFT JOIN frms_acumulo_rolling r ON r.funcionario_id = j.funcionario_id
                                         AND r.data_referencia = j.data_jornada
       WHERE j.funcionario_id = ?
         AND j.empresa_id = ?
         AND j.data_jornada = ?
         AND j.deleted_at IS NULL
       LIMIT 1`
    )
    .bind(relatorId, empresaId, dataStr)
    .first<{
      id: number;
      score_efetividade_cognitiva: number | null;
      horas_voo_7d: number | null;
      horas_voo_28d: number | null;
      ciclo_dia_embarcado: number | null;
    }>();

  // 4. Qualificações vencidas na data
  const qualVencidas = await db
    .prepare(
      `SELECT COUNT(*) as total
       FROM qualificacoes_historico qh
       WHERE qh.funcionario_id = ?
         AND qh.empresa_id = ?
         AND qh.deleted_at IS NULL
         AND qh.renovada = 0
         AND qh.data_vencimento IS NOT NULL
         AND qh.data_vencimento < ?`
    )
    .bind(relatorId, empresaId, dataStr)
    .first<{ total: number }>();

  return {
    escala_id: escala?.id ?? null,
    escala_quinzena: escala?.quinzena ?? null,
    frms_jornada_id: jornada?.id ?? null,
    efetividade_cognitiva: jornada?.score_efetividade_cognitiva ?? null,
    horas_acumuladas_7d: jornada?.horas_voo_7d ?? null,
    horas_acumuladas_28d: jornada?.horas_voo_28d ?? null,
    qualificacoes_vencidas: qualVencidas?.total ?? 0,
    dias_embarcado: jornada?.ciclo_dia_embarcado ?? null,
    aeronave_matricula: aeronave?.matricula ?? null,
    aeronave_modelo: aeronave?.modelo ?? null,
  };
}

// ── CRUD de Relatos ──────────────────────────────────────────

export async function criarRelato(
  db: D1Database,
  empresaId: number,
  createdBy: number | null,
  dto: CreateRelatoDto
): Promise<SgsoRelato> {
  const { v4: uuidv4 } = await import('uuid');
  const id = uuidv4();
  const now = new Date().toISOString();

  // Relato anônimo: relatorId fica NULL, sem log de quem enviou
  const relatorId = dto.anonimo ? null : createdBy;

  const numeroProtocolo = await gerarNumeroProtocolo(db, empresaId);

  // Captura contexto automático (FRMS, Escalas, Qualificações)
  const ctx = await capturarContextoOperacional(
    db,
    empresaId,
    relatorId,
    dto.aeronave_id ?? null,
    dto.data_ocorrencia
  );

  await db
    .prepare(
      `INSERT INTO sgso_relatos (
        id, empresa_id, numero_protocolo, tipo, anonimo, relator_id,
        aeronave_id, aeronave_matricula, aeronave_modelo,
        data_ocorrencia, local_icao, local_descricao,
        fase_voo, condicao_meteorologica,
        descricao, consequencia, accao_imediata,
        categoria_adrep, subcategoria_adrep,
        status,
        escala_id, escala_quinzena, frms_jornada_id,
        efetividade_cognitiva, horas_acumuladas_7d, horas_acumuladas_28d,
        qualificacoes_vencidas, dias_embarcado,
        created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        'ABERTO',
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?
      )`
    )
    .bind(
      id, empresaId, numeroProtocolo,
      dto.tipo, dto.anonimo ? 1 : 0, relatorId,
      dto.aeronave_id ?? null, ctx.aeronave_matricula, ctx.aeronave_modelo,
      dto.data_ocorrencia, dto.local_icao ?? null, dto.local_descricao ?? null,
      dto.fase_voo ?? null, dto.condicao_meteorologica ?? null,
      dto.descricao, dto.consequencia ?? null, dto.accao_imediata ?? null,
      dto.categoria_adrep ?? null, dto.subcategoria_adrep ?? null,
      ctx.escala_id, ctx.escala_quinzena, ctx.frms_jornada_id,
      ctx.efetividade_cognitiva, ctx.horas_acumuladas_7d, ctx.horas_acumuladas_28d,
      ctx.qualificacoes_vencidas, ctx.dias_embarcado,
      createdBy, now, now
    )
    .run();

  // Registrar histórico de status inicial
  await db
    .prepare(
      `INSERT INTO sgso_relatos_historico_status
         (relato_id, empresa_id, status_anterior, status_novo, motivo, alterado_por)
       VALUES (?, ?, NULL, 'ABERTO', 'Relato criado', ?)`
    )
    .bind(id, empresaId, createdBy ?? 0)
    .run();

  // Auto-inserir fator humano de fadiga se score < threshold
  if (ctx.efetividade_cognitiva !== null && ctx.efetividade_cognitiva < FRMS_FADIGA_THRESHOLD) {
    await db
      .prepare(
        `INSERT INTO sgso_relatos_fatores_humanos
           (relato_id, empresa_id, nivel_hfacs, categoria, subcategoria,
            descricao, efetividade_cognitiva_capturada, fonte_automatica)
         VALUES (?, ?, 'PRECONDICOES', 'FADIGA', 'REDUCAO_EFETIVIDADE_COGNITIVA',
                 ?, ?, 1)`
      )
      .bind(
        id, empresaId,
        `Score de efetividade cognitiva no momento do relato: ${ctx.efetividade_cognitiva.toFixed(1)}% (abaixo do threshold de ${FRMS_FADIGA_THRESHOLD}%). Inserido automaticamente pelo sistema.`,
        ctx.efetividade_cognitiva
      )
      .run();
  }

  const relato = await buscarRelatoPorId(db, empresaId, id);
  if (!relato) throw new AppError('Erro ao recuperar relato criado', 500, 'CREATE_ERROR');
  return relato;
}

export async function buscarRelatoPorId(
  db: D1Database,
  empresaId: number,
  id: string
): Promise<SgsoRelato | null> {
  return db
    .prepare(
      `SELECT * FROM sgso_relatos
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`
    )
    .bind(id, empresaId)
    .first<SgsoRelato>();
}

export interface ListarRelatosParams {
  page?: number;
  limit?: number;
  status?: SgsoRelatoStatus;
  tipo?: string;
  data_inicio?: string;
  data_fim?: string;
  aeronave_id?: number;
  com_fadiga?: boolean; // filtra apenas relatos onde efetividade_cognitiva < threshold
}

export async function listarRelatos(
  db: D1Database,
  empresaId: number,
  params: ListarRelatosParams = {}
): Promise<{ rows: SgsoRelato[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    status,
    tipo,
    data_inicio,
    data_fim,
    aeronave_id,
    com_fadiga,
  } = params;

  const conditions: string[] = ['empresa_id = ?', 'deleted_at IS NULL'];
  const binds: unknown[] = [empresaId];

  if (status) { conditions.push('status = ?'); binds.push(status); }
  if (tipo) { conditions.push('tipo = ?'); binds.push(tipo); }
  if (data_inicio) { conditions.push('data_ocorrencia >= ?'); binds.push(data_inicio); }
  if (data_fim) { conditions.push('data_ocorrencia <= ?'); binds.push(data_fim + 'T23:59:59'); }
  if (aeronave_id) { conditions.push('aeronave_id = ?'); binds.push(aeronave_id); }
  if (com_fadiga) {
    conditions.push('efetividade_cognitiva IS NOT NULL');
    conditions.push(`efetividade_cognitiva < ${FRMS_FADIGA_THRESHOLD}`);
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [totalResult, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as total FROM sgso_relatos WHERE ${where}`)
      .bind(...binds)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT * FROM sgso_relatos WHERE ${where}
         ORDER BY data_ocorrencia DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...binds, limit, offset)
      .all<SgsoRelato>(),
  ]);

  return { rows: rows.results, total: totalResult?.total ?? 0 };
}

export async function atualizarStatusRelato(
  db: D1Database,
  empresaId: number,
  id: string,
  novoStatus: SgsoRelatoStatus,
  alteradoPor: number,
  motivo?: string
): Promise<SgsoRelato> {
  const relato = await buscarRelatoPorId(db, empresaId, id);
  if (!relato) throw new AppError('Relato não encontrado', 404, 'NOT_FOUND');

  // Validação de transições permitidas
  const transicoesValidas: Record<SgsoRelatoStatus, SgsoRelatoStatus[]> = {
    ABERTO: ['EM_ANALISE'],
    EM_ANALISE: ['AGUARDANDO_ACAO', 'FECHADO'],
    AGUARDANDO_ACAO: ['EM_ANALISE', 'FECHADO'],
    FECHADO: [],
  };

  if (!transicoesValidas[relato.status].includes(novoStatus)) {
    throw new AppError(
      `Transição inválida: ${relato.status} → ${novoStatus}`,
      400,
      'INVALID_TRANSITION'
    );
  }

  const now = new Date().toISOString();

  const extraFields =
    novoStatus === 'FECHADO'
      ? ', fechado_por = ?, fechado_em = ?'
      : '';
  const extraBinds =
    novoStatus === 'FECHADO' ? [alteradoPor, now] : [];

  await db
    .prepare(
      `UPDATE sgso_relatos
       SET status = ?, updated_at = ?${extraFields}
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`
    )
    .bind(novoStatus, now, ...extraBinds, id, empresaId)
    .run();

  await db
    .prepare(
      `INSERT INTO sgso_relatos_historico_status
         (relato_id, empresa_id, status_anterior, status_novo, motivo, alterado_por)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, empresaId, relato.status, novoStatus, motivo ?? null, alteradoPor)
    .run();

  return (await buscarRelatoPorId(db, empresaId, id))!;
}

// ── Avaliação de Risco ────────────────────────────────────────

export async function criarAvaliacaoRisco(
  db: D1Database,
  empresaId: number,
  relatorId: number,
  relatoId: string,
  dto: CreateAvaliacaoRiscoDto
): Promise<SgsoAvaliacaoRisco> {
  const relato = await buscarRelatoPorId(db, empresaId, relatoId);
  if (!relato) throw new AppError('Relato não encontrado', 404, 'NOT_FOUND');

  // Verifica se já existe avaliação do mesmo tipo
  const existente = await db
    .prepare(
      `SELECT id FROM sgso_avaliacao_risco
       WHERE relato_id = ? AND tipo_avaliacao = ? AND deleted_at IS NULL`
    )
    .bind(relatoId, dto.tipo_avaliacao)
    .first<{ id: number }>();

  if (existente) {
    throw new AppError(
      `Já existe avaliação ${dto.tipo_avaliacao} para este relato. Use PUT para atualizar.`,
      409,
      'DUPLICATE_AVALIACAO'
    );
  }

  // Verificar se deve elevar probabilidade por fadiga
  let probabilidadeFinal = dto.probabilidade;
  let elevadoPorFadiga = false;
  let justificativaElevacao: string | null = null;

  if (
    dto.tipo_avaliacao === 'INICIAL' &&
    relato.efetividade_cognitiva !== null &&
    relato.efetividade_cognitiva < FRMS_FADIGA_THRESHOLD
  ) {
    const probElevada = elevarProbabilidade(dto.probabilidade);
    if (probElevada !== dto.probabilidade) {
      probabilidadeFinal = probElevada;
      elevadoPorFadiga = true;
      justificativaElevacao =
        `Probabilidade elevada automaticamente de ${dto.probabilidade} para ${probElevada} ` +
        `pois o tripulante apresentava efetividade cognitiva de ${relato.efetividade_cognitiva.toFixed(1)}% ` +
        `(abaixo do threshold de ${FRMS_FADIGA_THRESHOLD}%) no momento da ocorrência. ` +
        `Conforme RBAC-117 / IS 117-001.`;
    }
  }

  const nivelRisco = calcularNivelRisco(probabilidadeFinal, dto.severidade as 1|2|3|4|5);
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `INSERT INTO sgso_avaliacao_risco (
        relato_id, empresa_id, tipo_avaliacao,
        probabilidade, severidade, nivel_risco,
        probabilidade_original, elevado_por_fadiga, justificativa_elevacao,
        justificativa, avaliador_id, data_avaliacao,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`
    )
    .bind(
      relatoId, empresaId, dto.tipo_avaliacao,
      probabilidadeFinal, dto.severidade, nivelRisco,
      elevadoPorFadiga ? dto.probabilidade : null,
      elevadoPorFadiga ? 1 : 0,
      justificativaElevacao,
      dto.justificativa ?? null, relatorId, now,
      now, now
    )
    .first<SgsoAvaliacaoRisco>();

  if (!result) throw new AppError('Erro ao criar avaliação de risco', 500, 'CREATE_ERROR');

  // Se nível CRITICO ou ALTO, forçar relato para EM_ANALISE
  if (['CRITICO', 'ALTO'].includes(nivelRisco) && relato.status === 'ABERTO') {
    await atualizarStatusRelato(
      db, empresaId, relatoId, 'EM_ANALISE', relatorId,
      `Promovido automaticamente para EM_ANALISE — risco ${nivelRisco} identificado`
    );
  }

  return result;
}

// ── Ações de Mitigação (CAPA) ─────────────────────────────────

export async function criarAcaoMitigacao(
  db: D1Database,
  empresaId: number,
  createdBy: number,
  relatoId: string,
  dto: CreateAcaoDto
): Promise<SgsoAcaoMitigacao> {
  const relato = await buscarRelatoPorId(db, empresaId, relatoId);
  if (!relato) throw new AppError('Relato não encontrado', 404, 'NOT_FOUND');

  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `INSERT INTO sgso_acoes_mitigacao (
        empresa_id, relato_id, tipo, descricao, categoria,
        responsavel_id, prazo, status, percentual_conclusao,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', 0, ?, ?, ?)
      RETURNING *`
    )
    .bind(
      empresaId, relatoId, dto.tipo, dto.descricao, dto.categoria ?? null,
      dto.responsavel_id, dto.prazo,
      createdBy, now, now
    )
    .first<SgsoAcaoMitigacao>();

  if (!result) throw new AppError('Erro ao criar ação', 500, 'CREATE_ERROR');

  // Atualizar status do relato para AGUARDANDO_ACAO se estava EM_ANALISE
  if (relato.status === 'EM_ANALISE') {
    await atualizarStatusRelato(
      db, empresaId, relatoId, 'AGUARDANDO_ACAO', createdBy,
      'Plano de ação criado'
    );
  }

  return result;
}

export async function listarAcoesPorRelato(
  db: D1Database,
  empresaId: number,
  relatoId: string
): Promise<SgsoAcaoMitigacao[]> {
  const result = await db
    .prepare(
      `SELECT a.*, f.nome as responsavel_nome
       FROM sgso_acoes_mitigacao a
       LEFT JOIN funcionarios f ON f.id = a.responsavel_id
       WHERE a.relato_id = ? AND a.empresa_id = ? AND a.deleted_at IS NULL
       ORDER BY a.prazo ASC`
    )
    .bind(relatoId, empresaId)
    .all<SgsoAcaoMitigacao & { responsavel_nome: string }>();

  return result.results;
}

// ── KPIs / SPIs ───────────────────────────────────────────────

export interface SpiResult {
  codigo: string;
  nome: string;
  valor_atual: number | null;
  meta_valor: number | null;
  meta_operador: string | null;
  alerta_valor: number | null;
  alerta_operador: string | null;
  status_spi: 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';
  unidade: string | null;
}

/**
 * Calcula todos os SPIs ativos para a empresa.
 * Período: últimos 90 dias (configurável no futuro via sgso_spi_config).
 */
export async function calcularSpis(
  db: D1Database,
  empresaId: number
): Promise<SpiResult[]> {
  const configs = await db
    .prepare(
      `SELECT * FROM sgso_spi_config
       WHERE empresa_id = ? AND ativo = 1`
    )
    .bind(empresaId)
    .all<{
      codigo: string; nome: string; unidade: string;
      meta_valor: number; meta_operador: string;
      alerta_valor: number; alerta_operador: string;
    }>();

  const agora = new Date().toISOString().substring(0, 10);
  const inicio90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10);

  // Coleta dados brutos
  const [
    totalRelatos,
    relatosAnonimos,
    ocorrenciasSerias,
    acoesPendentes,
    acoesTotais,
    ncsAbertas30d,
    auditoriasProgramadas,
    auditoriasRealizadas,
    frmsMedia,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as n FROM sgso_relatos WHERE empresa_id=? AND deleted_at IS NULL AND data_ocorrencia >= ?`).bind(empresaId, inicio90d).first<{n:number}>(),
    db.prepare(`SELECT COUNT(*) as n FROM sgso_relatos WHERE empresa_id=? AND deleted_at IS NULL AND anonimo=1 AND data_ocorrencia >= ?`).bind(empresaId, inicio90d).first<{n:number}>(),
    db.prepare(`SELECT COUNT(*) as n FROM sgso_relatos WHERE empresa_id=? AND deleted_at IS NULL AND tipo IN ('INCIDENTE','ACIDENTE') AND data_ocorrencia >= ?`).bind(empresaId, inicio90d).first<{n:number}>(),
    db.prepare(`SELECT COUNT(*) as n FROM sgso_acoes_mitigacao WHERE empresa_id=? AND deleted_at IS NULL AND status NOT IN ('CONCLUIDA','CANCELADA') AND prazo < ?`).bind(empresaId, agora).first<{n:number}>(),
    db.prepare(`SELECT COUNT(*) as n FROM sgso_acoes_mitigacao WHERE empresa_id=? AND deleted_at IS NULL AND created_at >= ?`).bind(empresaId, inicio90d).first<{n:number}>(),
    db.prepare(`SELECT COUNT(*) as n FROM sgso_nao_conformidades WHERE empresa_id=? AND deleted_at IS NULL AND status NOT IN ('FECHADA','CANCELADA') AND created_at <= date('now','-30 days')`).bind(empresaId).first<{n:number}>(),
    db.prepare(`SELECT COUNT(*) as n FROM sgso_auditorias WHERE empresa_id=? AND deleted_at IS NULL AND data_programada BETWEEN ? AND ?`).bind(empresaId, inicio90d, agora).first<{n:number}>(),
    db.prepare(`SELECT COUNT(*) as n FROM sgso_auditorias WHERE empresa_id=? AND deleted_at IS NULL AND status='CONCLUIDA' AND data_realizada BETWEEN ? AND ?`).bind(empresaId, inicio90d, agora).first<{n:number}>(),
    db.prepare(`SELECT AVG(r.score_efetividade_cognitiva) as media FROM frms_acumulo_rolling r JOIN funcionarios f ON f.id=r.funcionario_id WHERE f.empresa_id=? AND f.ativo=1 AND f.deleted_at IS NULL AND r.data_referencia >= date('now','-28 days')`).bind(empresaId).first<{media:number|null}>(),
  ]);

  const totalRelatosN = totalRelatos?.n ?? 0;

  // Mapa de valores calculados por código
  const valoresCalculados: Record<string, number | null> = {
    TAXA_RELATOS: totalRelatosN > 0 ? totalRelatosN : null, // Sem horas de voo base = só contagem
    TAXA_OCORRENCIAS_SERIAS: ocorrenciasSerias?.n ?? 0,
    FECHAMENTO_ACOES: acoesTotais?.n
      ? Math.round(((acoesTotais.n - (acoesPendentes?.n ?? 0)) / acoesTotais.n) * 100)
      : null,
    NCS_ABERTAS_30D: ncsAbertas30d?.n ?? 0,
    EXECUCAO_AUDITORIAS: auditoriasProgramadas?.n
      ? Math.round(((auditoriasRealizadas?.n ?? 0) / auditoriasProgramadas.n) * 100)
      : null,
    EFETIVIDADE_COGNITIVA_MEDIA: frmsMedia?.media
      ? Math.round(frmsMedia.media * 10) / 10
      : null,
    RELATOS_ANONIMOS_PERC: totalRelatosN > 0
      ? Math.round(((relatosAnonimos?.n ?? 0) / totalRelatosN) * 100)
      : null,
  };

  // Avalia status de cada SPI
  return configs.results.map(cfg => {
    const valor = valoresCalculados[cfg.codigo] ?? null;

    let statusSpi: SpiResult['status_spi'] = 'SEM_DADOS';
    if (valor !== null && cfg.meta_valor !== null && cfg.meta_operador) {
      const atingeMeta = avaliarOperador(valor, cfg.meta_operador, cfg.meta_valor);
      const triggersAlerta =
        cfg.alerta_valor !== null && cfg.alerta_operador
          ? avaliarOperador(valor, cfg.alerta_operador, cfg.alerta_valor)
          : false;

      if (triggersAlerta) statusSpi = 'CRITICO';
      else if (atingeMeta) statusSpi = 'OK';
      else statusSpi = 'ATENCAO';
    }

    return {
      codigo: cfg.codigo,
      nome: cfg.nome,
      valor_atual: valor,
      meta_valor: cfg.meta_valor,
      meta_operador: cfg.meta_operador,
      alerta_valor: cfg.alerta_valor,
      alerta_operador: cfg.alerta_operador,
      status_spi: statusSpi,
      unidade: cfg.unidade,
    };
  });
}

function avaliarOperador(valor: number, operador: string, limite: number): boolean {
  switch (operador) {
    case '>=': return valor >= limite;
    case '<=': return valor <= limite;
    case '>':  return valor > limite;
    case '<':  return valor < limite;
    case '=':  return valor === limite;
    default:   return false;
  }
}
