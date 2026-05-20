/**
 * ROTAS DE IMPORTAÇÃO - Refatoradas
 *
 * Endpoints:
 * - GET /api/importacao/template/:entidade - Download template CSV
 * - POST /api/importacao/validar/:entidade - Validar arquivo sem inserir
 * - POST /api/importacao/executar/:entidade - Importar com validação completa
 * - GET /api/importacao/historico - Histórico de importações
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { parseImportFile } from '../utils/parseImportFile';
import { remapRowHeaders } from '../services/importacao/columnMappings';
import { FuncionarioImportacao as FuncionarioImportacaoService } from '../services/importacao/FuncionarioImportacaoRefactored';
import { QualificacaoTipoImportacaoService } from '../services/importacao/QualificacaoTipoImportacaoRefactored';
import { QualificacaoHistoricoImportacaoService } from '../services/importacao/QualificacaoHistoricoImportacaoRefactored';

const app = new Hono();

// ===== HELPER: Get Service =====

function getImportService(entidade: string, db: D1Database) {
  switch (entidade) {
    case 'funcionarios':
      return new FuncionarioImportacaoService(db);
    case 'qualificacoes_tipos':
    case 'tipos':
      return new QualificacaoTipoImportacaoService(db);
    case 'qualificacoes_historico':
    case 'historico':
      return new QualificacaoHistoricoImportacaoService(db);
    default:
      return null;
  }
}

// ===== TEMPLATES (CSV com headers oficiais) =====

/**
 * GET /api/importacao/template/funcionarios
 * GET /api/importacao/template/tipos
 * GET /api/importacao/template/historico
 */
