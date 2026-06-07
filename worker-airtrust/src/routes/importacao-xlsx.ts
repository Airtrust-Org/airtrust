/**
 * IMPORTAÇÃO XLSX - Sistema completo para 3 tabelas
 *
 * Endpoints:
 * - POST /api/importacao-xlsx/funcionarios
 * - POST /api/importacao-xlsx/historico
 * - POST /api/importacao-xlsx/tipos
 *
 * Modos:
 * - "completar": Adiciona novos registros, atualiza existentes
 * - "substituir": Remove todos e insere os novos (com confirmação)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import { createLogger } from '../utils/logger';

const app = new Hono<{ Bindings: Env }>();

async function loadExcelJS(): Promise<typeof import('exceljs')> {
  return (await import('exceljs/dist/es5/exceljs.browser.js')) as unknown as typeof import('exceljs');
}

// ===== TIPOS =====

interface ImportResult {
  success: boolean;
  mode: string;
  totalRows: number;
  inserted: number;
  updated: number;
  deleted?: number;
  errors: Array<{
    linha: number;
    erro: string;
    dados?: Record<string, any>;
  }>;
}

// ===== HELPER: Parse XLSX =====

async function parseXLSXFile(fileBuffer: ArrayBuffer): Promise<any[]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Planilha vazia ou inválida');
  }

  const rows: any[] = [];
  const headers: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      // Headers
      row.eachCell((cell) => {
        headers.push(String(cell.value || '').trim());
      });
    } else {
      // Data rows
      const rowData: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          let value = cell.value;

          // Handle Excel dates
          if (value instanceof Date) {
            value = value.toISOString().split('T')[0];
          } else if (typeof value === 'object' && value !== null && 'result' in value) {
            value = value.result;
          }

          rowData[header] = value;
        }
      });

      // Só adiciona se tiver pelo menos um campo preenchido
      if (Object.values(rowData).some((v) => v !== null && v !== undefined && v !== '')) {
        rows.push(rowData);
      }
    }
  });

  return rows;
}

// ===== FUNCIONÁRIOS =====

/**
 * POST /api/importacao-xlsx/funcionarios
 * Body: FormData com arquivo "file" e campo "mode" (completar|substituir)
 *
 * Optimized: pre-fetches all aeronaves and existing CPFs in 2 queries,
 * then batches all UPDATEs and INSERTs via db.batch().
 * Before: ~3 queries per row. After: 2 queries + 1 batch call.
 */
