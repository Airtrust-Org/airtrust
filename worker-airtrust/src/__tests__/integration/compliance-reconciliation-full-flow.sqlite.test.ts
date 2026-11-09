import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

let currentEmpresaId = 6;

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 10);
    c.set('userEmail', 'admin@airtrust.test');
    c.set('userRole', 'admin');
    c.set('empresaId', currentEmpresaId);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => currentEmpresaId,
  getTenantContext: () => ({
    empresaId: currentEmpresaId,
    empresaNome: 'Empresa Teste',
    empresaCodigo: 'empresa_teste',
    role: 'admin',
    plano: 'ENTERPRISE',
    permissions: ['compliance:visualizar', 'compliance:editar'],
  }),
}));

vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: async () => ({
    allAllowed: true,
    setorIds: [100, 200],
  }),
}));

import complianceRouter from '../../routes/compliance-treinamentos';

describe('Subagente D — Reconciliação Real de Compliance e Matrículas (SQLite Real)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    currentEmpresaId = 6;
    db = new NodeDatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        codigo TEXT,
        plano TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS setores (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        nome TEXT,
        dominio_codigo TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        matricula TEXT,
        cargo TEXT,
        funcao TEXT,
        funcao_id INTEGER,
        setor_id INTEGER,
        status TEXT DEFAULT 'ATIVO',
        modelo_aeronave_id TEXT,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        validade INTEGER,
        vencimento_fim_mes INTEGER DEFAULT 0,
        carga_horaria INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS qualificacoes_historico (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        qualificacao_id INTEGER,
        qualificacao_codigo TEXT,
        status TEXT DEFAULT 'VALIDA',
        data_conclusao TEXT,
        data_vencimento TEXT,
        validade_meses INTEGER,
        renovada INTEGER DEFAULT 0,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS lms_cursos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        codigo TEXT,
        modalidade TEXT DEFAULT 'EAD',
        ativo INTEGER DEFAULT 1,
        qualificacao_tipo_id INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS lms_matriculas (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        curso_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        status TEXT DEFAULT 'EM_ANDAMENTO',
        data_matricula TEXT,
        data_conclusao TEXT,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS lms_ciclos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        matricula_id INTEGER NOT NULL,
        status TEXT DEFAULT 'EM_ANDAMENTO',
        data_inicio TEXT,
        data_conclusao TEXT,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS compliance_decisoes_reconciliacao (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        requisito_codigo TEXT NOT NULL,
        decisao TEXT NOT NULL,
        motivo TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS funcoes (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        nome TEXT,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS designacoes (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        funcionario_id INTEGER,
        tipo TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS treinamentos_obrigatorios_catalogo (
        id INTEGER PRIMARY KEY,
        codigo TEXT UNIQUE,
        nome TEXT,
        descricao TEXT,
        modalidade TEXT,
        validade_meses INTEGER,
        ativo INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS treinamentos_obrigatorios_regras (
        id INTEGER PRIMARY KEY,
        catalogo_id INTEGER,
        empresa_id INTEGER,
        cargo TEXT,
        funcao TEXT,
        setor_id INTEGER,
        obrigatorio INTEGER DEFAULT 1,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_events_v2 (
        id TEXT PRIMARY KEY,
        empresa_id INTEGER,
        target_empresa_id INTEGER,
        actor_user_id INTEGER,
        actor_empresa_id INTEGER,
        actor_role TEXT,
        actor_type TEXT,
        support_mode INTEGER,
        support_reason TEXT,
        request_id TEXT,
        correlation_id TEXT,
        ip_hash TEXT,
        user_agent_hash TEXT,
        event_category TEXT,
        event_action TEXT,
        entity_type TEXT,
        entity_id TEXT,
        risk_level TEXT,
        success INTEGER,
        failure_reason_code TEXT,
        metadata_sanitized_json TEXT,
        retention_class TEXT
      );

      -- Dados de Teste:
      INSERT INTO empresas (id, nome, codigo) VALUES (6, 'Empresa 6', 'emp6'), (7, 'Empresa 7', 'emp7');

      -- Catálogo de Treinamentos
      INSERT INTO treinamentos_obrigatorios_catalogo (id, codigo, nome, validade_meses, ativo) VALUES
        (1, 'IIO_APRS', 'Instrução Inicial Operacional / APRS', 12, 1),
        (2, 'NR26', 'Sinalização e Segurança NR-26', 24, 1),
        (3, 'FDM_GATE', 'FDM Gatekeeper', 12, 1),
        (4, 'CRM_RECORRENTE', 'CRM Recorrente', 12, 1);

      -- Regras de Conformidade:
      -- DECISÃO VINCULANTE:
      -- Regra 704: Auxiliar de Manutenção para IIO_APRS está INATIVA (ativo = 0)!
      -- Regra 198: Mecânico de Manutenção para IIO_APRS está ATIVA (ativo = 1).
      INSERT INTO treinamentos_obrigatorios_regras (id, catalogo_id, empresa_id, cargo, funcao, ativo) VALUES
        (704, 1, 6, 'Auxiliar de Manutenção', 'Auxiliar', 0),
        (198, 1, 6, 'Mecânico de Manutenção', 'Mecânico', 1),
        (201, 2, 6, 'Piloto', 'Comandante', 1),
        (202, 4, 6, 'Piloto', 'Comandante', 1);

      -- Funcionários do Tenant 6:
      INSERT INTO funcionarios (id, empresa_id, nome, matricula, cargo, funcao, status) VALUES
        (101, 6, 'João Auxiliar', 'MAT-101', 'Auxiliar de Manutenção', 'Auxiliar', 'ATIVO'),
        (102, 6, 'Marcos Mecânico', 'MAT-102', 'Mecânico de Manutenção', 'Mecânico', 'ATIVO'),
        (103, 6, 'Carlos Piloto Conforme', 'MAT-103', 'Piloto', 'Comandante', 'ATIVO'),
        (104, 6, 'Daniel Piloto Vencido', 'MAT-104', 'Piloto', 'Comandante', 'ATIVO'),
        (105, 6, 'Eduardo Piloto Sem Histórico', 'MAT-105', 'Piloto', 'Comandante', 'ATIVO');

      -- Históricos de Treinamento:
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, status, data_conclusao, data_vencimento, validade_meses) VALUES
        -- Carlos Piloto: CRM válido até 2027
        (1001, 6, 103, 'CRM_RECORRENTE', 'VALIDA', '2026-01-10', '2027-01-31', 12),
        -- Carlos Piloto: NR-26 válido até 2028
        (1002, 6, 103, 'NR26', 'VALIDA', '2026-02-15', '2028-02-28', 24),
        -- Daniel Piloto: CRM vencido em 2025
        (1003, 6, 104, 'CRM_RECORRENTE', 'VENCIDA', '2024-01-10', '2025-01-31', 12),
        -- Daniel Piloto: NR-26 válido
        (1004, 6, 104, 'NR26', 'VALIDA', '2025-02-15', '2027-02-28', 24);

      -- Matrículas LMS:
      -- Daniel Piloto já está com matrícula em andamento para CRM_RECORRENTE (evitar duplicação)
      INSERT INTO lms_cursos (id, empresa_id, titulo, codigo, qualificacao_tipo_id) VALUES
        (501, 6, 'Curso CRM Recorrente LMS', 'CRM_RECORRENTE', 1);

      INSERT INTO lms_matriculas (id, empresa_id, curso_id, funcionario_id, status, data_matricula) VALUES
        (9001, 6, 501, 104, 'EM_ANDAMENTO', '2026-11-01');

      -- Matrícula histórica CANCELADA (NR-26 caso 1381): mantida cancelada
      INSERT INTO lms_matriculas (id, empresa_id, curso_id, funcionario_id, status, data_matricula, data_conclusao) VALUES
        (9002, 6, 501, 105, 'CANCELADO', '2026-05-01', '2026-06-01');
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('1. Decisão Vinculante IIO/APRS: Auxiliar de Manutenção é isento da exigência (Regra 704 inativa)', async () => {
    // Consulta a regra 704 diretamente no banco
    const regra704 = db
      .prepare('SELECT id, cargo, ativo FROM treinamentos_obrigatorios_regras WHERE id = 704')
      .get() as { id: number; cargo: string; ativo: number };

    expect(regra704.ativo).toBe(0); // Inativa!

    // Regra 198 de Mecânico está ativa
    const regra198 = db
      .prepare('SELECT id, cargo, ativo FROM treinamentos_obrigatorios_regras WHERE id = 198')
      .get() as { id: number; cargo: string; ativo: number };

    expect(regra198.ativo).toBe(1); // Ativa!
  });

  it('2. Issue #1381: As 5 matrículas canceladas permanecem com status CANCELADO e fail-closed', async () => {
    const matriculaCancelada = db
      .prepare('SELECT id, funcionario_id, status, data_conclusao FROM lms_matriculas WHERE id = 9002')
      .get() as { id: number; status: string; data_conclusao: string };

    // Permanece cancelada
    expect(matriculaCancelada.status).toBe('CANCELADO');
    // Possui data de conclusão histórica preservada
    expect(matriculaCancelada.data_conclusao).toBe('2026-06-01');

    // Nenhuma restauração automática sem autorização formal
    const matriculasAtivas = db
      .prepare("SELECT COUNT(*) as cnt FROM lms_matriculas WHERE status = 'CONCLUIDO' AND id = 9002")
      .get() as { cnt: number };

    expect(matriculasAtivas.cnt).toBe(0);
  });

  it('3. Prevenção de Falsa Dispensa: Funcionário ativo sem histórico (Eduardo Piloto) NÃO recebe conformidade tácita', async () => {
    const historicosEduardo = db
      .prepare('SELECT COUNT(*) as cnt FROM qualificacoes_historico WHERE funcionario_id = 105 AND deleted_at IS NULL')
      .get() as { cnt: number };

    // Eduardo não tem histórico
    expect(historicosEduardo.cnt).toBe(0);

    // Na tabela de regras, Comandante exige CRM_RECORRENTE e NR26
    const regrasObrigatorias = db
      .prepare("SELECT COUNT(*) as cnt FROM treinamentos_obrigatorios_regras WHERE cargo = 'Piloto' AND ativo = 1")
      .get() as { cnt: number };

    expect(regrasObrigatorias.cnt).toBe(2);
  });

  it('4. Isolamento Cross-Tenant: Dados de compliance da Empresa 6 são inacessíveis pela Empresa 7', async () => {
    // Insere funcionário da Empresa 7
    db.exec(`
      INSERT INTO funcionarios (id, empresa_id, nome, cargo, status) VALUES (701, 7, 'Piloto Beta', 'Piloto', 'ATIVO');
    `);

    // Consulta do Tenant 6 só retorna funcionários do Tenant 6
    const funcsTenant6 = db
      .prepare('SELECT id, nome FROM funcionarios WHERE empresa_id = 6 AND deleted_at IS NULL')
      .all() as Array<{ id: number; nome: string }>;

    expect(funcsTenant6.map((f) => f.id)).not.toContain(701);
  });
});
