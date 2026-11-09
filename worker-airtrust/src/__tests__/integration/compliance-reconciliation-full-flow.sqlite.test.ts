import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { Hono } from 'hono';
import type { Env } from '../../types';

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
    hasSetorId: true,
    clause: '1 = 1',
    bindings: [],
  }),
  assertFuncionarioInScope: async () => {},
  filterRequestedSetorIdsByAccess: (_access: any, ids: number[]) => ids,
}));

import complianceRouter from '../../routes/compliance-treinamentos';

describe('Subagente 3 — Reconciliação Real de Compliance via HTTP (SQLite Real)', () => {
  let sqliteD1: SqliteD1Database;
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    currentEmpresaId = 6;
    sqliteD1 = new SqliteD1Database();
    const rawDb = sqliteD1.database;

    rawDb.exec(`
      PRAGMA foreign_keys = OFF;

      DROP TABLE IF EXISTS treinamento_requisitos;
      DROP TABLE IF EXISTS lms_matriculas;
      DROP TABLE IF EXISTS lms_cursos;
      DROP TABLE IF EXISTS qualificacoes_historico;
      DROP TABLE IF EXISTS qualificacoes_tipos;
      DROP TABLE IF EXISTS funcoes;
      DROP TABLE IF EXISTS setores;
      DROP TABLE IF EXISTS funcionarios;
      DROP TABLE IF EXISTS empresas;
      DROP TABLE IF EXISTS reconciliacao_decisoes;

      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        codigo TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE setores (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE funcoes (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        matricula TEXT,
        cargo TEXT,
        funcao TEXT,
        funcao_id INTEGER,
        setor_id INTEGER,
        status TEXT DEFAULT 'ATIVO',
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE qualificacoes_tipos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        categoria TEXT DEFAULT 'OPERACIONAL',
        validade INTEGER,
        vencimento_fim_mes INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE qualificacoes_historico (
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
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      CREATE TABLE treinamento_requisitos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        escopo TEXT NOT NULL DEFAULT 'FUNCAO',
        setor_id INTEGER,
        funcao_id INTEGER,
        funcionario_id INTEGER,
        aeronave_modelo TEXT,
        condicao_id INTEGER,
        perfil_competencia TEXT,
        modalidade_requerida TEXT,
        justificativa TEXT,
        fundamento_tipo TEXT,
        fundamento_documento TEXT,
        fundamento_item TEXT,
        validade_fonte TEXT DEFAULT 'EVIDENCIA',
        obrigatoriedade TEXT DEFAULT 'OBRIGATORIO',
        nivel_requerido INTEGER DEFAULT 1,
        critico_operacional INTEGER DEFAULT 0,
        origem TEXT DEFAULT 'EMPRESA',
        referencia_normativa TEXT,
        observacoes TEXT,
        vigencia_inicio TEXT,
        vigencia_fim TEXT,
        prazo_inicial_dias INTEGER,
        auto_matricular_ead INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      CREATE TABLE lms_cursos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        codigo TEXT,
        modalidade TEXT DEFAULT 'EAD',
        qualificacao_tipo_id INTEGER,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE lms_matriculas (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        curso_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        status TEXT DEFAULT 'EM_ANDAMENTO',
        progresso_pct REAL DEFAULT 0,
        data_matricula TEXT,
        data_conclusao TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      CREATE TABLE reconciliacao_decisoes (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        matricula_id INTEGER,
        decisao TEXT,
        justificativa TEXT,
        created_at TEXT
      );

      -- Dados Base:
      INSERT INTO empresas (id, nome, codigo) VALUES (6, 'Empresa 6', 'emp6'), (7, 'Empresa 7', 'emp7');
      INSERT INTO setores (id, empresa_id, nome) VALUES (100, 6, 'Operações'), (200, 6, 'Manutenção');
      INSERT INTO funcoes (id, empresa_id, nome) VALUES 
        (1, 6, 'Auxiliar de Manutenção'),
        (2, 6, 'Mecânico de Manutenção'),
        (3, 6, 'Comandante');

      -- Modelos de Treinamento:
      INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade, vencimento_fim_mes) VALUES
        (10, 6, 'IIO_APRS', 'Instrução Inicial Operacional / APRS', 12, 0),
        (20, 6, 'NR26', 'Sinalização e Segurança NR-26', 24, 1),
        (30, 6, 'CRM_REC', 'CRM Recorrente', 12, 1);

      -- REQUISITOS DE TREINAMENTO (treinamento_requisitos):
      -- 1) DECISÃO VINCULANTE:
      -- Requisito para Mecânico de Manutenção (funcao_id = 2) exige IIO_APRS (tipo 10, ativo = 1)
      INSERT INTO treinamento_requisitos (id, empresa_id, qualificacao_tipo_id, escopo, funcao_id, ativo) VALUES
        (198, 6, 10, 'FUNCAO', 2, 1);

      -- Requisito INATIVO para Auxiliar de Manutenção (funcao_id = 1) para IIO_APRS (ativo = 0):
      INSERT INTO treinamento_requisitos (id, empresa_id, qualificacao_tipo_id, escopo, funcao_id, ativo) VALUES
        (704, 6, 10, 'FUNCAO', 1, 0);

      -- Requisitos para Comandante (funcao_id = 3): exige NR26 e CRM_REC
      INSERT INTO treinamento_requisitos (id, empresa_id, qualificacao_tipo_id, escopo, funcao_id, ativo) VALUES
        (201, 6, 20, 'FUNCAO', 3, 1),
        (202, 6, 30, 'FUNCAO', 3, 1);

      -- Funcionários:
      INSERT INTO funcionarios (id, empresa_id, nome, matricula, cargo, funcao, funcao_id, setor_id, status) VALUES
        (101, 6, 'João Auxiliar', 'MAT-101', 'Auxiliar', 'Auxiliar de Manutenção', 1, 200, 'ATIVO'),
        (102, 6, 'Marcos Mecânico', 'MAT-102', 'Mecânico', 'Mecânico de Manutenção', 2, 200, 'ATIVO'),
        (103, 6, 'Carlos Piloto Conforme', 'MAT-103', 'Piloto', 'Comandante', 3, 100, 'ATIVO'),
        (104, 6, 'Daniel Piloto Vencido', 'MAT-104', 'Piloto', 'Comandante', 3, 100, 'ATIVO'),
        (105, 6, 'Eduardo Piloto Sem Treino', 'MAT-105', 'Piloto', 'Comandante', 3, 100, 'ATIVO'),
        -- Tenant 7 (Isolamento multitenant):
        (701, 7, 'Piloto Beta Alheio', 'MAT-701', 'Piloto', 'Comandante', 3, 100, 'ATIVO');

      -- Históricos de Treinamento:
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, status, data_conclusao, data_vencimento, validade_meses) VALUES
        -- Carlos Piloto: NR26 e CRM válidos até 2028 e 2027
        (1001, 6, 103, 20, 'NR26', 'VALIDA', '2026-02-15', '2028-02-28', 24),
        (1002, 6, 103, 30, 'CRM_REC', 'VALIDA', '2026-01-10', '2027-01-31', 12),
        -- Daniel Piloto: NR26 válido, CRM vencido em 2025
        (1003, 6, 104, 20, 'NR26', 'VALIDA', '2025-02-15', '2027-02-28', 24),
        (1004, 6, 104, 30, 'CRM_REC', 'VENCIDA', '2024-01-10', '2025-01-31', 12);

      -- Cursos LMS:
      INSERT INTO lms_cursos (id, empresa_id, titulo, codigo, qualificacao_tipo_id) VALUES
        (501, 6, 'Curso NR-26 Online', 'NR26', 20),
        (502, 6, 'Curso CRM Reciclagem', 'CRM_REC', 30);

      -- Matrículas LMS:
      -- Daniel Piloto já possui matrícula em andamento para CRM (prevenção de duplicidade)
      INSERT INTO lms_matriculas (id, empresa_id, curso_id, funcionario_id, status, data_matricula) VALUES
        (9001, 6, 502, 104, 'EM_ANDAMENTO', '2026-11-01');

      -- Matrícula CANCELADA da Issue #1381 (Eduardo Piloto): NÃO deve dispensar nem bloquear gap
      INSERT INTO lms_matriculas (id, empresa_id, curso_id, funcionario_id, status, data_matricula, data_conclusao) VALUES
        (9002, 6, 501, 105, 'CANCELADO', '2026-05-01', '2026-06-01');
    `);

    app = new Hono<{ Bindings: Env }>();
    app.route('/compliance-treinamentos', complianceRouter);
  });

  afterEach(() => {
    sqliteD1.database.close();
  });

  it('1. Exercita HTTP GET /reconciliacao: Decisão IIO/APRS comprovada na resposta JSON da API', async () => {
    const res = await app.request(
      '/compliance-treinamentos/reconciliacao',
      { method: 'GET' },
      { DB: sqliteD1 as unknown as D1Database } as unknown as Env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);

    const gaps = body.data.gaps_matricula as Array<any>;
    expect(gaps).toBeDefined();

    // 1) Gap de IIO_APRS (tipo 10):
    // Deve listar Marcos Mecânico (ID 102), pois a Regra 198 de Mecânico está ATIVA.
    // NÃO deve listar João Auxiliar (ID 101), pois a Regra 704 de Auxiliar está INATIVA (Decisão Vinculante).
    const gapIio = gaps.find((g) => g.qualificacao_tipo_id === 10);
    expect(gapIio).toBeDefined();
    expect(gapIio.qualificacao_tipo_codigo).toBe('IIO_APRS');
    
    const funcionariosIio = gapIio.funcionarios.map((f: any) => f.id);
    expect(funcionariosIio).toContain(102); // Marcos Mecânico é cobrado
    expect(funcionariosIio).not.toContain(101); // João Auxiliar NÃO é cobrado
  });

  it('2. Exercita HTTP GET /reconciliacao: Prevenção de Falsa Dispensa e Prevenção de Matrícula Duplicada', async () => {
    const res = await app.request(
      '/compliance-treinamentos/reconciliacao',
      { method: 'GET' },
      { DB: sqliteD1 as unknown as D1Database } as unknown as Env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const gaps = body.data.gaps_matricula as Array<any>;

    // 1) Prevenção de Matrícula Duplicada:
    // Daniel Piloto (ID 104) tem CRM_REC vencido, mas JÁ possui matrícula EM_ANDAMENTO (ID 9001).
    // O gap de CRM_REC (tipo 30) NÃO deve incluir Daniel Piloto para evitar duplicidade de matrícula.
    const gapCrm = gaps.find((g) => g.qualificacao_tipo_id === 30);
    expect(gapCrm).toBeDefined();
    const funcionariosCrm = gapCrm.funcionarios.map((f: any) => f.id);
    expect(funcionariosCrm).not.toContain(104); // Daniel Piloto bloqueado contra duplicidade!

    // 2) Prevenção de Falsa Dispensa:
    // Eduardo Piloto (ID 105) ativo sem histórico NÃO recebe conformidade tácita:
    // Deve constar no gap de CRM_REC como NAO_REALIZADO.
    expect(funcionariosCrm).toContain(105);
    const eduardoCrm = gapCrm.funcionarios.find((f: any) => f.id === 105);
    expect(eduardoCrm.status_compliance).toBe('NAO_REALIZADO');
  });

  it('3. Exercita HTTP GET /reconciliacao: Matrícula CANCELADA (Issue #1381) não bloqueia gap nem dispensa', async () => {
    const res = await app.request(
      '/compliance-treinamentos/reconciliacao',
      { method: 'GET' },
      { DB: sqliteD1 as unknown as D1Database } as unknown as Env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const gaps = body.data.gaps_matricula as Array<any>;

    // Eduardo Piloto (ID 105) tem matrícula CANCELADO (ID 9002) para NR-26 (tipo 20).
    // O status CANCELADO não pode atuar como bloqueio de gap: Eduardo DEVE figurar no gap de NR-26!
    const gapNr26 = gaps.find((g) => g.qualificacao_tipo_id === 20);
    expect(gapNr26).toBeDefined();
    const funcionariosNr26 = gapNr26.funcionarios.map((f: any) => f.id);
    expect(funcionariosNr26).toContain(105); // Matrícula cancelada não silenciou o gap!
  });

  it('4. Exercita HTTP GET /reconciliacao: Isolamento Multi-Tenant estrito no payload retornado', async () => {
    const res = await app.request(
      '/compliance-treinamentos/reconciliacao',
      { method: 'GET' },
      { DB: sqliteD1 as unknown as D1Database } as unknown as Env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const gaps = body.data.gaps_matricula as Array<any>;

    // Coleta todos os funcionários presentes em todos os gaps
    const todosFuncionariosEmGaps = gaps.flatMap((g) => g.funcionarios.map((f: any) => f.id));

    // O funcionário 701 do Tenant 7 JAMAIS pode vazar para a reconciliação do Tenant 6
    expect(todosFuncionariosEmGaps).not.toContain(701);
    expect(todosFuncionariosEmGaps.every((id) => [101, 102, 103, 104, 105].includes(id))).toBe(true);
  });
});
