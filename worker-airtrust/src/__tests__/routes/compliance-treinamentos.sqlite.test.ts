import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../middleware/error-handler';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 1,
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

const sectorAccessMock = vi.hoisted(() => ({
  access: { mode: 'all', setorIds: [], funcionarioId: null } as
    | { mode: 'all'; setorIds: []; funcionarioId: null }
    | { mode: 'restricted'; setorIds: number[]; funcionarioId: null },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => sectorAccessMock.access),
  filterRequestedSetorIdsByAccess: vi.fn(
    (ids: number[], access: { mode: string; setorIds: number[] }) =>
      access.mode === 'all' ? ids : ids.filter((id) => access.setorIds.includes(id)),
  ),
  assertFuncionarioInScope: vi.fn(async () => undefined),
}));

import complianceRouter from '../../routes/compliance-treinamentos';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(
        { success: false, error: error.message },
        error.statusCode as 400 | 403 | 404 | 409 | 500,
      );
    }
    return c.json({ success: false, error: 'INTERNAL' }, 500);
  });
  app.route('/', complianceRouter);
  return {
    request: (path: string, init?: RequestInit) => app.request(path, init, { DB: db } as Env),
  };
}

function patchComplianceSchema(sqlite: SqliteD1Database) {
  const db = sqlite.database;
  db.exec(`
    ALTER TABLE setores ADD COLUMN nome TEXT;
    ALTER TABLE setores ADD COLUMN codigo TEXT;
    UPDATE setores SET nome = CASE id WHEN 10 THEN 'Manutenção' WHEN 11 THEN 'Operações' ELSE 'Outro' END,
                       codigo = CASE id WHEN 10 THEN 'MAN' WHEN 11 THEN 'OPS' ELSE 'OUT' END;

    ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
    UPDATE qualificacoes_tipos SET nome = codigo;

    ALTER TABLE funcionarios ADD COLUMN funcao_id INTEGER;
    ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'ATIVO';
    ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1;

    CREATE TABLE funcoes (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT
    );
    INSERT INTO funcoes (id, empresa_id, codigo, nome) VALUES
      (1, 1, 'MEC', 'Mecânico'),
      (2, 1, 'PIL', 'Piloto'),
      (20, 2, 'MEC', 'Mecânico');

    UPDATE funcionarios SET funcao_id = 1 WHERE id IN (1000, 1001);
    UPDATE funcionarios SET funcao_id = 2 WHERE id = 1002;
    UPDATE funcionarios SET funcao_id = 20 WHERE id = 2000;

    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL,
      escopo TEXT NOT NULL,
      setor_id INTEGER,
      funcao_id INTEGER,
      funcionario_id INTEGER,
      obrigatoriedade TEXT NOT NULL DEFAULT 'OBRIGATORIA',
      nivel_requerido INTEGER,
      critico_operacional INTEGER NOT NULL DEFAULT 0,
      origem TEXT NOT NULL DEFAULT 'REGULATORIO',
      referencia_normativa TEXT,
      observacoes TEXT,
      vigencia_inicio TEXT,
      vigencia_fim TEXT,
      prazo_inicial_dias INTEGER,
      auto_matricular_ead INTEGER NOT NULL DEFAULT 0,
      perfil_competencia TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    ALTER TABLE qualificacoes_historico ADD COLUMN perfil_competencia TEXT;
    CREATE TABLE qualificacoes_historico_perfis_competencia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      historico_id INTEGER NOT NULL,
      perfil_competencia TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE notificacoes_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER,
      funcionario_cpf TEXT,
      tipo TEXT,
      destinatario TEXT,
      assunto TEXT,
      corpo TEXT,
      status TEXT,
      erro_mensagem TEXT,
      enviado_em TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      qualificacao_tipo_id INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      data_conclusao TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT,
      perfil_competencia TEXT
    );
    CREATE TABLE treinamento_matricula_reconciliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      matricula_id INTEGER NOT NULL,
      decisao TEXT NOT NULL,
      observacoes TEXT,
      decidido_por INTEGER,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);
}

describe('training compliance engine', () => {
  let sqlite: SqliteD1Database;

  beforeEach(() => {
    sectorAccessMock.access = { mode: 'all', setorIds: [], funcionarioId: null };
    sqlite = new SqliteD1Database();
    patchComplianceSchema(sqlite);
  });

  it('filtra todas as visões operacionais por nome do funcionário, ignorando acentos', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
    `);
    const app = createApp(sqlite.asD1());

    const peopleResponse = await app.request('/pessoas?q=operacoes');
    const peopleBody = (await peopleResponse.json()) as any;
    expect(peopleResponse.status).toBe(200);
    expect(peopleBody.data.map((item: any) => item.id)).toEqual([1002]);

    const summaryResponse = await app.request('/resumo?q=operacoes');
    const summaryBody = (await summaryResponse.json()) as any;
    expect(summaryResponse.status).toBe(200);
    expect(summaryBody.data.pessoas).toBe(1);

    const trainingsResponse = await app.request('/treinamentos?q=operacoes');
    const trainingsBody = (await trainingsResponse.json()) as any;
    expect(trainingsResponse.status).toBe(200);
    expect(trainingsBody.data).toHaveLength(1);
    expect(trainingsBody.data[0]).toMatchObject({ qualificacao_tipo_id: 100, pessoas: 1 });

    const sectorsResponse = await app.request('/setores?q=operacoes');
    const sectorsBody = (await sectorsResponse.json()) as any;
    expect(sectorsResponse.status).toBe(200);
    expect(sectorsBody.data).toHaveLength(1);
    expect(sectorsBody.data[0]).toMatchObject({ setor_id: 11, setor_nome: 'Operações', pessoas: 1 });

    const requirementsResponse = await app.request('/requisitos-aplicaveis?q=operacoes');
    const requirementsBody = (await requirementsResponse.json()) as any;
    expect(requirementsResponse.status).toBe(200);
    expect(requirementsBody.meta.pessoas).toBe(1);

    const pendingResponse = await app.request('/pendencias?funcionario_q=operacoes&status=NAO_REALIZADO');
    const pendingBody = (await pendingResponse.json()) as any;
    expect(pendingResponse.status).toBe(200);
    expect(pendingBody.data.map((item: any) => item.funcionario_id)).toEqual([1002]);

    sqlite.database.exec(`
      INSERT INTO notificacoes_log
        (empresa_id, funcionario_cpf, tipo, destinatario, assunto, corpo, status, enviado_em)
      VALUES
        (1, '113', 'EMAIL_COMPLIANCE', 'ops@example.com', '[COMPLIANCE_TREINAMENTO:100:OPS]',
         '{"funcionario_id":1002,"funcionario_nome":"Operações","qualificacao_tipo_id":100}', 'enviada', '2026-09-30 10:00:00'),
        (1, '111', 'EMAIL_COMPLIANCE', 'outro@example.com', '[COMPLIANCE_TREINAMENTO:100:OUTRO]',
         '{"funcionario_id":1000,"funcionario_nome":"Antes dos 60","qualificacao_tipo_id":100}', 'enviada', '2026-09-30 11:00:00');
    `);
    const communicationsResponse = await app.request('/comunicacoes?funcionario_q=operacoes');
    const communicationsBody = (await communicationsResponse.json()) as any;
    expect(communicationsResponse.status).toBe(200);
    expect(communicationsBody.data.map((item: any) => item.funcionario_id)).toEqual([1002]);
  });

  it('nao trata pessoa sem regra aplicavel como 100% conforme', async () => {
    const app = createApp(sqlite.asD1());
    const personResponse = await app.request('/funcionarios/1002');
    const personBody = (await personResponse.json()) as any;
    const summaryResponse = await app.request('/resumo');
    const summaryBody = (await summaryResponse.json()) as any;

    expect(personResponse.status).toBe(200);
    expect(personBody.data.configurado).toBe(false);
    expect(personBody.data.total_obrigatorios).toBe(0);
    expect(personBody.data.compliance_pct).toBeNull();

    expect(summaryResponse.status).toBe(200);
    expect(summaryBody.data.requisitos_obrigatorios).toBe(0);
    expect(summaryBody.data.compliance_pct).toBeNull();
    expect(summaryBody.data.pessoas_sem_configuracao).toBe(3);
    expect(summaryBody.data.setores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ setor_nome: 'Manutenção', compliance_pct: null }),
        expect.objectContaining({ setor_nome: 'Operações', compliance_pct: null }),
      ]),
    );
  });

  it('preserva a matriz legada por função enquanto o schema V2 ainda não foi aplicado', async () => {
    sqlite.database.exec(`
      DROP TABLE treinamento_requisitos;
      CREATE TABLE matriz_treinamento_funcao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        funcao_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        obrigatoriedade TEXT NOT NULL DEFAULT 'OBRIGATORIA',
        nivel_requerido INTEGER,
        critico_operacional INTEGER NOT NULL DEFAULT 0,
        origem TEXT NOT NULL DEFAULT 'REGULATORIO',
        observacoes TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );
      INSERT INTO matriz_treinamento_funcao
        (empresa_id, funcao_id, qualificacao_tipo_id, obrigatoriedade, origem)
      VALUES (1, 1, 100, 'OBRIGATORIA', 'REGULATORIO');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.meta.schema_ready).toBe(false);
    expect(body.data.configurado).toBe(true);
    expect(body.data.total_obrigatorios).toBe(1);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 100,
      escopo: 'FUNCAO',
      status_compliance: 'NAO_REALIZADO',
    });
  });

  it('distingue regra NAO_APLICA de ausencia de configuracao', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'NAO_APLICA', 'EMPRESA');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.configurado).toBe(true);
    expect(body.data.total_obrigatorios).toBe(0);
    expect(body.data.compliance_pct).toBeNull();
    expect(body.data.requisitos).toEqual([]);
  });

  it('detecta treinamento nunca realizado para novo funcionário mesmo sem vencimento prévio', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.total_obrigatorios).toBe(1);
    expect(body.data.nao_realizados).toBe(1);
    expect(body.data.compliance_pct).toBe(0);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 100,
      status_compliance: 'NAO_REALIZADO',
      status: 'EM_FALTA',
      escopo: 'EMPRESA',
    });
  });

  it('aplica a regra mais específica setor+função e permite NAO_APLICA explícito', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'NAO_APLICA', 'EMPRESA');
    `);

    const mec = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const piloto = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const mecBody = (await mec.json()) as any;
    const pilotoBody = (await piloto.json()) as any;

    expect(mecBody.data.total_obrigatorios).toBe(0);
    expect(mecBody.data.requisitos).toEqual([]);
    expect(pilotoBody.data.total_obrigatorios).toBe(1);
    expect(pilotoBody.data.nao_realizados).toBe(1);
  });

  it('não trata qualificação planejada como evidência concluída', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1000, 100, 'MNT-12', 'MANUTENCAO', '2026-09-20', '2027-09-20',
              'PLANEJADA', 0, 1, '2026-09-14', '2026-09-14');
    `);

    const response = await createApp(sqlite.asD1()).request('/pessoas?status=NAO_REALIZADO');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.map((person: any) => person.id)).toContain(1000);
    expect(body.data.find((person: any) => person.id === 1000).nao_realizados).toBe(1);
    expect(body.data.find((person: any) => person.id === 1000).conformes).toBe(0);
  });

  it('reconcilia histórico por código canônico quando a FK aponta para um tipo legado inativo', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO qualificacoes_tipos
        (id, empresa_id, codigo, nome, categoria, categoria_id, validade,
         carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, deleted_at)
      VALUES (190, 1, 'MNT-12-LEGACY', 'MNT legado', 'MANUTENCAO', 1, 12, 8, 8, 4,
              '2026-01-01 00:00:00');

      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1000, 190, 'MNT-12', 'MANUTENCAO', '2026-08-01', '2027-08-01',
              'CONCLUIDA', 0, 1, '2026-08-01', '2026-08-01');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.conformes).toBe(1);
    expect(body.data.nao_realizados).toBe(0);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 100,
      status_compliance: 'CONFORME',
      evidencia_origem: 'QUALIFICACAO',
      ultima_data: '2026-08-01',
    });
  });

  it('ordena evidências reconciliadas pela identidade canônica antes de escolher a mais recente', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO qualificacoes_tipos
        (id, empresa_id, codigo, nome, categoria, categoria_id, validade,
         carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, deleted_at)
      VALUES (190, 1, 'MNT-12-LEGACY', 'MNT legado', 'MANUTENCAO', 1, 12, 8, 8, 4,
              '2026-01-01 00:00:00');

      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at) VALUES
        (1000, 100, 'MNT-12', 'MANUTENCAO', '2025-08-01', '2026-08-01',
         'RENOVADA', 1, 1, '2025-08-01', '2025-08-01'),
        (1000, 190, 'MNT-12', 'MANUTENCAO', '2026-08-01', '2027-08-01',
         'CONCLUIDA', 0, 1, '2026-08-01', '2026-08-01');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.requisitos[0]).toMatchObject({
      status_compliance: 'CONFORME',
      ultima_data: '2026-08-01',
    });
  });

  it('usa a realização mais recente da qualificação, não o vencimento mais distante', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'FUNCAO', 1, 'OBRIGATORIA', 'REGULATORIO');

      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at) VALUES
        (1000, 100, 'MNT-12', 'MANUTENCAO', '2025-01-01', '2027-01-01',
         'CONCLUIDA', 0, 1, '2025-01-01', '2025-01-01'),
        (1000, 100, 'MNT-12', 'MANUTENCAO', '2026-08-01', '2026-09-01',
         'CONCLUIDA', 0, 1, '2026-08-01', '2026-08-01');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.compliance_pct).toBe(0);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 100,
      ultima_data: '2026-08-01',
      data_validade: '2026-09-01',
      status_compliance: 'VENCIDO',
      evidencia_origem: 'QUALIFICACAO',
    });
  });

  it('reconhece conclusão EAD diretamente vinculada ao tipo como evidência de compliance', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 101, 'SETOR_FUNCAO', 11, 2, 'OBRIGATORIA', 'REGULATORIO');

      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (500, 1, 'PBN EAD', 101);
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at)
      VALUES (700, 1, 500, 1002, 'CONCLUIDO', '2026-09-01', '2026-08-20', '2026-09-01');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;

    expect(body.data.conformes).toBe(1);
    expect(body.data.compliance_pct).toBe(100);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 101,
      status_compliance: 'CONFORME',
      evidencia_origem: 'LMS',
      curso_ead_titulo: 'PBN EAD',
    });
  });

  it('mantém matrícula EAD não iniciada como não realizada, sem inflar em andamento', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 101, 'SETOR_FUNCAO', 11, 2, 'OBRIGATORIA', 'REGULATORIO');

      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (500, 1, 'PBN EAD', 101);
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at)
      VALUES (700, 1, 500, 1002, 'NAO_INICIADO', NULL, '2026-09-10', '2026-09-10');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.nao_realizados).toBe(1);
    expect(body.data.em_andamento).toBe(0);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 101,
      status_compliance: 'NAO_REALIZADO',
      curso_ead_titulo: 'PBN EAD',
      lms_status: 'NAO_INICIADO',
    });
  });

  it('preserva conclusão EAD válida quando existe matrícula mais recente ainda em andamento', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 101, 'SETOR_FUNCAO', 11, 2, 'OBRIGATORIA', 'REGULATORIO');

      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id) VALUES
        (500, 1, 'PBN concluído', 101),
        (501, 1, 'PBN atualização', 101);
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at) VALUES
        (700, 1, 500, 1002, 'CONCLUIDO', '2026-09-01', '2026-08-20', '2026-09-01'),
        (701, 1, 501, 1002, 'EM_ANDAMENTO', NULL, '2026-09-10', '2026-09-10');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.conformes).toBe(1);
    expect(body.data.em_andamento).toBe(0);
    expect(body.data.compliance_pct).toBe(100);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 101,
      status_compliance: 'CONFORME',
      evidencia_origem: 'LMS',
      evidencia_id: 700,
      curso_ead_titulo: 'PBN atualização',
      lms_status: 'EM_ANDAMENTO',
    });
  });

  it('permite drill-down de pessoas por treinamento e status de compliance', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1000, 100, 'MNT-12', 'MANUTENCAO', '2026-01-01', '2027-01-01',
              'CONCLUIDA', 0, 1, '2026-01-01', '2026-01-01');
    `);

    const response = await createApp(sqlite.asD1()).request(
      '/pessoas?qualificacao_tipo_id=100&status=NAO_REALIZADO',
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.map((person: any) => person.id)).toEqual([1001, 1002]);
  });

  it('filtra pessoas por status geral mesmo sem treinamento específico', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1000, 100, 'MNT-12', 'MANUTENCAO', '2026-01-01', '2027-01-01',
              'CONCLUIDA', 0, 1, '2026-01-01', '2026-01-01');
    `);

    const response = await createApp(sqlite.asD1()).request('/pessoas?status=NAO_REALIZADO');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.map((person: any) => person.id)).toEqual([1001, 1002]);
  });

  it('não mistura requisitos recomendados nos drill-downs operacionais obrigatórios', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 101, 'EMPRESA', 'RECOMENDADA', 'EMPRESA');

      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1000, 101, 'OPS-12', 'OPERACOES', '2020-01-01', '2021-01-01',
              'CONCLUIDA', 0, 1, '2020-01-01', '2020-01-01');
    `);

    const byTraining = await createApp(sqlite.asD1()).request('/pessoas?qualificacao_tipo_id=101');
    const byStatus = await createApp(sqlite.asD1()).request('/pessoas?status=VENCIDO');
    const trainingBody = (await byTraining.json()) as any;
    const statusBody = (await byStatus.json()) as any;

    expect(byTraining.status).toBe(200);
    expect(trainingBody.data).toEqual([]);
    expect(byStatus.status).toBe(200);
    expect(statusBody.data).toEqual([]);
  });

  it('rejeita status inválido no drill-down de pessoas', async () => {
    const response = await createApp(sqlite.asD1()).request(
      '/pessoas?qualificacao_tipo_id=100&status=QUALQUER',
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Status de compliance inválido');
  });

  it('mantém isolamento de tenant no cálculo organizacional', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (2, 200, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
    `);

    const response = await createApp(sqlite.asD1()).request('/resumo');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.pessoas).toBe(3);
    expect(body.data.requisitos_obrigatorios).toBe(3);
    expect(body.data.nao_realizados).toBe(3);
    expect(body.data.setores.some((s: any) => s.setor_nome === 'Outro')).toBe(false);
  });
  it('expõe impacto da regra e quantas pessoas ficam efetivamente sob cada override', async () => {
    sqlite.database.exec(
      "INSERT INTO treinamento_requisitos (id,empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem) VALUES (70,1,100,'EMPRESA','OBRIGATORIA','EMPRESA'); INSERT INTO treinamento_requisitos (id,empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,origem) VALUES (71,1,100,'FUNCAO',1,'NAO_APLICA','EMPRESA');",
    );
    const response = await createApp(sqlite.asD1()).request('/regras?qualificacao_tipo_id=100');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.data.find((rule: any) => rule.id === 70).impacto).toEqual({
      abrangidas: 3,
      prevalece_para: 1,
    });
    expect(body.data.find((rule: any) => rule.id === 71).impacto).toEqual({
      abrangidas: 2,
      prevalece_para: 2,
    });
  });

  it('restringe gestor às funções presentes nos setores sob sua gestão', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'FUNCAO', 1, 'OBRIGATORIA', 'REGULATORIO');
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem)
      VALUES (1, 101, 'FUNCAO', 2, 'OBRIGATORIA', 'REGULATORIO');
    `);
    sectorAccessMock.access = { mode: 'restricted', setorIds: [10], funcionarioId: null };

    const response = await createApp(sqlite.asD1()).request('/regras');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.map((rule: any) => rule.funcao_id)).toEqual([1]);
  });

  it('impede gestor setorial de converter uma regra global existente em regra do seu setor', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (id, empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem)
      VALUES (90, 1, 100, 'FUNCAO', 1, 'OBRIGATORIA', 'REGULATORIO');
    `);
    sectorAccessMock.access = { mode: 'restricted', setorIds: [10], funcionarioId: null };

    const response = await createApp(sqlite.asD1()).request('/regras/90', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ escopo: 'SETOR', setor_id: 10, funcao_id: null }),
    });

    expect(response.status).toBe(403);
    const row = sqlite.database
      .prepare('SELECT escopo, setor_id, funcao_id FROM treinamento_requisitos WHERE id=90')
      .get() as any;
    expect(row).toMatchObject({ escopo: 'FUNCAO', setor_id: null, funcao_id: 1 });
  });

  it('protege regras regulatórias governadas por designação contra edição ou exclusão genérica', async () => {
    sqlite.database.exec(`
      CREATE TABLE compliance_condicoes (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
        nome TEXT NOT NULL, tipo TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
      );
      ALTER TABLE treinamento_requisitos ADD COLUMN condicao_id INTEGER;
      ALTER TABLE treinamento_requisitos ADD COLUMN fundamento_tipo TEXT;
      INSERT INTO compliance_condicoes VALUES (55,1,'DESIGNACAO_TESTE','Designação de teste','DESIGNACAO',1,NULL);
      INSERT INTO treinamento_requisitos
        (id,empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem,condicao_id,fundamento_tipo)
      VALUES
        (95,1,100,'EMPRESA','NAO_APLICA','REGULATORIO',55,'PADRAO_EXCLUSAO'),
        (96,1,101,'EMPRESA','NAO_APLICA','EMPRESA',55,'PADRAO_EXCLUSAO');
    `);
    const app = createApp(sqlite.asD1());

    const update = await app.request('/regras/95', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ obrigatoriedade: 'OBRIGATORIA' }),
    });
    const remove = await app.request('/regras/95', { method: 'DELETE' });
    expect(update.status).toBe(409);
    expect(remove.status).toBe(409);
    expect(await update.json()).toMatchObject({ error: expect.stringContaining('Regra governada') });
    expect(await remove.json()).toMatchObject({ error: expect.stringContaining('Regra governada') });

    const ordinaryRemove = await app.request('/regras/96', { method: 'DELETE' });
    expect(ordinaryRemove.status).toBe(200);
    const rows = sqlite.database
      .prepare('SELECT id,ativo,deleted_at FROM treinamento_requisitos WHERE id IN (95,96) ORDER BY id')
      .all() as Array<{ id: number; ativo: number; deleted_at: string | null }>;
    expect(rows[0]).toMatchObject({ id: 95, ativo: 1, deleted_at: null });
    expect(rows[1].id).toBe(96);
    expect(rows[1].ativo).toBe(0);
    expect(rows[1].deleted_at).not.toBeNull();
  });

  it('rejeita exclusão global redundante sem condição específica', async () => {
    const response = await createApp(sqlite.asD1()).request('/regras', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        qualificacao_tipo_id: 100,
        escopo: 'EMPRESA',
        obrigatoriedade: 'NAO_APLICA',
        origem: 'EMPRESA',
      }),
    });
    const body = (await response.json()) as any;
    expect(response.status).toBe(400);
    expect(body.error).toContain('Exclusão global sem condição é redundante');
    expect(
      sqlite.database.prepare("SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=1 AND qualificacao_tipo_id=100 AND escopo='EMPRESA' AND obrigatoriedade='NAO_APLICA' AND ativo=1 AND deleted_at IS NULL").get(),
    ).toMatchObject({ total: 0 });
  });

  it('agrega compliance por setor e por cargo', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'OBRIGATORIA', 'EMPRESA');
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1000, 100, 'MNT-12', 'MANUTENCAO', '2026-01-01', '2027-01-01',
              'CONCLUIDA', 0, 1, '2026-01-01', '2026-01-01');
    `);

    const response = await createApp(sqlite.asD1()).request('/setores');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    const manutencao = body.data.find((item: any) => item.setor_id === 10);
    expect(manutencao).toMatchObject({
      setor_nome: 'Manutenção',
      pessoas: 2,
      requisitos_obrigatorios: 2,
      requisitos_distintos: 1,
      conformes: 1,
      nao_realizados: 1,
      compliance_pct: 50,
    });
    expect(manutencao.cargos).toEqual([
      expect.objectContaining({
        funcao_nome: 'Mecânico',
        pessoas: 2,
        requisitos_obrigatorios: 2,
        requisitos_distintos: 1,
        compliance_pct: 50,
      }),
    ]);
  });

  it('permite detalhar pessoas sem configuração de matriz', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'OBRIGATORIA', 'EMPRESA');
    `);

    const response = await createApp(sqlite.asD1()).request('/pessoas?configurado=false');
    const body = (await response.json()) as {
      data: Array<{ id: number; configurado: boolean; funcao_nome: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data.map((person) => person.id)).toEqual([1002]);
    expect(body.data[0]).toMatchObject({ configurado: false, funcao_nome: 'Piloto' });
  });

  it('expõe requisitos distintos do cargo sem multiplicar pela quantidade de pessoas', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem, referencia_normativa)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'OBRIGATORIA', 'REGULATORIO', 'RBAC 121');
    `);

    const response = await createApp(sqlite.asD1()).request(
      '/requisitos-aplicaveis?setor_id=10&funcao_id=1',
    );
    const body = (await response.json()) as {
      meta: { pessoas: number; requisitos_distintos: number; obrigacoes_individuais: number };
      data: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(body.meta).toMatchObject({
      pessoas: 2,
      requisitos_distintos: 1,
      obrigacoes_individuais: 2,
    });
    expect(body.data).toEqual([
      expect.objectContaining({
        qualificacao_tipo_id: 100,
        pessoas: 2,
        obrigacoes_individuais: 2,
        referencias_normativas: ['RBAC 121'],
        nao_realizados: 2,
      }),
    ]);
  });

  it('reconcilia matrícula sem requisito e requisito obrigatório sem matrícula sem inferir regra', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'OBRIGATORIA', 'EMPRESA');
      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id) VALUES
        (500, 1, 'PBN EAD', 101),
        (501, 1, 'MNT EAD', 100);
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at)
      VALUES (700, 1, 500, 1000, 'NAO_INICIADO', NULL, '2026-09-10', '2026-09-10');
    `);

    const response = await createApp(sqlite.asD1()).request('/reconciliacao');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.data.resumo.matriculados_sem_requisito).toBe(1);
    expect(body.data.resumo.gaps_matricula_acionaveis).toBe(2);
    expect(body.data.matriculas_revisao[0]).toMatchObject({
      matricula_id: 700,
      situacao: 'MATRICULADO_SEM_REQUISITO',
      funcionario_id: 1000,
      qualificacao_tipo_id: 101,
    });
    const mntGap = body.data.gaps_matricula.find((item: any) => item.qualificacao_tipo_id === 100);
    expect(mntGap).toMatchObject({ pessoas: 2, nunca_realizados: 2 });
    expect(mntGap.cursos_ead).toEqual([{ id: 501, titulo: 'MNT EAD' }]);
  });

  it('inclui requisito recomendado e permite renovação quando só existe matrícula concluída', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 101, 'SETOR_FUNCAO', 11, 2, 'RECOMENDADA', 'EMPRESA');
      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (500, 1, 'SOP S76 EAD', 101);
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at)
      VALUES (700, 1, 500, 1002, 'CONCLUIDO', '2024-01-01', '2024-01-01', '2024-01-01');
    `);

    const app = createApp(sqlite.asD1());
    const response = await app.request('/reconciliacao');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    const renewalGap = body.data.gaps_matricula.find(
      (item: any) => item.qualificacao_tipo_id === 101,
    );
    expect(renewalGap).toMatchObject({ pessoas: 1, vencidos: 1, nunca_realizados: 0 });
    expect(renewalGap.cursos_ead).toEqual([{ id: 500, titulo: 'SOP S76 EAD' }]);

    sqlite.database.exec(`
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at)
      VALUES (701, 1, 500, 1002, 'NAO_INICIADO', NULL, '2026-09-16', '2026-09-16');
    `);
    const withOpenEnrollment = (await (await app.request('/reconciliacao')).json()) as any;
    expect(
      withOpenEnrollment.data.gaps_matricula.find((item: any) => item.qualificacao_tipo_id === 101),
    ).toBeUndefined();
  });

  it('não aceita evidência com data de realização futura como compliance válido', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'OBRIGATORIA', 'EMPRESA');
      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (501, 1, 'MNT EAD', 100);
      INSERT INTO qualificacoes_historico
        (id, empresa_id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, deleted_at)
      VALUES (9900, 1, 1000, 100, date('now','+10 days'), date('now','+400 days'), 'VALIDA', NULL);
    `);

    const app = createApp(sqlite.asD1());
    const person = (await (await app.request('/funcionarios/1000')).json()) as any;
    const requirement = person.data.requisitos.find((item: any) => item.qualificacao_tipo_id === 100);
    expect(requirement.status_compliance).toBe('NAO_REALIZADO');
    expect(requirement.ultima_data).toBeNull();

    const reconciliation = (await (await app.request('/reconciliacao')).json()) as any;
    const gap = reconciliation.data.gaps_matricula.find((item: any) => item.qualificacao_tipo_id === 100);
    expect(gap).toMatchObject({ pessoas: 2, nunca_realizados: 2 });
  });

  it('abre renovação antecipada em 60 dias sem alterar o status global de compliance', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (1, 100, 'SETOR_FUNCAO', 10, 1, 'OBRIGATORIA', 'EMPRESA');
      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (501, 1, 'MNT EAD', 100);
      INSERT INTO qualificacoes_historico
        (id, empresa_id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, deleted_at)
      VALUES (9901, 1, 1000, 100, date('now','-300 days'), date('now','+45 days'), 'VALIDA', NULL);
    `);

    const app = createApp(sqlite.asD1());
    const person = (await (await app.request('/funcionarios/1000')).json()) as any;
    const requirement = person.data.requisitos.find((item: any) => item.qualificacao_tipo_id === 100);
    expect(requirement.status_compliance).toBe('CONFORME');
    expect(requirement.dias_para_vencer).toBeGreaterThan(30);
    expect(requirement.dias_para_vencer).toBeLessThanOrEqual(60);

    const reconciliation = (await (await app.request('/reconciliacao')).json()) as any;
    const gap = reconciliation.data.gaps_matricula.find((item: any) => item.qualificacao_tipo_id === 100);
    expect(gap).toMatchObject({
      pessoas: 2,
      renovacao_antecipada: 1,
      janela_renovacao_dias: 60,
    });
  });

  it('persiste decisão de manter matrícula avulsa e permite reabrir a reconciliação', async () => {
    sqlite.database.exec(`
      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (500, 1, 'PBN EAD', 101);
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at)
      VALUES (700, 1, 500, 1000, 'NAO_INICIADO', NULL, '2026-09-10', '2026-09-10');
    `);
    const app = createApp(sqlite.asD1());
    const saved = await app.request('/reconciliacao/700/decisao', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisao: 'MANTER_AVULSA', observacoes: 'Capacitação pontual' }),
    });
    expect(saved.status).toBe(200);
    const reconciled = (await (await app.request('/reconciliacao')).json()) as any;
    expect(reconciled.data.resumo.matriculas_avulsas_reconciliadas).toBe(1);
    expect(reconciled.data.matriculas_revisao[0].situacao).toBe('MATRICULA_AVULSA_RECONCILIADA');

    const reopened = await app.request('/reconciliacao/700/decisao', { method: 'DELETE' });
    expect(reopened.status).toBe(200);
    const after = (await (await app.request('/reconciliacao')).json()) as any;
    expect(after.data.matriculas_revisao[0].situacao).toBe('MATRICULADO_SEM_REQUISITO');
  });

  it('expõe a matriz por organização com regra efetiva e override direto', async () => {
    sqlite.database.exec(`
      CREATE TABLE setores_funcoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, setor_id INTEGER NOT NULL,
        funcao_id INTEGER NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
      );
      INSERT INTO setores_funcoes (empresa_id,setor_id,funcao_id) VALUES (1,10,1);
      INSERT INTO treinamento_requisitos
        (id, empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (80, 1, 100, 'EMPRESA', 'RECOMENDADA', 'EMPRESA');
      INSERT INTO treinamento_requisitos
        (id, empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, obrigatoriedade, origem)
      VALUES (81, 1, 100, 'SETOR_FUNCAO', 10, 1, 'OBRIGATORIA', 'EMPRESA');
      INSERT INTO treinamento_requisitos
        (id, empresa_id, qualificacao_tipo_id, escopo, funcionario_id, obrigatoriedade, origem)
      VALUES (82, 1, 100, 'FUNCIONARIO', 1001, 'NAO_APLICA', 'EMPRESA');
    `);
    const response = await createApp(sqlite.asD1()).request(
      '/matriz-organizacao?setor_id=10&funcao_id=1',
    );
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    const row = body.data.find((item: any) => item.qualificacao_tipo_id === 100);
    expect(row).toMatchObject({
      efetiva: { id: 81, escopo: 'SETOR_FUNCAO', obrigatoriedade: 'OBRIGATORIA' },
      direta: { id: 81, escopo: 'SETOR_FUNCAO', obrigatoriedade: 'OBRIGATORIA' },
      impacto: {
        pessoas: 2,
        atingidas_neste_nivel: 1,
        override_mais_especifico: 1,
        com_requisito: 1,
        sem_requisito: 1,
        matriculados: 0,
        sem_matricula: 2,
      },
    });
  });

  it('rejeita regra setor+função fora do mapa canônico', async () => {
    sqlite.database.exec(`
      CREATE TABLE setores_funcoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, setor_id INTEGER NOT NULL,
        funcao_id INTEGER NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
      );
      INSERT INTO setores_funcoes (empresa_id,setor_id,funcao_id) VALUES (1,10,1);
    `);
    const response = await createApp(sqlite.asD1()).request('/regras', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        qualificacao_tipo_id: 100,
        escopo: 'SETOR_FUNCAO',
        setor_id: 10,
        funcao_id: 2,
        obrigatoriedade: 'OBRIGATORIA',
      }),
    });
    const body = (await response.json()) as any;
    expect(response.status).toBe(400);
    expect(body.error).toBe('Cargo/função não pertence ao setor selecionado');
  });

  it('usa o mapa canônico setor-função mesmo quando ainda não há funcionário no cargo', async () => {
    sqlite.database.exec(`
      INSERT INTO funcoes (id, empresa_id, codigo, nome) VALUES (3, 1, 'ENG', 'Engenheiro');
      CREATE TABLE setores_funcoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        setor_id INTEGER NOT NULL,
        funcao_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT
      );
      INSERT INTO setores_funcoes (empresa_id,setor_id,funcao_id) VALUES
        (1,10,1),(1,10,3);
    `);

    const response = await createApp(sqlite.asD1()).request('/catalogos');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.setor_funcoes).toEqual([
      { setor_id: 10, funcao_id: 1 },
      { setor_id: 10, funcao_id: 3 },
    ]);
    expect(body.data.funcoes.map((item: any) => item.id)).toEqual([3, 1]);
    expect(body.data.funcoes.map((item: any) => item.nome)).toEqual(['Engenheiro', 'Mecânico']);
  });

  it('lista pendências obrigatórias por pessoa sem transformar nunca realizado em conformidade', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
    `);
    const response = await createApp(sqlite.asD1()).request('/pendencias?status=NAO_REALIZADO');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.data.map((row: any) => row.funcionario_id).sort()).toEqual([1000, 1001, 1002]);
    expect(body.data.every((row: any) => row.status_compliance === 'NAO_REALIZADO')).toBe(true);
    expect(body.meta).toMatchObject({ total: 3, funcionarios: 3, nunca_realizados: 3 });
  });

  it('recalcula automaticamente todos os funcionarios: conclusoes de historico/LMS saem da pendencia, vencimento continua', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
    `);
    const app = createApp(sqlite.asD1());
    const pending = async () => {
      const response = await app.request('/pendencias?status=NAO_REALIZADO,VENCIDO');
      expect(response.status).toBe(200);
      return (await response.json() as any).data as Array<{
        funcionario_id: number; status_compliance: string;
      }>;
    };
    expect((await pending()).map((row) => row.funcionario_id).sort()).toEqual([1000, 1001, 1002]);

    // Conclusao por registro de qualificacao: imediatamente reconhecida sem nova matricula.
    sqlite.database.exec(`
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
         data_conclusao, data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1000, 100, 'MNT-12', 'OPERACOES',
              '2026-08-01', '2030-08-01', 'CONCLUIDA', 0, 1, '2026-08-01', '2026-08-01');
    `);
    expect((await pending()).map((row) => row.funcionario_id).sort()).toEqual([1001, 1002]);

    // O mesmo calculo aceita conclusao LMS imediatamente, sem recomecar nem rematricular.
    sqlite.database.exec(`
      INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (505, 1, 'Curso obrigatorio', 100);
      INSERT INTO lms_matriculas
        (id, empresa_id, curso_id, funcionario_id, status, data_conclusao, created_at, updated_at)
      VALUES (705, 1, 505, 1001, 'CONCLUIDO', '2026-08-02', '2026-08-01', '2026-08-02');
    `);
    expect((await pending()).map((row) => row.funcionario_id)).toEqual([1002]);

    // Evidencia realmente vencida e pendente, mas nunca classificada "nunca realizou".
    sqlite.database.exec(`
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
         data_conclusao, data_vencimento, status, renovada, empresa_id, created_at, updated_at)
      VALUES (1002, 100, 'MNT-12', 'OPERACOES',
              '2024-08-01', '2025-08-01', 'CONCLUIDA', 0, 1, '2024-08-01', '2024-08-01');
    `);
    expect(await pending()).toMatchObject([{ funcionario_id: 1002, status_compliance: 'VENCIDO' }]);
    for (const funcionarioId of [1000, 1001]) {
      const response = await app.request(`/funcionarios/${funcionarioId}`);
      expect((await response.json() as any).data.requisitos[0].status_compliance).toBe('CONFORME');
    }
  });

  it('agrega histórico de cobrança sem depender de LIMIT alto', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');

      INSERT INTO notificacoes_log
        (empresa_id, funcionario_cpf, tipo, destinatario, assunto, corpo, status, enviado_em)
      VALUES
        (1, '111', 'EMAIL_COMPLIANCE', 'pessoa@example.com', '[COMPLIANCE_TREINAMENTO:100:A]',
         '{"funcionario_id":1000,"qualificacao_tipo_id":100}', 'enviada', '2026-09-20 10:00:00'),
        (1, '111', 'WHATSAPP_COMPLIANCE', '+5522999999999', '[COMPLIANCE_TREINAMENTO:100:B]',
         '{"funcionario_id":1000,"qualificacao_tipo_id":100}', 'enviada', '2026-09-21 10:00:00'),
        (1, '111', 'EMAIL_COMPLIANCE', 'pessoa@example.com', '[COMPLIANCE_TREINAMENTO:100:C]',
         '{"funcionario_id":1000,"qualificacao_tipo_id":100}', 'erro', '2026-09-21 12:00:00');
    `);
    const response = await createApp(sqlite.asD1()).request('/pendencias?status=NAO_REALIZADO');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    const row = body.data.find((item: any) => item.funcionario_id === 1000);
    expect(row).toMatchObject({
      avisos_enviados: 2,
      ultimo_aviso_em: '2026-09-21 12:00:00',
      ultimo_canal: 'EMAIL_COMPLIANCE',
      ultimo_status_envio: 'erro',
    });
  });

  it('mantém a central de pendências limitada aos setores autorizados do gestor', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
    `);
    sectorAccessMock.access = { mode: 'restricted', setorIds: [10], funcionarioId: null };
    const response = await createApp(sqlite.asD1()).request('/pendencias?status=NAO_REALIZADO');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.data.map((row: any) => row.funcionario_id).sort()).toEqual([1000, 1001]);
    expect(body.data.some((row: any) => row.funcionario_id === 1002)).toBe(false);
  });

  it('expõe o ponto atual de tendência sem inventar histórico quando o snapshot ainda não existe', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, obrigatoriedade, origem)
      VALUES (1, 100, 'EMPRESA', 'OBRIGATORIA', 'EMPRESA');
    `);
    const response = await createApp(sqlite.asD1()).request('/tendencias?days=90');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.meta.history_ready).toBe(false);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      pessoas: 3,
      requisitos_obrigatorios: 3,
      conformes: 0,
      nao_realizados: 3,
      compliance_pct: 0,
    });
  });

  it('não aceita EAD como evidência quando o requisito exige modalidade presencial', async () => {
    sqlite.database.exec(`
      ALTER TABLE treinamento_requisitos ADD COLUMN modalidade_requerida TEXT;
      ALTER TABLE qualificacoes_historico ADD COLUMN formato_codigo TEXT;
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem, modalidade_requerida)
      VALUES (1, 100, 'FUNCAO', 1, 'OBRIGATORIA', 'REGULATORIO', 'PRESENCIAL');
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at, formato_codigo)
      VALUES (1000, 100, 'MNT-12', 'EAD', '2026-08-01', '2028-08-01',
              'CONCLUIDA', 0, 1, '2026-08-01', '2026-08-01', 'EAD');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data.nao_realizados).toBe(1);
    expect(body.data.requisitos[0]).toMatchObject({
      qualificacao_tipo_id: 100,
      status_compliance: 'NAO_REALIZADO',
      modalidade_requerida: 'PRESENCIAL',
      evidencia_modalidade: 'EAD',
      evidencia_modalidade_incompativel: true,
    });
  });

  it('classifica CA-EBS concluído com formato legado indefinido como evidência a validar, sem inventar prática', async () => {
    sqlite.database.exec(`
      ALTER TABLE treinamento_requisitos ADD COLUMN modalidade_requerida TEXT;
      ALTER TABLE qualificacoes_historico ADD COLUMN formato_codigo TEXT;
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem, modalidade_requerida)
      VALUES (1, 100, 'FUNCAO', 1, 'OBRIGATORIA', 'PTO', 'PRATICO');
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at, formato_codigo)
      VALUES (1000, 100, 'MNT-12', 'Prático', '2026-02-26', '2030-02-26',
              'CONCLUIDA', 0, 1, '2026-02-26', '2026-02-26', 'NAO_CLASSIFICADO');
    `);
    const response = await createApp(sqlite.asD1()).request('/funcionarios/1000');
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.data.requisitos[0]).toMatchObject({
      status_compliance: 'NAO_REALIZADO',
      evidencia_modalidade: 'NAO_CLASSIFICADO',
      evidencia_modalidade_incompativel: true,
      evidencia_pendente_validacao: true,
      evidencia_pendente_motivo: 'MODALIDADE',
    });
  });

  it('exige correspondência exata do perfil de competência para AVSEC/DGR', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem, perfil_competencia)
      VALUES (1, 101, 'FUNCAO', 2, 'OBRIGATORIA', 'REGULATORIO', 'AVSEC_TRIPULANTE');
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at, perfil_competencia)
      VALUES (1002, 101, 'D1', 'OPERACOES', '2026-09-01', '2028-09-01',
              'CONCLUIDA', 0, 1, '2026-09-01', '2026-09-01', 'AVSEC_OPERACOES_SOLO');
    `);
    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;
    expect(body.data.requisitos[0]).toMatchObject({
      status_compliance: 'NAO_REALIZADO',
      perfil_competencia: 'AVSEC_TRIPULANTE',
      evidencia_perfil_incompativel: true,
    });
  });

  it('usa a evidência mais recente do perfil correto, sem ser escondida por outro perfil mais novo', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem, perfil_competencia)
      VALUES (1, 101, 'FUNCAO', 2, 'OBRIGATORIA', 'REGULATORIO', 'PTAP_TRIPULANTE_VOO');
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at, perfil_competencia) VALUES
        (1002, 101, 'D4', 'OPERACOES', '2026-08-01', '2028-08-01', 'CONCLUIDA', 0, 1, '2026-08-01', '2026-08-01', 'PTAP_TRIPULANTE_VOO'),
        (1002, 101, 'D4', 'OPERACOES', '2026-09-01', '2028-09-01', 'CONCLUIDA', 0, 1, '2026-09-01', '2026-09-01', 'PTAP_AGENTE_RAMPA');
    `);
    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;
    expect(body.data.requisitos[0]).toMatchObject({
      status_compliance: 'CONFORME',
      ultima_data: '2026-08-01',
      evidencia_perfil_competencia: 'PTAP_TRIPULANTE_VOO',
      evidencia_perfil_incompativel: false,
    });
  });

  it('aceita o mesmo histórico como evidência de dois perfis quando ambos estão explicitamente relacionados', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem, perfil_competencia)
      VALUES
        (1, 101, 'FUNCAO', 2, 'OBRIGATORIA', 'REGULATORIO', 'AVSEC_TRIPULANTE'),
        (1, 101, 'FUNCAO', 2, 'OBRIGATORIA', 'REGULATORIO', 'AVSEC_OPERACOES_SOLO');
      INSERT INTO qualificacoes_historico
        (id, funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at, perfil_competencia)
      VALUES (9001, 1002, 101, 'D1', 'OPERACOES', '2026-09-01', '2028-09-01',
              'CONCLUIDA', 0, 1, '2026-09-01', '2026-09-01', 'AVSEC_TRIPULANTE');
      INSERT INTO qualificacoes_historico_perfis_competencia
        (empresa_id, historico_id, perfil_competencia)
      VALUES
        (1, 9001, 'AVSEC_TRIPULANTE'),
        (1, 9001, 'AVSEC_OPERACOES_SOLO');
    `);

    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;
    const byProfile = new Map(
      body.data.requisitos.map((item: any) => [item.perfil_competencia, item]),
    );

    expect(response.status).toBe(200);
    expect(byProfile.get('AVSEC_TRIPULANTE')).toMatchObject({
      status_compliance: 'CONFORME',
      evidencia_perfil_competencia: 'AVSEC_TRIPULANTE',
    });
    expect(byProfile.get('AVSEC_OPERACOES_SOLO')).toMatchObject({
      status_compliance: 'CONFORME',
      evidencia_perfil_competencia: 'AVSEC_OPERACOES_SOLO',
    });
  });

  it('não aceita evidência sem perfil quando o requisito é perfilado após 0519', async () => {
    sqlite.database.exec(`
      INSERT INTO treinamento_requisitos
        (empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade, origem, perfil_competencia)
      VALUES (1, 101, 'FUNCAO', 2, 'OBRIGATORIA', 'REGULATORIO', 'PTAP_TRIPULANTE_VOO');
      INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao,
         data_vencimento, status, renovada, empresa_id, created_at, updated_at, perfil_competencia)
      VALUES (1002, 101, 'D4', 'OPERACOES', '2026-09-01', '2028-09-01',
              'CONCLUIDA', 0, 1, '2026-09-01', '2026-09-01', NULL);
    `);
    const response = await createApp(sqlite.asD1()).request('/funcionarios/1002');
    const body = (await response.json()) as any;
    expect(body.data.requisitos[0].status_compliance).toBe('NAO_REALIZADO');
    expect(body.data.requisitos[0].evidencia_perfil_incompativel).toBe(true);
  });
});
