/**
 * Serviço de sincronização bidirecional entre funcionarios e qualificacoes_historico
 * Para certificações: ICAO, CMA, ASO
 */

import { D1Database } from '@cloudflare/workers-types';

// IDs das qualificações no banco (serão buscados dinamicamente se possível)
const DEFAULT_CMA_ID = 1;
const DEFAULT_ASO_ID = 18;

interface FuncionarioEmpresaRow {
  empresa_id: number | null;
}

interface FuncionarioCertificacao {
  funcionario_id: number;
  nivel_icao?: string | null;
  data_realizacao_icao?: string | null;
  validade_icao?: string | null;
  cma?: string | null;
  data_realizacao_cma?: string | null;
  validade_cma?: string | null;
  aso?: string | null;
  data_realizacao_aso?: string | null;
  validade_aso?: string | null;
}

/**
 * Busca ID do tipo de qualificação pelo código ou nome (case insensitive)
 */
async function getFuncionarioEmpresaId(
  db: D1Database,
  funcionarioId: number,
): Promise<number | null> {
  const funcionario = await db
    .prepare(
      `SELECT empresa_id
         FROM funcionarios
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(funcionarioId)
    .first<FuncionarioEmpresaRow>();

  return funcionario?.empresa_id ?? null;
}

async function getTipoId(
  db: D1Database,
  codigo: string,
  empresaId: number,
  defaultId: number,
): Promise<number> {
  try {
    const tipo = await db
      .prepare(
        `SELECT id
           FROM qualificacoes_tipos
          WHERE (UPPER(codigo) = UPPER(?) OR UPPER(nome) = UPPER(?))
            AND empresa_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(codigo, codigo, empresaId)
      .first<{ id: number }>();
    return tipo?.id || defaultId;
  } catch (e) {
    console.warn(`[SYNC] Erro ao buscar tipo ${codigo}, usando default ${defaultId}`, e);
    return defaultId;
  }
}

/**
 * Sincroniza certificações de funcionário para qualificacoes_historico
 * Chamado após salvar/atualizar funcionário no modal
 */
export async function syncFuncionarioCertificacoes(
  db: D1Database,
  data: FuncionarioCertificacao,
): Promise<void> {
  const { funcionario_id } = data;
  const empresaId = await getFuncionarioEmpresaId(db, funcionario_id);
  if (!empresaId) {
    throw new Error(`SYNC_TENANT_NOT_FOUND funcionario_id=${funcionario_id}`);
  }

  console.log('[SYNC] Iniciando sincronização de certificações:', {
    funcionario_id,
    empresa_id: empresaId,
    has_cma: !!data.data_realizacao_cma,
    has_aso: !!data.data_realizacao_aso,
  });

  // 1. Sincronizar CMA
  if (data.data_realizacao_cma || data.validade_cma) {
    const cmaId = await getTipoId(db, 'CMA', empresaId, DEFAULT_CMA_ID);
    await upsertQualificacao(db, {
      funcionario_id,
      empresa_id: empresaId,
      qualificacao_tipo_id: cmaId,
      data_conclusao: data.data_realizacao_cma || '', // Permitir um dos dois
      data_vencimento: data.validade_cma || '',
      numero_documento: data.cma || null,
      observacoes: 'Atualizado via modal de funcionário (Sync Automático)',
    });
  }

  // 2. Sincronizar ASO
  if (data.data_realizacao_aso || data.validade_aso) {
    const asoId = await getTipoId(db, 'ASO', empresaId, DEFAULT_ASO_ID);
    await upsertQualificacao(db, {
      funcionario_id,
      empresa_id: empresaId,
      qualificacao_tipo_id: asoId,
      data_conclusao: data.data_realizacao_aso || '',
      data_vencimento: data.validade_aso || '',
      numero_documento: data.aso || null,
      observacoes: 'Atualizado via modal de funcionário (Sync Automático)',
    });
  }

  // 3. Verificar se existe uma regra genérica de "EXAME" (Regra de Negócio customizada)
  // Se o usuário pediu "Qualificação do tipo Exame", pode ser um tipo agregador ou específico.
  // Tentaremos buscar um tipo com código "EXAME". Se existir, criamos um registro genérico?
  // POR ENQUANTO: Focamos em garantir que CMA e ASO (que são exames) sejam criados.
}

interface UpsertQualificacaoParams {
  funcionario_id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  data_conclusao: string;
  data_vencimento: string;
  numero_documento: string | null;
  observacoes: string;
}

/**
 * Cria ou atualiza registro em qualificacoes_historico
 */
