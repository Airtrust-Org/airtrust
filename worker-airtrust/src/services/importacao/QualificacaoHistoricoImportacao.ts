/**
 * QUALIFICACAO HISTORICO IMPORTACAO - SIMPLIFICADO
 *
 * APENAS 3 CAMPOS OBRIGATÓRIOS:
 * - funcionario_cpf (FK)
 * - qualificacao_codigo (FK)
 * - data_conclusao
 *
 * TODOS OS OUTROS DADOS SÃO CALCULADOS AUTOMATICAMENTE:
 * - data_vencimento: calculado via qualificacao.validade + vencimento_fim_mes
 * - funcionario_nome: via JOIN com funcionarios
 * - qualificacao_nome: via JOIN com qualificacoes_tipos
 * - carga_horaria: via JOIN com qualificacoes_tipos
 * - categoria: via JOIN com qualificacoes_tipos
 *
 * INTEGRAÇÃO ATIVA: Quando funcionários ou tipos são atualizados,
 * os dados refletidos automaticamente via JOINs
 */

import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import { QUALIFICACOES_HISTORICO_COLUMNS, normalizeCode, normalizeCPF } from './columnMappings';
import { validateQualificacaoHistoricoRow, type ValidationError } from './validators';
import { calcularDataVencimento } from '../../utils/qualificacoes-expiration';

// ===== SCHEMA SIMPLIFICADO (3 campos APENAS) =====

export const QualificacaoHistoricoImportSchema = z.object({
  funcionario_cpf: z.string().min(11, 'CPF do funcionário obrigatório'),
  qualificacao_codigo: z.string().min(1, 'Código da qualificação obrigatório'),
  data_conclusao: z.string().min(10, 'Data de conclusão obrigatória'), // ISO date YYYY-MM-DD
});

export type QualificacaoHistoricoImportData = z.infer<typeof QualificacaoHistoricoImportSchema>;

// ===== RESULT TYPES =====

export interface ImportResult {
  success: boolean;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: ValidationError[];
}

// ===== SERVICE =====

export class QualificacaoHistoricoImportacaoService {
  constructor(
    private db: D1Database,
    private empresaId?: number,
  ) {}

