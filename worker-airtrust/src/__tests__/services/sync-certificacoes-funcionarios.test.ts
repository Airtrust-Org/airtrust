/**
 * syncFuncionarioCertificacoes — schema real + settlement canônico.
 *
 * Prova dois gaps corrigidos:
 * 1. Bug de schema: o arquivo usava `qualificacao_tipo_id`, coluna que não
 *    existe em qualificacoes_historico (a coluna real é `qualificacao_id`),
 *    fazendo o SELECT de lookup falhar sempre.
 * 2. Gap de lineage: a seleção do registro "existente" era por created_at
 *    (irrelevante à cronologia operacional) e nunca setava renovacao_de —
 *    agora delega a createQualificationHistoryAtomic para conclusões reais
 *    (data_conclusao presente).
 *
 * Executa contra SQLite real (node:sqlite), não mocks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database, insertHistory } from '../helpers/qualification-history-sqlite-d1';
import { syncFuncionarioCertificacoes } from '../../services/sync-certificacoes-funcionarios';

let sqlite: SqliteD1Database;

function seedTipo(id: number, codigo: string, empresaId: number) {
  // O helper compartilhado já semeia um tipo 'CMA' (id 105, empresa 1) na
  // base — removê-lo evita duas linhas com o mesmo código competindo pelo
  // LIMIT 1 de getTipoInfo (não determinístico sobre qual delas "ganha").
  sqlite.database
    .prepare('DELETE FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND empresa_id = ?')
    .run(codigo, empresaId);
  sqlite.database
    .prepare(
      `INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, categoria, dominio_codigo, validade)
       VALUES (?, ?, ?, 'MANUTENCAO', 'MANUTENCAO', 12)`,
    )
    .run(id, empresaId, codigo);
}

beforeEach(() => {
  sqlite = new SqliteD1Database();
  // O helper compartilhado não modela a coluna `nome` de
  // qualificacoes_tipos (presente no schema real) — getTipoInfo faz
  // fallback de busca por nome quando o código não bate, então precisamos
  // dela aqui para não quebrar essa query.
  sqlite.database.exec('ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT');
  // CMA (id 1000) e ASO (id 1001) para o funcionário 1000 (empresa 1) e
  // funcionário 2000 (empresa 2), replicando os tipos "reais" do sistema.
  seedTipo(1000, 'CMA', 1);
  seedTipo(1001, 'ASO', 1);
  seedTipo(2000, 'CMA', 2);
});

afterEach(() => {
  sqlite.close();
});

function historicoRows(funcionarioId: number, qualificacaoCodigo: string) {
  return sqlite.database
    .prepare(
      `SELECT * FROM qualificacoes_historico
        WHERE funcionario_id = ? AND UPPER(COALESCE(qualificacao_codigo, '')) = ?`,
    )
    .all(funcionarioId, qualificacaoCodigo) as Record<string, unknown>[];
}

describe('syncFuncionarioCertificacoes — schema real (qualificacao_id) e lineage canônica', () => {
  it('primeira sincronização: cria CONCLUIDA com numero_certificado, sem predecessor', async () => {
    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      cma: 'CMA-001',
      data_realizacao_cma: '2026-01-10',
      validade_cma: '2027-01-10',
    });

    const rows = historicoRows(1000, 'CMA');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('CONCLUIDA');
    expect(rows[0].numero_certificado).toBe('CMA-001');
    expect(rows[0].renovacao_de).toBeNull();
  });

  it('segunda sincronização idempotente (mesma data_conclusao): não duplica, atualiza numero_certificado', async () => {
    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      cma: 'CMA-001',
      data_realizacao_cma: '2026-01-10',
      validade_cma: '2027-01-10',
    });
    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      cma: 'CMA-001-v2',
      data_realizacao_cma: '2026-01-10',
      validade_cma: '2027-01-10',
    });

    const rows = historicoRows(1000, 'CMA');
    expect(rows).toHaveLength(1);
    expect(rows[0].numero_certificado).toBe('CMA-001-v2');
  });

  it('predecessor: nova conclusão CMA seta renovacao_de e materializa o CMA anterior como RENOVADA', async () => {
    const predecessorId = insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 1000,
      qualificationCode: 'CMA',
      completionDate: '2025-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      cma: 'CMA-002',
      data_realizacao_cma: '2026-01-10',
      validade_cma: '2027-01-10',
    });

    const rows = historicoRows(1000, 'CMA');
    const successor = rows.find((r) => r.id !== predecessorId)!;
    expect(successor.renovacao_de).toBe(predecessorId);

    const predecessor = sqlite.database
      .prepare('SELECT status, renovada FROM qualificacoes_historico WHERE id = ?')
      .get(predecessorId) as Record<string, unknown>;
    expect(predecessor.status).toBe('RENOVADA');
    expect(predecessor.renovada).toBe(1);
  });

  it('retroatividade: conclusão CMA registrada com data anterior a um registro futuro não toca o futuro', async () => {
    const futureId = insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 1000,
      qualificationCode: 'CMA',
      completionDate: '2030-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      cma: 'CMA-RETRO',
      data_realizacao_cma: '2026-01-10',
      validade_cma: '2027-01-10',
    });

    const future = sqlite.database
      .prepare('SELECT status, renovada FROM qualificacoes_historico WHERE id = ?')
      .get(futureId) as Record<string, unknown>;
    expect(future.status).toBe('CONCLUIDA');
    expect(future.renovada).toBe(0);
  });

  it('apenas data_vencimento (sem data_conclusao): atualiza o vencimento do CONCLUIDA mais recente, sem criar linha nem tocar lineage', async () => {
    const existingId = insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 1000,
      qualificationCode: 'CMA',
      completionDate: '2026-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      validade_cma: '2028-06-01',
    });

    const rows = historicoRows(1000, 'CMA');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existingId);
    expect(rows[0].data_vencimento).toBe('2028-06-01');
    expect(rows[0].renovacao_de).toBeNull();
  });

  it('apenas data_vencimento sem nenhum CONCLUIDA existente: não cria linha órfã', async () => {
    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      validade_cma: '2028-06-01',
    });

    expect(historicoRows(1000, 'CMA')).toHaveLength(0);
  });

  it('tenant A/B: sincronizar CMA do funcionário do tenant 2 nunca cria/atualiza histórico do tenant 1', async () => {
    insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 1000,
      qualificationCode: 'CMA',
      completionDate: '2025-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 2000, // funcionário do tenant 2
      cma: 'CMA-T2',
      data_realizacao_cma: '2026-01-10',
      validade_cma: '2027-01-10',
    });

    const t2Rows = historicoRows(2000, 'CMA');
    expect(t2Rows).toHaveLength(1);
    expect(t2Rows[0].empresa_id).toBe(2);
    expect(t2Rows[0].renovacao_de).toBeNull(); // não deve enxergar o predecessor do tenant 1

    const t1Rows = historicoRows(1000, 'CMA');
    expect(t1Rows).toHaveLength(1); // inalterado
  });

  it('funcionário inexistente/sem tenant: lança erro explícito, nenhuma linha criada', async () => {
    await expect(
      syncFuncionarioCertificacoes(sqlite.asD1(), {
        funcionario_id: 999999,
        cma: 'X',
        data_realizacao_cma: '2026-01-10',
        validade_cma: '2027-01-10',
      }),
    ).rejects.toThrow(/SYNC_TENANT_NOT_FOUND/);

    expect(historicoRows(999999, 'CMA')).toHaveLength(0);
  });

  it('CMA e ASO sincronizados juntos criam duas linhas independentes (códigos diferentes, sem interferência)', async () => {
    await syncFuncionarioCertificacoes(sqlite.asD1(), {
      funcionario_id: 1000,
      cma: 'CMA-1',
      data_realizacao_cma: '2026-01-10',
      validade_cma: '2027-01-10',
      aso: 'ASO-1',
      data_realizacao_aso: '2026-02-15',
      validade_aso: '2027-02-15',
    });

    expect(historicoRows(1000, 'CMA')).toHaveLength(1);
    expect(historicoRows(1000, 'ASO')).toHaveLength(1);
  });
});