app.get('/template/:entidade', async (c: Context) => {
  const entidade = c.req.param('entidade');
  const db = c.env.DB;

  const service = getImportService(entidade, db);

  if (!service) {
    return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
  }

  const csv = service.getTemplate();
  const filename = `template-${entidade}-${new Date().toISOString().split('T')[0]}.csv`;

  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

// ===== VALIDAR (sem inserir) =====

/**
 * POST /api/importacao/validar/:entidade
 * Body: FormData com arquivo CSV ou XLSX
 */
app.post('/validar/:entidade', async (c: Context) => {
  try {
    const entidade = c.req.param('entidade');
    const db = c.env.DB;

    const service = getImportService(entidade, db);

    if (!service) {
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    // Parse file
    const formData = await c.req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    const buffer = await file.arrayBuffer();
    const parsed = await parseImportFile(buffer, file.type);
    console.log(
      `[importacao-refactored] Arquivo parseado: ${parsed.rows.length} linhas, headers:`,
      parsed.headers,
    );
    console.log(`[importacao-refactored] Primeira linha parseada:`, parsed.rows[0]);
    console.log(`[importacao-refactored] Headers originais:`, Object.keys(parsed.rows[0]));

    // Remapear headers conforme entidade
    const remappedRows = parsed.rows.map((row) =>
      remapRowHeaders(
        row,
        entidade as 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
      ),
    );
    console.log(`[importacao-refactored] Primeira linha após remapeamento:`, remappedRows[0]);
    console.log(`[importacao-refactored] Headers remapeados:`, Object.keys(remappedRows[0]));

    // Validar
    const errors = await service.validate(remappedRows);
    console.log(`[importacao-refactored] Validação completa: ${errors.length} erros`);

    return c.json({
      success: errors.length === 0,
      totalRows: parsed.rows.length,
      errors,
      preview: parsed.rows.slice(0, 5), // primeiras 5 linhas
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[importacao-refactored] Erro ao validar:', errorMsg);
    console.error('[importacao-refactored] Stack:', error instanceof Error ? error.stack : '');
    return c.json(
      {
        success: false,
        error: errorMsg,
      },
      500,
    );
  }
});

// ===== EXECUTAR (validar + inserir) =====

/**
 * POST /api/importacao/executar/:entidade
 * Body: FormData com arquivo + mode (INSERT|UPDATE|UPSERT)
 */
app.post('/executar/:entidade', async (c: Context) => {
  try {
    const entidade = c.req.param('entidade');
    const db = c.env.DB;

    const service = getImportService(entidade, db);

    if (!service) {
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    // Parse file
    const formData = await c.req.formData();
    const file = formData.get('file');
    const mode = (formData.get('mode') as string) || 'UPSERT';

    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    // Validar mode baseado na entidade
    const validModes =
      entidade === 'historico' || entidade === 'qualificacoes_historico'
        ? ['INSERT', 'UPSERT']
        : ['INSERT', 'UPDATE', 'UPSERT'];

    if (!validModes.includes(mode)) {
      return c.json({ success: false, error: `Mode inválido. Use ${validModes.join(', ')}` }, 400);
    }

    const buffer = await (file as File).arrayBuffer();
    const parsed = await parseImportFile(buffer, (file as File).type);

    // Remapear headers conforme entidade
    const remappedRows = parsed.rows.map((row) =>
      remapRowHeaders(
        row,
        entidade as 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
      ),
    );

    // Importar
    const result = await service.import(
      remappedRows,
      mode as ('INSERT' | 'UPDATE' | 'UPSERT') & ('INSERT' | 'UPSERT'),
    );

    return c.json({
      success: result.success,
      totalRows: result.totalRows,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      message: result.success
        ? `Importação concluída: ${result.inserted} inseridos, ${result.updated} atualizados, ${result.skipped} ignorados`
        : `Importação falhou com ${result.errors.length} erros`,
    });
  } catch (error) {
    console.error('Erro ao executar importação:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

// ===== VALIDAR COM JSON (rows já parseadas - usado pelo frontend após XLSX parse) =====

/**
 * POST /api/importacao-v2/validar-json/:entidade
 * Body: { rows: Record<string, any>[], mode: string }
 * Compatível com parseImportFile output
 */
app.post('/validar-json/:entidade', async (c: Context) => {
  try {
    const entidade = c.req.param('entidade');
    const db = c.env.DB;

    const service = getImportService(entidade, db);
    if (!service) {
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    const body = await c.req.json<{ rows: Record<string, any>[]; mode: string }>();
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json({ success: false, error: 'Nenhuma linha para validar' }, 400);
    }

    console.log(
      `[importacao-refactored] Validando JSON: ${rows.length} linhas, entidade: ${entidade}`,
    );
    console.log(`[importacao-refactored] Headers originais primeira linha:`, Object.keys(rows[0]));
    console.log(`[importacao-refactored] Valores primeira linha:`, rows[0]);

    // Remapear headers conforme entidade
    const remappedRows = rows.map((row) => {
      const remapped = remapRowHeaders(
        row,
        entidade as 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
      );
      // DEBUG: Log da primeira linha remapeada
      if (rows.indexOf(row) === 0) {
        console.log('[importacao-refactored] Row original:', Object.keys(row));
        console.log('[importacao-refactored] Row remapeada:', Object.keys(remapped));
        console.log('[importacao-refactored] Valores remapeados:', remapped);
      }
      return remapped;
    });

    // Validar
    const errors = await service.validate(remappedRows);
    console.log(`[importacao-refactored] Validação JSON completa: ${errors.length} erros`);

    // DEBUG: Print dos erros encontrados
    if (errors.length > 0) {
      console.log('[importacao-refactored] Primeiros 5 erros:', errors.slice(0, 5));
      console.log('[importacao-refactored] Tipos de erro:', {
        campos: errors.map((e) => e.field).filter((v, i, a) => a.indexOf(v) === i),
        mensagensUnicas: [...new Set(errors.map((e) => e.message))],
      });
    }

    return c.json({
      success: errors.length === 0,
      totalRows: rows.length,
      errors,
      preview: rows.slice(0, 5),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[importacao-refactored] Erro ao validar JSON:', errorMsg);
    return c.json(
      {
        success: false,
        error: errorMsg,
      },
      500,
    );
  }
});

// ===== EXECUTAR COM JSON (rows já parseadas - usado pelo frontend após XLSX parse) =====

/**
 * POST /api/importacao-v2/executar-json/:entidade
 * Body: { rows: Record<string, any>[], mode: 'INSERT' | 'UPDATE' | 'UPSERT' }
 * Compatível com parseImportFile output
 */
app.post('/executar-json/:entidade', async (c: Context) => {
  try {
    const entidade = c.req.param('entidade');
    const db = c.env.DB;

    const service = getImportService(entidade, db);
    if (!service) {
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    const body = await c.req.json<{ rows: Record<string, any>[]; mode: string }>();
    const { rows, mode = 'UPSERT' } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json({ success: false, error: 'Nenhuma linha para importar' }, 400);
    }

    // Validar mode baseado na entidade
    const validModes =
      entidade === 'historico' || entidade === 'qualificacoes_historico'
        ? ['INSERT', 'UPSERT']
        : ['INSERT', 'UPDATE', 'UPSERT'];

    if (!validModes.includes(mode)) {
      return c.json({ success: false, error: `Mode inválido. Use ${validModes.join(', ')}` }, 400);
    }

    console.log(
      `[importacao-refactored] Importando JSON: ${rows.length} linhas, entidade: ${entidade}, mode: ${mode}`,
    );

    // Remapear headers conforme entidade
    const remappedRows = rows.map((row) =>
      remapRowHeaders(
        row,
        entidade as 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
      ),
    );

    // Importar
    const result = await service.import(
      remappedRows,
      mode as any, // TYPE_CASTING: mode é validado acima
    );

    console.log(`[importacao-refactored] Importação JSON concluída:`, {
      success: result.success,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return c.json({
      success: result.success,
      totalRows: result.totalRows,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      message: result.success
        ? `Importação concluída: ${result.inserted} inseridos, ${result.updated} atualizados, ${result.skipped} ignorados`
        : `Importação falhou com ${result.errors.length} erros`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[importacao-refactored] Erro ao executar JSON:', errorMsg);
    return c.json(
      {
        success: false,
        error: errorMsg,
      },
      500,
    );
  }
});

// ===== LISTAGEM COM JOIN (apenas para histórico) =====

/**
 * GET /api/importacao/historico/list
 * Query params: funcionario_cpf, qualificacao_codigo, limit, offset
 */
app.get('/historico/list', async (c: Context) => {
  try {
    const db = c.env.DB;
    const service = new QualificacaoHistoricoImportacaoService(db);

    const filters = {
      funcionario_cpf: c.req.query('funcionario_cpf'),
      qualificacao_codigo: c.req.query('qualificacao_codigo'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0,
    };

    const rows = await service.list(filters);

    return c.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Erro ao listar histórico:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

export default app;