  private resolveEmpresaId(empresaIdOverride?: number): number {
    const empresaId = Number(empresaIdOverride ?? this.empresaId);
    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }
    return empresaId;
  }

  /**
   * Valida batch completo sem inserir (COM FK CHECKS OTIMIZADOS!)
   * Funcionários precisam existir no tenant. Tipos ausentes continuam elegíveis ao fluxo
   * legado de criação automática, mas CPFs desconhecidos são rejeitados com erro de linha.
   */
  async validate(
    rows: Record<string, unknown>[],
    empresaIdOverride?: number,
  ): Promise<ValidationError[]> {
    const empresaId = this.resolveEmpresaId(empresaIdOverride);
    const errors: ValidationError[] = [];

    // OTIMIZAÇÃO: Fetch único de todos os funcionários e qualificações válidos
    const allCPFs = Array.from(
      new Set(
        rows
          .map((r) => normalizeCPF(r.funcionario_cpf))
          .filter((cpf): cpf is string => Boolean(cpf)),
      ),
    );
    const allCodigos = Array.from(
      new Set(
        rows
          .map((r) => normalizeCode(r.qualificacao_codigo))
          .filter((cod): cod is string => Boolean(cod)),
      ),
    );

    // Fetch funcionários em BATCHES para não exceder 999 variáveis
    const validCPFs = new Set<string>();
    if (allCPFs.length > 0) {
      const VALIDATE_CPF_BATCH = 100; // 100 CPFs = 100 variáveis (seguro)
      for (let i = 0; i < allCPFs.length; i += VALIDATE_CPF_BATCH) {
        const batch = allCPFs.slice(i, i + VALIDATE_CPF_BATCH);
        const placeholders = batch.map(() => '?').join(',');

        const validCPFsResult = await this.db
          .prepare(
            `SELECT cpf FROM funcionarios WHERE cpf IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL`,
          )
          .bind(...batch, empresaId)
          .all<{ cpf: string }>();

        // Adicionar ao Set usando CPF normalizado como chave
        (validCPFsResult.results || []).forEach((f) => {
          validCPFs.add(normalizeCPF(f.cpf) || f.cpf);
        });
      }
    }

    // Fetch qualificações em BATCHES para não exceder 999 variáveis
    const validCodigos = new Set<string>();
    if (allCodigos.length > 0) {
      const VALIDATE_COD_BATCH = 100; // 100 códigos = 100 variáveis (seguro)
      for (let i = 0; i < allCodigos.length; i += VALIDATE_COD_BATCH) {
        const batch = allCodigos.slice(i, i + VALIDATE_COD_BATCH);
        const placeholders = batch.map(() => '?').join(',');
        const codigosUpper = batch.map((c) => c.toUpperCase());

        const validCodigosResult = await this.db
          .prepare(
            `SELECT UPPER(codigo) as codigo FROM qualificacoes_tipos WHERE UPPER(codigo) IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL`,
          )
          .bind(...codigosUpper, empresaId)
          .all<{ codigo: string }>();

        (validCodigosResult.results || []).forEach((q) => validCodigos.add(q.codigo.toUpperCase()));
      }
    }

    // Tipos ausentes podem ser criados pelo fluxo legado; funcionários nunca são criados
    // implicitamente, pois um CPF digitado errado não pode virar uma pessoa fantasma.
    const codigosAceitos = new Set([
      ...validCodigos,
      ...allCodigos.map((codigo) => codigo.toUpperCase()),
    ]);
    for (let i = 0; i < rows.length; i++) {
      const rowErrors = await validateQualificacaoHistoricoRow(
        rows[i],
        i + 2,
        this.db,
        validCPFs,
        codigosAceitos,
        false,
      );
      errors.push(...rowErrors);
    }

    return errors;
  }

  /**
   * Importa histórico com validação COMPLETA de FKs e cálculo automático
   * Calcula data_vencimento automaticamente com base no tipo de qualificação
   * Rejeita funcionários inexistentes e cria tipos ausentes conforme compatibilidade legada.
   */
  async import(
    rows: Record<string, unknown>[],
    mode: 'INSERT' | 'UPSERT' = 'INSERT',
    empresaIdOverride?: number,
  ): Promise<ImportResult> {
    const empresaId = this.resolveEmpresaId(empresaIdOverride);
    const result: ImportResult = {
      success: false,
      totalRows: rows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // 1. CRÍTICO: Validar todos antes de inserir (especialmente FKs)
    const validationErrors = await this.validate(rows, empresaId);
    if (validationErrors.length > 0) {
      result.errors = validationErrors;
      return result;
    }

    // ===== OTIMIZAÇÃO: LOOKUPS E CRIAÇÃO LEGADA DE TIPOS =====

    // Extrair todos CPFs e códigos únicos
    const allCPFs = Array.from(
      new Set(
        rows
          .map((r) => normalizeCPF(r.funcionario_cpf))
          .filter((cpf): cpf is string => Boolean(cpf)),
      ),
    );
    const allCodigos = Array.from(
      new Set(
        rows
          .map((r) => normalizeCode(r.qualificacao_codigo))
          .filter((cod): cod is string => Boolean(cod)),
      ),
    );

    // Buscar tipos existentes em BATCHES para não exceder 999 variáveis
    const existingCodigos = new Set<string>();
    if (allCodigos.length > 0) {
      const COD_BATCH = 100; // 100 códigos = 100 variáveis (seguro)
      for (let i = 0; i < allCodigos.length; i += COD_BATCH) {
        const batch = allCodigos.slice(i, i + COD_BATCH);
        const placeholders = batch.map(() => '?').join(',');
        const codigosUpper = batch.map((c) => c.toUpperCase());

        const existing = await this.db
          .prepare(
            `SELECT UPPER(codigo) as codigo FROM qualificacoes_tipos WHERE UPPER(codigo) IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL`,
          )
          .bind(...codigosUpper, empresaId)
          .all<{ codigo: string }>();

        (existing.results || []).forEach((q) => existingCodigos.add(q.codigo.toUpperCase()));
      }
      console.log(
        `[AUTO-CREATE] Tipos existentes: ${existingCodigos.size} de ${allCodigos.length}`,
      );
    }

    // Criar tipos que não existem (BATCH INSERT)
    const codigosToCreate = allCodigos.filter((cod) => !existingCodigos.has(cod.toUpperCase()));
    if (codigosToCreate.length > 0) {
      console.log(`[AUTO-CREATE] Criando ${codigosToCreate.length} tipos em batch...`);
      const TIPO_BATCH = 50; // Lotes de 50
      for (let i = 0; i < codigosToCreate.length; i += TIPO_BATCH) {
        const batch = codigosToCreate.slice(i, i + TIPO_BATCH);
        const placeholders = batch
          .map(() => '(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
          .join(',');
        const values: unknown[] = [];
        batch.forEach((codigo) => {
          values.push(codigo, `Qualificação ${codigo}`, 'OUTROS', null, 0, empresaId);
        });

        try {
          await this.db
            .prepare(
              `INSERT INTO qualificacoes_tipos (codigo, nome, categoria, validade, vencimento_fim_mes, empresa_id, created_at, updated_at)
               VALUES ${placeholders}`,
            )
            .bind(...values)
            .run();
          console.log(
            `[AUTO-CREATE] Lote ${Math.floor(i / TIPO_BATCH) + 1}: ${batch.length} tipos criados`,
          );
        } catch (error) {
          console.warn(`[AUTO-CREATE] Erro ao criar lote de tipos:`, error);
        }
      }
    }

    // ===== FIM DA CRIAÇÃO LEGADA DE TIPOS =====

    // Revalidar CPFs existentes no tenant após auto-create para evitar inserção cross-tenant
    const tenantCPFs = new Set<string>();
    if (allCPFs.length > 0) {
      const CPF_BATCH = 100;
      for (let i = 0; i < allCPFs.length; i += CPF_BATCH) {
        const batch = allCPFs.slice(i, i + CPF_BATCH);
        const placeholders = batch.map(() => '?').join(',');
        const existentes = await this.db
          .prepare(
            `SELECT cpf FROM funcionarios WHERE cpf IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL`,
          )
          .bind(...batch, empresaId)
          .all<{ cpf: string }>();
        (existentes.results || []).forEach((item) => {
          const normalized = normalizeCPF(item.cpf);
          if (normalized) tenantCPFs.add(normalized);
        });
      }
    }

    // Buscar TODOS os tipos de qualificação em BATCHES para não exceder 999 variáveis
    const tiposMap = new Map<
      string,
      { id: number; validade: number | null; vencimento_fim_mes: number }
    >();
    if (allCodigos.length > 0) {
      const TIPOS_BATCH = 100; // 100 códigos = 100 variáveis (seguro)
      for (let i = 0; i < allCodigos.length; i += TIPOS_BATCH) {
        const batch = allCodigos.slice(i, i + TIPOS_BATCH);
        const placeholders = batch.map(() => '?').join(',');
        const codigosUpper = batch.map((c) => c.toUpperCase());

        const tipos = await this.db
          .prepare(
            `
            SELECT id, UPPER(codigo) as codigo, validade, vencimento_fim_mes 
            FROM qualificacoes_tipos 
            WHERE UPPER(codigo) IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL
          `,
          )
          .bind(...codigosUpper, empresaId)
          .all<{
            id: number;
            codigo: string;
            validade: number | null;
            vencimento_fim_mes: number;
          }>();

        (tipos.results || []).forEach((t) => {
          tiposMap.set(t.codigo.toUpperCase(), {
            id: t.id,
            validade: t.validade,
            vencimento_fim_mes: t.vencimento_fim_mes,
          });
        });
      }
    }

    // Se modo UPSERT, buscar TODOS os registros existentes de uma vez
    const existingRecordsMap = new Map<string, number>(); // key: "cpf|codigo|data" -> id
    if (mode === 'UPSERT') {
      // Criar lista de todas as combinações para buscar
      const combinations: Array<{ cpf: string; codigo: string; data: string }> = [];
      for (const row of rows) {
        const cpf = normalizeCPF(row.funcionario_cpf);
        const codigo = normalizeCode(row.qualificacao_codigo);
        if (cpf && codigo && row.data_conclusao) {
          combinations.push({ cpf, codigo, data: String(row.data_conclusao) });
        }
      }

      // Buscar em batches de 50 para não exceder limites
      const batchSize = 50;
      for (let i = 0; i < combinations.length; i += batchSize) {
        const batch = combinations.slice(i, i + batchSize);

        // Construir query dinâmica com OR conditions
        const conditions = batch
          .map(
            () =>
              '(funcionario_cpf = ? AND UPPER(qualificacao_codigo) = UPPER(?) AND data_conclusao = ?)',
          )
          .join(' OR ');

        const bindings: unknown[] = [];
        batch.forEach((c) => {
          bindings.push(c.cpf, c.codigo, c.data);
        });

        const existing = await this.db
          .prepare(
            `
            SELECT id, funcionario_cpf, UPPER(qualificacao_codigo) as qualificacao_codigo, data_conclusao
            FROM qualificacoes_historico 
            WHERE (${conditions}) AND empresa_id = ? AND deleted_at IS NULL
          `,
          )
          .bind(...bindings, empresaId)
          .all<{
            id: number;
            funcionario_cpf: string;
            qualificacao_codigo: string;
            data_conclusao: string;
          }>();

        (existing.results || []).forEach((rec) => {
          const key = `${normalizeCPF(rec.funcionario_cpf)}|${rec.qualificacao_codigo}|${
            rec.data_conclusao
          }`;
          existingRecordsMap.set(key, rec.id);
        });
      }

      console.log(
        `[UPSERT] Encontrados ${existingRecordsMap.size} registros existentes para atualizar`,
      );
    }

    // 2. Preparar dados para INSERT e UPDATE em lotes (evitar limite de variáveis do SQLite)
    type RowPrepared = {
      cpf: string;
      codigo: string;
      qualificacaoId: number;
      data_conclusao: string;
      data_vencimento: string | null;
      existingId?: number;
      line: number; // linha original (para erros)
    };

    const prepared: RowPrepared[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cpf = normalizeCPF(row.funcionario_cpf);
      const codigo = normalizeCode(row.qualificacao_codigo);

      if (!cpf || !codigo) {
        result.errors.push({
          line: i + 2,
          field: 'geral',
          message: 'CPF ou código inválido',
        });
        continue;
      }

      if (!tenantCPFs.has(cpf)) {
        result.errors.push({
          line: i + 2,
          field: 'funcionario_cpf',
          message: `Funcionário CPF ${cpf} não encontrado para a empresa ${empresaId}`,
        });
        continue;
      }

      // Buscar tipo no Map (sem query)
      const tipoQualificacao = tiposMap.get(codigo.toUpperCase());
      if (!tipoQualificacao?.id) {
        result.errors.push({
          line: i + 2,
          field: 'qualificacao_codigo',
          message: `Qualificação não encontrada para o código ${codigo}`,
        });
        continue;
      }

      // Calcular data_vencimento
      let dataVencimento: string | null = null;
      if (tipoQualificacao?.validade) {
        dataVencimento = calcularDataVencimento(
          String(row.data_conclusao),
          tipoQualificacao.validade,
          1,
        );
      }

      const key = `${cpf}|${codigo.toUpperCase()}|${rows[i].data_conclusao}`;
      const existingId = mode === 'UPSERT' ? existingRecordsMap.get(key) : undefined;

      prepared.push({
        cpf,
        codigo,
        qualificacaoId: tipoQualificacao.id,
        data_conclusao: String(rows[i].data_conclusao),
        data_vencimento: dataVencimento,
        existingId,
        line: i + 2,
      });
    }

    const toUpdate = prepared.filter((p) => mode === 'UPSERT' && p.existingId);
    const toInsert = prepared.filter((p) => !(mode === 'UPSERT' && p.existingId));

    const BATCH_SIZE = 50; // 50 * 5 campos = 250 variáveis (seguro abaixo de 999)

    // 2a. Executar INSERTs em lotes
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;

      console.log(
        `🔍 [QualificacaoHistoricoImportacao] Tentando inserir batch de ${batch.length} rows (total: ${toInsert.length})`,
      );

      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
      const values: unknown[] = [];
      batch.forEach((r) => {
        values.push(
          r.cpf,
          r.codigo,
          r.qualificacaoId,
          r.data_conclusao,
          r.data_vencimento,
          empresaId,
        );
      });

      console.log(
        `🔍 [QualificacaoHistoricoImportacao] Placeholders: ${batch.length} rows × 5 campos = ${values.length} variáveis`,
      );

      try {
        await this.db
          .prepare(
            `
            INSERT INTO qualificacoes_historico (
              funcionario_cpf,
              qualificacao_codigo,
              qualificacao_id,
              data_conclusao,
              data_vencimento,
              empresa_id
            ) VALUES ${placeholders}
          `,
          )
          .bind(...values)
          .run();

        result.inserted += batch.length;
      } catch (error) {
        // Em caso de erro no lote, registrar erros por linha
        const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
        batch.forEach((r) => {
          result.errors.push({ line: r.line, field: 'geral', message: errMsg });
        });
      }
    }

    // 2b. Executar UPDATEs (UPSERT) em lotes usando CASE WHEN ... THEN ...
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;

      // SQLite: UPDATE ... SET data_vencimento = CASE id WHEN ? THEN ? ... END WHERE id IN (?,...)
      const caseParts = batch.map(() => 'WHEN ? THEN ?').join(' ');
      const idsPlaceholders = batch.map(() => '?').join(',');

      const sql = `
        UPDATE qualificacoes_historico
        SET data_vencimento = CASE id ${caseParts} END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${idsPlaceholders}) AND empresa_id = ?
      `;

      const bindings: unknown[] = [];
      batch.forEach((r) => {
        bindings.push(r.existingId!, r.data_vencimento);
      });
      batch.forEach((r) => bindings.push(r.existingId!));
      bindings.push(empresaId);

      try {
        await this.db
          .prepare(sql)
          .bind(...bindings)
          .run();
        result.updated += batch.length;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
        batch.forEach((r) => {
          result.errors.push({ line: r.line, field: 'geral', message: errMsg });
        });
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Gera template CSV com apenas 3 colunas obrigatórias
   */
  getTemplate(): string {
    const headers = Object.keys(QUALIFICACOES_HISTORICO_COLUMNS);
    const example = ['12345678900', 'CMA1', '2024-03-15'];

    return headers.join(',') + '\n' + example.join(',');
  }

  /**
   * Query de listagem COM JOIN - Integração ATIVA
   * Dados de funcionários e tipos sempre atualizados automaticamente
   */
  async list(
    filters?: {
      funcionario_cpf?: string;
      qualificacao_codigo?: string;
      limit?: number;
      offset?: number;
    },
    empresaIdOverride?: number,
  ): Promise<Array<Record<string, unknown>>> {
    const empresaId = this.resolveEmpresaId(empresaIdOverride);
    let sql = `
      SELECT 
        h.id,
        h.funcionario_cpf,
        h.qualificacao_codigo,
        h.data_conclusao,
        h.data_vencimento,
        h.created_at,
        h.updated_at,
        -- Dados do funcionário (INTEGRAÇÃO ATIVA via JOIN)
        f.nome as funcionario_nome,
        f.guerra as funcionario_guerra,
        f.matricula as funcionario_matricula,
        f.codigo_anac as funcionario_codigo_anac,
        f.funcao as funcionario_funcao,
        -- Dados da qualificação (INTEGRAÇÃO ATIVA via JOIN)
        q.nome as qualificacao_nome,
        q.tipo as qualificacao_tipo,
        q.categoria as qualificacao_categoria,
        q.validade as qualificacao_validade,
        q.vencimento_fim_mes as qualificacao_vencimento_fim_mes,
        q.carga_horaria as qualificacao_carga_horaria,
        q.descricao as qualificacao_descricao,
        -- Cálculos de status (INTEGRAÇÃO ATIVA)
        CASE 
          WHEN h.data_vencimento IS NULL THEN 'VITALICIA'
          WHEN date(h.data_vencimento) < date('now') THEN 'VENCIDA'
          WHEN date(h.data_vencimento) <= date('now', '+30 days') THEN 'EXPIRANDO'
          ELSE 'VIGENTE'
        END as status,
        CASE 
          WHEN h.data_vencimento IS NULL THEN NULL
          WHEN date(h.data_vencimento) < date('now') THEN 'VENCIDA'
          WHEN date(h.data_vencimento) <= date('now', '+7 days') THEN 'HIGH'
          WHEN date(h.data_vencimento) <= date('now', '+30 days') THEN 'MEDIUM'
          ELSE 'LOW'
        END as urgencia
      FROM qualificacoes_historico h
      INNER JOIN funcionarios f ON h.funcionario_cpf = f.cpf AND f.empresa_id = h.empresa_id AND f.deleted_at IS NULL
      INNER JOIN qualificacoes_tipos q ON UPPER(h.qualificacao_codigo) = UPPER(q.codigo) AND q.empresa_id = h.empresa_id AND q.deleted_at IS NULL
      WHERE h.deleted_at IS NULL
        AND h.empresa_id = ?
    `;

    const bindings: unknown[] = [empresaId];

    if (filters?.funcionario_cpf) {
      sql += ' AND h.funcionario_cpf = ?';
      bindings.push(filters.funcionario_cpf);
    }

    if (filters?.qualificacao_codigo) {
      sql += ' AND UPPER(h.qualificacao_codigo) = UPPER(?)';
      bindings.push(filters.qualificacao_codigo);
    }

    sql += ' ORDER BY h.data_conclusao DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      bindings.push(filters.limit);
    }

    if (filters?.offset) {
      sql += ' OFFSET ?';
      bindings.push(filters.offset);
    }

    const stmt = this.db.prepare(sql);
    const result = await stmt.bind(...bindings).all();

    return result.results || [];
  }
}
