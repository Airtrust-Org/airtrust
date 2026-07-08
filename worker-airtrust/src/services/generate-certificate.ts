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
  getCertificadosStorageColumns,
  insertCertificadoNaPastaVirtual,
  backfillCertificadoAtualNaPastaVirtual,
  resolveImageDataUrl,
  resolveConteudoProgramaticoCertificado,
  resolveInstrutorCertificadoData,
  resolveFuncionarioInstrutorNaEmpresa,
} from '../routes/qualificacoes-certificados-helpers';

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
    return result.replace('</div>\n\n  <!-- QUALIFICAÇÃO -->', '</div>\n\n  {{instrutor_section}}\n\n  <!-- QUALIFICAÇÃO -->');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        COALESCE(qt.vencimento_fim_mes, 0) AS vencimento_fim_mes
      FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
      LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
      WHERE qh.id = ? AND qh.deleted_at IS NULL AND f.empresa_id = ?`,
    )
    .bind(historicoId, empresaId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .first()) as any;

  if (!qualificacao) {
    throw new Error(`Qualificação não encontrada: historicoId=${historicoId} empresaId=${empresaId}`);
  }

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
    nomeFuncionario:
      participanteCertificado?.nome || qualificacao.funcionario_nome || 'SEM_NOME',
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
  const dataVencimentoPersistido = String(qualificacao.data_vencimento || '').trim().split('T')[0];
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
    data_conclusao: dataConclusaoCertificado,
    data_vencimento: dataVencimentoCertificado,
    numero_certificado: nomeArquivo.replace('.pdf', ''),
    carga_horaria: cargaHorariaCertificado,
    instrutor:
      (participanteCertificado?.nome || qualificacao.instrutor || undefined) ?? undefined,
    local: qualificacao.local || undefined,
    nota: qualificacao.nota || undefined,
    funcao: participanteCertificado?.funcao || qualificacao.funcionario_funcao || undefined,
    conteudo: buildConteudoProgramaticoCertificadoHtml(conteudoProgramaticoCertificado),
  };

  const cpfLimpo = (certificadoData.funcionario_cpf || '').replace(/\D/g, '');

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
    templateHtml = isTemplateJson(rawTemplate) ? convertTemplateJsonToHtml(rawTemplate) : rawTemplate;
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
    throw new Error(
      `Nenhum template ativo encontrado para a empresa ${qualificacaoEmpresaId}. Geração interrompida.`,
    );
  }

  if (!env.CF_ACCOUNT_ID || !env.CF_BROWSER_API_TOKEN) {
    throw new Error(
      'Cloudflare Browser Rendering não está configurado. Geração interrompida.',
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
    qualificacao_categoria: certificadoData.qualificacao_categoria,
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
    throw new Error(`Browser Rendering falhou: ${result.error}`);
  }

  const pdfBytes = result.pdfBytes;

  // Validar magic bytes
  const magicStr = String.fromCharCode(...Array.from(new Uint8Array(pdfBytes.slice(0, 4))));
  if (!magicStr.startsWith('%PDF')) {
    throw new Error('PDF gerado com magic bytes inválidos.');
  }

  // ── Resolver funcionario de destino antes do upload (necessário para a R2 key) ──
  let targetFuncionarioId: number = qualificacao.funcionario_id;
  if (paraInstrutor) {
    try {
      const instrutorFuncionario = await resolveFuncionarioInstrutorNaEmpresa(db, {
        empresaId: qualificacaoEmpresaId,
        nomeInstrutor:
          participanteCertificado?.nome ||
          nomeInstrutorInformado ||
          qualificacao.instrutor ||
          '',
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
  const r2Key = buildCertificadoR2Key(qualificacaoEmpresaId, targetFuncionarioId, historicoId, uuid);
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

  // ── Persistir no D1 ──────────────────────────────────────────────────────────
  const storageColumns = await getCertificadosStorageColumns(db);
  await backfillCertificadoAtualNaPastaVirtual(db, storageColumns, {
    historicoId,
    funcionarioId: qualificacao.funcionario_id,
    certificadoArquivoId: qualificacao.certificado_arquivo_id ?? null,
    empresaId: qualificacaoEmpresaId,
  });

  const insertResult = await db
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
    )
    .run();

  const documentoId = Number(insertResult.meta.last_row_id || 0);
  if (!documentoId) {
    throw new Error('Falha ao inserir documento no D1: last_row_id inválido.');
  }

  try {
    await insertCertificadoNaPastaVirtual(db, storageColumns, {
      funcionarioId: targetFuncionarioId,
      documentoId,
      historicoId,
      empresaId: qualificacaoEmpresaId,
      r2Key,
      nomeArquivo,
      descricao: `Certificado ${qualificacao.qualificacao_codigo || qualificacao.codigo} - ${
        participanteCertificado?.nome || qualificacao.funcionario_nome
      }`,
    });
  } catch (e) {
    console.error('[generate-certificate] Erro ao inserir na pasta_virtual:', e);
    // Não falhar o processo todo por isso
  }

  const numeroCertificado = nomeArquivo.replace('.pdf', '');
  await db
    .prepare(
      `UPDATE qualificacoes_historico
         SET certificado_arquivo_id = ?,
             arquivo_url = ?,
             numero_certificado = ?,
             updated_at = datetime('now')
         WHERE id = ?
           AND empresa_id = ?`,
    )
    .bind(documentoId, `/api/pasta-virtual/stream/${documentoId}`, numeroCertificado, historicoId, qualificacaoEmpresaId)
    .run();

  try {
    await registrarAuditoria({
      db,
      tabela: 'documentos',
      acao: 'INSERT',
      registro_id: documentoId,
      dados_novos: { historico_id: historicoId, r2_key: r2Key, nome_arquivo: nomeArquivo, empresa_id: qualificacaoEmpresaId },
      usuario_id: actorUserId?.toString(),
    });
  } catch (auditErr) {
    console.error('[generate-certificate] Falha ao registrar auditoria:', auditErr);
  }

  console.log(`✅ [generate-certificate] Certificado gerado: historicoId=${historicoId} documentoId=${documentoId}`);

  return { documentoId, uuid, r2Key, tamanho: pdfBytes.length, numeroCertificado };
}
