/**
 * generate-certificate.ts
 *
 * Core PDF-generation logic for qualificacoes certificates.
 * Called by the manual route AND by the auto-generation hook.
 */
import type { Env } from '../types';
import { gerarNomeArquivoPadronizado } from '../utils/nomenclatura-padronizada';
import type { CertificadoData } from './pdf-generator';
import { htmlToPdf, processTemplateWithQR } from './html-to-pdf';
import { convertTemplateJsonToHtml, isTemplateJson } from '../utils/template-json-to-html';
import { registrarAuditoria } from '../utils/auditoria';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';
import {
  adaptTemplateHtmlForSinglePageA4,
  adaptTemplateHtmlForInstrutor,
  tableHasColumn,
  normalizeTipoTreinamento,
  resolveCargaHorariaCertificado,
  buildConteudoProgramaticoCertificadoHtml,
  buildDescricaoSectionHtml,
  buildQualMetaLineHtml,
  getCertificadosStorageColumns,
  backfillCertificadoAtualNaPastaVirtual,
  resolveImageDataUrl,
  resolveConteudoProgramaticoCertificado,
  resolveInstrutorCertificadoData,
  resolveFuncionarioInstrutorNaEmpresa,
} from '../routes/qualificacoes-certificados-helpers';

// ── Erros tipados ──────────────────────────────────────────────────────────────

/**
 * Códigos de erro sanitizados retornados pela geração de certificado.
 * Nenhuma mensagem associada a estes códigos deve conter stack traces, SQL,
 * tokens ou outros detalhes internos — apenas texto seguro para exibição
 * ao usuário final. O route handler (qualificacoes-certificados-write.ts)
 * mapeia cada código para o status HTTP apropriado.
 */
export const CERTIFICATE_ERROR_CODES = [
  'CERTIFICATE_HISTORY_NOT_FOUND',
  'CERTIFICATE_TEMPLATE_NOT_CONFIGURED',
  'CERTIFICATE_BROWSER_RENDERING_NOT_CONFIGURED',
  'CERTIFICATE_BROWSER_RENDERING_FAILED',
  'CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED',
  'CERTIFICATE_ACCESS_DENIED',
  'CERTIFICATE_STORAGE_FAILED',
  'CERTIFICATE_CONCURRENT_GENERATION',
  'CERTIFICATE_PERSISTENCE_FAILED',
] as const;

export type CertificateErrorCode = (typeof CERTIFICATE_ERROR_CODES)[number];

export class CertificateGenerationError extends Error {
  public readonly code: CertificateErrorCode;

  constructor(code: CertificateErrorCode, message: string) {
    super(message);
    this.name = 'CertificateGenerationError';
    this.code = code;
  }
}

// ── Helpers locais ─────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInstrutorSection(instrutor: {
  nome: string;
  codigoAnac?: string | null;
  matricula?: string | null;
}): string {
  const safeName = escapeHtml(instrutor.nome);
  const meta = [instrutor.codigoAnac, instrutor.matricula]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join(' &nbsp;·&nbsp; ');
  const metaHtml = meta
    ? `<span class="instructor-meta-label" style="color:#64748b;font-size:7.1pt;font-weight:700;text-transform:uppercase;letter-spacing:.45px;white-space:nowrap;">CANAC / Matrícula</span><span class="instructor-meta-value" style="color:#1d1d1f;font-size:9pt;font-weight:650;line-height:1.15;">${meta}</span>`
    : '';
  return `<div class="instructor-section" style="border:1px solid #dbeafe;background:#eff6ff;border-radius:9px;padding:7px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;align-items:center;min-height:0;"><div class="instructor-name-block" style="display:flex;align-items:center;gap:8px;min-width:0;"><span class="instructor-label" style="color:#64748b;font-size:7.1pt;font-weight:700;text-transform:uppercase;letter-spacing:.45px;white-space:nowrap;">Instrutor</span><span class="instructor-name" style="color:#1d1d1f;font-size:9pt;font-weight:700;line-height:1.15;overflow:hidden;text-overflow:ellipsis;">${safeName}</span></div>${metaHtml ? `<div class="instructor-meta-block" style="display:flex;align-items:center;gap:7px;min-width:0;">${metaHtml}</div>` : ''}</div>`;
}

