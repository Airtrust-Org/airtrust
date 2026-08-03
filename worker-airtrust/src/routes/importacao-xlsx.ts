/**
 * IMPORTAÇÃO XLSX - Sistema completo para 3 tabelas
 *
 * Endpoints:
 * - POST /api/importacao-xlsx/funcionarios
 * - POST /api/importacao-xlsx/historico
 * - POST /api/importacao-xlsx/tipos
 *
 * Modos:
 * - "completar": adiciona novos registros e atualiza existentes
 * - "substituir": valida tudo e aplica delete + reimport em uma única transação D1
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import { createLogger } from '../utils/logger';

const app = new Hono<{ Bindings: Env }>();
const MAX_IMPORT_ROWS = 500;
const LOOKUP_BIND_CHUNK = 80;
const WRITE_BATCH_SIZE = 100;

async function loadExcelJS(): Promise<typeof import('exceljs')> {
  return (await import('exceljs/dist/es5/exceljs.browser.js')) as unknown as typeof import('exceljs');
}

interface ImportError {
  linha: number;
  erro: string;
  dados?: Record<string, unknown>;
}

interface ImportResult {
  success: boolean;
  mode: string;
  totalRows: number;
  inserted: number;
  updated: number;
  deleted?: number;
  errors: ImportError[];
}

type ImportAction = 'inserted' | 'updated';

interface StatementEntry {
  statement: D1PreparedStatement;
  linha: number;
  action: ImportAction;
}

interface ExecutionResult {
  inserted: number;
  updated: number;
  deleted: number;
  blocked: boolean;
  transactionFailed: boolean;
}

interface UploadedFile {
  arrayBuffer(): Promise<ArrayBuffer>;
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof value.arrayBuffer === 'function'
  );
}

async function parseXLSXFile(fileBuffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Planilha vazia ou inválida');

  const rows: Record<string, unknown>[] = [];
  const headers: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => headers.push(String(cell.value || '').trim()));
      return;
    }

    const rowData: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (!header) return;

      let value = cell.value;
      if (value instanceof Date) value = value.toISOString().split('T')[0];
      else if (typeof value === 'object' && value !== null && 'result' in value) {
        value = value.result;
      }
      rowData[header] = value;
    });

    if (
      Object.values(rowData).some((value) => value !== null && value !== undefined && value !== '')
    ) {
      rows.push(rowData);
    }
  });

  return rows;
}

function validateRequest(mode: string, rows: Record<string, unknown>[]): string | null {
  if (mode !== 'completar' && mode !== 'substituir') return 'Modo de importação inválido';
  if (rows.length === 0) return 'Planilha vazia';
  if (rows.length > MAX_IMPORT_ROWS) {
    return `Planilha excede o limite de ${MAX_IMPORT_ROWS} linhas por importação`;
  }
  return null;
}

function normalizeCpf(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const calculateDigit = (base: string, factor: number) => {
    let total = 0;
    for (const digit of base) total += Number(digit) * factor--;
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return (
    calculateDigit(value.slice(0, 9), 10) === Number(value[9]) &&
    calculateDigit(value.slice(0, 10), 11) === Number(value[10])
  );
}

function countActions(entries: StatementEntry[]): Pick<ExecutionResult, 'inserted' | 'updated'> {
  return entries.reduce(
    (totals, entry) => {
      totals[entry.action] += 1;
      return totals;
    },
    { inserted: 0, updated: 0 },
  );
}

async function executeStatements(params: {
  db: D1Database;
  mode: string;
  deleteStatement: D1PreparedStatement | null;
  entries: StatementEntry[];
  errors: ImportError[];
}): Promise<ExecutionResult> {
  const { db, mode, deleteStatement, entries, errors } = params;

  if (mode === 'substituir') {
    if (errors.length > 0) {
      return { inserted: 0, updated: 0, deleted: 0, blocked: true, transactionFailed: false };
    }

    try {
      const results = await db.batch([
        deleteStatement as D1PreparedStatement,
        ...entries.map((entry) => entry.statement),
      ]);
      const totals = countActions(entries);
      return {
        ...totals,
        deleted: Number(results[0]?.meta?.changes || 0),
        blocked: false,
        transactionFailed: false,
      };
    } catch (error) {
      errors.push({
        linha: 0,
        erro: `Importação não aplicada; toda a substituição foi revertida: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return { inserted: 0, updated: 0, deleted: 0, blocked: false, transactionFailed: true };
    }
  }

  let inserted = 0;
  let updated = 0;
  for (let offset = 0; offset < entries.length; offset += WRITE_BATCH_SIZE) {
    const chunk = entries.slice(offset, offset + WRITE_BATCH_SIZE);
    try {
      await db.batch(chunk.map((entry) => entry.statement));
      const totals = countActions(chunk);
      inserted += totals.inserted;
      updated += totals.updated;
    } catch {
      // D1 reverte o batch que falhou. Reexecutar individualmente identifica a linha real.
      for (const entry of chunk) {
        try {
          await entry.statement.run();
          if (entry.action === 'inserted') inserted += 1;
          else updated += 1;
        } catch (error) {
          errors.push({
            linha: entry.linha,
            erro: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  return { inserted, updated, deleted: 0, blocked: false, transactionFailed: false };
}

function responseStatus(execution: ExecutionResult): 200 | 422 | 500 {
  if (execution.blocked) return 422;
  if (execution.transactionFailed) return 500;
  return 200;
}

app.post('/funcionarios', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const formData = await c.req.formData();
    const fileEntry: unknown = formData.get('file');
    const mode = String(formData.get('mode') || 'completar');
    if (!isUploadedFile(fileEntry)) {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    const rows = await parseXLSXFile(await fileEntry.arrayBuffer());
    const requestError = validateRequest(mode, rows);
    if (requestError) return c.json({ success: false, error: requestError }, 400);

    const db = c.env.DB;
    const empresaId = getTenantContext(c).empresaId;
    const errors: ImportError[] = [];

    const modelos = await db
      .prepare(
        `SELECT id, modelo, codigo, nome FROM modelos_aeronave
         WHERE deleted_at IS NULL AND empresa_id = ?`,
      )
      .bind(empresaId)
      .all<{ id: number; modelo: string | null; codigo: string | null; nome: string | null }>();
    const modeloMap = new Map<string, number>();
    for (const modelo of modelos.results || []) {
      if (modelo.modelo) modeloMap.set(modelo.modelo.toLowerCase(), modelo.id);
      if (modelo.codigo) modeloMap.set(modelo.codigo.toLowerCase(), modelo.id);
      if (modelo.nome) modeloMap.set(modelo.nome.toLowerCase(), modelo.id);
    }

    const cpfs = rows.map((row) => normalizeCpf(row.CPF)).filter(Boolean);
    const duplicateCpfs = new Set<string>();
    const seenCpfs = new Set<string>();
    for (const cpf of cpfs) {
      if (seenCpfs.has(cpf)) duplicateCpfs.add(cpf);
      seenCpfs.add(cpf);
    }

    const existentesByCpf = new Map<string, string>();
    const uniqueCpfs = [...new Set(cpfs)];
    for (let offset = 0; offset < uniqueCpfs.length; offset += LOOKUP_BIND_CHUNK) {
      const chunk = uniqueCpfs.slice(offset, offset + LOOKUP_BIND_CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      const existentes = await db
        .prepare(
          `SELECT id, cpf FROM funcionarios
           WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') IN (${placeholders})
             AND empresa_id = ?`,
        )
        .bind(...chunk, empresaId)
        .all<{ id: string; cpf: string }>();
      for (const row of existentes.results || [])
        existentesByCpf.set(normalizeCpf(row.cpf), row.id);
    }

    const entries: StatementEntry[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const linha = index + 2;
      const nome = String(row.Nome || '').trim();
      const cpf = normalizeCpf(row.CPF);
      if (!nome || !cpf) {
        errors.push({ linha, erro: 'Nome e CPF são obrigatórios', dados: row });
        continue;
      }
      if (!isValidCpf(cpf)) {
        errors.push({ linha, erro: `CPF inválido: ${String(row.CPF || '')}`, dados: row });
        continue;
      }
      if (duplicateCpfs.has(cpf)) {
        errors.push({ linha, erro: `CPF duplicado na planilha: ${cpf}`, dados: row });
        continue;
      }

      const aeronaveKey = String(row.Aeronave || '')
        .trim()
        .toLowerCase();
      const modeloAeronaveId = aeronaveKey ? (modeloMap.get(aeronaveKey) ?? null) : null;
      const existenteId = existentesByCpf.get(cpf);
      if (existenteId) {
        entries.push({
          linha,
          action: 'updated',
          statement: db
            .prepare(
              `UPDATE funcionarios SET
                 nome = ?, cpf = ?, matricula = ?, email = ?, telefone = ?, nascimento = ?, admissao = ?,
                 cargo = ?, funcao = ?, modelo_aeronave_id = ?, codigo_anac = ?, licenca = ?,
                 is_instrutor = ?, is_examinador = ?, ativo = ?, deleted_at = NULL,
                 updated_at = datetime('now')
               WHERE id = ? AND empresa_id = ?`,
            )
            .bind(
              nome,
              cpf,
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
              empresaId,
            ),
        });
      } else {
        entries.push({
          linha,
          action: 'inserted',
          statement: db
            .prepare(
              `INSERT INTO funcionarios (
                 nome, cpf, matricula, email, telefone, nascimento, admissao,
                 cargo, funcao, modelo_aeronave_id, codigo_anac, licenca,
                 is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            )
            .bind(
              nome,
              cpf,
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
              empresaId,
            ),
        });
      }
    }

    const execution = await executeStatements({
      db,
      mode,
      deleteStatement:
        mode === 'substituir'
          ? db
              .prepare(
                `UPDATE funcionarios SET deleted_at = datetime('now')
                 WHERE deleted_at IS NULL AND empresa_id = ?`,
              )
              .bind(empresaId)
          : null,
      entries,
      errors,
    });
    const result: ImportResult = {
      success: errors.length === 0,
      mode,
      totalRows: rows.length,
      inserted: execution.inserted,
      updated: execution.updated,
      deleted: mode === 'substituir' ? execution.deleted : undefined,
      errors,
    };
    return c.json(result, responseStatus(execution));
  } catch (error) {
    createLogger(c, 'ImportacaoXlsxRoutes').error(
      'Erro na importacao XLSX de funcionarios',
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/historico', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const formData = await c.req.formData();
    const fileEntry: unknown = formData.get('file');
    const mode = String(formData.get('mode') || 'completar');
    if (!isUploadedFile(fileEntry)) {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    const rows = await parseXLSXFile(await fileEntry.arrayBuffer());
    const requestError = validateRequest(mode, rows);
    if (requestError) return c.json({ success: false, error: requestError }, 400);

    const db = c.env.DB;
    const empresaId = getTenantContext(c).empresaId;
    const errors: ImportError[] = [];

    const funcionarios = await db
      .prepare(
        `SELECT id, nome FROM funcionarios
         WHERE deleted_at IS NULL AND empresa_id = ?`,
      )
      .bind(empresaId)
      .all<{ id: string; nome: string }>();
    const funcionarioByNome = new Map(
      (funcionarios.results || []).map((row) => [row.nome.trim().toLowerCase(), row.id]),
    );

    const tipos = await db
      .prepare(
        `SELECT id, nome FROM qualificacoes_tipos
         WHERE deleted_at IS NULL AND empresa_id = ?`,
      )
      .bind(empresaId)
      .all<{ id: string; nome: string }>();
    const tipoByNome = new Map(
      (tipos.results || []).map((row) => [row.nome.trim().toLowerCase(), row.id]),
    );

    const entries: StatementEntry[] = [];
    const seenKeys = new Set<string>();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const linha = index + 2;
      const funcionarioNome = String(row['Funcionário'] || '').trim();
      const qualificacaoNome = String(row['Qualificação'] || '').trim();
      if (!funcionarioNome || !qualificacaoNome) {
        errors.push({ linha, erro: 'Funcionário e Qualificação são obrigatórios', dados: row });
        continue;
      }

      const funcionarioId = funcionarioByNome.get(funcionarioNome.toLowerCase());
      if (!funcionarioId) {
        errors.push({ linha, erro: `Funcionário não encontrado: ${funcionarioNome}`, dados: row });
        continue;
      }
      const tipoId = tipoByNome.get(qualificacaoNome.toLowerCase());
      if (!tipoId) {
        errors.push({
          linha,
          erro: `Tipo de qualificação não encontrado: ${qualificacaoNome}`,
          dados: row,
        });
        continue;
      }

      const dataConclusao = String(row['Data Conclusão'] || '').trim();
      const uniqueKey = `${funcionarioId}:${tipoId}:${dataConclusao}`;
      if (seenKeys.has(uniqueKey)) {
        errors.push({ linha, erro: 'Registro duplicado na planilha', dados: row });
        continue;
      }
      seenKeys.add(uniqueKey);

      entries.push({
        linha,
        action: 'inserted',
        statement: db
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
               deleted_at = NULL,
               updated_at = datetime('now')`,
          )
          .bind(
            funcionarioId,
            tipoId,
            row['Código'] || null,
            row.Categoria || null,
            dataConclusao || null,
            row['Data Vencimento'] || null,
            row.Instrutor || null,
            row['Observações'] || null,
            empresaId,
          ),
      });
    }

    const execution = await executeStatements({
      db,
      mode,
      deleteStatement:
        mode === 'substituir'
          ? db
              .prepare(
                `UPDATE qualificacoes_historico SET deleted_at = datetime('now')
                 WHERE deleted_at IS NULL AND empresa_id = ?`,
              )
              .bind(empresaId)
          : null,
      entries,
      errors,
    });
    const result: ImportResult = {
      success: errors.length === 0,
      mode,
      totalRows: rows.length,
      inserted: execution.inserted,
      updated: execution.updated,
      deleted: mode === 'substituir' ? execution.deleted : undefined,
      errors,
    };
    return c.json(result, responseStatus(execution));
  } catch (error) {
    createLogger(c, 'ImportacaoXlsxRoutes').error(
      'Erro na importacao XLSX de historico',
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/tipos', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const formData = await c.req.formData();
    const fileEntry: unknown = formData.get('file');
    const mode = String(formData.get('mode') || 'completar');
    if (!isUploadedFile(fileEntry)) {
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    }

    const rows = await parseXLSXFile(await fileEntry.arrayBuffer());
    const requestError = validateRequest(mode, rows);
    if (requestError) return c.json({ success: false, error: requestError }, 400);

    const db = c.env.DB;
    const empresaId = getTenantContext(c).empresaId;
    const errors: ImportError[] = [];
    const existentes = await db
      .prepare(`SELECT id, codigo FROM qualificacoes_tipos WHERE empresa_id = ?`)
      .bind(empresaId)
      .all<{ id: string; codigo: string }>();
    const existentesByCodigo = new Map(
      (existentes.results || []).map((row) => [String(row.codigo), row.id]),
    );

    const entries: StatementEntry[] = [];
    const seenCodes = new Set<string>();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const linha = index + 2;
      const nome = String(row.Nome || '').trim();
      const codigo = String(row['Código'] || '').trim();
      if (!nome || !codigo) {
        errors.push({ linha, erro: 'Nome e Código são obrigatórios', dados: row });
        continue;
      }
      if (seenCodes.has(codigo)) {
        errors.push({ linha, erro: `Código duplicado na planilha: ${codigo}`, dados: row });
        continue;
      }
      seenCodes.add(codigo);

      const existenteId = existentesByCodigo.get(codigo);
      if (existenteId) {
        entries.push({
          linha,
          action: 'updated',
          statement: db
            .prepare(
              `UPDATE qualificacoes_tipos SET
                 tipo = ?, nome = ?, descricao = ?, categoria = ?, carga_horaria = ?,
                 validade = ?, observacoes = ?, ativo = ?, deleted_at = NULL,
                 updated_at = datetime('now')
               WHERE id = ? AND empresa_id = ?`,
            )
            .bind(
              row.Tipo || null,
              nome,
              row['Descrição'] || null,
              row.Categoria || null,
              row['Carga Horária'] || null,
              row['Validade (meses)'] || null,
              row['Observações'] || null,
              row.Ativo === 'Sim' ? 1 : 0,
              existenteId,
              empresaId,
            ),
        });
      } else {
        entries.push({
          linha,
          action: 'inserted',
          statement: db
            .prepare(
              `INSERT INTO qualificacoes_tipos (
                 tipo, codigo, nome, descricao, categoria, carga_horaria,
                 validade, observacoes, ativo, empresa_id, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            )
            .bind(
              row.Tipo || null,
              codigo,
              nome,
              row['Descrição'] || null,
              row.Categoria || null,
              row['Carga Horária'] || null,
              row['Validade (meses)'] || null,
              row['Observações'] || null,
              row.Ativo === 'Sim' ? 1 : 0,
              empresaId,
            ),
        });
      }
    }

    const execution = await executeStatements({
      db,
      mode,
      deleteStatement:
        mode === 'substituir'
          ? db
              .prepare(
                `UPDATE qualificacoes_tipos SET deleted_at = datetime('now')
                 WHERE deleted_at IS NULL AND empresa_id = ?`,
              )
              .bind(empresaId)
          : null,
      entries,
      errors,
    });
    const result: ImportResult = {
      success: errors.length === 0,
      mode,
      totalRows: rows.length,
      inserted: execution.inserted,
      updated: execution.updated,
      deleted: mode === 'substituir' ? execution.deleted : undefined,
      errors,
    };
    return c.json(result, responseStatus(execution));
  } catch (error) {
    createLogger(c, 'ImportacaoXlsxRoutes').error(
      'Erro na importacao XLSX de tipos',
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
