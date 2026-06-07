// ETL Import Script (staging -> principal)
// Executar via: wrangler d1 execute airtrust-db --command "..." ou adaptar para runtime Worker.
// Para uso local Node (ts-node), ajustar acesso ao SQLite se necessário.

import {
  FuncionarioStagingSchema,
  QualificacaoStagingSchema,
  validateBatch,
} from '../schemas/importSchemas';
import { z } from 'zod';

/**
 * Generic interface for DB execution (D1 subset). We assume a binding provides .prepare().
 */
interface D1ResultRow {
  [key: string]: unknown;
}

interface D1PreparedStatement {
  bind: (...args: unknown[]) => D1PreparedStatement;
  all: () => Promise<{ results: D1ResultRow[] }>;
  run: () => Promise<{ success: boolean; meta?: { last_row_id?: number } }>;
  first: () => Promise<D1ResultRow | null>;
}

interface D1Like {
  prepare: (q: string) => D1PreparedStatement;
}

interface ImportOptions {
  db: D1Like;
  empresaId: number;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

const logDefault = (m: string) => console.log(`[IMPORT] ${m}`);

// Dedup helpers
function assertEmpresaId(empresaId: number): number {
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('TENANT_CONTEXT_REQUIRED');
  }
  return empresaId;
}

async function mapFuncionarioMatriculas(
  db: D1Like,
  empresaId: number,
): Promise<Record<string, number>> {
  const { results } = await db
    .prepare('SELECT id, matricula FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL')
    .bind(empresaId)
    .all();
  const map: Record<string, number> = {};
  results.forEach((r) => {
    const matricula = r.matricula as string | undefined;
    const id = r.id as number | undefined;
    if (matricula && id) map[matricula.toUpperCase()] = id;
  });
  return map;
}

async function mapQualificacaoCodigos(
  db: D1Like,
  empresaId: number,
): Promise<Record<string, number>> {
  const { results } = await db
    .prepare('SELECT id, codigo FROM qualificacoes_tipos WHERE empresa_id = ? AND deleted_at IS NULL')
    .bind(empresaId)
    .all();
  const map: Record<string, number> = {};
  results.forEach((r) => {
    const codigo = r.codigo as string | undefined;
    const id = r.id as number | undefined;
    if (codigo && id) map[codigo.toUpperCase()] = id;
  });
  return map;
}

// Insert funcionario
async function insertFuncionario(
  db: D1Like,
  row: z.infer<typeof FuncionarioStagingSchema>,
  empresaId: number,
): Promise<number> {
  const stmt =
    db.prepare(`INSERT INTO funcionarios (nome, guerra, cpf, matricula, email, telefone, funcao, cargo, setor, codigo_anac, status, ativo, empresa_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`);
  const res = await stmt
    .bind(
      row.nome,
      row.guerra ?? null,
      row.cpf,
      row.matricula,
      row.email,
      row.telefone ?? null,
      row.funcao ?? null,
      row.cargo ?? null,
      row.setor ?? null,
      row.codigo_anac ?? null,
      row.status,
      empresaId,
    )
    .run();
  // D1 run() returns { success, meta } -> meta.last_row_id
  return res.meta?.last_row_id ?? 0;
}

// Insert qualificacao historico
interface EnrichedHistoricoRow {
  funcionario_id: number;
  qualificacao_id: number;
  empresa_id: number;
  data_conclusao: string | null;
  data_vencimento: string | null;
  validade_meses: number | null;
  codigo: string;
  categoria: string | null;
  numero_certificado: string | null;
  observacoes: string | null;
  arquivo_url?: string | null;
  nota?: number | null;
  instrutor?: string | null;
  local?: string | null;
  modalidade?: string | null;
  carga_horaria?: number | null;
}

async function insertQualificacaoHistorico(
  db: D1Like,
  enriched: EnrichedHistoricoRow,
): Promise<number> {
  const stmt =
    db.prepare(`INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, empresa_id, data_conclusao, data_vencimento, validade_meses, codigo, categoria, numero_certificado, observacoes, arquivo_url, nota, instrutor, carga_horaria, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDA', datetime('now'), datetime('now'))`);
  const res = await stmt
    .bind(
      enriched.funcionario_id,
      enriched.qualificacao_id,
      enriched.empresa_id,
      enriched.data_conclusao ?? null,
      enriched.data_vencimento ?? null,
      enriched.validade_meses ?? null,
      enriched.codigo,
      enriched.categoria ?? null,
      enriched.numero_certificado ?? null,
      enriched.observacoes ?? null,
      enriched.arquivo_url ?? null,
      enriched.nota ?? null,
      enriched.instrutor ?? null,
      enriched.carga_horaria ?? null,
    )
    .run();
  return res.meta?.last_row_id ?? 0;
}

