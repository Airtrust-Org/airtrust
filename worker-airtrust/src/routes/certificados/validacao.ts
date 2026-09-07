import { Hono } from 'hono';
import { rateLimiter, rateLimitPresets } from '../../middleware/rate-limit';
import type { Env } from '../../types';
import { calcularDataVencimento } from '../../utils/qualificacoes-expiration';
import { generateCertificateValidationHash } from '../../utils/certificate-validation-hash';
import { tableHasColumn } from '../qualificacoes-certificados-helpers';

const validacao = new Hono<{ Bindings: Env }>();
const CERTIFICATE_SCAN_BATCH_SIZE = 250;
const CERTIFICATE_SCAN_MAX_ROWS = 1_000;

interface CertificateValidationRow {
  id: number | string;
  r2_key: string | null;
  numero_certificado: string;
  created_at: string;
  data_conclusao: string | null;
  data_vencimento: string | null;
  validade_meses: number | string | null;
  carga_horaria: number | string | null;
  instrutor: string | null;
  tipo_treinamento: string | null;
  funcionario_nome: string;
  funcionario_cpf: string;
  codigo_anac: string | null;
  qualificacao_nome: string | null;
  qualificacao_codigo: string;
  qualificacao_categoria: string | null;
  qualificacao_carga_padrao: number | string | null;
  qualificacao_carga_inicial: number | string | null;
  qualificacao_carga_recorrente: number | string | null;
  qualificacao_validade: number | string | null;
  vencimento_fim_mes: number | string | null;
  empresa_nome: string;
}

type TipoTreinamento = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

function toPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeTipoTreinamento(value?: string | null): TipoTreinamento | undefined {
  if (!value) return undefined;

  const normalized = value
    .toString()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (normalized === 'SEMESTRAL') return 'SEMESTRAL';
  if (normalized === 'PERIODICO') return 'RECORRENTE';
  if (normalized === 'RECORRENTE') return 'RECORRENTE';
  if (normalized === 'INICIAL') return 'INICIAL';
  if (normalized === 'UPGRADE') return 'UPGRADE';
  if (normalized === 'ESPECIFICO') return 'ESPECIFICO';

  return undefined;
}

function resolveCargaHorariaCertificado(params: {
  tipoTreinamento?: string | null;
  cargaHistorico?: unknown;
  cargaInicial?: unknown;
  cargaRecorrente?: unknown;
  cargaPadrao?: unknown;
}): number | undefined {
  const cargaInicial = toPositiveNumber(params.cargaInicial);
  const cargaRecorrente = toPositiveNumber(params.cargaRecorrente);
  const cargaPadrao = toPositiveNumber(params.cargaPadrao);
  const cargaHistorico = toPositiveNumber(params.cargaHistorico);
  const tipoTreinamento = normalizeTipoTreinamento(params.tipoTreinamento);

  if (tipoTreinamento === 'RECORRENTE' || tipoTreinamento === 'SEMESTRAL') {
    return cargaRecorrente || cargaPadrao || cargaInicial || cargaHistorico;
  }

  if (tipoTreinamento === 'INICIAL') {
    return cargaInicial || cargaPadrao || cargaRecorrente || cargaHistorico;
  }

  return cargaPadrao || cargaRecorrente || cargaInicial || cargaHistorico;
}

