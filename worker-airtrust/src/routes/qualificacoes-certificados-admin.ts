/**
 * Rotas administrativas e de debug para certificados de qualificações.
 * Extraído de qualificacoes-certificados.ts para reduzir tamanho do arquivo principal.
 *
 * Rotas:
 *   GET  /debug/template/:id
 *   POST /admin/copiar-template/:fromEmpresa/:toEmpresa
 *   GET  /admin/empresas-com-templates
 *   POST /admin/ativar-template/:empresaId/:templateId
 *   GET  /admin/templates/:empresaId
 *   GET  /admin/inspecionar/:historicoId
 *   GET  /admin/verificar-cf
 *   GET  /admin/preview-html/:historicoId
 *   GET  /admin/debug-certificado-data/:historicoId
 *   GET  /admin/debug-template/:historicoId
 *   GET  /admin/debug-query/:historicoId
 *   POST /recuperar-orfaos
 *   POST /limpar-refs-orfas
 *   POST /historico/export-zip
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { type CertificadoData } from '../services/pdf-generator';
import { processTemplate } from '../services/html-to-pdf';
import { convertTemplateJsonToHtml, isTemplateJson } from '../utils/template-json-to-html';
import {
  tableHasColumn,
  resolveCargaHorariaCertificado,
} from './qualificacoes-certificados-helpers';
import adminOpsRoutes from './qualificacoes-certificados-admin-ops';

const app = new Hono<{ Bindings: Env }>();

// DEBUG: Endpoint para diagnosticar template
app.get('/debug/template/:id', auth(), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  try {
    // Buscar qualificação
    const qual = (await db
      .prepare(
        `SELECT qh.id, qh.empresa_id, qh.funcionario_id
         FROM qualificacoes_historico qh
         WHERE qh.id = ? AND qh.deleted_at IS NULL`,
      )
      .bind(id)
      .first()) as any;

    if (!qual) {
      return c.json(
        {
          success: false,
          error: 'Qualificação não encontrada',
          checked_id: id,
        },
        404,
      );
    }

    console.log(`🔍 [DEBUG] Qualificação ${id}: empresa_id=${qual.empresa_id}`);

    // Buscar template para a empresa
    const template = (await db
      .prepare(
        `SELECT id, nome, empresa_id, ativo, template_json, deleted_at
         FROM certificados_templates
         WHERE empresa_id = ? AND deleted_at IS NULL
         ORDER BY ativo DESC, updated_at DESC
         LIMIT 1`,
      )
      .bind(qual.empresa_id)
      .first()) as any;

    console.log(
      `🔍 [DEBUG] Template encontrado: ${template ? 'SIM' : 'NÃO'}`,
      template ? { id: template.id, nome: template.nome, ativo: template.ativo } : null,
    );

    // Buscar template ativo especificamente
    const templateAtivo = (await db
      .prepare(
        `SELECT id, nome, empresa_id, ativo, template_json
         FROM certificados_templates
         WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(qual.empresa_id)
      .first()) as any;

    const templateJson = templateAtivo?.template_json;
    const isJson = templateJson ? isTemplateJson(templateJson) : false;
    const htmlLength = isJson
      ? convertTemplateJsonToHtml(templateJson).length
      : templateJson?.length || 0;

    return c.json({
      success: true,
      data: {
        qualificacao_id: id,
        empresa_id: qual.empresa_id,
        template: {
          found: !!templateAtivo,
          id: templateAtivo?.id || null,
          nome: templateAtivo?.nome || null,
          ativo: templateAtivo?.ativo || 0,
          template_json_type: isJson ? 'JSON_ESTRUTURADO' : 'HTML_DIRETO',
          template_json_length: templateJson?.length || 0,
          template_html_length: htmlLength,
          first_100_chars: templateJson?.substring(0, 100) || 'NULL',
        },
        cloudflare: {
          has_account_id: !!c.env.CF_ACCOUNT_ID,
          has_browser_token: !!c.env.CF_BROWSER_API_TOKEN,
          will_use_browser_rendering: !!(
            templateJson &&
            c.env.CF_ACCOUNT_ID &&
            c.env.CF_BROWSER_API_TOKEN
          ),
        },
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// ADMIN ONLY: Copiar template de uma empresa para outra
app.post(
  '/admin/copiar-template/:fromEmpresa/:toEmpresa',
  auth(),
  requireRole('admin'),
  async (c) => {
    const db = c.env.DB;
    const fromEmpresa = parseInt(c.req.param('fromEmpresa'));
    const toEmpresa = parseInt(c.req.param('toEmpresa'));

    try {
      // Buscar template da empresa origem
      const templateRow = await db
        .prepare(
          `SELECT template_json, nome FROM certificados_templates
         WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
         ORDER BY padrao DESC LIMIT 1`,
        )
        .bind(fromEmpresa)
        .first<{ template_json: string; nome: string }>();

      if (!templateRow) {
        return c.json(
          { success: false, error: `Nenhum template ativo encontrado para empresa ${fromEmpresa}` },
          404,
        );
      }

      // Apenas inserir direto (sem checks de existing) - simplificar para evitar erro de backup
      const result = await db
        .prepare(
          `INSERT INTO certificados_templates (
          empresa_id, nome, template_json, ativo, padrao, created_at, updated_at
        ) VALUES (?, ?, ?, 1, 1, datetime('now'), datetime('now'))`,
        )
        .bind(toEmpresa, `${templateRow.nome}`, templateRow.template_json)
        .run();

      console.log(
        `✅ Template copiado: empresa ${fromEmpresa} → ${toEmpresa}, ID: ${result.meta.last_row_id}`,
      );

      return c.json({
        success: true,
        message: `Template copiado com sucesso para empresa ${toEmpresa}`,
        id: result.meta.last_row_id,
      });
    } catch (error) {
      console.error('Erro ao copiar template:', error);
      return c.json(
        {
          success: false,
          error: 'Erro ao copiar template',
          details: 'Detalhes internos omitidos',
        },
        500,
      );
    }
  },
);

// ADMIN ONLY: Listar empresas com templates
app.get('/admin/empresas-com-templates', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;

  try {
    const { results } = await db
      .prepare(
        `SELECT
          DISTINCT e.id, e.nome,
          (SELECT COUNT(*) FROM certificados_templates ct
           WHERE ct.empresa_id = e.id AND ct.deleted_at IS NULL) as total_templates,
          (SELECT COUNT(*) FROM certificados_templates ct
           WHERE ct.empresa_id = e.id AND ct.ativo = 1 AND ct.deleted_at IS NULL) as templates_ativos
        FROM empresas e
        WHERE e.deleted_at IS NULL
        ORDER BY e.nome ASC`,
      )
      .all();

    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao listar empresas',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

// ADMIN ONLY: Ativar template de empresa
app.post(
  '/admin/ativar-template/:empresaId/:templateId',
  auth(),
  requireRole('admin'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = parseInt(c.req.param('empresaId'));
    const templateId = parseInt(c.req.param('templateId'));

    try {
      // Primeiro, desativar todos os templates da empresa
      await db
        .prepare(
          `UPDATE certificados_templates
         SET ativo = 0
         WHERE empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(empresaId)
        .run();

      // Depois, ativar o template específico
      const result = await db
        .prepare(
          `UPDATE certificados_templates
         SET ativo = 1, updated_at = datetime('now')
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(templateId, empresaId)
        .run();

      if (result.meta.changes === 0) {
        return c.json(
          {
            success: false,
            error: `Template ${templateId} não encontrado para empresa ${empresaId}`,
          },
          404,
        );
      }

      console.log(`✅ Template ${templateId} ativado para empresa ${empresaId}`);

      return c.json({
        success: true,
        message: `Template ${templateId} ativado para empresa ${empresaId}`,
      });
    } catch (error) {
      console.error('Erro ao ativar template:', error);
      return c.json(
        {
          success: false,
          error: 'Erro ao ativar template',
          details: 'Detalhes internos omitidos',
        },
        500,
      );
    }
  },
);

// ADMIN ONLY: Listar templates de uma empresa
app.get('/admin/templates/:empresaId', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = parseInt(c.req.param('empresaId'));

  try {
    const { results } = await db
      .prepare(
        `SELECT
          id, nome, ativo, padrao, created_at, updated_at,
          LENGTH(template_json) as template_size
        FROM certificados_templates
        WHERE empresa_id = ? AND deleted_at IS NULL
        ORDER BY ativo DESC, padrao DESC, updated_at DESC`,
      )
      .bind(empresaId)
      .all();

    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Erro ao listar templates:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao listar templates',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

// ADMIN ONLY: Inspeção completa do processo de geração de certificado
app.get('/admin/inspecionar/:historicoId', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const historicoId = parseInt(c.req.param('historicoId'));

  try {
    // 1. Buscar qualificação
    const qual = (await db
      .prepare(
        `SELECT qh.*, f.nome, e.id as empresa_id, e.nome as empresa_nome
         FROM qualificacoes_historico qh
         LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
         LEFT JOIN empresas e ON e.id = qh.empresa_id
         WHERE qh.id = ? AND qh.deleted_at IS NULL`,
      )
      .bind(historicoId)
      .first()) as any;

    if (!qual) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    const empresaId = qual.empresa_id;

    // 2. Buscar em certificados_templates
    const templateCertificados = await db
      .prepare(
        `SELECT id, nome, ativo, template_json FROM certificados_templates
         WHERE empresa_id = ? AND deleted_at IS NULL
         ORDER BY ativo DESC, updated_at DESC`,
      )
      .bind(empresaId)
      .all();

    // 3. Buscar em empresas_config
    const templateConfig = await db
      .prepare(`SELECT certificado_template_html FROM empresas_config WHERE empresa_id = ?`)
      .bind(empresaId)
      .first<{ certificado_template_html: string | null }>();

    // 4. Verificar qual está sendo usado
    let templateSelecionado = null;
    let origem = null;

    const ativoEmCertificados = (templateCertificados.results as any[])?.find(
      (t: any) => t.ativo === 1,
    );
    if (ativoEmCertificados) {
      templateSelecionado = ativoEmCertificados.template_json;
      origem = 'certificados_templates (ATIVO)';
    } else if (templateConfig?.certificado_template_html) {
      templateSelecionado = templateConfig.certificado_template_html;
      origem = 'empresas_config (FALLBACK)';
    }

    // 5. Verificar se é JSON ou HTML
    let isJson = false;
    let htmlLength = 0;
    if (templateSelecionado) {
      try {
        isJson = isTemplateJson(templateSelecionado);
        htmlLength = isJson
          ? convertTemplateJsonToHtml(templateSelecionado).length
          : templateSelecionado.length;
      } catch (e) {
        console.error('Erro ao processar template:', e);
      }
    }

    return c.json({
      success: true,
      data: {
        qualificacao: {
          id: qual.id,
          empresa_id: empresaId,
          empresa_nome: qual.empresa_nome,
          funcionario_nome: qual.nome,
        },
        templates: {
          em_certificados_templates: {
            total: templateCertificados.results?.length || 0,
            items:
              (templateCertificados.results as any[])?.map((t: any) => ({
                id: t.id,
                nome: t.nome,
                ativo: t.ativo,
                tamanho: t.template_json?.length || 0,
              })) || [],
          },
          em_empresas_config: {
            existe: !!templateConfig?.certificado_template_html,
            tamanho: templateConfig?.certificado_template_html?.length || 0,
          },
        },
        template_selecionado: {
          origem,
          encontrado: !!templateSelecionado,
          tamanho: templateSelecionado?.length || 0,
          eh_json: isJson,
          tamanho_html: htmlLength,
          primeiros_200_chars: templateSelecionado?.substring(0, 200) || 'NULL',
        },
        cloudflare: {
          CF_ACCOUNT_ID: !!c.env.CF_ACCOUNT_ID,
          CF_BROWSER_API_TOKEN: !!c.env.CF_BROWSER_API_TOKEN,
          vai_usar_browser_rendering: !!(
            templateSelecionado &&
            c.env.CF_ACCOUNT_ID &&
            c.env.CF_BROWSER_API_TOKEN
          ),
          vai_usar_pdf_lib: !!(
            templateSelecionado &&
            (!c.env.CF_ACCOUNT_ID || !c.env.CF_BROWSER_API_TOKEN)
          ),
          sem_template: !templateSelecionado,
        },
      },
    });
  } catch (error) {
    console.error('Erro na inspeção:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao inspecionar',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

// ADMIN ONLY: Verificar configuração do Cloudflare
app.get('/admin/verificar-cf', auth(), requireRole('admin'), async (c) => {
  return c.json({
    success: true,
    cloudflare: {
      CF_ACCOUNT_ID: {
        configurado: !!c.env.CF_ACCOUNT_ID,
        tipo: typeof c.env.CF_ACCOUNT_ID,
        comprimento: c.env.CF_ACCOUNT_ID?.length || 0,
        valor_primeiros_10: c.env.CF_ACCOUNT_ID ? c.env.CF_ACCOUNT_ID.substring(0, 10) : 'null',
      },
      CF_BROWSER_API_TOKEN: {
        configurado: !!c.env.CF_BROWSER_API_TOKEN,
        tipo: typeof c.env.CF_BROWSER_API_TOKEN,
        comprimento: c.env.CF_BROWSER_API_TOKEN?.length || 0,
        valor_primeiros_10: c.env.CF_BROWSER_API_TOKEN
          ? c.env.CF_BROWSER_API_TOKEN.substring(0, 10)
          : 'null',
      },
      browser_rendering_disponivel: !!(c.env.CF_ACCOUNT_ID && c.env.CF_BROWSER_API_TOKEN),
    },
  });
});

// ADMIN ONLY: Ver HTML processado que será enviado ao Cloudflare
app.get('/admin/preview-html/:historicoId', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const historicoId = parseInt(c.req.param('historicoId'));

  try {
    // Buscar qualificação
    const qual = (await db
      .prepare(
        `SELECT qh.*, f.nome, f.cpf, f.codigo_anac, f.matricula, e.nome as empresa_nome
         FROM qualificacoes_historico qh
         LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
         LEFT JOIN empresas e ON e.id = qh.empresa_id
         WHERE qh.id = ? AND qh.deleted_at IS NULL`,
      )
      .bind(historicoId)
      .first()) as any;

    if (!qual) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    // Buscar template
    let templateHtml = null;
    const templateRow = await db
      .prepare(
        `SELECT template_json FROM certificados_templates
         WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(qual.empresa_id)
      .first<{ template_json: string }>();

    if (templateRow) {
      if (isTemplateJson(templateRow.template_json)) {
        templateHtml = convertTemplateJsonToHtml(templateRow.template_json);
      } else {
        templateHtml = templateRow.template_json;
      }
    } else {
      const configRow = await db
        .prepare(
          `SELECT certificado_template_html FROM empresas_config
           WHERE empresa_id = ? AND certificado_template_html IS NOT NULL LIMIT 1`,
        )
        .bind(qual.empresa_id)
        .first<{ certificado_template_html: string }>();

      if (configRow?.certificado_template_html) {
        templateHtml = configRow.certificado_template_html;
      }
    }

    if (!templateHtml) {
      return c.json({ success: false, error: 'Nenhum template encontrado' }, 404);
    }

    // Preparar dados
    const templateData = {
      funcionario_nome: qual.nome || '',
      funcionario_cpf: qual.cpf || '',
      funcionario_codigo_anac: qual.codigo_anac || '',
      funcionario_matricula: qual.matricula || '',
      qualificacao_nome: qual.qualificacao_nome || '',
      qualificacao_codigo: qual.codigo || '',
      qualificacao_categoria: qual.categoria || '',
      data_conclusao: qual.data_conclusao || '',
      data_vencimento: qual.data_vencimento || '',
      numero_certificado: 'AUTO-' + Date.now(),
      nome_empresa: qual.empresa_nome || 'AirTrust',
    };

    // Processar
    const processedHtml = processTemplate(templateHtml, templateData);

    // Mostrar resultado
    return c.json({
      success: true,
      data: {
        template_original_length: templateHtml.length,
        html_processado_length: processedHtml.length,
        primeiros_1000_chars: processedHtml.substring(0, 1000),
        ultimos_1000_chars: processedHtml.substring(processedHtml.length - 1000),
        html_completo: processedHtml, // Cuidado: pode ser grande!
      },
    });
  } catch (error) {
    console.error('Erro ao preview HTML:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao processar',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

// ✅ ENDPOINT: Debug - Ver certificadoData e templateData que será usado
app.get('/admin/debug-certificado-data/:historicoId', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('historicoId'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
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

    // Exatamente o mesmo que no endpoint de geração
    const qualificacao = (await db
      .prepare(
        `SELECT
          qh.*,
          f.nome AS funcionario_nome,
          f.cpf AS funcionario_cpf,
          f.codigo_anac AS funcionario_codigo_anac,
          f.matricula AS funcionario_matricula,
          qt.nome AS qualificacao_nome,
          qt.codigo AS qualificacao_codigo,
          qt.categoria AS qualificacao_categoria,
          ${historicoHasTipoTreinamento ? 'qh.tipo_treinamento' : 'NULL'} AS tipo_treinamento,
          qh.carga_horaria AS carga_horaria_historico,
          qt.carga_horaria AS carga_horaria_padrao,
          ${tiposHasCargaInicial ? 'qt.carga_horaria_inicial' : 'NULL'} AS carga_horaria_inicial,
          ${tiposHasCargaRecorrente ? 'qt.carga_horaria_recorrente' : 'NULL'} AS carga_horaria_recorrente
        FROM qualificacoes_historico qh
        LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
        LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
        WHERE qh.id = ? AND qh.deleted_at IS NULL`,
      )
      .bind(id)
      .first()) as any;

    if (!qualificacao) {
      return c.json({
        success: false,
        error: 'Histórico não encontrado',
      });
    }

    const cargaHorariaCertificado = resolveCargaHorariaCertificado({
      tipoTreinamento: qualificacao.tipo_treinamento,
      cargaHistorico: qualificacao.carga_horaria_historico,
      cargaInicial: qualificacao.carga_horaria_inicial,
      cargaRecorrente: qualificacao.carga_horaria_recorrente,
      cargaPadrao: qualificacao.carga_horaria_padrao,
    });

    // Preparar certificadoData EXATAMENTE como no endpoint real
    const certificadoData: CertificadoData = {
      funcionario_nome: qualificacao.funcionario_nome || 'NÃO INFORMADO',
      funcionario_cpf: qualificacao.funcionario_cpf || qualificacao.cpf || '',
      funcionario_codigo_anac: qualificacao.funcionario_codigo_anac || '',
      funcionario_matricula: qualificacao.funcionario_matricula || '',
      qualificacao_nome: qualificacao.qualificacao_nome || qualificacao.tipo_codigo || '',
      qualificacao_codigo: qualificacao.qualificacao_codigo || qualificacao.codigo || '',
      qualificacao_categoria: qualificacao.qualificacao_categoria || qualificacao.categoria || '',
      data_conclusao: qualificacao.data_conclusao || new Date().toISOString(),
      data_vencimento: qualificacao.data_vencimento || '',
      numero_certificado: qualificacao.numero_certificado || 'AUTO-' + Date.now(),
      carga_horaria: cargaHorariaCertificado,
      instrutor: qualificacao.instrutor || undefined,
      local: qualificacao.local || undefined,
      nota: qualificacao.nota || undefined,
    };

    // Agora preparar templateData EXATAMENTE como no endpoint real
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
      nome_empresa: 'Costa do Sol Táxi Aéreo', // exemplo
      numero_certificado: certificadoData.numero_certificado,
    };

    return c.json({
      success: true,
      data: {
        // Do banco de dados
        raw_data: {
          funcionario_nome: qualificacao.funcionario_nome,
          qualificacao_nome: qualificacao.qualificacao_nome,
          qualificacao_codigo: qualificacao.qualificacao_codigo,
        },
        // Após construção do certificadoData
        certificado_data: certificadoData,
        // Após construção do templateData
        template_data: templateData,
        // Verificação de valores
        check: {
          qualificacao_nome_is_empty:
            !certificadoData.qualificacao_nome || certificadoData.qualificacao_nome.trim() === '',
          qualificacao_nome_value: certificadoData.qualificacao_nome,
          qualificacao_codigo_value: certificadoData.qualificacao_codigo,
        },
      },
    });
  } catch (error) {
    console.error('❌ [DEBUG CERTIFICADO DATA] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao processar',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

// ✅ ENDPOINT: Debug - Ver template RAW do banco
app.get('/admin/debug-template/:historicoId', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('historicoId'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    // Buscar o historico para pegar empresa_id
    const historico = (await db
      .prepare('SELECT empresa_id FROM qualificacoes_historico WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first()) as any;

    if (!historico) {
      return c.json({ success: false, error: 'Histórico não encontrado' });
    }

    const empresaId = historico.empresa_id;

    // Buscar template em certificados_templates
    let templateRow = (await db
      .prepare(
        `SELECT id, nome, template_json FROM certificados_templates
         WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(empresaId)
      .first()) as any;

    if (!templateRow) {
      // Fallback para empresas_config
      const configRow = (await db
        .prepare(
          `SELECT certificado_template_html as template_json FROM empresas_config
           WHERE empresa_id = ? LIMIT 1`,
        )
        .bind(empresaId)
        .first()) as any;

      templateRow = configRow;
    }

    if (!templateRow?.template_json) {
      return c.json({ success: false, error: 'Template não encontrado' });
    }

    const templateHtml = templateRow.template_json;

    // Procurar por TODAS as variáveis do tipo {{...}}
    const variableMatches = templateHtml.match(/\{\{[^}]*\}\}/g) || [];

    return c.json({
      success: true,
      data: {
        template_length: templateHtml.length,
        variables_found: variableMatches,
        variables_unique: [...new Set(variableMatches)],
        template_preview_first_500: templateHtml.substring(0, 500),
        template_part_with_qualificacao: templateHtml.substring(
          templateHtml.indexOf('treinamento') - 50,
          templateHtml.indexOf('treinamento') + 200,
        ),
      },
    });
  } catch (error) {
    console.error('❌ [DEBUG TEMPLATE] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao processar',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

// ✅ ENDPOINT: Debug - Verificar dados do histórico
app.get('/admin/debug-query/:historicoId', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('historicoId'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    console.log(`📄 [DEBUG QUERY] historicoId=${id}`);

    const qualificacao = (await db
      .prepare(
        `SELECT
          qh.*,
          f.nome AS funcionario_nome,
          f.cpf AS funcionario_cpf,
          f.codigo_anac AS funcionario_codigo_anac,
          f.matricula AS funcionario_matricula,
          qt.nome AS qualificacao_nome,
          qt.codigo AS qualificacao_codigo,
          qt.categoria AS qualificacao_categoria
        FROM qualificacoes_historico qh
        LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
        LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
        WHERE qh.id = ? AND qh.deleted_at IS NULL`,
      )
      .bind(id)
      .first()) as any;

    console.log(`📄 [DEBUG QUERY] Resultado completo:`, JSON.stringify(qualificacao, null, 2));

    if (!qualificacao) {
      return c.json({
        success: false,
        error: 'Histórico não encontrado',
      });
    }

    // Retornar dados brutos para inspeção
    return c.json({
      success: true,
      data: {
        id: qualificacao.id,
        empresa_id: qualificacao.empresa_id,
        funcionario_id: qualificacao.funcionario_id,
        qualificacao_id: qualificacao.qualificacao_id,
        // ✅ CAMPOS JUNTADOS (do LEFT JOIN)
        funcionario_nome: qualificacao.funcionario_nome,
        funcionario_cpf: qualificacao.funcionario_cpf,
        funcionario_codigo_anac: qualificacao.funcionario_codigo_anac,
        funcionario_matricula: qualificacao.funcionario_matricula,
        qualificacao_nome: qualificacao.qualificacao_nome,
        qualificacao_codigo: qualificacao.qualificacao_codigo,
        qualificacao_categoria: qualificacao.qualificacao_categoria,
        // Datas
        data_conclusao: qualificacao.data_conclusao,
        data_vencimento: qualificacao.data_vencimento,
        // Campos nativos do histórico
        carga_horaria: qualificacao.carga_horaria,
        tipo_codigo: qualificacao.tipo_codigo,
        codigo: qualificacao.codigo,
        categoria: qualificacao.categoria,
      },
    });
  } catch (error) {
    console.error('❌ [DEBUG QUERY] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao processar',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});


app.route('/', adminOpsRoutes);
export default app;