export async function importFuncionarios({
  db,
  empresaId: rawEmpresaId,
  dryRun = false,
  log = logDefault,
}: ImportOptions) {
  const empresaId = assertEmpresaId(rawEmpresaId);
  log('Iniciando import de funcionarios staging');
  const { results } = await db
    .prepare('SELECT * FROM import_funcionarios_staging WHERE imported = 0')
    .all();
  if (!results.length) {
    log('Nenhum registro para importar');
    return;
  }
  const { valid, errors } = validateBatch(FuncionarioStagingSchema, results);
  if (errors.length) log(`Erros de validação: ${errors.length}`);

  const matriculaMap = await mapFuncionarioMatriculas(db, empresaId);

  let imported = 0;
  for (const raw of valid) {
    const row = raw as z.infer<typeof FuncionarioStagingSchema> & { id?: number };
    if (matriculaMap[row.matricula]) {
      // Dedup: já existe -> marcar como imported sem inserir (ou poderia atualizar)
      if (!dryRun && row.id)
        await db
          .prepare(
            'UPDATE import_funcionarios_staging SET imported=1, validation_errors=? WHERE id=?',
          )
          .bind(JSON.stringify(['DUPLICATE_MATRICULA']), row.id)
          .run();
      continue;
    }
    if (!dryRun) {
      const newId = await insertFuncionario(db, row, empresaId);
      if (row.id)
        await db
          .prepare('UPDATE import_funcionarios_staging SET imported=1 WHERE id=?')
          .bind(row.id)
          .run();
      matriculaMap[row.matricula] = newId;
      imported++;
    }
  }
  log(`Funcionarios importados: ${imported}`);
}

export async function importQualificacoes({
  db,
  empresaId: rawEmpresaId,
  dryRun = false,
  log = logDefault,
}: ImportOptions) {
  const empresaId = assertEmpresaId(rawEmpresaId);
  log('Iniciando import de qualificacoes staging');
  const { results } = await db
    .prepare('SELECT * FROM import_qualificacoes_staging WHERE imported = 0')
    .all();
  if (!results.length) {
    log('Nenhum registro para importar');
    return;
  }
  const { valid, errors } = validateBatch(QualificacaoStagingSchema, results);
  if (errors.length) log(`Erros de validação: ${errors.length}`);

  const matriculaMap = await mapFuncionarioMatriculas(db, empresaId);
  const qualMap = await mapQualificacaoCodigos(db, empresaId);

  let imported = 0;
  for (const raw of valid) {
    const row = raw as z.infer<typeof QualificacaoStagingSchema> & { id?: number };
    const funcId = matriculaMap[row.funcionario_matricula];
    const qualId = qualMap[row.qualificacao_codigo];
    if (!funcId || !qualId) {
      // registro inválido (referência ausente)
      if (!dryRun && row.id)
        await db
          .prepare(
            'UPDATE import_qualificacoes_staging SET validation_errors=?, imported=0 WHERE id=?',
          )
          .bind(JSON.stringify(['REF_NOT_FOUND']), row.id)
          .run();
      continue;
    }
    const enriched: EnrichedHistoricoRow = {
      funcionario_id: funcId,
      qualificacao_id: qualId,
      empresa_id: empresaId,
      data_conclusao: row.data_conclusao ?? null,
      data_vencimento: row.data_vencimento ?? null,
      validade_meses: row.validade_meses ?? null,
      codigo: row.qualificacao_codigo,
      categoria: row.categoria ?? null,
      numero_certificado: row.numero_certificado ?? null,
      observacoes: null,
    };
    if (!dryRun) {
      await insertQualificacaoHistorico(db, enriched);
      if (row.id)
        await db
          .prepare('UPDATE import_qualificacoes_staging SET imported=1 WHERE id=?')
          .bind(row.id)
          .run();
      imported++;
    }
  }
  log(`Qualificacoes importadas: ${imported}`);
}

// Orquestrador
export async function runFullImport(db: D1Like, opts: { empresaId: number; dryRun?: boolean }) {
  const dryRun = opts?.dryRun ?? false;
  const empresaId = assertEmpresaId(opts.empresaId);
  await importFuncionarios({ db, empresaId, dryRun });
  await importQualificacoes({ db, empresaId, dryRun });
  return 'IMPORT_COMPLETO';
}
