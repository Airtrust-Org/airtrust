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
  filterRequestedSetorIdsByAccess: vi.fn((ids: number[], access: { mode: string; setorIds: number[] }) =>
    access.mode === 'all' ? ids : ids.filter((id) => access.setorIds.includes(id)),
  ),
  assertFuncionarioInScope: vi.fn(async () => undefined),
}));

import complianceRouter from '../../routes/compliance-treinamentos';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ success: false, error: error.message }, error.statusCode as 400 | 403 | 404 | 409 | 500);
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
    UPDATE setores SET nome = CASE id WHEN 10 THEN 'Manutenção' WHEN 11 THEN 'Operações' ELSE 'Outro' END;

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
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
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
    const row = sqlite.database.prepare('SELECT escopo, setor_id, funcao_id FROM treinamento_requisitos WHERE id=90').get() as any;
    expect(row).toMatchObject({ escopo: 'FUNCAO', setor_id: null, funcao_id: 1 });
  });

});
