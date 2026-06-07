/**
 * ROTAS DE IMPORTAÇÃO - Refatoradas
 * VERSION: 2025-11-28T11:45:00Z - BATCH IMPORT FIX
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
import { FuncionarioImportacao as FuncionarioImportacaoService } from '../services/importacao/FuncionarioImportacao';
import { QualificacaoTipoImportacaoService } from '../services/importacao/QualificacaoTipoImportacao';
import { QualificacaoHistoricoImportacaoService } from '../services/importacao/QualificacaoHistoricoImportacao';
import { CategoriaImportacaoService } from '../services/importacao/CategoriaImportacao';
import { createLogger } from '../utils/logger';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';
import type { Env } from '../types';
import { auth } from '../middleware/auth';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

function resolveEmpresaIdOrThrow(c: Context): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEmpresaId = (c as any).get('empresaId');
  const empresaId = Number(rawEmpresaId);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('TENANT_CONTEXT_REQUIRED');
  }
  return empresaId;
}

function tenantContextResponse(c: Context) {
  return c.json(
    {
      success: false,
      error: 'TENANT_CONTEXT_REQUIRED',
      message: 'Contexto de empresa inválido para importação',
    },
    403,
  );
}

// ===== HELPER: Get Service =====

function getImportService(entidade: string, db: D1Database, empresaId?: number) {
  switch (entidade) {
    case 'funcionarios':
      return new FuncionarioImportacaoService(db);
    case 'qualificacoes_tipos':
    case 'tipos':
      return new QualificacaoTipoImportacaoService(db, empresaId);
    case 'qualificacoes_historico':
    case 'historico':
      return new QualificacaoHistoricoImportacaoService(db, empresaId);
    case 'categorias':
      return new CategoriaImportacaoService(db);
    default:
      return null;
  }
}

interface HistoricoRow {
  funcionario_cpf: string;
  qualificacao_codigo: string;
  data_conclusao: string;
  data_vencimento: string;
}

type HistoricoValidacaoRow = {
  funcionario_cpf?: string;
  funcionario_nome?: string;
  qualificacao_codigo?: string;
  qualificacao_nome?: string;
  data_conclusao?: string | number;
  data_conclusao_convertida?: string;
  data_vencimento?: string;
  data_vencimento_calculada?: string;
  [key: string]: unknown;
};

type HistoricoErroLinha = {
  linha: number;
  funcionario_cpf?: string;
  qualificacao_codigo?: string;
  erros: string[];
};

type FuncionarioRow = { cpf: string; nome: string };
type TipoQualificacaoRow = {
  codigo: string;
  nome: string;
  validade: number | null;
  vencimento_fim_mes: number;
};

type ImportacaoJsonRow = Record<string, unknown>;

async function executarImportacaoHistoricoEmLotes(
  c: Context,
  rows: HistoricoRow[],
  modo: string,
  empresaId: number,
  debugLogs: string[] = [],
) {
  console.log(
    '🔥🔥🔥 [executarImportacaoHistoricoEmLotes] FUNÇÃO CHAMADA! VERSÃO: 2025-11-28-14:40 🔥🔥🔥',
  );
  debugLogs.push('🔥 Helper executarImportacaoHistoricoEmLotes alcançado');

  console.log(
    `[IMPORT HISTORICO BATCH] Iniciando: ${rows.length} registros, Modo: ${modo || 'N/D'}`,
  );

  debugLogs.push(`🔥 Iniciando batch: ${rows.length} registros, modo: ${modo}`);

  if (!rows || rows.length === 0) {
    return c.json({ success: false, error: 'Nenhum dado para importar', debugLogs }, 400);
  }

  const db = c.env.DB as D1Database;
  const BATCH_SIZE = 20; // 20 rows × 3 campos = 60 variáveis (margem segura)
  debugLogs.push(`🔥 BATCH_SIZE definido: ${BATCH_SIZE}`);

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  console.log(`[IMPORT HISTORICO BATCH] ${totalBatches} lotes de ${BATCH_SIZE}`);

  let totalInserted = 0;
  let totalFailed = 0;
  const erros: Array<{ linha: number; cpf: string; codigo: string; erro: string }> = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, rows.length);
    const batch = rows.slice(start, end);

    console.log(
      `[IMPORT HISTORICO BATCH] Lote ${batchIndex + 1}/${totalBatches}: ${batch.length} registros`,
    );

    debugLogs.push(`🔥 Lote ${batchIndex + 1}/${totalBatches}: processando ${batch.length} rows`);

    try {
      const codigos = Array.from(
        new Set(
          batch
            .map((row) =>
              String(row.qualificacao_codigo || '')
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        ),
      );

      const tipoMap = new Map<string, number>();
      if (codigos.length > 0) {
        const codigoPlaceholders = codigos.map(() => '?').join(', ');
        const tipos = await db
          .prepare(
            `SELECT id, UPPER(TRIM(codigo)) AS codigo
             FROM qualificacoes_tipos
             WHERE UPPER(TRIM(codigo)) IN (${codigoPlaceholders})
               AND empresa_id = ?
               AND deleted_at IS NULL`,
          )
          .bind(...codigos, empresaId)
          .all<{ id: number; codigo: string }>();

        for (const tipo of tipos.results || []) {
          tipoMap.set(tipo.codigo, tipo.id);
        }
      }

      const cpfsLote = Array.from(
        new Set(
          batch
            .map((row) => String(row.funcionario_cpf || '').trim())
            .filter(Boolean),
        ),
      );
      const cpfMap = new Set<string>();
      if (cpfsLote.length > 0) {
        const cpfPlaceholders = cpfsLote.map(() => '?').join(', ');
        const funcionarios = await db
          .prepare(
            `SELECT cpf
             FROM funcionarios
             WHERE cpf IN (${cpfPlaceholders})
               AND empresa_id = ?
               AND deleted_at IS NULL`,
          )
          .bind(...cpfsLote, empresaId)
          .all<{ cpf: string }>();
        for (const funcionario of funcionarios.results || []) {
          cpfMap.add(String(funcionario.cpf).trim());
        }
      }

      const validRows: Array<HistoricoRow & { qualificacao_id: number }> = [];
      batch.forEach((row, index) => {
        const normalizedCodigo = String(row.qualificacao_codigo || '')
          .trim()
          .toUpperCase();
        const funcionarioCpf = String(row.funcionario_cpf || '').trim();
        const qualificacaoId = tipoMap.get(normalizedCodigo);

        if (!qualificacaoId) {
          const linha = start + index + 2;
          const errorMsg = `Qualificação não encontrada para o código ${row.qualificacao_codigo}`;
          totalFailed += 1;
          erros.push({
            linha,
            cpf: row.funcionario_cpf,
            codigo: row.qualificacao_codigo,
            erro: errorMsg,
          });
          debugLogs.push(`🔥 Lote ${batchIndex + 1}: linha ${linha} ignorada - ${errorMsg}`);
          return;
        }

        if (!cpfMap.has(funcionarioCpf)) {
          const linha = start + index + 2;
          const errorMsg = `Funcionário CPF ${funcionarioCpf} não encontrado para a empresa ${empresaId}`;
          totalFailed += 1;
          erros.push({
            linha,
            cpf: row.funcionario_cpf,
            codigo: row.qualificacao_codigo,
            erro: errorMsg,
          });
          debugLogs.push(`🔥 Lote ${batchIndex + 1}: linha ${linha} ignorada - ${errorMsg}`);
          return;
        }

        validRows.push({ ...row, qualificacao_id: qualificacaoId });
      });

      if (validRows.length === 0) {
        continue;
      }

      const placeholders = validRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const values: (string | number)[] = [];

      validRows.forEach((row) => {
        values.push(
          row.funcionario_cpf,
          row.qualificacao_codigo,
          row.qualificacao_id,
          row.data_conclusao,
          row.data_vencimento,
          empresaId,
        );
      });

      debugLogs.push(
        `🔥 Lote ${batchIndex + 1}: placeholders criados para ${validRows.length} rows (${
          values.length
        } variáveis)`,
      );

      await db
        .prepare(
          `
          INSERT INTO qualificacoes_historico 
          (funcionario_cpf, qualificacao_codigo, qualificacao_id, data_conclusao, data_vencimento, empresa_id)
          VALUES ${placeholders}
        `,
        )
        .bind(...values)
        .run();

      totalInserted += validRows.length;
      debugLogs.push(`🔥 Lote ${batchIndex + 1}: ✅ ${validRows.length} inseridos com sucesso`);
      console.log(
        `[IMPORT HISTORICO BATCH] Lote ${batchIndex + 1}: ✅ ${validRows.length} inseridos`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      debugLogs.push(`🔥 Lote ${batchIndex + 1}: ❌ ERRO: ${errorMsg}`);
      console.error(`[IMPORT HISTORICO BATCH] Lote ${batchIndex + 1}: ❌ Erro:`, errorMsg);
      totalFailed += batch.length;

      batch.forEach((row, index) => {
        erros.push({
          linha: start + index + 2,
          cpf: row.funcionario_cpf,
          codigo: row.qualificacao_codigo,
          erro: errorMsg,
        });
      });
    }

    if (batchIndex < totalBatches - 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  console.log(
    `[IMPORT HISTORICO BATCH] CONCLUÍDO: ${totalInserted} inseridos, ${totalFailed} falharam`,
  );

  debugLogs.push(
    `🔥 Concluído: ${totalInserted} inseridos, ${totalFailed} falharam, ${erros.length} erros`,
  );

  return c.json({
    success: erros.length === 0,
    totalRows: rows.length,
    inserted: totalInserted,
    failed: totalFailed,
    errors: erros.length > 0 ? erros : undefined,
    debugLogs, // INCLUIR DEBUGLOGS NO RESPONSE
  });
}

// ===== TEMPLATES (CSV com headers oficiais) =====

/**
 * GET /api/importacao/template/funcionarios
 * GET /api/importacao/template/tipos
 * GET /api/importacao/template/historico
 */
