import { afterEach, describe, expect, it } from 'vitest';
import { getQualificationComplianceSummary } from '../../services/dashboardService';
import { insertHistory, SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

describe('getQualificationComplianceSummary sqlite', () => {
  let db: SqliteD1Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('separa documentos/avaliações de treinamentos e não transforma evidência em obrigação', async () => {
    db = new SqliteD1Database();
    db.database.exec(`
      ALTER TABLE funcionarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE funcionarios ADD COLUMN status TEXT NOT NULL DEFAULT 'ATIVO';
      ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE qualificacoes_tipos ADD COLUMN classe_requisito TEXT;
      ALTER TABLE qualificacoes_tipos ADD COLUMN is_check INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE qualificacoes_tipos_setores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        tipo_id INTEGER NOT NULL,
        setor_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE licencas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        data_vencimento TEXT,
        deleted_at TEXT
      );

      CREATE TABLE empresas_config (
        empresa_id INTEGER PRIMARY KEY,
        dias_alerta_vencimento INTEGER
      );

      INSERT INTO empresas_config (empresa_id, dias_alerta_vencimento) VALUES (1, 30);

      UPDATE qualificacoes_tipos
         SET classe_requisito = 'TREINAMENTO'
       WHERE empresa_id = 1;
      UPDATE qualificacoes_tipos
         SET classe_requisito = 'DOCUMENTO'
       WHERE id = 105;
      UPDATE qualificacoes_tipos
         SET classe_requisito = 'AVALIACAO', is_check = 1
       WHERE id = 106;

      INSERT INTO qualificacoes_tipos_setores (empresa_id, tipo_id, setor_id)
      VALUES (1, 105, 10), (1, 106, 10);

      INSERT INTO licencas (empresa_id, funcionario_id, tipo, data_vencimento)
      VALUES (1, 1000, 'CMA', '2099-12-31');
    `);

    insertHistory(db.database, {
      funcionarioId: 1000,
      qualificationId: 106,
      qualificationCode: 'G1',
      completionDate: '2026-01-01',
      expiryDate: '2099-12-31',
      empresaId: 1,
    });

    // Evidência de treinamento existente não pode aumentar o denominador de Qualificações.
    insertHistory(db.database, {
      funcionarioId: 1000,
      qualificationId: 100,
      qualificationCode: 'MNT-12',
      completionDate: '2026-01-01',
      expiryDate: '2099-12-31',
      empresaId: 1,
    });

    const summary = await getQualificationComplianceSummary(db.asD1(), 1);

    expect(summary).toEqual({
      pessoas: 3,
      pessoas_sem_configuracao: 1,
      requisitos_obrigatorios: 4,
      conformes: 2,
      vencendo: 0,
      vencidos: 0,
      nao_realizados: 2,
      compliance_pct: 50,
      cobertura: 'PARCIAL',
      escopo_modelo: 'SETOR_OU_TRANSVERSAL',
    });
  });
});