app.post('/funcionarios', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as unknown as File;
    const mode = (formData.get('mode') as string) || 'completar';

    if (!file) {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    const buffer = await file.arrayBuffer();
    const rows = await parseXLSXFile(buffer);

    if (rows.length === 0) {
      return c.json({ success: false, error: 'Planilha vazia' }, 400);
    }

    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const errors: any[] = [];
    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    // Modo SUBSTITUIR: deletar tudo primeiro
    if (mode === 'substituir') {
      const deleteResult = await db
        .prepare(
          `UPDATE funcionarios
              SET deleted_at = datetime('now')
            WHERE deleted_at IS NULL
              AND empresa_id = ?`,
        )
        .bind(tenantCtx.empresaId)
        .run();
      deleted = deleteResult.meta.changes || 0;
    }

    // ─── PRE-FETCH: modelos_aeronave e CPFs existentes (2 queries para toda a planilha) ───
    const modelosAeronave = await db
      .prepare(
        `SELECT id, modelo, codigo, nome
           FROM modelos_aeronave
          WHERE deleted_at IS NULL
            AND empresa_id = ?`,
      )
      .bind(tenantCtx.empresaId)
      .all<{ id: number; modelo: string | null; codigo: string | null; nome: string | null }>();
    const modeloMap = new Map<string, number>();
    for (const m of modelosAeronave.results ?? []) {
      if (m.modelo) modeloMap.set(m.modelo.toLowerCase(), m.id);
      if (m.codigo) modeloMap.set(m.codigo.toLowerCase(), m.id);
      if (m.nome) modeloMap.set(m.nome.toLowerCase(), m.id);
    }

    const cpfsNaPlanilha = rows.map((r: any) => String(r.CPF || '')).filter(Boolean);
    let existentesByCpf = new Map<string, string>(); // cpf → id
    if (cpfsNaPlanilha.length > 0) {
      // D1 não suporta IN com array nativo — usar múltiplas queries em batch OU WHERE cpf IN literal
      // Para planilhas até 500 linhas é seguro serializar o IN
      const placeholders = cpfsNaPlanilha.map(() => '?').join(',');
      const existentes = await db
        .prepare(
          `SELECT id, cpf
             FROM funcionarios
            WHERE cpf IN (${placeholders})
              AND empresa_id = ?
              AND deleted_at IS NULL`,
        )
        .bind(...cpfsNaPlanilha, tenantCtx.empresaId)
        .all<{ id: string; cpf: string }>();
      for (const f of existentes.results ?? []) {
        existentesByCpf.set(f.cpf, f.id);
      }
    }

    // ─── GERAR STATEMENTS ───
    const stmts: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linha = i + 2;

      if (!row.Nome || !row.CPF) {
        errors.push({ linha, erro: 'Nome e CPF são obrigatórios', dados: row });
        continue;
      }

      const aeronaveKey = String(row.Aeronave || '')
        .trim()
        .toLowerCase();
      const modeloAeronaveId = aeronaveKey ? (modeloMap.get(aeronaveKey) ?? null) : null;
      const existenteId = existentesByCpf.get(String(row.CPF));

      if (existenteId) {
        stmts.push(
          db
            .prepare(
              `UPDATE funcionarios SET
                nome = ?, matricula = ?, email = ?, telefone = ?, nascimento = ?, admissao = ?,
                cargo = ?, funcao = ?, modelo_aeronave_id = ?, codigo_anac = ?, licenca = ?,
                is_instrutor = ?, is_examinador = ?, ativo = ?, updated_at = datetime('now')
              WHERE id = ? AND empresa_id = ?`,
            )
            .bind(
              row.Nome,
              row['Matrícula'] || null,
              row.Email || null,
              row.Telefone || null,
              row.Nascimento || null,
              row['Admissão'] || null,
              row.Cargo || null,
              row['Função'] || null,
              modeloAeronaveId,
              row['Código ANAC'] || null,
              row['Licença'] || null,
              row.Instrutor === 'Sim' ? 1 : 0,
              row.Examinador === 'Sim' ? 1 : 0,
              row.Ativo === 'Sim' ? 1 : 0,
              existenteId,
              tenantCtx.empresaId,
            ),
        );
        updated++;
      } else {
        stmts.push(
          db
            .prepare(
              `INSERT INTO funcionarios (
                nome, cpf, matricula, email, telefone, nascimento, admissao,
                cargo, funcao, modelo_aeronave_id, codigo_anac, licenca,
                is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            )
            .bind(
              row.Nome,
              row.CPF,
              row['Matrícula'] || null,
              row.Email || null,
              row.Telefone || null,
              row.Nascimento || null,
              row['Admissão'] || null,
              row.Cargo || null,
              row['Função'] || null,
              modeloAeronaveId,
              row['Código ANAC'] || null,
              row['Licença'] || null,
              row.Instrutor === 'Sim' ? 1 : 0,
              row.Examinador === 'Sim' ? 1 : 0,
              row.Ativo === 'Sim' ? 1 : 0,
              tenantCtx.empresaId,
            ),
        );
        inserted++;
      }
    }

    // ─── EXECUTAR BATCH ───
    for (let i = 0; i < stmts.length; i += 100) {
      try {
        await db.batch(stmts.slice(i, i + 100));
      } catch (err: any) {
        errors.push({ linha: i + 2, erro: err.message || String(err) });
      }
    }

    return c.json({
      success: errors.length === 0,
      mode,
      totalRows: rows.length,
      inserted,
      updated,
      deleted: mode === 'substituir' ? deleted : undefined,
      errors,
    } as ImportResult);
  } catch (error: any) {
    createLogger(c, 'ImportacaoXlsxRoutes').error('Erro na importacao XLSX de funcionarios', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ===== HISTÓRICO =====

/**
 * POST /api/importacao-xlsx/historico
 */
app.post('/historico', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as unknown as File;
    const mode = (formData.get('mode') as string) || 'completar';

    if (!file) {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    const buffer = await file.arrayBuffer();
    const rows = await parseXLSXFile(buffer);

    if (rows.length === 0) {
      return c.json({ success: false, error: 'Planilha vazia' }, 400);
    }

    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const errors: any[] = [];
    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    // Modo SUBSTITUIR
    if (mode === 'substituir') {
      const deleteResult = await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET deleted_at = datetime('now')
            WHERE deleted_at IS NULL
              AND empresa_id = ?`,
        )
        .bind(tenantCtx.empresaId)
        .run();
      deleted = deleteResult.meta.changes || 0;
    }

    // ─── PRE-FETCH: funcionarios e tipos_qualificacoes (2 queries para toda a planilha) ───
    const todosFuncionarios = await db
      .prepare(
        `SELECT id, nome
           FROM funcionarios
          WHERE deleted_at IS NULL
            AND empresa_id = ?`,
      )
      .bind(tenantCtx.empresaId)
      .all<{ id: string; nome: string }>();
    const funcionarioByNome = new Map<string, string>();
    for (const f of todosFuncionarios.results ?? []) {
      funcionarioByNome.set(f.nome.trim().toLowerCase(), f.id);
    }

    const todosTipos = await db
      .prepare(
        `SELECT id, nome
           FROM qualificacoes_tipos
          WHERE deleted_at IS NULL
            AND empresa_id = ?`,
      )
      .bind(tenantCtx.empresaId)
      .all<{ id: string; nome: string }>();
    const tipoByNome = new Map<string, string>();
    for (const t of todosTipos.results ?? []) {
      tipoByNome.set(t.nome.trim().toLowerCase(), t.id);
    }

    // ─── GERAR STATEMENTS (sem queries por linha — tudo resolvido pelos Maps) ───
    const stmts: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linha = i + 2;

      if (!row['Funcionário'] || !row['Qualificação']) {
        errors.push({ linha, erro: 'Funcionário e Qualificação são obrigatórios', dados: row });
        continue;
      }

      const funcionarioId = funcionarioByNome.get(String(row['Funcionário']).trim().toLowerCase());
      if (!funcionarioId) {
        errors.push({
          linha,
          erro: `Funcionário não encontrado: ${row['Funcionário']}`,
          dados: row,
        });
        continue;
      }

      const tipoId = tipoByNome.get(String(row['Qualificação']).trim().toLowerCase());
      if (!tipoId) {
        errors.push({
          linha,
          erro: `Tipo de qualificação não encontrado: ${row['Qualificação']}`,
          dados: row,
        });
        continue;
      }

      // Use INSERT OR REPLACE (upsert) on the unique key (funcionario_id, qualificacao_id, data_conclusao)
      // to avoid needing a per-row SELECT to check existence
      stmts.push(
        db
          .prepare(
            `INSERT INTO qualificacoes_historico (
              funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
              data_conclusao, data_vencimento, instrutor, observacoes,
              empresa_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(funcionario_id, qualificacao_id, data_conclusao) DO UPDATE SET
              qualificacao_codigo = excluded.qualificacao_codigo,
              categoria = excluded.categoria,
              data_vencimento = excluded.data_vencimento,
              instrutor = excluded.instrutor,
              observacoes = excluded.observacoes,
              empresa_id = excluded.empresa_id,
              updated_at = datetime('now')`,
          )
          .bind(
            funcionarioId,
            tipoId,
            row['Código'] || null,
            row.Categoria || null,
            row['Data Conclusão'] || null,
            row['Data Vencimento'] || null,
            row.Instrutor || null,
            row['Observações'] || null,
            tenantCtx.empresaId,
          ),
      );
      inserted++; // counting as inserted (upsert may update existing rows)
    }

    // ─── EXECUTAR BATCH ───
    for (let i = 0; i < stmts.length; i += 100) {
      try {
        await db.batch(stmts.slice(i, i + 100));
      } catch (err: any) {
        errors.push({ linha: i + 2, erro: err.message || String(err) });
      }
    }

    return c.json({
      success: errors.length === 0,
      mode,
      totalRows: rows.length,
      inserted,
      updated,
      deleted: mode === 'substituir' ? deleted : undefined,
      errors,
    } as ImportResult);
  } catch (error: any) {
    createLogger(c, 'ImportacaoXlsxRoutes').error('Erro na importacao XLSX de historico', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ===== TIPOS =====

/**
 * POST /api/importacao-xlsx/tipos
 */
app.post('/tipos', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as unknown as File;
    const mode = (formData.get('mode') as string) || 'completar';

    if (!file) {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    const buffer = await file.arrayBuffer();
    const rows = await parseXLSXFile(buffer);

    if (rows.length === 0) {
      return c.json({ success: false, error: 'Planilha vazia' }, 400);
    }

    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const errors: any[] = [];
    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    // Modo SUBSTITUIR
    if (mode === 'substituir') {
      const deleteResult = await db
        .prepare(
          `UPDATE qualificacoes_tipos
              SET deleted_at = datetime('now')
            WHERE deleted_at IS NULL
              AND empresa_id = ?`,
        )
        .bind(tenantCtx.empresaId)
        .run();
      deleted = deleteResult.meta.changes || 0;
    }

    // ─── PRE-FETCH: tipos existentes por código (1 query) ───
    const todosExistentes = await db
      .prepare(
        `SELECT id, codigo
           FROM qualificacoes_tipos
          WHERE deleted_at IS NULL
            AND empresa_id = ?`,
      )
      .bind(tenantCtx.empresaId)
      .all<{ id: string; codigo: string }>();
    const existentesByCodigo = new Map<string, string>();
    for (const t of todosExistentes.results ?? []) {
      existentesByCodigo.set(t.codigo, t.id);
    }

    // ─── GERAR STATEMENTS ───
    const stmts: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linha = i + 2;

      if (!row.Nome || !row['Código']) {
        errors.push({ linha, erro: 'Nome e Código são obrigatórios', dados: row });
        continue;
      }

      const existenteId = existentesByCodigo.get(String(row['Código']));
      if (existenteId) {
        stmts.push(
          db
            .prepare(
              `UPDATE qualificacoes_tipos SET
                tipo = ?, nome = ?, descricao = ?, categoria = ?,
                carga_horaria = ?, validade = ?, observacoes = ?,
                ativo = ?, updated_at = datetime('now')
              WHERE id = ? AND empresa_id = ?`,
            )
            .bind(
              row.Tipo || null,
              row.Nome,
              row['Descrição'] || null,
              row.Categoria || null,
              row['Carga Horária'] || null,
              row['Validade (meses)'] || null,
              row['Observações'] || null,
              row.Ativo === 'Sim' ? 1 : 0,
              existenteId,
              tenantCtx.empresaId,
            ),
        );
        updated++;
      } else {
        stmts.push(
          db
            .prepare(
              `INSERT INTO qualificacoes_tipos (
                tipo, codigo, nome, descricao, categoria, carga_horaria,
                validade, observacoes, ativo, empresa_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            )
            .bind(
              row.Tipo || null,
              row['Código'],
              row.Nome,
              row['Descrição'] || null,
              row.Categoria || null,
              row['Carga Horária'] || null,
              row['Validade (meses)'] || null,
              row['Observações'] || null,
              row.Ativo === 'Sim' ? 1 : 0,
              tenantCtx.empresaId,
            ),
        );
        inserted++;
      }
    }

    // ─── EXECUTAR BATCH ───
    for (let i = 0; i < stmts.length; i += 100) {
      try {
        await db.batch(stmts.slice(i, i + 100));
      } catch (err: any) {
        errors.push({ linha: i + 2, erro: err.message || String(err) });
      }
    }

    const result: ImportResult = {
      success: errors.length === 0,
      mode,
      totalRows: rows.length,
      inserted,
      updated,
      deleted: mode === 'substituir' ? deleted : undefined,
      errors,
    };

    return c.json(result);
  } catch (error: any) {
    createLogger(c, 'ImportacaoXlsxRoutes').error('Erro na importacao XLSX de tipos', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