app.get('/template/:entidade', async (c: Context) => {
  const entidade = c.req.param('entidade') ?? '';
  const format = c.req.query('format') || 'csv';
  const db = c.env.DB;
  let empresaId = 0;
  try {
    empresaId = resolveEmpresaIdOrThrow(c);
  } catch {
    return tenantContextResponse(c);
  }

  const service = getImportService(entidade, db, empresaId);

  if (!service) {
    return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
  }

  const csv = service.getTemplate();
  const dateStr = new Date().toISOString().split('T')[0];

  if (format === 'xlsx') {
    // Gerar HTML-as-Excel (compatível com Excel/LibreOffice sem dependências externas)
    const rows = csv
      .split('\n')
      .filter(Boolean)
      .map((line) =>
        line
          .split(',')
          .map((cell) => `<td>${cell.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`)
          .join(''),
      )
      .map((cells, i) =>
        i === 0
          ? `<tr style="font-weight:bold;background:#e2e8f0">${cells}</tr>`
          : `<tr>${cells}</tr>`,
      )
      .join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Template</x:Name><x:WorksheetOptions><x:Selected/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml></head><body><table>${rows}</table></body></html>`;

    return c.body(html, 200, {
      'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
      'Content-Disposition': `attachment; filename="template-${entidade}-${dateStr}.xls"`,
    });
  }

  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="template-${entidade}-${dateStr}.csv"`,
  });
});

