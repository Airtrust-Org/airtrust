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
      ALTER TABLE funcionarios ADD COLUMN funcao_id INTEGER;
      ALTER TABLE funcionarios ADD COLUMN aeronave TEXT;
      ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE qualificacoes_tipos ADD COLUMN classe_requisito TEXT;
      ALTER TABLE qualificacoes_tipos ADD COLUMN is_check INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE treinamento_requisitos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        escopo TEXT NOT NULL,
        setor_id INTEGER,
        funcao_id INTEGER,
        funcionario_id INTEGER,
        condicao_id INTEGER,
        aeronave_modelo TEXT,
        perfil_competencia TEXT,
        obrigatoriedade TEXT NOT NULL,
        auto_matricular_ead INTEGER NOT NULL DEFAULT 0,
        vigencia_inicio TEXT,
        vigencia_fim TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE compliance_condicoes (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE funcionarios_compliance_condicoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        condicao_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        data_inicio TEXT,
        data_fim TEXT,
        deleted_at TEXT
      );

      CREATE TABLE aeronaves (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        modelo TEXT,
        deleted_at TEXT
      );

      CREATE TABLE funcionarios_aeronaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        aeronave_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        data_inicio TEXT,
        data_fim TEXT,
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

      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, obrigatoriedade, ativo)
      VALUES
        (1, 105, 'SETOR', 10, 'OBRIGATORIA', 1),
        (1, 106, 'SETOR', 10, 'OBRIGATORIA', 1);

      -- Vínculo/catálogo não é necessário: a obrigação vem exclusivamente da matriz canônica.
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
      escopo_modelo: 'MATRIZ_CANONICA',
    });
  });
});
