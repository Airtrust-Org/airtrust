/**
 * Serviço de sincronização bidirecional entre funcionarios e qualificacoes_historico
 * Para certificações: ICAO, CMA, ASO
 */

import { D1Database } from '@cloudflare/workers-types';
import { createQualificationHistoryAtomic } from './qualification-history-atomic';

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

interface TipoInfo {
  id: number;
  codigo: string;
  categoria: string | null;
}

async function getTipoInfo(
  db: D1Database,
  codigo: string,
  empresaId: number,
  defaultId: number,
): Promise<TipoInfo> {
  try {
    const tipo = await db
      .prepare(
        `SELECT id, codigo, categoria
           FROM qualificacoes_tipos
          WHERE (UPPER(codigo) = UPPER(?) OR UPPER(nome) = UPPER(?))
            AND empresa_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(codigo, codigo, empresaId)
      .first<TipoInfo>();
    if (tipo) return tipo;
  } catch (e) {
    console.warn(`[SYNC] Erro ao buscar tipo ${codigo}, usando default ${defaultId}`, e);
  }
  // Fallback: o default id é fixo por instalação (não configurável por
  // tenant), então seu código canônico é o próprio parâmetro recebido.
  return { id: defaultId, codigo, categoria: null };
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
    const cma = await getTipoInfo(db, 'CMA', empresaId, DEFAULT_CMA_ID);
    await upsertQualificacao(db, {
      funcionario_id,
      empresa_id: empresaId,
      tipo: cma,
      data_conclusao: data.data_realizacao_cma || null,
      data_vencimento: data.validade_cma || null,
      numero_documento: data.cma || null,
      observacoes: 'Atualizado via modal de funcionário (Sync Automático)',
    });
  }

  // 2. Sincronizar ASO
  if (data.data_realizacao_aso || data.validade_aso) {
    const aso = await getTipoInfo(db, 'ASO', empresaId, DEFAULT_ASO_ID);
    await upsertQualificacao(db, {
      funcionario_id,
      empresa_id: empresaId,
      tipo: aso,
      data_conclusao: data.data_realizacao_aso || null,
      data_vencimento: data.validade_aso || null,
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
  tipo: TipoInfo;
  data_conclusao: string | null;
  data_vencimento: string | null;
  numero_documento: string | null;
  observacoes: string;
}

/**
 * Cria/realiza a certificação via o primitivo canônico de settlement quando
 * há data_conclusao (uma conclusão real), preservando o invariante de
 * lineage (predecessor imediato + renovacao_de) que todo outro writer de
 * qualificacoes_historico convergido nesta auditoria já respeita. Quando o
 * modal só envia data_vencimento (sem data_conclusao), não há um evento de
 * conclusão para settlement — nesse caso apenas atualiza o vencimento do
 * registro CONCLUIDA mais recente já existente, sem criar linha nova nem
 * tocar lineage.
 */
async function upsertQualificacao(db: D1Database, params: UpsertQualificacaoParams): Promise<void> {
  const { funcionario_id, empresa_id, tipo, data_conclusao, data_vencimento, numero_documento, observacoes } =
    params;

  if (!data_conclusao && !data_vencimento) {
    console.warn('[SYNC] Ignorando upsertQualificacao: sem datas', {
      funcionario_id,
      qualificacao_id: tipo.id,
    });
    return;
  }

  if (!data_conclusao) {
    // Sem data de conclusão real: apenas atualiza o vencimento do registro
    // CONCLUIDA mais recente (por data_conclusao, não por created_at), se
    // existir. Nunca cria linha nem materializa/realoca lineage.
    const existing = await db
      .prepare(
        `SELECT id
           FROM qualificacoes_historico
          WHERE funcionario_id = ?
            AND qualificacao_id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND UPPER(COALESCE(status, '')) = 'CONCLUIDA'
          ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) DESC, id DESC
          LIMIT 1`,
      )
      .bind(funcionario_id, tipo.id, empresa_id)
      .first<{ id: number }>();

    if (!existing) {
      console.warn('[SYNC] Sem data_conclusao e nenhum registro CONCLUIDA existente para atualizar vencimento', {
        funcionario_id,
        qualificacao_id: tipo.id,
      });
      return;
    }

    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET data_vencimento = ?,
                numero_certificado = COALESCE(?, numero_certificado),
                observacoes = ?,
                updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(data_vencimento, numero_documento, observacoes, existing.id, empresa_id)
      .run();
    return;
  }

  const result = await createQualificationHistoryAtomic(db, {
    empresaId: empresa_id,
    funcionarioId: funcionario_id,
    qualificationId: tipo.id,
    qualificationCode: tipo.codigo,
    category: tipo.categoria,
    completionDate: data_conclusao,
    expiryDate: data_vencimento,
    validityMonths: null,
    instructor: null,
    observations: observacoes,
    status: 'CONCLUIDA',
    workload: null,
    trainingType: 'RECORRENTE',
  });

  if (numero_documento) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET numero_certificado = ?,
                updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(numero_documento, result.id, empresa_id)
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
        ON qt.id = qh.qualificacao_id
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