// ===== VALIDAR (sem inserir) =====

/**
 * POST /api/importacao/validar/:entidade
 * Body: FormData com arquivo CSV ou XLSX
 */
app.post('/validar/:entidade', async (c: Context) => {
  const logger = createLogger(c, 'ImportacaoRoute');

  try {
    const entidade = c.req.param('entidade') ?? '';
    const db = c.env.DB;
    const empresaId = resolveEmpresaIdOrThrow(c);

    logger.info('Request de validação recebida', {
      entidade,
      method: 'POST /validar',
    });

    const service = getImportService(entidade, db, empresaId);

    if (!service) {
      logger.warn('Entidade inválida solicitada', { entidade });
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    // Parse file
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');

    if (!fileEntry || typeof fileEntry === 'string') {
      logger.warn('Arquivo não enviado na requisição');
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }
    const file = fileEntry as File;

    logger.debug('Parsing arquivo', {
      filename: file.name,
      type: file.type,
      size: file.size,
    });

    const buffer = await file.arrayBuffer();
    const parsed = await parseImportFile(buffer, file.type);

    logger.info('Arquivo parseado com sucesso', {
      total_linhas: parsed.rows.length,
      headers: parsed.headers,
      primeira_linha: parsed.rows[0],
    });

    // Remapear headers conforme entidade
    const remappedRows = parsed.rows.map((row) =>
      remapRowHeaders(
        row,
        entidade as 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
      ),
    );

    logger.debug('Headers remapeados', {
      headers_remapeados: Object.keys(remappedRows[0] || {}),
      primeira_linha: remappedRows[0],
    });

    // Validar
    const timer = logger.startTimer('Validação completa');
    const errors = await service.validate(remappedRows, empresaId);
    timer();

    logger.info('Validação concluída', {
      total_linhas: parsed.rows.length,
      total_erros: errors.length,
      validos: parsed.rows.length - errors.length,
    });

    return c.json({
      success: errors.length === 0,
      totalRows: parsed.rows.length,
      errors,
      preview: parsed.rows.slice(0, 5), // primeiras 5 linhas
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    if (errorMsg === 'TENANT_CONTEXT_REQUIRED') {
      return tenantContextResponse(c);
    }
    logger.fatal('Erro ao validar importação', error as Error);
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
  const logger = createLogger(c, 'ImportacaoRoute');

  try {
    const entidade = c.req.param('entidade') ?? '';
    const db = c.env.DB;
    const empresaId = resolveEmpresaIdOrThrow(c);

    logger.info('Request de execução recebida', {
      entidade,
      method: 'POST /executar',
    });

    const service = getImportService(entidade, db, empresaId);

    if (!service) {
      logger.warn('Entidade inválida solicitada', { entidade });
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    // Parse file
    const formData = await c.req.formData();
    const file = formData.get('file');
    const mode = (formData.get('mode') as string) || 'UPSERT';

    logger.debug('Parâmetros recebidos', { mode, has_file: !!file });

    if (!file || typeof file === 'string') {
      logger.warn('Arquivo não enviado ou inválido');
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    // Validar mode baseado na entidade
    const validModes =
      entidade === 'historico' || entidade === 'qualificacoes_historico'
        ? ['INSERT', 'UPSERT']
        : ['INSERT', 'UPDATE', 'UPSERT'];

    if (!validModes.includes(mode)) {
      logger.warn('Mode inválido', { mode, valid_modes: validModes });
      return c.json({ success: false, error: `Mode inválido. Use ${validModes.join(', ')}` }, 400);
    }

    const buffer = await (file as File).arrayBuffer();
    const parsed = await parseImportFile(buffer, (file as File).type);

    logger.info('Arquivo parseado para execução', {
      total_linhas: parsed.rows.length,
      mode,
    });

    // Remapear headers conforme entidade
    const remappedRows = parsed.rows.map((row) =>
      remapRowHeaders(
        row,
        entidade as 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
      ),
    );

    // Importar
    const timer = logger.startTimer(`Importação completa (mode: ${mode})`);
    const result = await service.import(
      remappedRows,
      mode as ('INSERT' | 'UPDATE' | 'UPSERT') & ('INSERT' | 'UPSERT'),
      empresaId,
    );
    timer();

    logger.info('Importação concluída', {
      success: result.success,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors_count: result.errors.length,
    });

    if (!result.success && result.errors.length > 0) {
      logger.error('Importação com erros', undefined, {
        total_erros: result.errors.length,
        primeiro_erro: result.errors[0],
      });
    }

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
    if (error instanceof Error && error.message === 'TENANT_CONTEXT_REQUIRED') {
      return tenantContextResponse(c);
    }
    logger.fatal('Erro ao executar importação', error as Error);
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// ===== VALIDAR COM JSON (rows já parseadas - usado pelo frontend após XLSX parse) =====

/**
 * POST /api/importacao-v2/validar-json/:entidade
 * Body: { rows: ImportacaoJsonRow[], mode: string }
 * Compatível com parseImportFile output
 * OTIMIZADO: Apenas 2 queries totais para qualificacoes_historico
 */
app.post('/validar-json/:entidade', async (c: Context) => {
  try {
    const entidade = c.req.param('entidade') ?? '';
    const db = c.env.DB;
    const empresaId = resolveEmpresaIdOrThrow(c);

    console.log(`[VALIDACAO] Iniciando: entidade=${entidade}`);

    const service = getImportService(entidade, db, empresaId);
    if (!service) {
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    const body = await c.req.json<{ rows: ImportacaoJsonRow[]; mode?: string }>();
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json({ success: false, error: 'Nenhuma linha para validar' }, 400);
    }

    console.log(`[VALIDACAO] Total de linhas: ${rows.length}`);
    console.log(`[VALIDACAO] Entidade recebida: "${entidade}"`);
    console.log(`[VALIDACAO] Primeira linha keys:`, Object.keys(rows[0] || {}));
    console.log(`[VALIDACAO] Primeira linha:`, rows[0]);
    console.log(
      `[VALIDACAO] Teste condição: ${entidade === 'qualificacoes_historico'} || ${
        entidade === 'historico'
      }`,
    );

    // OTIMIZAÇÃO ESPECIAL para qualificacoes_historico (muitas linhas)
    if (entidade === 'qualificacoes_historico' || entidade === 'historico') {
      console.log('[VALIDACAO HISTORICO] ✅ Usando validação otimizada para histórico');

      // Função helper para normalizar CPF (remove pontos e hífen)
      const historicoRows = rows as HistoricoValidacaoRow[];

      const normalizarCPF = (cpf?: string): string => {
        if (!cpf || typeof cpf !== 'string') return '';
        return cpf.replace(/[.-]/g, '');
      };

      // 1. Extrair CPFs e códigos únicos (normalizando CPFs)
      const cpfsUnicos = Array.from(
        new Set(
          historicoRows
            .map((r) => r.funcionario_cpf)
            .filter(Boolean)
            .map(normalizarCPF)
            .filter((cpf) => cpf.length > 0),
        ),
      );
      const codigosUnicos = Array.from(
        new Set(historicoRows.map((r) => r.qualificacao_codigo).filter(Boolean)),
      );

      console.log(`[VALIDACAO HISTORICO] CPFs únicos: ${cpfsUnicos.length}`);
      console.log(`[VALIDACAO HISTORICO] Códigos únicos: ${codigosUnicos.length}`);

      if (cpfsUnicos.length === 0) {
        return c.json({ success: false, error: 'Nenhum CPF válido encontrado' }, 400);
      }

      if (codigosUnicos.length === 0) {
        return c.json(
          { success: false, error: 'Nenhum código de qualificação válido encontrado' },
          400,
        );
      }

      // 2. Buscar TODOS os funcionários de uma vez (QUERY 1/2)
      console.log('[VALIDACAO HISTORICO] Buscando funcionários no banco...');
      const funcionariosMap = new Map<string, { cpf: string; nome: string }>();
      if (cpfsUnicos.length > 0) {
        // Buscar tanto CPFs normalizados quanto formatados
        const cpfsFormatados = cpfsUnicos.map((cpf) => {
          // Formatar: XXX.XXX.XXX-XX
          return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        });

        const todosCPFs = [...cpfsUnicos, ...cpfsFormatados];
        const allPlaceholders = todosCPFs.map(() => '?').join(',');

        const funcionariosResult = await db
          .prepare(
            `SELECT cpf, nome FROM funcionarios WHERE cpf IN (${allPlaceholders}) AND empresa_id = ? AND deleted_at IS NULL`,
          )
          .bind(...todosCPFs, empresaId)
          .all();

        const funcionarios = (funcionariosResult.results || []) as FuncionarioRow[];

        // Mapear por CPF normalizado (sem formatação)
        funcionarios.forEach((f) => {
          const cpfNormalizado = normalizarCPF(f.cpf);
          funcionariosMap.set(cpfNormalizado, { cpf: f.cpf, nome: f.nome });
        });
        console.log(
          `[VALIDACAO HISTORICO] Funcionários encontrados: ${funcionariosMap.size}/${cpfsUnicos.length}`,
        );
      }

      // 3. Buscar TODOS os tipos de qualificação de uma vez (QUERY 2/2)
      console.log('[VALIDACAO HISTORICO] Buscando tipos de qualificação...');
      const tiposMap = new Map<
        string,
        { codigo: string; nome: string; validade: number | null; vencimento_fim_mes: number }
      >();
      if (codigosUnicos.length > 0) {
        const placeholders = codigosUnicos.map(() => '?').join(',');
        const tiposResult = await db
          .prepare(
            `SELECT codigo, nome, validade, vencimento_fim_mes 
             FROM qualificacoes_tipos 
             WHERE codigo IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL`,
          )
          .bind(...codigosUnicos, empresaId)
          .all();

        const tipos = (tiposResult.results || []) as TipoQualificacaoRow[];

        tipos.forEach((t) => tiposMap.set(t.codigo, t));
        console.log(
          `[VALIDACAO HISTORICO] Tipos encontrados: ${tiposMap.size}/${codigosUnicos.length}`,
        );
      }

      // 4. Validar TODAS as linhas em memória (SEM mais queries!)
      console.log('[VALIDACAO HISTORICO] Validando linhas em memória...');
      const validos: HistoricoValidacaoRow[] = [];
      const erros: HistoricoErroLinha[] = [];

      historicoRows.forEach((row, index) => {
        const errosLinha: string[] = [];

        try {
          // Validar CPF (normalizando para busca)
          if (!row.funcionario_cpf) {
            errosLinha.push('CPF do funcionário é obrigatório');
          } else {
            const cpfNormalizado = normalizarCPF(row.funcionario_cpf);
            const funcionario = funcionariosMap.get(cpfNormalizado);
            if (!funcionario) {
              errosLinha.push(`Funcionário com CPF ${row.funcionario_cpf} não encontrado`);
            } else {
              row.funcionario_nome = funcionario.nome;
              // Usar o CPF do banco (formato correto)
              row.funcionario_cpf = funcionario.cpf;
            }
          }

          // Validar Código da Qualificação
          if (!row.qualificacao_codigo) {
            errosLinha.push('Código da qualificação é obrigatório');
          } else {
            const tipo = row.qualificacao_codigo
              ? tiposMap.get(row.qualificacao_codigo)
              : undefined;
            if (!tipo) {
              errosLinha.push(`Tipo '${row.qualificacao_codigo}' não encontrado`);
            } else {
              row.qualificacao_nome = tipo.nome;
            }
          }

          // Validar e converter Data de Conclusão
          if (!row.data_conclusao) {
            errosLinha.push('Data de conclusão é obrigatória');
          } else {
            let dataConversao: Date;

            // Data do Excel (número serial)
            if (typeof row.data_conclusao === 'number') {
              const excelEpoch = new Date(1899, 11, 30);
              dataConversao = new Date(excelEpoch.getTime() + row.data_conclusao * 86400000);
            } else if (typeof row.data_conclusao === 'string') {
              dataConversao = new Date(row.data_conclusao);
            } else {
              throw new Error('Formato de data inválido');
            }

            if (isNaN(dataConversao.getTime())) {
              errosLinha.push('Data de conclusão inválida');
            } else {
              row.data_conclusao_convertida = dataConversao.toISOString().split('T')[0];
            }
          }

          // Calcular data de vencimento automaticamente
          if (
            row.data_conclusao_convertida &&
            row.qualificacao_codigo &&
            tiposMap.has(row.qualificacao_codigo)
          ) {
            const tipo = tiposMap.get(row.qualificacao_codigo);

            if (tipo && tipo.validade) {
              row.data_vencimento_calculada = calcularDataVencimento(
                row.data_conclusao_convertida as string,
                tipo.validade,
                1,
              );
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
          errosLinha.push(`Erro ao processar linha: ${errorMsg}`);
        }

        // Classificar linha
        if (errosLinha.length > 0) {
          erros.push({
            linha: index + 2, // +2 porque Excel começa em 1 e tem header
            funcionario_cpf: row.funcionario_cpf,
            qualificacao_codigo: row.qualificacao_codigo,
            erros: errosLinha,
          });
        } else {
          validos.push(row);
        }
      });

      console.log(
        `[VALIDACAO HISTORICO] Resultado: ${validos.length} válidos, ${erros.length} com erro`,
      );

      return c.json({
        success: erros.length === 0,
        total: historicoRows.length,
        validos: validos.length,
        erros: erros.length,
        dados_validos: validos,
        lista_erros: erros,
        preview: validos.slice(0, 5),
      });
    }

    // FALLBACK: Validação padrão para outras entidades
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
    const errors = await service.validate(remappedRows, empresaId);
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
    if (errorMsg === 'TENANT_CONTEXT_REQUIRED') {
      return tenantContextResponse(c);
    }
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[VALIDACAO] Erro crítico:', errorMsg);
    console.error('[VALIDACAO] Stack:', errorStack);
    return c.json(
      {
        success: false,
        error: 'Erro ao validar importação',
        code: 'INTERNAL_ERROR',
      },
      500,
    );
  }
});

// ===== NOVO ENDPOINT COM BATCHING AUTOMÁTICO PARA HISTÓRICO =====

/**
 * POST /api/importacao-v2/batch-historico-v3
 * Body: { rows: HistoricoRow[], mode: string }
 * ENDPOINT DEDICADO COM BATCHING AUTOMÁTICO - NUNCA FALHA POR SQL VARIABLES
 * V3: Novo endpoint para forçar bypass de cache Cloudflare
 */
app.post('/batch-historico-v3', async (c: Context) => {
  const debugLogs: string[] = ['✅ ENDPOINT /batch-historico-v3 ALCANÇADO'];

  try {
    const empresaId = resolveEmpresaIdOrThrow(c);
    const body = await c.req.json<{ rows: ImportacaoJsonRow[]; mode?: string }>();
    const { rows, mode = 'INSERT' } = body;

    debugLogs.push(`✅ Body parseado: ${rows?.length || 0} rows, mode: ${mode}`);

    console.log(`[BATCH-HISTORICO] Recebido: ${rows?.length || 0} registros, mode: ${mode}`);

    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json({ success: false, error: 'Nenhum dado para importar', debugLogs }, 400);
    }

    // Converter datas Excel
    const processedRows = rows.map((row) => {
      const newRow = { ...row };

      // Converter data_conclusao
      if (row.data_conclusao) {
        if (typeof row.data_conclusao === 'number') {
          // Formato Excel serial
          const excelEpoch = new Date(1899, 11, 30);
          const dataConversao = new Date(
            excelEpoch.getTime() + (row.data_conclusao as number) * 86400000,
          );
          newRow.data_conclusao = dataConversao.toISOString().split('T')[0];
        } else if (typeof row.data_conclusao === 'string' && row.data_conclusao.includes('/')) {
          // Formato DD/MM/YYYY
          const parts = row.data_conclusao.split('/');
          if (parts.length === 3) {
            const [dia, mes, ano] = parts;
            newRow.data_conclusao = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
          }
        }
      }

      if (row.data_vencimento) {
        if (typeof row.data_vencimento === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const dataConversao = new Date(
            excelEpoch.getTime() + (row.data_vencimento as number) * 86400000,
          );
          newRow.data_vencimento = dataConversao.toISOString().split('T')[0];
        } else if (typeof row.data_vencimento === 'string' && row.data_vencimento.includes('/')) {
          // Formato DD/MM/YYYY
          const parts = row.data_vencimento.split('/');
          if (parts.length === 3) {
            const [dia, mes, ano] = parts;
            newRow.data_vencimento = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
          }
        }
      }

      return newRow;
    });

    debugLogs.push(`✅ Datas convertidas: ${processedRows.length} rows`);

    // Montar rows para batch
    const batchRows: HistoricoRow[] = processedRows.map((row, index) => {
      const funcionarioCpf =
        (row.funcionario_cpf as string) || (row.data_conclusao_convertida as string) || '';
      const qualificacaoCodigo = (row.qualificacao_codigo as string) || '';
      const dataConclusao =
        (row.data_conclusao_convertida as string) || (row.data_conclusao as string) || '';
      const dataVencimento =
        (row.data_vencimento_calculada as string) ||
        (row.data_vencimento as string) ||
        dataConclusao;

      if (!funcionarioCpf || !qualificacaoCodigo || !dataConclusao) {
        console.error(`[BATCH-HISTORICO] Linha ${index + 2} inválida:`, row);
      }

      return {
        funcionario_cpf: funcionarioCpf,
        qualificacao_codigo: qualificacaoCodigo,
        data_conclusao: dataConclusao,
        data_vencimento: dataVencimento,
      };
    });

    debugLogs.push(`✅ batchRows criados: ${batchRows.length} rows`);
    debugLogs.push(`✅ Chamando executarImportacaoHistoricoEmLotes...`);

    console.log(
      `[BATCH-HISTORICO] Chamando executarImportacaoHistoricoEmLotes com ${batchRows.length} rows`,
    );

    // Passar debugLogs para a função
    return executarImportacaoHistoricoEmLotes(c, batchRows, mode, empresaId, debugLogs);
  } catch (error) {
    if (error instanceof Error && error.message === 'TENANT_CONTEXT_REQUIRED') {
      return tenantContextResponse(c);
    }
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    const errorStack = error instanceof Error ? error.stack : '';
    debugLogs.push(`❌ ERRO CRÍTICO: ${errorMsg}`);
    console.error('[BATCH-HISTORICO-V3] Erro crítico:', errorMsg, errorStack);
    return c.json(
      { success: false, error: 'Erro ao executar importação em lote', code: 'INTERNAL_ERROR' },
      500,
    );
  }
});

// ===== EXECUTAR COM JSON (rows já parseadas - usado pelo frontend após XLSX parse) =====

/**
 * POST /api/importacao-v2/executar-json/:entidade
 * Body: { rows: ImportacaoJsonRow[], mode: 'INSERT' | 'UPDATE' | 'UPSERT' }
 * Compatível com parseImportFile output
 */
app.post('/executar-json/:entidade', async (c: Context) => {
  try {
    const entidade = c.req.param('entidade') ?? '';
    const db = c.env.DB;
    const empresaId = resolveEmpresaIdOrThrow(c);

    const service = getImportService(entidade, db, empresaId);
    if (!service) {
      return c.json({ success: false, error: `Entidade inválida: ${entidade}` }, 400);
    }

    const body = await c.req.json<{ rows: ImportacaoJsonRow[]; mode?: string }>();
    const { rows, mode = 'UPSERT' } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json({ success: false, error: 'Nenhuma linha para importar' }, 400);
    }

    // Validar mode baseado na entidade
    const validModes =
      entidade === 'historico' || entidade === 'qualificacoes_historico'
        ? ['INSERT', 'UPSERT', 'SOBRESCREVER', 'MESCLAR_INTELIGENTE']
        : ['INSERT', 'UPDATE', 'UPSERT', 'SOBRESCREVER', 'MESCLAR_INTELIGENTE'];

    if (!validModes.includes(mode)) {
      return c.json({ success: false, error: `Mode inválido. Use ${validModes.join(', ')}` }, 400);
    }

    // Mapear modos do frontend para modos do backend
    let backendMode: 'INSERT' | 'UPSERT' = 'INSERT';
    if (
      mode === 'UPSERT' ||
      mode === 'SOBRESCREVER' ||
      mode === 'MESCLAR_INTELIGENTE' ||
      mode === 'UPDATE'
    ) {
      backendMode = 'UPSERT';
    } else {
      backendMode = 'INSERT';
    }

    console.log(
      `[EXECUTAR IMPORTACAO] Importando JSON: ${rows.length} linhas, entidade: ${entidade}, mode: ${mode} -> ${backendMode}`,
    );
    console.log(`[EXECUTAR IMPORTACAO] ⚠️ DEBUG: Testando condição historico...`);
    console.log(
      `[EXECUTAR IMPORTACAO] ⚠️ entidade === 'qualificacoes_historico': ${
        entidade === 'qualificacoes_historico'
      }`,
    );
    console.log(`[EXECUTAR IMPORTACAO] ⚠️ entidade === 'historico': ${entidade === 'historico'}`);

    // PRÉ-PROCESSAMENTO ESPECIAL para qualificacoes_historico
    let processedRows = rows;
    const debugLogs: string[] = [];

    if (entidade === 'qualificacoes_historico' || entidade === 'historico') {
      debugLogs.push(`🔵 /executar-json/${entidade} endpoint alcançado`);
      console.log('🎯🎯🎯 [EXECUTAR IMPORTACAO] ENTRANDO NO FLUXO DE LOTES! 🎯🎯🎯');
      console.log('[EXECUTAR IMPORTACAO] Convertendo datas do Excel para histórico...');

      processedRows = rows.map((row) => {
        const newRow = { ...row };

        // Converter data_conclusao se for número (Excel serial date)
        if (row.data_conclusao && typeof row.data_conclusao === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const dataConversao = new Date(excelEpoch.getTime() + row.data_conclusao * 86400000);
          newRow.data_conclusao = dataConversao.toISOString().split('T')[0];
        }

        // Converter data_vencimento se for número (Excel serial date)
        if (row.data_vencimento && typeof row.data_vencimento === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const dataConversao = new Date(excelEpoch.getTime() + row.data_vencimento * 86400000);
          newRow.data_vencimento = dataConversao.toISOString().split('T')[0];
        }

        return newRow;
      });

      console.log('[EXECUTAR IMPORTACAO] Datas convertidas. Primeira linha:', processedRows[0]);
      console.log(
        '[EXECUTAR IMPORTACAO] Keys da primeira linha:',
        Object.keys(processedRows[0] || {}),
      );

      const batchRows = processedRows.map((row, index) => {
        // Aceitar tanto campos originais quanto os calculados pela validação
        const funcionarioCpf = (row.funcionario_cpf as string) || '';
        const qualificacaoCodigo = (row.qualificacao_codigo as string) || '';
        const dataConclusao =
          (row.data_conclusao_convertida as string) || (row.data_conclusao as string) || '';
        const dataVencimento =
          (row.data_vencimento_calculada as string) ||
          (row.data_vencimento as string) ||
          dataConclusao;

        if (!funcionarioCpf || !qualificacaoCodigo || !dataConclusao) {
          console.error('[EXECUTAR IMPORTACAO] Linha inválida:', {
            index: index + 2,
            cpf: funcionarioCpf,
            codigo: qualificacaoCodigo,
            conclusao: dataConclusao,
            row_keys: Object.keys(row),
            row_sample: row,
          });
          throw new Error(
            `Linha ${
              index + 2
            } inválida: campos obrigatórios ausentes (cpf=${!!funcionarioCpf}, codigo=${!!qualificacaoCodigo}, data=${!!dataConclusao})`,
          );
        }

        return {
          funcionario_cpf: funcionarioCpf,
          qualificacao_codigo: qualificacaoCodigo,
          data_conclusao: dataConclusao,
          data_vencimento: dataVencimento,
        } satisfies HistoricoRow;
      });

      console.log('[EXECUTAR IMPORTACAO] Preparando batch de', batchRows.length, 'registros');
      console.log('[EXECUTAR IMPORTACAO] Primeira batchRow:', batchRows[0]);
      debugLogs.push(`🔵 Chamando executarImportacaoHistoricoEmLotes com ${batchRows.length} rows`);
      return executarImportacaoHistoricoEmLotes(c, batchRows, mode, empresaId, debugLogs);
    }

    // Importar
    const result = await service.import(processedRows, backendMode, empresaId);

    console.log(`[EXECUTAR IMPORTACAO] Importação JSON concluída:`, {
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
    if (errorMsg === 'TENANT_CONTEXT_REQUIRED') {
      return tenantContextResponse(c);
    }
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[EXECUTAR IMPORTACAO] Erro crítico:', errorMsg);
    console.error('[EXECUTAR IMPORTACAO] Stack:', errorStack);
    return c.json(
      {
        success: false,
        error: 'Erro ao executar importação',
        code: 'INTERNAL_ERROR',
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
    const empresaId = resolveEmpresaIdOrThrow(c);
    const service = new QualificacaoHistoricoImportacaoService(db, empresaId);

    const filters = {
      funcionario_cpf: c.req.query('funcionario_cpf'),
      qualificacao_codigo: c.req.query('qualificacao_codigo'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0,
    };

    const rows = await service.list(filters, empresaId);

    return c.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'TENANT_CONTEXT_REQUIRED') {
      return tenantContextResponse(c);
    }
    console.error('Erro ao listar histórico:', error);
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// =============================================
// POST /api/importacao-v2/enriquecer-historico
// Enriquece registros importados com dados de funcionarios e tipos
// =============================================
app.post('/enriquecer-historico', async (c: Context) => {
  try {
    const db = c.env.DB as D1Database;
    const empresaId = resolveEmpresaIdOrThrow(c);
    console.log('[ENRIQUECER HISTORICO] Iniciando enriquecimento...');

    // Buscar query params
    const { recalcular } = c.req.query();
    const recalcularTodos = recalcular === 'true';

    // 1. Buscar registros
    const whereClause = recalcularTodos
      ? 'WHERE qh.deleted_at IS NULL AND qh.empresa_id = ?'
      : 'WHERE qh.deleted_at IS NULL AND qh.empresa_id = ? AND (qh.funcionario_id IS NULL OR qh.qualificacao_id IS NULL)';

    const { results: registros } = await db
      .prepare(
        `
        SELECT 
          qh.id,
          qh.funcionario_cpf,
          qh.qualificacao_codigo,
          qh.data_conclusao
        FROM qualificacoes_historico qh
        ${whereClause}
        LIMIT 1000
      `,
      )
      .bind(empresaId)
      .all();

    if (!registros || registros.length === 0) {
      return c.json({
        success: true,
        message: 'Nenhum registro pendente de enriquecimento',
        processados: 0,
      });
    }

    console.log(`[ENRIQUECER HISTORICO] ${registros.length} registros para processar`);

    let atualizados = 0;
    let erros = 0;

    // 2. Processar cada registro
    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const reg of registros as any[]) {
      try {
        // Normalizar CPF (remover pontuação)
        const cpfNormalizado = reg.funcionario_cpf
          .replace(/\./g, '')
          .replace(/-/g, '')
          .replace(/\//g, '');

        // Buscar funcionario_id
        const { results: funcResults } = await db
          .prepare('SELECT id FROM funcionarios WHERE cpf = ? AND empresa_id = ? AND deleted_at IS NULL')
          .bind(cpfNormalizado, empresaId)
          .all();

        const funcionarioId = funcResults?.[0]?.id || null;

        // Buscar qualificacao_id e validade
        const { results: qualResults } = await db
          .prepare(
            'SELECT id, validade, vencimento_fim_mes FROM qualificacoes_tipos WHERE UPPER(TRIM(codigo)) = UPPER(TRIM(?)) AND empresa_id = ? AND deleted_at IS NULL',
          )
          .bind(reg.qualificacao_codigo, empresaId)
          .all();

        const qualificacaoId = qualResults?.[0]?.id || null;
        const validadeMeses = (qualResults?.[0]?.validade as number) || null;
        const vencimentoFimMes = Number((qualResults?.[0] as any)?.vencimento_fim_mes || 0) === 1 ? 1 : 0;

        // Calcular data_vencimento se temos data_conclusao e validade
        let dataVencimento = null;
        if (reg.data_conclusao && validadeMeses) {
          dataVencimento = calcularDataVencimento(reg.data_conclusao, validadeMeses, vencimentoFimMes);
        }

        // Atualizar registro
        if (funcionarioId || qualificacaoId || dataVencimento) {
          const updates: string[] = [];
          const params: any[] = [];

          if (funcionarioId) {
            updates.push('funcionario_id = ?');
            params.push(funcionarioId);
          }

          if (qualificacaoId) {
            updates.push('qualificacao_id = ?');
            params.push(qualificacaoId);
          }

          if (dataVencimento) {
            updates.push('data_vencimento = ?');
            params.push(dataVencimento);
          }

          updates.push('updated_at = datetime("now")');
          params.push(reg.id);

          await db
            .prepare(
              `
              UPDATE qualificacoes_historico 
              SET ${updates.join(', ')}
              WHERE id = ? AND empresa_id = ?
            `,
            )
            .bind(...params, empresaId)
            .run();

          atualizados++;
        }
      } catch (err) {
        console.error(`[ENRIQUECER HISTORICO] Erro no registro ${reg.id}:`, err);
        erros++;
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    console.log(`[ENRIQUECER HISTORICO] Concluído: ${atualizados} atualizados, ${erros} erros`);

    return c.json({
      success: true,
      processados: registros.length,
      atualizados,
      erros,
      message: `${atualizados} registros enriquecidos com sucesso`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'TENANT_CONTEXT_REQUIRED') {
      return tenantContextResponse(c);
    }
    console.error('[ENRIQUECER HISTORICO] Erro:', err);
    return c.json(
      {
        success: false,
        error: 'Erro ao enriquecer registros',
      },
      500,
    );
  }
});

export default app;