async function upsertQualificacao(db: D1Database, params: UpsertQualificacaoParams): Promise<void> {
  const {
    funcionario_id,
    empresa_id,
    qualificacao_tipo_id,
    data_conclusao,
    data_vencimento,
    numero_documento,
    observacoes,
  } = params;

  // Validação mínima: precisa de pelo menos uma data
  if (!data_conclusao && !data_vencimento) {
    console.warn('[SYNC] Ignorando upsertQualificacao: sem datas', {
      funcionario_id,
      qualificacao_tipo_id,
    });
    return;
  }

  // Verificar se já existe registro ativo (mesmo tipo, mesmo funcionário)
  // CRITÉRIO DE UNICIDADE: Consideramos o "mais recente" criado pelo sistema ou pelo usuário para este tipo.
  // Se a data de validade/conclusão for DIFERENTE da mais recente, criamos um NOVO histórico?
  // OU atualizamos o existente se for recente?
  // Regra de Negócio: Ao editar no modal, ATUALIZA o registro SE ele parecer ser o "atual".
  // Se as datas mudaram drasticamente (ex: renovação), deveria ser NOVO.
  // SIMPLIFICAÇÃO ATUAL: Busca o último registro. Se as datas batem (ou são nulas), atualiza. Se diferente, insere novo (Histórico).
  // MUDANÇA: O pedido diz "garantir persistência". Se eu editar uma data, devo atualizar o registro correspondente se for o mesmo exame.

  const existing = await db
    .prepare(
      `
      SELECT id, data_conclusao, data_vencimento
      FROM qualificacoes_historico 
      WHERE funcionario_id = ? 
        AND qualificacao_tipo_id = ? 
        AND empresa_id = ?
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .bind(funcionario_id, qualificacao_tipo_id, empresa_id)
    .first<{ id: number; data_conclusao: string; data_vencimento: string }>();

  if (existing) {
    // Decisão: Atualizar ou Criar Novo?
    // Se a data de vencimento nova for > que a atual em X dias?
    // Para simplificar e garantir persistência da edição: UPDATE no último registro.
    // Isso garante que "reabrir modal e conferir" mostre o salvo.
    console.log(`[SYNC] Atualizando qualificação existente ID=${existing.id}`);
    await db
      .prepare(
        `
        UPDATE qualificacoes_historico
        SET data_conclusao = ?,
            data_vencimento = ?,
            numero_documento = COALESCE(?, numero_documento),
            observacoes = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
      `,
      )
      .bind(data_conclusao, data_vencimento, numero_documento, observacoes, existing.id, empresa_id)
      .run();
  } else {
    // Criar novo registro
    console.log(`[SYNC] Criando nova qualificação para tipo=${qualificacao_tipo_id}`);
    await db
      .prepare(
        `
        INSERT INTO qualificacoes_historico (
          funcionario_id,
          qualificacao_id,
          data_conclusao,
          data_vencimento,
          numero_certificado,
          observacoes,
          empresa_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      )
      .bind(
        funcionario_id,
        qualificacao_tipo_id, // Agora vai para qualificacao_id
        data_conclusao,
        data_vencimento,
        numero_documento,
        observacoes,
        empresa_id,
      )
      .run();
  }
}

/**
 * Atualiza campos de certificação no funcionario quando qualificacao_historico é modificada
 * Chamado após criar/atualizar qualificação via página de qualificações
 */
/**
 * Atualiza campos de certificação no funcionario quando qualificacao_historico é modificada
 * Chamado após criar/atualizar qualificação via página de qualificações
 */
export async function syncQualificacaoToFuncionario(
  db: D1Database,
  qualificacaoHistoricoId: number,
): Promise<void> {
  // Buscar dados da qualificação incluindo o CÓDIGO do tipo
  const qual = await db
    .prepare(
      `
      SELECT 
        qh.funcionario_id,
        qh.empresa_id,
        qh.data_conclusao,
        qh.data_vencimento,
        qt.codigo as tipo_codigo
      FROM qualificacoes_historico qh
      LEFT JOIN qualificacoes_tipos qt
        ON qt.id = qh.qualificacao_tipo_id
       AND qt.empresa_id = qh.empresa_id
       AND qt.deleted_at IS NULL
      WHERE qh.id = ?
        AND qh.deleted_at IS NULL
    `,
    )
    .bind(qualificacaoHistoricoId)
    .first<{
      funcionario_id: number;
      empresa_id: number;
      tipo_codigo: string;
      data_conclusao: string;
      data_vencimento: string;
    }>();

  if (!qual || !qual.tipo_codigo) return;

  const codigo = qual.tipo_codigo.toUpperCase();

  // Atualizar campos correspondentes no funcionário
  if (codigo === 'CMA') {
    await db
      .prepare(
        `
        UPDATE funcionarios
        SET data_realizacao_cma = ?,
            validade_cma = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
      `,
      )
      .bind(qual.data_conclusao, qual.data_vencimento, qual.funcionario_id, qual.empresa_id)
      .run();
  } else if (codigo === 'ASO') {
    await db
      .prepare(
        `
        UPDATE funcionarios
        SET data_realizacao_aso = ?,
            validade_aso = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
      `,
      )
      .bind(qual.data_conclusao, qual.data_vencimento, qual.funcionario_id, qual.empresa_id)
      .run();
  }
}