function ensureInstrutorSectionInTemplate(templateHtml: string): string {
  const hasPlaceholder = templateHtml.includes('{{instrutor_section}}');

  const style = `<style id="airtrust-instrutor-section-style">
  .cert-page {
    grid-template-rows: auto auto auto auto auto minmax(0, 1fr) auto !important;
    gap: 14px !important;
  }
  .instructor-section {
    border: 1px solid #dbeafe;
    background: #eff6ff;
    border-radius: 9px;
    padding: 7px 10px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 14px;
    min-height: 0;
  }
  .instructor-name-block,
  .instructor-meta-block {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .instructor-label,
  .instructor-meta-label {
    color: #64748b;
    font-size: 7.1pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .45px;
    white-space: nowrap;
  }
  .instructor-name,
  .instructor-meta-value {
    color: #1d1d1f;
    font-size: 9pt;
    font-weight: 700;
    line-height: 1.15;
  }
</style>`;

  let result = templateHtml;
  if (!result.includes('airtrust-instrutor-section-style')) {
    result = /<\/head>/i.test(result)
      ? result.replace(/<\/head>/i, `${style}</head>`)
      : `${style}${result}`;
  }

  if (hasPlaceholder) return result;

  if (result.includes('</div>\n\n  <!-- QUALIFICAÇÃO -->')) {
    return result.replace(
      '</div>\n\n  <!-- QUALIFICAÇÃO -->',
      '</div>\n\n  {{instrutor_section}}\n\n  <!-- QUALIFICAÇÃO -->',
    );
  }

  if (/<div[^>]+class=["'][^"']*training-box[^"']*["']/i.test(result)) {
    return result.replace(
      /(<div[^>]+class=["'][^"']*training-box[^"']*["'][^>]*>)/i,
      '{{instrutor_section}}\n\n  $1',
    );
  }

  return result.replace(/<\/body>/i, '{{instrutor_section}}</body>');
}

// ── Helpers públicos ───────────────────────────────────────────────────────────

/**
 * Constrói a R2 key tenant-scoped para um certificado.
 * Não contém PII (sem CPF, sem nome) no path.
 */
export function buildCertificadoR2Key(
  empresaId: number,
  funcionarioId: number,
  historicoId: number,
  uuid: string,
): string {
  return `certificados/empresa-${empresaId}/funcionario-${funcionarioId}/historico-${historicoId}/${uuid}.pdf`;
}

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface GenerateCertificateOptions {
  paraInstrutor?: boolean;
  nomeInstrutor?: string;
  cpfInstrutor?: string;
  matriculaInstrutor?: string;
  actorUserId?: number;
  /** Valor observado antes da geração; usado como compare-and-set no vínculo final. */
  expectedCertificadoArquivoId?: number | null;
  actorRole?: string;
  ipAddress?: string;
}

export interface GenerateCertificateResult {
  documentoId: number;
  uuid: string;
  r2Key: string;
  tamanho: number;
  numeroCertificado: string;
}

// ── Função principal ───────────────────────────────────────────────────────────

export async function generateCertificateForHistorico(
  env: Env,
  historicoId: number,
  empresaId: number,
  options: GenerateCertificateOptions = {},
): Promise<GenerateCertificateResult> {
  const db = env.DB;
  const bucket = env.BUCKET;

  const {
    paraInstrutor = false,
    nomeInstrutor: nomeInstrutorInformado = '',
    cpfInstrutor: cpfInstrutorInformado = '',
    matriculaInstrutor: matriculaInstrutorInformada = '',
    actorUserId,
    expectedCertificadoArquivoId: expectedCertificadoArquivoIdOption,
  } = options;

  const historicoHasTipoTreinamento = await tableHasColumn(
    db,
    'qualificacoes_historico',
    'tipo_treinamento',
  );
  const tiposHasCargaInicial = await tableHasColumn(
    db,
    'qualificacoes_tipos',
    'carga_horaria_inicial',
  );
  const tiposHasCargaRecorrente = await tableHasColumn(
    db,
    'qualificacoes_tipos',
    'carga_horaria_recorrente',
  );

  const qualificacao = (await db
    .prepare(
      `SELECT
        qh.*,
        f.nome AS funcionario_nome,
        f.cpf AS funcionario_cpf,
        f.codigo_anac AS funcionario_codigo_anac,
        f.matricula AS funcionario_matricula,
        f.funcao AS funcionario_funcao,
        f.empresa_id AS func_empresa_id,
        qt.nome AS qualificacao_nome,
        qt.codigo AS qualificacao_codigo,
        qt.categoria AS qualificacao_categoria,
        qt.validade AS qualificacao_validade,
        ${historicoHasTipoTreinamento ? 'qh.tipo_treinamento' : 'NULL'} AS tipo_treinamento,
        qh.carga_horaria AS carga_horaria_historico,
        qt.carga_horaria AS carga_horaria_padrao,
        ${tiposHasCargaInicial ? 'qt.carga_horaria_inicial' : 'NULL'} AS carga_horaria_inicial,
        ${tiposHasCargaRecorrente ? 'qt.carga_horaria_recorrente' : 'NULL'} AS carga_horaria_recorrente,
        qt.conteudo_programatico AS conteudo_programatico,
        qt.descricao AS qualificacao_descricao,
        COALESCE(qt.vencimento_fim_mes, 0) AS vencimento_fim_mes,
        qc.nome AS categoria_qualificacao_canonica
      FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
      LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL AND qt.empresa_id = ?
      LEFT JOIN qualificacoes_categorias qc
        ON qc.id = qt.categoria_id AND qc.deleted_at IS NULL AND qc.ativo = 1 AND qc.empresa_id = ?
      WHERE qh.id = ? AND qh.deleted_at IS NULL AND qh.empresa_id = ? AND f.id IS NOT NULL`,
    )
    .bind(empresaId, empresaId, empresaId, historicoId, empresaId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .first()) as any;

  if (!qualificacao) {
    throw new CertificateGenerationError(
      'CERTIFICATE_HISTORY_NOT_FOUND',
      'Qualificação não encontrada para esta empresa.',
    );
  }

  const expectedCertificadoArquivoId =
    expectedCertificadoArquivoIdOption === undefined
      ? (qualificacao.certificado_arquivo_id ?? null)
      : expectedCertificadoArquivoIdOption;

  const participanteCertificado = paraInstrutor
    ? await resolveInstrutorCertificadoData(db, {
        empresaId,
        nomeInstrutor: nomeInstrutorInformado || qualificacao.instrutor,
        fallbackFuncao: 'Instrutor',
      })
    : {
        nome: String(qualificacao.funcionario_nome || '').trim(),
        cpf: String(qualificacao.funcionario_cpf || qualificacao.cpf || '').trim(),
        codigoAnac: String(qualificacao.funcionario_codigo_anac || '').trim(),
        matricula: String(qualificacao.funcionario_matricula || '').trim(),
        funcao: String(qualificacao.funcionario_funcao || '').trim(),
      };

  if (paraInstrutor && !participanteCertificado?.nome) {
    throw new Error('Nome do instrutor não informado para geração do certificado do instrutor.');
  }

  const uuid = crypto.randomUUID().substring(0, 8);
  const dataBase = new Date(qualificacao.data_conclusao || Date.now());

  const nomeArquivo = gerarNomeArquivoPadronizado({
    tipo: 'CERTIFICADO_QUALIFICACAO',
    nomeFuncionario: participanteCertificado?.nome || qualificacao.funcionario_nome || 'SEM_NOME',
    cpf:
      (
        participanteCertificado?.cpf ||
        qualificacao.funcionario_cpf ||
        qualificacao.cpf ||
        ''
      ).replace(/\D/g, '') || 'SEM_CPF',
    codigo: `${qualificacao.qualificacao_codigo || qualificacao.codigo || 'SEM_CODIGO'}${paraInstrutor ? '-INSTRUTOR' : ''}`,
    data: dataBase,
    uuid,
  });

  const dataConclusaoCertificado = String(
    qualificacao.data_conclusao || new Date().toISOString().split('T')[0],
  ).split('T')[0];
  const validadeMeses = Number(
    qualificacao.validade_meses || qualificacao.qualificacao_validade || 0,
  );
  const tipoTreinamentoCertificado =
    normalizeTipoTreinamento(qualificacao.tipo_treinamento) ||
    (validadeMeses === 6 ? 'SEMESTRAL' : 'RECORRENTE');
  const vencimentoFimMes = Number(qualificacao.vencimento_fim_mes || 0) === 1 ? 1 : 0;
  const dataVencimentoPersistido = String(qualificacao.data_vencimento || '')
    .trim()
    .split('T')[0];
  const dataVencimentoCertificado =
    dataVencimentoPersistido ||
    (dataConclusaoCertificado && validadeMeses > 0
      ? calcularDataVencimento(dataConclusaoCertificado, validadeMeses, vencimentoFimMes)
      : '');
  const cargaHorariaCertificado = resolveCargaHorariaCertificado({
    tipoTreinamento: tipoTreinamentoCertificado,
    cargaHistorico: qualificacao.carga_horaria_historico,
    cargaInicial: qualificacao.carga_horaria_inicial,
    cargaRecorrente: qualificacao.carga_horaria_recorrente,
    cargaPadrao: qualificacao.carga_horaria_padrao,
  });

  const qualificacaoEmpresaId = qualificacao.func_empresa_id || qualificacao.empresa_id;
  if (!qualificacaoEmpresaId) {
    throw new Error(`Não foi possível resolver a empresa do historico ${historicoId}.`);
  }

  const conteudoProgramaticoCertificado = await resolveConteudoProgramaticoCertificado(db, {
    conteudoProgramatico: qualificacao.conteudo_programatico,
    qualificacaoCodigo: qualificacao.qualificacao_codigo || qualificacao.codigo,
    empresaId: qualificacaoEmpresaId,
  });
  const instrutorQualificacao = String(qualificacao.instrutor || '').trim();
  const deveMostrarInstrutor = Boolean(instrutorQualificacao);
  const instrutorCertificado = deveMostrarInstrutor
    ? await resolveInstrutorCertificadoData(db, {
        empresaId: qualificacaoEmpresaId,
        nomeInstrutor: instrutorQualificacao,
        fallbackFuncao: 'Instrutor',
      })
    : null;
  const instrutorNomeCertificado =
    instrutorCertificado?.nome || (deveMostrarInstrutor ? instrutorQualificacao : '');

  const certificadoData: CertificadoData = {
    funcionario_nome:
      participanteCertificado?.nome || qualificacao.funcionario_nome || 'NÃO INFORMADO',
    funcionario_cpf:
      participanteCertificado?.cpf || qualificacao.funcionario_cpf || qualificacao.cpf || '',
    funcionario_codigo_anac:
      participanteCertificado?.codigoAnac || qualificacao.funcionario_codigo_anac || '',
    funcionario_matricula:
      participanteCertificado?.matricula || qualificacao.funcionario_matricula || '',
    qualificacao_nome: qualificacao.qualificacao_nome || qualificacao.tipo_codigo || '',
    qualificacao_codigo: qualificacao.qualificacao_codigo || qualificacao.codigo || '',
    qualificacao_categoria: qualificacao.qualificacao_categoria || qualificacao.categoria || '',
    categoria_qualificacao_canonica: qualificacao.categoria_qualificacao_canonica || undefined,
    data_conclusao: dataConclusaoCertificado,
    data_vencimento: dataVencimentoCertificado,
    numero_certificado: nomeArquivo.replace('.pdf', ''),
    carga_horaria: cargaHorariaCertificado,
    instrutor: (participanteCertificado?.nome || qualificacao.instrutor || undefined) ?? undefined,
    local: qualificacao.local || undefined,
    nota: qualificacao.nota || undefined,
    funcao: participanteCertificado?.funcao || qualificacao.funcionario_funcao || undefined,
    conteudo: buildConteudoProgramaticoCertificadoHtml(conteudoProgramaticoCertificado),
  };

  // ── Buscar logo + template ──────────────────────────────────────────────────
  let nomeEmpresa: string | null = null;
  let templateHtml: string | null = null;

  const dadosEmpresa = await db
    .prepare(
      `SELECT
        e.nome as empresa_nome,
        e.logo_url as logo_principal,
        ec.certificado_logo_url,
        ec.certificado_template_html
      FROM empresas e
      LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
      WHERE e.id = ?`,
    )
    .bind(qualificacaoEmpresaId)
    .first<{
      empresa_nome: string;
      logo_principal: string;
      certificado_logo_url: string;
      certificado_template_html: string | null;
    }>();

  nomeEmpresa = dadosEmpresa?.empresa_nome || null;

  // Template: empresas_config first, then certificados_templates
  const rawTemplate = dadosEmpresa?.certificado_template_html || null;
  if (rawTemplate) {
    templateHtml = isTemplateJson(rawTemplate)
      ? convertTemplateJsonToHtml(rawTemplate)
      : rawTemplate;
  } else {
    const fallbackRow = await db
      .prepare(
        `SELECT template_json FROM certificados_templates
          WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
          ORDER BY padrao DESC, updated_at DESC LIMIT 1`,
      )
      .bind(qualificacaoEmpresaId)
      .first<{ template_json: string }>();
    if (fallbackRow?.template_json) {
      templateHtml = isTemplateJson(fallbackRow.template_json)
        ? convertTemplateJsonToHtml(fallbackRow.template_json)
        : fallbackRow.template_json;
    }
  }

  if (!templateHtml?.trim()) {
    throw new CertificateGenerationError(
      'CERTIFICATE_TEMPLATE_NOT_CONFIGURED',
      'Nenhum template de certificado ativo está configurado para esta empresa.',
    );
  }

  if (!env.CF_ACCOUNT_ID || !env.CF_BROWSER_API_TOKEN) {
    throw new CertificateGenerationError(
      'CERTIFICATE_BROWSER_RENDERING_NOT_CONFIGURED',
      'A geração de PDF (Cloudflare Browser Rendering) não está configurada para este ambiente.',
    );
  }

  templateHtml = adaptTemplateHtmlForSinglePageA4(templateHtml);
  if (paraInstrutor) {
    templateHtml = adaptTemplateHtmlForInstrutor(templateHtml);
  }

  // ── Resolver logo como data URL ─────────────────────────────────────────────
  const logoSource = dadosEmpresa?.logo_principal || dadosEmpresa?.certificado_logo_url || '';
  const logoUrlForTemplate = await resolveImageDataUrl(bucket, logoSource);

  // ── Instrutor section ───────────────────────────────────────────────────────
  const instrutorSection = deveMostrarInstrutor
    ? buildInstrutorSection({
        nome: instrutorNomeCertificado,
        codigoAnac: instrutorCertificado?.codigoAnac,
        matricula: instrutorCertificado?.matricula,
      })
    : '';
  const templateForRendering = deveMostrarInstrutor
    ? ensureInstrutorSectionInTemplate(templateHtml)
    : templateHtml;

  // ── Template data + QR ──────────────────────────────────────────────────────
  const templateData = {
    funcionario_nome: certificadoData.funcionario_nome,
    funcionario_cpf: certificadoData.funcionario_cpf,
    funcionario_codigo_anac: certificadoData.funcionario_codigo_anac,
    funcionario_matricula: certificadoData.funcionario_matricula,
    qualificacao_nome: certificadoData.qualificacao_nome,
    qualificacao_codigo: certificadoData.qualificacao_codigo,
    // {{categoria}} mostra exclusivamente a categoria canônica
    // (qualificacoes_categorias.nome) — nunca o texto legado qt.categoria.
    qualificacao_categoria: certificadoData.categoria_qualificacao_canonica || '',
    qual_meta_line: buildQualMetaLineHtml({
      cargaHoraria: certificadoData.carga_horaria,
      categoriaCanonica: certificadoData.categoria_qualificacao_canonica,
      codigoQualificacao: certificadoData.qualificacao_codigo,
    }),
    data_conclusao: certificadoData.data_conclusao,
    data_vencimento: certificadoData.data_vencimento,
    carga_horaria: certificadoData.carga_horaria,
    conteudo: certificadoData.conteudo || '',
    nome_empresa: nomeEmpresa || 'AirTrust',
    numero_certificado: certificadoData.numero_certificado,
    logo_url: logoUrlForTemplate,
    descricao_section: buildDescricaoSectionHtml(qualificacao.qualificacao_descricao),
    instrutor_nome: instrutorNomeCertificado,
    instrutor_codigo_anac: deveMostrarInstrutor ? instrutorCertificado?.codigoAnac || '' : '',
    instrutor_matricula: deveMostrarInstrutor ? instrutorCertificado?.matricula || '' : '',
    instrutor_section: instrutorSection,
  };

  const processedHtml = await processTemplateWithQR(templateForRendering, templateData, {
    validationApiBaseUrl: env.API_URL,
    validationPageBaseUrl: env.FRONTEND_URL,
  });

  const result = await htmlToPdf({
    html: processedHtml,
    accountId: env.CF_ACCOUNT_ID,
    apiToken: env.CF_BROWSER_API_TOKEN,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  });

  if (!result.success || !result.pdfBytes) {
    throw new CertificateGenerationError(
      'CERTIFICATE_BROWSER_RENDERING_FAILED',
      'Falha ao renderizar o PDF do certificado.',
    );
  }

  const pdfBytes = result.pdfBytes;

  // Validar magic bytes
  const magicStr = String.fromCharCode(...Array.from(new Uint8Array(pdfBytes.slice(0, 4))));
  if (!magicStr.startsWith('%PDF')) {
    throw new CertificateGenerationError(
      'CERTIFICATE_BROWSER_RENDERING_FAILED',
      'O PDF gerado é inválido (magic bytes incorretos).',
    );
  }

  // ── Resolver funcionario de destino antes do upload (necessário para a R2 key) ──
  let targetFuncionarioId: number = qualificacao.funcionario_id;
  if (paraInstrutor) {
    try {
      const instrutorFuncionario = await resolveFuncionarioInstrutorNaEmpresa(db, {
        empresaId: qualificacaoEmpresaId,
        nomeInstrutor:
          participanteCertificado?.nome || nomeInstrutorInformado || qualificacao.instrutor || '',
        cpfInstrutor: participanteCertificado?.cpf || cpfInstrutorInformado,
        matriculaInstrutor: participanteCertificado?.matricula || matriculaInstrutorInformada,
      });
      if (instrutorFuncionario?.id) {
        targetFuncionarioId = instrutorFuncionario.id;
      }
    } catch (e) {
      console.warn('[generate-certificate] Falha ao resolver funcionario do instrutor:', e);
    }
  }

  // ── Upload R2 ────────────────────────────────────────────────────────────────
  // Key é tenant-scoped e não contém PII (sem CPF/nome no path).
  // Ordem exigida: PDF gerado -> R2 -> D1 (em lote, quando possível). Se o D1
  // falhar após o R2 já ter sido escrito, o objeto recém-criado é removido do
  // R2 antes de propagar o erro — nunca deixamos um PDF orfão em storage sem
  // registro correspondente em documentos/qualificacoes_historico.
  const r2Key = buildCertificadoR2Key(
    qualificacaoEmpresaId,
    targetFuncionarioId,
    historicoId,
    uuid,
  );

  try {
    await bucket.put(r2Key, pdfBytes, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: {
        tipo: 'CERTIFICADO_QUALIFICACAO',
        codigo: qualificacao.qualificacao_codigo || qualificacao.codigo,
        historico_id: String(historicoId),
        data_referencia: dataBase.toISOString(),
        origem: 'auto-gerado',
        gerado_em: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error('[generate-certificate] Falha ao gravar PDF no R2:', e);
    throw new CertificateGenerationError(
      'CERTIFICATE_STORAGE_FAILED',
      'Falha ao salvar o certificado no armazenamento.',
    );
  }

  // ── Persistir no D1 (atômico via db.batch) ──────────────────────────────────
  // documentos + pasta_virtual + qualificacoes_historico precisam commitar
  // juntos ou nenhum deles — usamos db.batch([...]), o mesmo padrão
  // transacional já usado em outros fluxos deste worker (ex.:
  // controle-voos-rdv-workflow.ts, sigvoos-frms.ts) para writes que devem
  // ser tudo-ou-nada. A ligação com `documentos` (cujo id só existe DEPOIS
  // do INSERT) é feita via subquery correlacionada por `r2_key`, que é
  // único por definição (contém o uuid gerado acima) — isso evita depender
  // de um valor de auto-incremento que ainda não existe no momento em que
  // as statements são preparadas.
  const storageColumns = await getCertificadosStorageColumns(db);
  await backfillCertificadoAtualNaPastaVirtual(db, storageColumns, {
    historicoId,
    funcionarioId: qualificacao.funcionario_id,
    certificadoArquivoId: qualificacao.certificado_arquivo_id ?? null,
    empresaId: qualificacaoEmpresaId,
  });

  const numeroCertificado = nomeArquivo.replace('.pdf', '');

  const insertDocumentoStmt = db
    .prepare(
      storageColumns.documentosHasEmpresaId
        ? `INSERT INTO documentos (
             uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key,
             descricao, empresa_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        : `INSERT INTO documentos (
             uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key,
             descricao, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      ...(storageColumns.documentosHasEmpresaId
        ? [
            uuid,
            targetFuncionarioId,
            nomeArquivo,
            'application/pdf',
            pdfBytes.length,
            r2Key,
            `Certificado automático gerado em ${new Date().toLocaleDateString('pt-BR')}`,
            qualificacaoEmpresaId,
          ]
        : [
            uuid,
            targetFuncionarioId,
            nomeArquivo,
            'application/pdf',
            pdfBytes.length,
            r2Key,
            `Certificado automático gerado em ${new Date().toLocaleDateString('pt-BR')}`,
          ]),
    );

  const pastaVirtualColumns = ['funcionario_id'];
  const pastaVirtualValues = ['?'];
  const pastaVirtualBindings: Array<string | number | null> = [targetFuncionarioId];

  if (storageColumns.pastaVirtualHasDocumentoId) {
    pastaVirtualColumns.push('documento_id');
    pastaVirtualValues.push('(SELECT id FROM documentos WHERE r2_key = ?)');
    pastaVirtualBindings.push(r2Key);
  }
  if (storageColumns.pastaVirtualHasCertificacaoId) {
    pastaVirtualColumns.push('certificacao_id');
    pastaVirtualValues.push('?');
    pastaVirtualBindings.push(historicoId);
  }
  if (storageColumns.pastaVirtualHasEmpresaId) {
    pastaVirtualColumns.push('empresa_id');
    pastaVirtualValues.push('?');
    pastaVirtualBindings.push(qualificacaoEmpresaId);
  }
  pastaVirtualColumns.push(
    'tipo_documento',
    'categoria',
    'caminho_arquivo',
    'nome_arquivo',
    'dataupload',
    'descricao',
    'created_at',
  );
  pastaVirtualValues.push('?', '?', '?', '?', "datetime('now')", '?', "datetime('now')");
  pastaVirtualBindings.push(
    'CERTIFICADO',
    'Certificados de Qualificação',
    r2Key,
    nomeArquivo,
    `Certificado ${qualificacao.qualificacao_codigo || qualificacao.codigo} - ${
      participanteCertificado?.nome || qualificacao.funcionario_nome
    }`,
  );

  const insertPastaVirtualStmt = db
    .prepare(
      `INSERT INTO pasta_virtual (${pastaVirtualColumns.join(', ')}) VALUES (${pastaVirtualValues.join(', ')})`,
    )
    .bind(...pastaVirtualBindings);

  const updateHistoricoStmt = db
    .prepare(
      `UPDATE qualificacoes_historico
          SET certificado_arquivo_id = (SELECT id FROM documentos WHERE r2_key = ?),
              arquivo_url = '/api/pasta-virtual/stream/' || (SELECT id FROM documentos WHERE r2_key = ?),
              numero_certificado = ?,
              updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?
          AND (
            (? IS NULL AND certificado_arquivo_id IS NULL)
            OR certificado_arquivo_id = ?
          )`,
    )
    .bind(
      r2Key,
      r2Key,
      numeroCertificado,
      historicoId,
      qualificacaoEmpresaId,
      expectedCertificadoArquivoId,
      expectedCertificadoArquivoId,
    );

  let batchResults: Awaited<ReturnType<typeof db.batch>>;
  try {
    batchResults = await db.batch([
      insertDocumentoStmt,
      insertPastaVirtualStmt,
      updateHistoricoStmt,
    ]);
  } catch (e) {
    console.error(
      '[generate-certificate] Falha no batch D1 (documento+pasta_virtual+historico), revertendo R2:',
      e,
    );
    try {
      await bucket.delete(r2Key);
    } catch (cleanupErr) {
      console.error(
        '[generate-certificate] Falha ao remover objeto R2 após erro de persistência:',
        cleanupErr,
      );
    }
    throw new CertificateGenerationError(
      'CERTIFICATE_PERSISTENCE_FAILED',
      'Falha ao registrar o certificado gerado.',
    );
  }

  const [documentoResult, pastaVirtualResult, historicoUpdateResult] = batchResults;
  const documentoId = Number(documentoResult.meta.last_row_id || 0);

  // D1's batch() commits the whole set atomically ONLY when a statement
  // throws — a syntactically valid UPDATE/INSERT that simply matches zero
  // rows still "succeeds" and is still committed. Treat that as a failure
  // just the same, and explicitly remove everything we just wrote (D1 rows
  // keyed by the unique r2Key, plus the R2 object) so no residue survives
  // pointing at a certificate that was never fully linked.
  const documentoPersistido = documentoId > 0;
  const pastaVirtualPersistida = Number(pastaVirtualResult.meta.changes || 0) === 1;
  const historicoVinculado = Number(historicoUpdateResult.meta.changes || 0) === 1;
  const persistedSuccessfully = documentoPersistido && pastaVirtualPersistida && historicoVinculado;
  const lostConcurrentGenerationRace =
    documentoPersistido && pastaVirtualPersistida && !historicoVinculado;

  if (!persistedSuccessfully) {
    console.error(
      '[generate-certificate] Persistência incompleta após batch — revertendo resíduo D1 + R2:',
      {
        documentoId,
        pastaVirtualChanges: pastaVirtualResult.meta.changes,
        historicoChanges: historicoUpdateResult.meta.changes,
      },
    );
    try {
      await db.batch([
        db.prepare('DELETE FROM pasta_virtual WHERE caminho_arquivo = ?').bind(r2Key),
        db.prepare('DELETE FROM documentos WHERE r2_key = ?').bind(r2Key),
      ]);
    } catch (cleanupErr) {
      console.error('[generate-certificate] Falha ao reverter resíduo D1:', cleanupErr);
    }
    try {
      await bucket.delete(r2Key);
    } catch (cleanupErr) {
      console.error(
        '[generate-certificate] Falha ao remover objeto R2 após erro de persistência:',
        cleanupErr,
      );
    }
    throw new CertificateGenerationError(
      lostConcurrentGenerationRace
        ? 'CERTIFICATE_CONCURRENT_GENERATION'
        : 'CERTIFICATE_PERSISTENCE_FAILED',
      lostConcurrentGenerationRace
        ? 'Outro processo concluiu a geração deste certificado antes desta solicitação.'
        : 'Falha ao registrar o certificado gerado.',
    );
  }

  try {
    await registrarAuditoria({
      db,
      tabela: 'documentos',
      acao: 'INSERT',
      registro_id: documentoId,
      dados_novos: {
        historico_id: historicoId,
        r2_key: r2Key,
        nome_arquivo: nomeArquivo,
        empresa_id: qualificacaoEmpresaId,
      },
      usuario_id: actorUserId?.toString(),
    });
  } catch (auditErr) {
    console.error('[generate-certificate] Falha ao registrar auditoria:', auditErr);
  }

  console.log(
    `✅ [generate-certificate] Certificado gerado: historicoId=${historicoId} documentoId=${documentoId}`,
  );

  return { documentoId, uuid, r2Key, tamanho: pdfBytes.length, numeroCertificado };
}