async function buildValidationPayload(
  env: Env,
  cert: CertificateValidationRow,
  expectedHash: string,
) {
  const funcionarioCpf = String(cert.funcionario_cpf || '');
  const qualificacaoCodigo = String(cert.qualificacao_codigo || '');
  const dataConclusao = String(cert.data_conclusao || '').trim();
  const numeroCertificado = String(cert.numero_certificado || '');
  if (!funcionarioCpf || !qualificacaoCodigo || !dataConclusao || !numeroCertificado) return null;

  const certHash = await generateCertificateValidationHash({
    funcionarioCpf,
    qualificacaoCodigo,
    dataConclusao,
    numeroCertificado,
  });
  if (certHash !== expectedHash) return null;

  const validadeMesesNumero = Number(cert.validade_meses || cert.qualificacao_validade || 0);
  const vencimentoFimMes = Number(cert.vencimento_fim_mes || 0) === 1 ? 1 : 0;
  const cargaHorariaAtual = resolveCargaHorariaCertificado({
    tipoTreinamento: cert.tipo_treinamento,
    cargaHistorico: cert.carga_horaria,
    cargaInicial: cert.qualificacao_carga_inicial,
    cargaRecorrente: cert.qualificacao_carga_recorrente,
    cargaPadrao: cert.qualificacao_carga_padrao,
  });
  const dataVencimentoPersistido = String(cert.data_vencimento || '')
    .trim()
    .split('T')[0];
  const dataVencimentoAtual =
    dataVencimentoPersistido ||
    (validadeMesesNumero > 0
      ? calcularDataVencimento(dataConclusao, validadeMesesNumero, vencimentoFimMes)
      : null);

  const situacaoOperacionalAtual: 'VALIDA' | 'VENCIDA' | 'INDETERMINADA' = !dataVencimentoAtual
    ? 'INDETERMINADA'
    : dataVencimentoAtual < new Date().toISOString().slice(0, 10)
      ? 'VENCIDA'
      : 'VALIDA';

  let validadeMeses = 'Indeterminada';
  if (dataVencimentoAtual) {
    const conclusao = new Date(`${dataConclusao}T00:00:00Z`);
    const vencimento = new Date(`${dataVencimentoAtual}T00:00:00Z`);
    let meses = (vencimento.getFullYear() - conclusao.getFullYear()) * 12;
    meses += vencimento.getMonth() - conclusao.getMonth();
    if (meses === 1) validadeMeses = '1 mês';
    else if (meses > 1) validadeMeses = `${meses} meses`;
  }

  let arquivoDisponivel = false;
  const r2Key = String(cert.r2_key || '').trim();
  if (r2Key) {
    try {
      arquivoDisponivel = Boolean(await env.BUCKET.head(r2Key));
    } catch (storageError) {
      console.error('[VALIDAÇÃO] Falha ao verificar artefato R2:', storageError);
    }
  }

  const qualificacaoNome =
    String(cert.qualificacao_nome || qualificacaoCodigo).trim() || 'Qualificação';
  const qualificacaoCategoria = String(cert.qualificacao_categoria || '').trim() || 'N/A';

  return {
    success: true,
    valido: true,
    documento_autentico: true,
    situacao_operacional_atual: situacaoOperacionalAtual,
    arquivo_disponivel: arquivoDisponivel,
    alerta: arquivoDisponivel
      ? undefined
      : 'Certificado registrado, mas o arquivo digital está indisponível. Contate a empresa emissora.',
    certificado: {
      numero: numeroCertificado,
      funcionario_nome: cert.funcionario_nome,
      funcionario_cpf: mascarCPF(funcionarioCpf),
      codigo_anac: cert.codigo_anac || 'N/A',
      instrutor_nome: cert.instrutor || 'N/A',
      instrutor_codigo_anac: 'N/A',
      qualificacao_tipo: qualificacaoCategoria,
      qualificacao_nome: qualificacaoNome,
      qualificacao_codigo: qualificacaoCodigo,
      categoria: qualificacaoCategoria,
      carga_horaria: cargaHorariaAtual ? `${cargaHorariaAtual} horas` : 'N/A',
      data_emissao: dataConclusao || cert.created_at,
      data_conclusao: dataConclusao,
      data_validade: dataVencimentoAtual,
      data_vencimento: dataVencimentoAtual ? formatarData(dataVencimentoAtual) : 'Indeterminada',
      validade: validadeMeses,
      empresa_nome: cert.empresa_nome,
      hash: certHash,
      tipo_treinamento: cert.tipo_treinamento || 'RECORRENTE',
    },
  };
}

/**
 * GET /api/certificados/validar/:hash
 * Endpoint PÚBLICO (sem autenticação) para validar certificados.
 * Durante o rollout da migration 0470, usa o índice quando disponível e
 * preserva o scan legado até o backfill histórico estar comprovadamente completo.
 */
