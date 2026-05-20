/**
 * QUALIFICACOES CERTIFICADOS — Write Routes
 * POST /historico/:id/certificados/gerar
 * POST /historico/:id/certificados/upload
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { gerarNomeArquivoPadronizado } from '../utils/nomenclatura-padronizada';
import { type CertificadoData } from '../services/pdf-generator';
import { htmlToPdf, processTemplateWithQR } from '../services/html-to-pdf';
import { convertTemplateJsonToHtml, isTemplateJson } from '../utils/template-json-to-html';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';
import {
  adaptTemplateHtmlForInstrutor,
  adaptTemplateHtmlForSinglePageA4,
  tableHasColumn,
  normalizeTipoTreinamento,
  resolveCargaHorariaCertificado,
  buildConteudoProgramaticoCertificadoHtml,
  buildDescricaoSectionHtml,
  getCertificadosStorageColumns,
  insertCertificadoNaPastaVirtual,
  backfillCertificadoAtualNaPastaVirtual,
  resolveImageDataUrl,
  resolveCertificadoContext,
  resolveConteudoProgramaticoCertificado,
  resolveInstrutorCertificadoData,
  resolveFuncionarioInstrutorNaEmpresa,
} from './qualificacoes-certificados-helpers';

const app = new Hono<{ Bindings: Env }>();

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
  const hasInstrutorPlaceholder = templateHtml.includes('{{instrutor_section}}');

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

  if (hasInstrutorPlaceholder) {
    return result;
  }

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

app.post(
  '/historico/:id/certificados/gerar',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const bucket = c.env.BUCKET;
    const id = parseInt(c.req.param('id'));
    const empresaId = getEmpresaId(c);

    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    // Ler body opcional para flags como para_instrutor
    const body = await c.req.json().catch(() => ({}));
    const paraInstrutor = Boolean(body?.para_instrutor);
    const nomeInstrutorInformado = String(body?.nome_instrutor || '').trim();
    const cpfInstrutorInformado = String(body?.cpf_instrutor || '').trim();
    const matriculaInstrutorInformada = String(body?.matricula_instrutor || '').trim();

    try {
      console.log(`📄 [GERAR PDF] ========== INICIANDO GERAÇÃO ==========`);
      console.log(`📄 [GERAR PDF] ID recebido:`, id);
      console.log(`📄 [GERAR PDF] Tipo do ID:`, typeof id);
      console.log(`📄 [GERAR PDF] isNaN(id):`, isNaN(id));

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

      // Buscar dados COMPLETOS para o certificado
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
        .bind(id, empresaId)
        .first()) as any;

      console.log(`📄 [GERAR PDF] Resultado da query:`, {
        encontrada: !!qualificacao,
        id: qualificacao?.id,
        empresa_id: qualificacao?.empresa_id,
        funcionario_nome: qualificacao?.funcionario_nome,
      });

      if (!qualificacao) {
        console.error(`❌ [GERAR PDF] Qualificação NÃO encontrada para ID=${id}`);
        return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
      }

      // DEBUG: Log todas as colunas retornadas
      console.log(
        `📄 [DEBUG] TODAS as colunas do qualificacao object:`,
        JSON.stringify(qualificacao, null, 2),
      );

      console.log(`📄 [GERAR PDF] Qualificação encontrada:`, {
        id: qualificacao.id,
        empresa_id: qualificacao.empresa_id,
        funcionario_id: qualificacao.funcionario_id,
        funcionario_nome: qualificacao.funcionario_nome,
        qualificacao_nome: qualificacao.qualificacao_nome,
        qualificacao_codigo: qualificacao.qualificacao_codigo,
      });

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
        throw new Error(
          'Nome do instrutor não informado para geração do certificado do instrutor.',
        );
      }

      // Gerar nome do arquivo primeiro (antes de criar certificadoData)
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

      // Use func_empresa_id (from funcionarios join) as the authoritative empresa; fall back to qh.empresa_id
      const qualificacaoEmpresaId = qualificacao.func_empresa_id || qualificacao.empresa_id;

      if (!qualificacaoEmpresaId) {
        throw new Error(
          `Nao foi possivel resolver a empresa do historico ${id} para gerar o certificado.`,
        );
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

      // Preparar dados para o PDF
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
        numero_certificado: nomeArquivo.replace('.pdf', ''), // Usar nome do arquivo como ID
        carga_horaria: cargaHorariaCertificado,
        instrutor:
          (participanteCertificado?.nome || qualificacao.instrutor || undefined) ?? undefined,
        local: qualificacao.local || undefined,
        nota: qualificacao.nota || undefined,
        funcao: participanteCertificado?.funcao || qualificacao.funcionario_funcao || undefined,
        conteudo: buildConteudoProgramaticoCertificadoHtml(conteudoProgramaticoCertificado),
      };

      // 🔥 LOG CRÍTICO: Verificar o certificadoData que será usado
      console.log(`📄 [GERAR PDF] ✅ certificadoData construído:`, {
        funcionario_nome: certificadoData.funcionario_nome,
        qualificacao_nome: certificadoData.qualificacao_nome,
        qualificacao_codigo: certificadoData.qualificacao_codigo,
        funcionario_codigo_anac: certificadoData.funcionario_codigo_anac,
        tipo_treinamento: tipoTreinamentoCertificado,
        carga_horaria: certificadoData.carga_horaria || null,
        data_vencimento: certificadoData.data_vencimento || null,
        conteudo_len: conteudoProgramaticoCertificado?.length || 0,
      });

      // Limpar CPF para uso em nomenclatura e metadata
      const cpfLimpo = (certificadoData.funcionario_cpf || '').replace(/\D/g, '');

      // 1. Buscar Configuração da Empresa (Logo + Template)
      let logoBytes: Uint8Array | undefined;
      let templateHtml: string | null = null;
      let nomeEmpresa: string | null = null;

      console.log(`📄 [GERAR PDF] ========== INICIANDO GERAÇÃO ==========`);
      console.log(`📄 [GERAR PDF] empresaId=${qualificacaoEmpresaId}, historicoId=${id}`);
      console.log(`📄 [GERAR PDF] Qualificação data:`, {
        id: qualificacao.id,
        empresa_id: qualificacao.empresa_id,
        funcionario_id: qualificacao.funcionario_id,
      });

      if (qualificacaoEmpresaId) {
        try {
          // Buscar config e dados da empresa
          const dadosEmpresa = await db
            .prepare(
              `
              SELECT
                e.nome as empresa_nome,
                e.logo_url as logo_principal,
                ec.certificado_logo_url
              FROM empresas e
              LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
              WHERE e.id = ?
            `,
            )
            .bind(qualificacaoEmpresaId)
            .first<{
              empresa_nome: string;
              logo_principal: string;
              certificado_logo_url: string;
            }>();

          nomeEmpresa = dadosEmpresa?.empresa_nome || null;

          console.log(`📄 [GERAR PDF] dadosEmpresa:`, {
            nome: nomeEmpresa,
            has_logo: !!(dadosEmpresa?.certificado_logo_url || dadosEmpresa?.logo_principal),
          });

          // Prioridade: 1. Logo principal da empresa (fonte oficial atual),
          // 2. certificado_logo_url legado apenas como fallback.
          const logoUrl = dadosEmpresa?.logo_principal || dadosEmpresa?.certificado_logo_url;

          if (logoUrl) {
            // Se for asset interno (/api/assets/...)
            if (logoUrl.startsWith('/api/assets/')) {
              const key = logoUrl.replace('/api/assets/', '');
              const obj = await bucket.get(key);
              if (obj) {
                logoBytes = new Uint8Array(await obj.arrayBuffer());
              }
            } else {
              // URL externa
              const res = await fetch(logoUrl);
              if (res.ok) {
                logoBytes = new Uint8Array(await res.arrayBuffer());
              }
            }
          }

          // Priorizar o HTML salvo em empresas_config para evitar inconsistencias antigas de certificados_templates.
          console.log(`📄 [GERAR PDF] Buscando template em empresas_config...`);

          let templateRow = await db
            .prepare(
              `
                SELECT
                  certificado_template_html as template_json,
                  'Config Padrão' as nome,
                  1 as padrao,
                  1 as ativo
                FROM empresas_config
                WHERE empresa_id = ? AND certificado_template_html IS NOT NULL AND certificado_template_html != ''
                LIMIT 1
              `,
            )
            .bind(qualificacaoEmpresaId)
            .first<{
              template_json: string;
              nome: string;
              padrao: number;
              ativo: number;
            }>();

          if (!templateRow) {
            console.log(
              `📄 [GERAR PDF] ⚠️ Template não encontrado em empresas_config, procurando em certificados_templates...`,
            );

            templateRow = await db
              .prepare(
                `
                SELECT
                  template_json,
                  nome,
                  padrao,
                  ativo
                FROM certificados_templates
                WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
                ORDER BY padrao DESC, updated_at DESC
                LIMIT 1
              `,
              )
              .bind(qualificacaoEmpresaId)
              .first<{
                template_json: string;
                nome: string;
                padrao: number;
                ativo: number;
              }>();
          }

          console.log(
            `📄 [GERAR PDF] Resultado da query:`,
            templateRow ? `✅ Encontrado: ${templateRow.nome}` : `❌ Nenhum template encontrado`,
          );

          if (templateRow) {
            console.log(
              `📄 [GERAR PDF] ✅ Template encontrado: "${templateRow.nome}" (padrão: ${templateRow.padrao}, ativo: ${templateRow.ativo})`,
            );
            console.log(
              `📄 [GERAR PDF] Template JSON length: ${
                templateRow.template_json?.length || 0
              } caracteres`,
            );

            // template_json pode ser JSON estruturado ou HTML string
            try {
              // Verificar se é um template JSON estruturado
              if (isTemplateJson(templateRow.template_json)) {
                console.log(
                  `📄 [GERAR PDF] ✅ Template é JSON estruturado, convertendo para HTML...`,
                );
                templateHtml = convertTemplateJsonToHtml(templateRow.template_json);
                console.log(
                  `📄 [GERAR PDF] ✅ HTML gerado: ${templateHtml?.length || 0} caracteres`,
                );
              } else {
                console.log(
                  `📄 [GERAR PDF] ⚠️ Template não é JSON estruturado, usando como HTML direto`,
                );
                // Se não for JSON estruturado, usar como HTML direto
                templateHtml = templateRow.template_json;
              }
            } catch (convertError) {
              console.error(`❌ [GERAR PDF] Erro ao converter template JSON:`, convertError);
              // Fallback: usar como HTML direto
              templateHtml = templateRow.template_json;
            }
            console.log(`📄 [GERAR PDF] Template final disponível: ${!!templateHtml}`);
          } else {
            console.log(
              `📄 [GERAR PDF] ⚠️ Nenhum template ativo encontrado em certificados_templates para empresa ${qualificacaoEmpresaId}`,
            );
          }
        } catch (e) {
          console.error('❌ [GERAR PDF] Erro ao buscar logo/template:', e);
        }
      }

      if (!templateHtml || !templateHtml.trim()) {
        throw new Error(
          `Nenhum template ativo encontrado para a empresa ${qualificacaoEmpresaId}. A geracao foi interrompida para evitar um PDF incorreto.`,
        );
      }

      templateHtml = adaptTemplateHtmlForSinglePageA4(templateHtml);

      // Ajustar template para certificado de instrutor
      if (paraInstrutor) {
        templateHtml = adaptTemplateHtmlForInstrutor(templateHtml);
        console.log(`📄 [GERAR PDF] ✅ Template adaptado para certificado de INSTRUTOR`);
      }

      if (!c.env.CF_ACCOUNT_ID || !c.env.CF_BROWSER_API_TOKEN) {
        throw new Error(
          'Cloudflare Browser Rendering nao esta configurado na producao. A geracao foi interrompida para evitar um certificado degradado.',
        );
      }

      // ✅ GERAR PDF - Certificados desta rota exigem template HTML + Browser Rendering
      let pdfBytes: Uint8Array;

      console.log(`📄 [GERAR PDF] Decisão de renderização:`, {
        has_template: !!templateHtml,
        template_length: templateHtml?.length || 0,
        has_cf_account: !!c.env.CF_ACCOUNT_ID,
        has_cf_token: !!c.env.CF_BROWSER_API_TOKEN,
        will_use_browser_rendering: !!(
          templateHtml &&
          c.env.CF_ACCOUNT_ID &&
          c.env.CF_BROWSER_API_TOKEN
        ),
      });

      if (templateHtml && c.env.CF_ACCOUNT_ID && c.env.CF_BROWSER_API_TOKEN) {
        console.log('📄 [GERAR PDF] ✅ Usando Cloudflare Browser Rendering com template HTML');

        try {
          // Preparar dados para substituição no template
          // Buscar logoUrl da empresa (já foi carregado anteriormente)
          let logoUrlForTemplate = '';
          if (qualificacaoEmpresaId) {
            const dadosEmpresa = await db
              .prepare(
                `SELECT
                  e.logo_url as logo_principal,
                  ec.certificado_logo_url
                FROM empresas e
                LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
                WHERE e.id = ?`,
              )
              .bind(qualificacaoEmpresaId)
              .first<{
                logo_principal: string;
                certificado_logo_url: string;
              }>();
            const logoSource =
              dadosEmpresa?.logo_principal || dadosEmpresa?.certificado_logo_url || '';
            logoUrlForTemplate = await resolveImageDataUrl(bucket, logoSource);

            console.log(`📄 [GERAR PDF] Logo resolvido para template:`, {
              original: logoSource,
              embedded: logoUrlForTemplate.startsWith('data:'),
              length: logoUrlForTemplate.length,
            });
          }

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

          console.log(`📄 [GERAR PDF] Dados para substituição:`, templateData);

          // ✅ Processar template substituindo variáveis E gerando QR code
          const processedHtml = await processTemplateWithQR(templateForRendering, templateData, {
            validationApiBaseUrl: c.env.API_URL,
            validationPageBaseUrl: c.env.FRONTEND_URL,
          });

          console.log(
            `📄 [GERAR PDF] HTML processado (primeiros 500 chars):`,
            processedHtml.substring(0, 500),
          );
          console.log(`📄 [GERAR PDF] HTML processado (total: ${processedHtml.length} chars)`);

          // Converter HTML para PDF usando Cloudflare Browser Rendering
          console.log('📄 [GERAR PDF] Chamando htmlToPdf...');
          const result = await htmlToPdf({
            html: processedHtml,
            accountId: c.env.CF_ACCOUNT_ID,
            apiToken: c.env.CF_BROWSER_API_TOKEN,
            format: 'A4',
            printBackground: true,
            margin: {
              top: '0mm',
              right: '0mm',
              bottom: '0mm',
              left: '0mm',
            },
          });

          console.log('📄 [GERAR PDF] Resultado do htmlToPdf:', {
            success: result.success,
            has_pdfBytes: !!result.pdfBytes,
            pdfBytesLength: result.pdfBytes?.length || 0,
            error: result.error || 'null',
          });

          if (result.success && result.pdfBytes) {
            pdfBytes = result.pdfBytes;
            console.log(
              `✅ [GERAR PDF] PDF gerado via Browser Rendering: ${pdfBytes.length} bytes`,
            );
          } else {
            console.error(`❌ [GERAR PDF] Falha CRÍTICA no Browser Rendering:`, {
              error: result.error,
              success: result.success,
              has_pdfBytes: !!result.pdfBytes,
            });
            // NÃO fazer fallback para pdf-lib porque pdf-lib não consegue renderizar HTML customizado
            throw new Error(
              `Browser Rendering falhou: ${result.error}. Sem fallback disponível para HTML customizado.`,
            );
          }
        } catch (browserRenderError: any) {
          console.error('❌ [GERAR PDF] Erro no Browser Rendering:', {
            message: browserRenderError?.message,
            stack: browserRenderError?.stack,
          });
          throw new Error(
            `Falha ao renderizar certificado HTML em produção: ${browserRenderError?.message || 'erro desconhecido'}`,
          );
        }
      } else {
        console.error(`❌ [GERAR PDF] Estado invalido antes da renderizacao HTML`, {
          has_account: !!c.env.CF_ACCOUNT_ID,
          has_token: !!c.env.CF_BROWSER_API_TOKEN,
          account_id_length: c.env.CF_ACCOUNT_ID?.length || 0,
          has_template: !!templateHtml,
          length: templateHtml?.length || 0,
        });
        throw new Error(
          'Falha de pre-condicao: Browser Rendering nao pode ser substituido por pdf-lib nesta rota.',
        );
      }

      console.log(`📄 [GERAR PDF] PDF gerado: ${pdfBytes.length} bytes`);
      console.log(`📄 [GERAR PDF] Tipo: ${pdfBytes.constructor.name}`);

      // Nome do arquivo já foi gerado anteriormente e está no certificadoData

      const r2Key = `certificados/${nomeArquivo}`;

      // Validar magic bytes antes de upload
      const magicBytes = new Uint8Array(pdfBytes.slice(0, 4));
      const magicStr = String.fromCharCode(...Array.from(magicBytes));
      console.log(`🔍 [GERAR PDF] Magic bytes: "${magicStr}" (esperado: "%PDF")`);

      if (!magicStr.startsWith('%PDF')) {
        throw new Error('❌ PDF gerado com magic bytes inválidos - possível corrupção na geração');
      }

      // Upload para R2 usando Uint8Array diretamente
      // NOTA: R2 aceita Uint8Array, ArrayBuffer ou ReadableStream
      // Usar Uint8Array diretamente evita problemas de offset e corrupção
      await bucket.put(r2Key, pdfBytes, {
        httpMetadata: {
          contentType: 'application/pdf',
        },
        customMetadata: {
          tipo: 'CERTIFICADO_QUALIFICACAO',
          cpf: cpfLimpo,
          codigo: qualificacao.qualificacao_codigo || qualificacao.codigo,
          historico_id: String(qualificacao.id),
          data_referencia: dataBase.toISOString(),
          origem: 'auto-gerado',
          gerado_em: new Date().toISOString(),
        },
      });

      console.log(`📄 [GERAR PDF] Upload R2: ${r2Key}`);

      // Persistir no D1
      console.log(`📄 [GERAR PDF] Inserindo documento no D1...`);
      const storageColumns = await getCertificadosStorageColumns(db);
      await backfillCertificadoAtualNaPastaVirtual(db, storageColumns, {
        historicoId: id,
        funcionarioId: qualificacao.funcionario_id,
        certificadoArquivoId: qualificacao.certificado_arquivo_id ?? null,
        empresaId: qualificacaoEmpresaId,
      });

      // Determinar em qual pasta_virtual o certificado deve ser arquivado.
      // Para certificados de instrutor, tentar localizar o `funcionario.id` do instrutor
      // (busca por nome / cpf / matricula). Se encontrado, arquivar na pasta do instrutor,
      // caso contrário, mantemos o comportamento atual (arquivo no aluno).
      let targetFuncionarioId = qualificacao.funcionario_id;
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
          console.warn('[GERAR PDF] Falha ao tentar resolver funcionario do instrutor:', e);
        }
      }

      const result = await db
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

      console.log(`📄 [GERAR PDF] Insert result:`, result);
      const documentoId = result.meta.last_row_id;

      if (!documentoId) {
        throw new Error(
          `❌ Erro ao inserir documento no D1: last_row_id inválido (${documentoId})`,
        );
      }

      console.log(`📄 [GERAR PDF] Documento criado com ID: ${documentoId}`);

      // Inserir na pasta_virtual para exibir na UI e manter histórico de múltiplos certificados
      try {
        await insertCertificadoNaPastaVirtual(db, storageColumns, {
          funcionarioId: targetFuncionarioId,
          documentoId: Number(documentoId),
          historicoId: id,
          empresaId: qualificacaoEmpresaId,
          r2Key,
          nomeArquivo,
          descricao: `Certificado ${qualificacao.qualificacao_codigo || qualificacao.codigo} - ${
            participanteCertificado?.nome || qualificacao.funcionario_nome
          }`,
        });
        console.log(
          '✅ Certificado inserido na pasta_virtual (funcionario:',
          targetFuncionarioId,
          ')',
        );
      } catch (e) {
        console.error('❌ Erro ao inserir na pasta_virtual:', e);
        // Não falhar o processo todo por isso
      }

      // Atualizar qualificacao_historico com FK e numero_certificado
      console.log(`📄 [GERAR PDF] Atualizando qualificacao_historico...`);
      const numeroCertificado = nomeArquivo.replace('.pdf', '');
      await db
        .prepare(
          `UPDATE qualificacoes_historico
         SET certificado_arquivo_id = ?,
             arquivo_url = ?,
             numero_certificado = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        )
        .bind(documentoId, `/api/pasta-virtual/stream/${documentoId}`, numeroCertificado, id)
        .run();

      console.log(`✅ [GERAR PDF] Sucesso total: ${nomeArquivo}`);

      const ua = extrairUsuarioAuditoria(c);
      await registrarAuditoria({
        db,
        tabela: 'documentos',
        acao: 'INSERT',
        registro_id: documentoId,
        dados_novos: { historico_id: id, r2_key: r2Key, nome_arquivo: nomeArquivo },
        ...ua,
      });

      const response: ApiResponse<{ id: number; uuid: string; r2_key: string; tamanho: number }> = {
        success: true,
        data: {
          id: documentoId,
          uuid,
          r2_key: r2Key,
          tamanho: pdfBytes.length,
        },
        message: 'Certificado gerado com sucesso',
      };

      return c.json(response, 201);
    } catch (error: any) {
      console.error('❌ [GERAR PDF] Erro completo:', {
        message: error?.message || 'Erro desconhecido',
        stack: error?.stack,
        code: error?.code,
        details: String(error),
      });
      return c.json(
        {
          success: false,
          error: 'Erro ao gerar certificado',
          message: error?.message || 'Erro desconhecido',
          details: error?.stack || 'Sem stack trace',
        },
        500,
      );
    }
  },
);

app.post(
  '/historico/:id/certificados/upload',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const bucket = c.env.BUCKET;
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    try {
      const { historico, nomeFuncionario, cpf, codigo } = await resolveCertificadoContext(db, id);
      const storageColumns = await getCertificadosStorageColumns(db);
      const empresaId = getEmpresaId(c);
      await backfillCertificadoAtualNaPastaVirtual(db, storageColumns, {
        historicoId: id,
        funcionarioId: historico.funcionario_id,
        certificadoArquivoId: historico.certificado_arquivo_id ?? null,
        empresaId,
      });

      const form = await c.req.formData();
      const file = form.get('file') as File | null;
      const descricao = (form.get('descricao') as string) || null;
      const dataRealizacaoStr = (form.get('data_realizacao') as string) || null;

      if (!file) {
        return c.json({ success: false, error: 'Campo "file" é obrigatório' }, 400);
      }

      // ✅ NOVA VALIDAÇÃO: Tamanho máximo (10MB)
      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        return c.json(
          {
            success: false,
            error: `Arquivo muito grande. Máximo: 10MB (enviado: ${(
              file.size /
              1024 /
              1024
            ).toFixed(2)}MB)`,
          },
          400,
        );
      }

      // ✅ NOVA VALIDAÇÃO: Tamanho mínimo (evitar vazios)
      if (file.size < 1024) {
        return c.json({ success: false, error: 'Arquivo muito pequeno (mínimo: 1KB)' }, 400);
      }

      // ✅ NOVA VALIDAÇÃO: Magic bytes do PDF
      const arrayBuffer = await file.arrayBuffer();
      const header = new Uint8Array(arrayBuffer.slice(0, 5));
      const isPDF =
        header[0] === 0x25 && // %
        header[1] === 0x50 && // P
        header[2] === 0x44 && // D
        header[3] === 0x46 && // F
        header[4] === 0x2d; // -

      if (!isPDF) {
        return c.json(
          {
            success: false,
            error: 'Arquivo inválido. Não é um PDF real (magic bytes inválidos)',
          },
          400,
        );
      }

      // Data de realização: usa data_realizacao se fornecida, senão fallback
      let dataRealização: Date;
      if (dataRealizacaoStr) {
        dataRealização = new Date(dataRealizacaoStr);
      } else if (historico.data_conclusao) {
        dataRealização = new Date(historico.data_conclusao);
      } else if (historico.data_vencimento) {
        dataRealização = new Date(historico.data_vencimento);
      } else {
        return c.json(
          {
            success: false,
            error:
              'Impossível fazer upload: qualificação não possui data de conclusão ou vencimento.',
          },
          400,
        );
      }

      const uuid = crypto.randomUUID().substring(0, 8);

      // Usar nomenclatura padronizada
      const nomeArquivo = gerarNomeArquivoPadronizado({
        tipo: 'CERTIFICADO_QUALIFICACAO',
        nomeFuncionario: nomeFuncionario,
        cpf,
        data: dataRealização,
        codigo,
        uuid,
      });

      console.log('[UPLOAD CERT] Gerando certificado:', {
        historicoId: id,
        cpf,
        codigo,
        nomeArquivoGerado: nomeArquivo,
      });

      const r2Key = `certificados/${nomeArquivo}`;
      const uint8Array = new Uint8Array(arrayBuffer);
      const fileType = file.type || 'application/pdf';

      // Calcular hash SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      await bucket.put(r2Key, uint8Array, {
        httpMetadata: {
          contentType: fileType,
        },
        customMetadata: {
          tipo: 'CERTIFICADO_QUALIFICACAO',
          cpf,
          codigo,
          historico_id: String(historico.id),
          data_referencia: dataRealização.toISOString(),
          origem: 'upload_manual',
          hash_sha256: hash,
        },
      });

      const result = await db
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
                historico.funcionario_id,
                nomeArquivo,
                fileType,
                uint8Array.byteLength,
                r2Key,
                descricao ||
                  `Certificado anexado para qualificação ${codigo} em ${
                    dataRealização.toISOString().split('T')[0]
                  }`,
                empresaId,
              ]
            : [
                uuid,
                historico.funcionario_id,
                nomeArquivo,
                fileType,
                uint8Array.byteLength,
                r2Key,
                descricao ||
                  `Certificado anexado para qualificação ${codigo} em ${
                    dataRealização.toISOString().split('T')[0]
                  }`,
              ]),
        )
        .run();

      const documentoId = result.meta.last_row_id;
      console.log(`✅ [UPLOAD CERT] Certificado salvo: ID ${documentoId}`);

      // ✅ INSERIR na pasta_virtual para exibir na UI e manter histórico de múltiplos certificados
      try {
        await insertCertificadoNaPastaVirtual(db, storageColumns, {
          funcionarioId: historico.funcionario_id,
          documentoId: Number(documentoId),
          historicoId: id,
          empresaId,
          r2Key,
          nomeArquivo,
          descricao: `Certificado ${codigo} - ${nomeFuncionario}`,
        });
        console.log('✅ [UPLOAD CERT] Certificado inserido na pasta_virtual');
      } catch (e) {
        console.error('❌ [UPLOAD CERT] Erro ao inserir na pasta_virtual:', e);
        // Não falhar o processo todo por isso
      }

      // ✅ LINK certificado_arquivo_id ao historico
      const numeroCertificado = nomeArquivo.replace('.pdf', '');
      await db
        .prepare(
          `UPDATE qualificacoes_historico
           SET certificado_arquivo_id = ?,
               arquivo_url = ?,
               numero_certificado = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(documentoId, `/api/pasta-virtual/stream/${documentoId}`, numeroCertificado, id)
        .run();

      console.log(`✅ [UPLOAD CERT] Linked documento ${documentoId} to historico ${id}`);

      const ua2 = extrairUsuarioAuditoria(c);
      await registrarAuditoria({
        db,
        tabela: 'documentos',
        acao: 'INSERT',
        registro_id: documentoId,
        dados_novos: { historico_id: id, r2_key: r2Key, nome_arquivo: nomeArquivo },
        ...ua2,
      });

      const response: ApiResponse<{ id: number; uuid: string; r2_key: string }> = {
        success: true,
        data: {
          id: documentoId,
          uuid,
          r2_key: r2Key,
        },
        message: 'Certificado anexado com sucesso',
      };

      return c.json(response, 201);
    } catch (error) {
      console.error('[UPLOAD CERT] Erro:', error);
      return c.json(
        {
          success: false,
          error: 'Erro ao fazer upload do certificado',
          details: error instanceof Error ? error.message : 'Erro desconhecido',
        },
        500,
      );
    }
  },
);

export default app;
