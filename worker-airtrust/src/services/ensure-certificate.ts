/**
 * ensure-certificate.ts
 *
 * Serviço idempotente para garantir que uma qualificação tem certificado arquivado.
 * Chamado pelos hooks automáticos (LMS, histórico manual, renovação) e pelo backfill.
 *
 * Estados retornados:
 *   EXISTS  — já havia certificado vinculado, nenhuma ação tomada
 *   CREATED — certificado gerado e arquivado com sucesso
 *   SKIPPED — pré-condição ausente (sem template, sem CF creds, sem data_conclusao)
 *   ERROR   — falha inesperada na geração (não derruba o fluxo principal)
 */
import type { Env } from '../types';
import { generateCertificateForHistorico } from './generate-certificate';

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type EnsureCertificateState = 'EXISTS' | 'CREATED' | 'SKIPPED' | 'ERROR';

export interface EnsureCertificateResult {
  state: EnsureCertificateState;
  documentoId?: number;
  reason?: string;
  error?: string;
}

export interface EnsureCertificateOptions {
  /** Se true, regera mesmo que já exista um certificado (usado no botão manual de regenerar). */
  forceRegenerate?: boolean;
  /** ID do usuário que disparou a ação (para auditoria). */
  actorUserId?: number;
}

// ── Função principal ───────────────────────────────────────────────────────────

export async function ensureCertificateForQualification(
  env: Env,
  historicoId: number,
  empresaId: number,
  options: EnsureCertificateOptions = {},
): Promise<EnsureCertificateResult> {
  const db = env.DB;
  const { forceRegenerate = false, actorUserId } = options;

  try {
    // 1. Verificar pré-condições rápidas antes de qualquer query pesada
    if (!env.CF_ACCOUNT_ID || !env.CF_BROWSER_API_TOKEN) {
      return {
        state: 'SKIPPED',
        reason: 'CF Browser Rendering não configurado (CF_ACCOUNT_ID / CF_BROWSER_API_TOKEN ausentes)',
      };
    }

    // 2. Buscar historico para checar existência de certificado e data_conclusao
    const historico = await db
      .prepare(
        `SELECT qh.id, qh.certificado_arquivo_id, qh.data_conclusao, qh.status, f.empresa_id
           FROM qualificacoes_historico qh
           INNER JOIN funcionarios f
             ON f.id = qh.funcionario_id
            AND f.deleted_at IS NULL
          WHERE qh.id = ?
            AND qh.deleted_at IS NULL
            AND f.empresa_id = ?
          LIMIT 1`,
      )
      .bind(historicoId, empresaId)
      .first<{
        id: number;
        certificado_arquivo_id: number | null;
        data_conclusao: string | null;
        status: string | null;
        empresa_id: number;
      }>();

    if (!historico) {
      return {
        state: 'SKIPPED',
        reason: `Histórico ${historicoId} não encontrado para empresa ${empresaId}`,
      };
    }

    // 3. Idempotência: se já tem certificado e não é forçado, retornar EXISTS
    if (historico.certificado_arquivo_id && !forceRegenerate) {
      // Verificar se o documento ainda existe (não foi soft-deleted)
      const docExiste = await db
        .prepare(
          `SELECT id FROM documentos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .bind(historico.certificado_arquivo_id)
        .first<{ id: number }>();

      if (docExiste) {
        return {
          state: 'EXISTS',
          documentoId: historico.certificado_arquivo_id,
        };
      }
      // Documento órfão (deleted_at setado) — prosseguir para regenerar
    }

    // 4. Verificar se tem data_conclusao (necessário para gerar certificado)
    if (!historico.data_conclusao) {
      return {
        state: 'SKIPPED',
        reason: 'Qualificação sem data_conclusao — não é possível gerar certificado',
      };
    }

    // 5. Verificar se há template configurado para a empresa
    const temTemplate = await db
      .prepare(
        `SELECT 1 FROM empresas_config
          WHERE empresa_id = ?
            AND certificado_template_html IS NOT NULL
            AND certificado_template_html != ''
          LIMIT 1`,
      )
      .bind(empresaId)
      .first<{ 1: number }>();

    if (!temTemplate) {
      // Fallback: verificar em certificados_templates
      const temTemplateFallback = await db
        .prepare(
          `SELECT 1 FROM certificados_templates
            WHERE empresa_id = ?
              AND ativo = 1
              AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(empresaId)
        .first<{ 1: number }>();

      if (!temTemplateFallback) {
        return {
          state: 'SKIPPED',
          reason: `Nenhum template de certificado configurado para empresa ${empresaId}`,
        };
      }
    }

    // 6. Gerar certificado
    const generated = await generateCertificateForHistorico(env, historicoId, empresaId, {
      actorUserId,
    });

    console.log(
      `[ensure-certificate] CREATED historicoId=${historicoId} documentoId=${generated.documentoId}`,
    );

    return {
      state: 'CREATED',
      documentoId: generated.documentoId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ensure-certificate] ERROR historicoId=${historicoId} empresaId=${empresaId}:`,
      errorMsg,
    );
    return {
      state: 'ERROR',
      error: errorMsg,
    };
  }
}