validacao.get('/:hash', rateLimiter(rateLimitPresets.certificateValidation), async (c) => {
  const { hash } = c.req.param();
  const db = c.env.DB;

  try {
    if (!/^[A-F0-9]{16}$/i.test(hash)) {
      return c.json(
        {
          success: false,
          valido: false,
          mensagem: 'Código de verificação inválido (formato incorreto)',
        },
        400,
      );
    }

    const expectedHash = hash.toUpperCase();
    const hasIndexedHash = await tableHasColumn(db, 'qualificacoes_historico', 'validacao_hash');

    if (hasIndexedHash) {
      const page: D1Result<CertificateValidationRow> = await db
        .prepare(
          `SELECT
             d.id,
             d.r2_key,
             d.created_at,
             qh.numero_certificado,
             qh.data_conclusao,
             qh.data_vencimento,
             qh.validade_meses,
             qh.carga_horaria,
             qh.instrutor,
             qh.tipo_treinamento,
             f.nome AS funcionario_nome,
             f.cpf AS funcionario_cpf,
             f.codigo_anac,
             qt.nome AS qualificacao_nome,
             qh.qualificacao_codigo,
             qt.categoria AS qualificacao_categoria,
             qt.carga_horaria AS qualificacao_carga_padrao,
             qt.carga_horaria_inicial AS qualificacao_carga_inicial,
             qt.carga_horaria_recorrente AS qualificacao_carga_recorrente,
             qt.validade AS qualificacao_validade,
             COALESCE(qt.vencimento_fim_mes, 0) AS vencimento_fim_mes,
             e.nome AS empresa_nome
           FROM qualificacoes_historico qh
           INNER JOIN documentos d ON d.id = qh.certificado_arquivo_id
           INNER JOIN funcionarios f ON f.id = qh.funcionario_id
           LEFT JOIN qualificacoes_tipos qt
             ON qt.id = qh.qualificacao_id
            AND qt.deleted_at IS NULL
           INNER JOIN empresas e ON e.id = qh.empresa_id
           WHERE qh.deleted_at IS NULL
             AND d.deleted_at IS NULL
             AND f.deleted_at IS NULL
             AND qh.certificado_arquivo_id IS NOT NULL
             AND qh.numero_certificado IS NOT NULL
             AND qh.validacao_hash = ?
           ORDER BY d.created_at DESC, d.id DESC
           LIMIT 2`,
        )
        .bind(expectedHash)
        .all<CertificateValidationRow>();
      const indexedResults: CertificateValidationRow[] = page.results || [];
      if (indexedResults.length > 1) {
        return c.json(
          {
            success: false,
            valido: false,
            mensagem: 'Certificado não pôde ser determinado de forma única.',
          },
          409,
        );
      }

      const indexedCert = indexedResults[0];
      if (indexedCert) {
        const payload = await buildValidationPayload(c.env, indexedCert, expectedHash);
        if (payload) {
          console.log(`[VALIDAÇÃO] Certificado encontrado via índice. ID: ${indexedCert.id}`);
          return c.json(payload);
        }
      }
    }

    // Transitional compatibility path required by the 0470 Schema V2 plan:
    // do not remove until historical backfill verification reports zero
    // eligible rows without validacao_hash and no ambiguous collisions.
    let cursorCreatedAt: string | null = null;
    let cursorId: number | null = null;
    let scanned = 0;

    while (scanned < CERTIFICATE_SCAN_MAX_ROWS) {
      const remaining = CERTIFICATE_SCAN_MAX_ROWS - scanned;
      const pageSize = Math.min(CERTIFICATE_SCAN_BATCH_SIZE, remaining);
      const cursorPredicate = cursorCreatedAt
        ? 'AND (d.created_at < ? OR (d.created_at = ? AND d.id < ?))'
        : '';
      const statement = db.prepare(
        `SELECT
           d.id,
           d.r2_key,
           d.created_at,
           qh.numero_certificado,
           qh.data_conclusao,
           qh.data_vencimento,
           qh.validade_meses,
           qh.carga_horaria,
           qh.instrutor,
           qh.tipo_treinamento,
           f.nome AS funcionario_nome,
           f.cpf AS funcionario_cpf,
           f.codigo_anac,
           qt.nome AS qualificacao_nome,
           qh.qualificacao_codigo,
           qt.categoria AS qualificacao_categoria,
           qt.carga_horaria AS qualificacao_carga_padrao,
           qt.carga_horaria_inicial AS qualificacao_carga_inicial,
           qt.carga_horaria_recorrente AS qualificacao_carga_recorrente,
           qt.validade AS qualificacao_validade,
           COALESCE(qt.vencimento_fim_mes, 0) AS vencimento_fim_mes,
           e.nome AS empresa_nome
         FROM qualificacoes_historico qh
         INNER JOIN documentos d ON d.id = qh.certificado_arquivo_id
         INNER JOIN funcionarios f ON f.id = qh.funcionario_id
         LEFT JOIN qualificacoes_tipos qt
           ON qt.id = qh.qualificacao_id
          AND qt.deleted_at IS NULL
         INNER JOIN empresas e ON e.id = qh.empresa_id
         WHERE qh.deleted_at IS NULL
           AND d.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND qh.certificado_arquivo_id IS NOT NULL
           AND qh.numero_certificado IS NOT NULL
           ${hasIndexedHash ? "AND (qh.validacao_hash IS NULL OR TRIM(qh.validacao_hash) = '')" : ''}
           ${cursorPredicate}
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT ?`,
      );
      const page: D1Result<CertificateValidationRow> = cursorCreatedAt
        ? await statement
            .bind(cursorCreatedAt, cursorCreatedAt, cursorId, pageSize)
            .all<CertificateValidationRow>()
        : await statement.bind(pageSize).all<CertificateValidationRow>();
      const results: CertificateValidationRow[] = page.results || [];
      scanned += results.length;

      for (const cert of results) {
        const payload = await buildValidationPayload(c.env, cert, expectedHash);
        if (!payload) continue;
        console.log(`[VALIDAÇÃO] Certificado encontrado via fallback após ${scanned} registros. ID: ${cert.id}`);
        return c.json(payload);
      }

      if (results.length < pageSize) break;
      const last: CertificateValidationRow = results[results.length - 1];
      cursorCreatedAt = String(last.created_at || '');
      cursorId = Number(last.id);
      if (!cursorCreatedAt || !Number.isFinite(cursorId)) break;
    }

    if (scanned >= CERTIFICATE_SCAN_MAX_ROWS) {
      console.warn(
        `[VALIDAÇÃO] Fallback histórico atingiu o teto de ${CERTIFICATE_SCAN_MAX_ROWS} registros sem resolução.`,
      );
      return c.json(
        {
          success: false,
          valido: false,
          code: 'CERTIFICATE_VALIDATION_SCAN_LIMIT',
          mensagem: 'Validação temporariamente indisponível para este certificado.',
        },
        503,
      );
    }

    console.log(`[VALIDAÇÃO] Hash não encontrado após ${scanned} registros: ${hash}`);
    return c.json(
      {
        success: false,
        valido: false,
        mensagem: 'Certificado não encontrado. Verifique se o código foi digitado corretamente.',
      },
      404,
    );
  } catch (error) {
    console.error('[VALIDAÇÃO] Erro ao validar certificado:', error);
    return c.json(
      {
        success: false,
        valido: false,
        error: 'Erro ao validar certificado',
        mensagem: 'Ocorreu um erro ao processar sua solicitação. Tente novamente.',
      },
      500,
    );
  }
});

/**
 * Mascara CPF para privacidade (ex: ***.***.***-05)
 */
function mascarCPF(cpf: string): string {
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return `***.***.***-${limpo.slice(-2)}`;
}

/**
 * Formata data ISO para pt-BR
 */
function formatarData(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'Data inválida';
  }
}

export default validacao;
