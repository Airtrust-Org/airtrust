/**
 * Auditoria Compliance ↔ LMS — visibilidade da matrícula para o aluno, com SQL real (SQLite).
 *
 * Caso de regressão: funcionário matriculado administrativamente que "não vê" o curso.
 * Invariantes verificadas aqui na camada de repositório/identidade (as mesmas funções usadas
 * por GET /api/lms/matriculas/minhas e /minhas-ead):
 *   - o aluno vê exatamente as próprias matrículas (nunca as de outro funcionário/tenant);
 *   - matrícula CANCELADA não aparece nem soma no total (contrato da issue #1492);
 *   - sem vínculo usuário→funcionário ativo da empresa, não há identidade (null → 409 na rota).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  countMinhasEnrollments,
  listMinhasEadEnrollments,
  listMinhasEnrollments,
} from '../../repositories/lms-matricula-queries';
import { resolveLmsFuncionarioId } from '../../services/lms-learner-identity';

let sqlite: SqliteD1Database;
let db: D1Database;

beforeEach(() => {
  sqlite = new SqliteD1Database();
  db = sqlite as unknown as D1Database;
  sqlite.database.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS lms_matriculas;
    DROP TABLE IF EXISTS lms_cursos;
    DROP TABLE IF EXISTS qualificacoes_historico;
    DROP TABLE IF EXISTS qualificacoes_tipos;
    DROP TABLE IF EXISTS usuarios;
    DROP TABLE IF EXISTS funcionarios;
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nome TEXT,
      status TEXT DEFAULT 'ATIVO', ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, titulo TEXT, categoria TEXT,
      carga_horaria_minutos INTEGER, thumbnail_r2_key TEXT, tipo_conteudo TEXT, scorm_versao TEXT,
      publicado INTEGER DEFAULT 1, gerar_qualificacao_ao_concluir INTEGER DEFAULT 0, deleted_at TEXT
    );
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL, status TEXT NOT NULL, progresso_pct REAL DEFAULT 0, score_final REAL,
      data_matricula TEXT, data_inicio TEXT, data_conclusao TEXT, data_expiracao TEXT,
      qualificacao_historico_id INTEGER, deleted_at TEXT, updated_at TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT, certificado_arquivo_id INTEGER,
      data_vencimento TEXT, data_conclusao TEXT, validade_meses INTEGER, qualificacao_id INTEGER
    );
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT, validade INTEGER, codigo TEXT
    );

    INSERT INTO funcionarios (id, empresa_id, nome, status, ativo) VALUES
      (101, 1, 'Gestor A', 'ATIVO', 1),
      (102, 1, 'Piloto B', 'ATIVO', 1),
      (103, 1, 'Inativo C', 'INATIVO', 0),
      (201, 2, 'Outro Tenant', 'ATIVO', 1);
    INSERT INTO usuarios (id, funcionario_id) VALUES (1, 101), (2, 102), (3, NULL), (4, 103), (5, 201);
    INSERT INTO usuarios (id, funcionario_id, deleted_at) VALUES (6, 101, '2026-01-01');

    INSERT INTO lms_cursos (id, empresa_id, titulo) VALUES
      (50, 1, 'CRM para Gestores'), (51, 1, 'NR-35'), (52, 1, 'Curso removido'), (60, 2, 'CRM T2');
    UPDATE lms_cursos SET deleted_at = '2026-02-01' WHERE id = 52;

    INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, curso_id, status, updated_at) VALUES
      (1, 1, 101, 50, 'NAO_INICIADO', '2026-10-01'),
      (2, 1, 101, 51, 'CANCELADO',    '2026-10-02'),
      (3, 1, 102, 50, 'EM_ANDAMENTO', '2026-10-03'),
      (4, 1, 101, 52, 'NAO_INICIADO', '2026-10-04'),
      (5, 2, 201, 60, 'NAO_INICIADO', '2026-10-05');
    INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, curso_id, status, deleted_at, updated_at) VALUES
      (6, 1, 101, 51, 'NAO_INICIADO', '2026-09-01', '2026-09-01');
  `);
});

describe('identidade do aluno (usuário → funcionário ativo da empresa)', () => {
  it('usuário vinculado a funcionário ativo da empresa resolve o funcionário', async () => {
    expect(await resolveLmsFuncionarioId(db, 1, 1)).toBe(101);
  });

  it.each([
    ['usuário sem vínculo funcional', 3, 1],
    ['funcionário inativo', 4, 1],
    ['usuário removido', 6, 1],
    ['vínculo de outra empresa (tenant errado)', 5, 1],
    ['usuário inexistente', 999, 1],
    ['tenant inválido', 1, 0],
  ])('%s → sem identidade (null)', async (_label, userId, empresaId) => {
    expect(await resolveLmsFuncionarioId(db, userId, empresaId)).toBeNull();
  });
});

describe('matrículas do aluno — escopo e cancelamento', () => {
  it('/minhas-ead: só as próprias, sem CANCELADO, sem curso removido, sem matrícula soft-deleted', async () => {
    const rows = await listMinhasEadEnrollments(db, { funcionarioId: 101, empresaId: 1 });
    expect((rows.results ?? []).map((r) => r.id)).toEqual([1]);
  });

  it('/minhas: não lista matrícula CANCELADA nem a soma no total', async () => {
    const rows = await listMinhasEnrollments(db, { funcionarioId: 101, empresaId: 1, limit: 100, offset: 0 });
    const ids = (rows.results ?? []).map((r) => r.id);
    expect(ids).toEqual([1]);
    const total = await countMinhasEnrollments(db, { funcionarioId: 101, empresaId: 1 });
    expect(total?.n).toBe(1);
  });

  it('/minhas e /minhas-ead concordam entre si para o mesmo aluno', async () => {
    const ead = await listMinhasEadEnrollments(db, { funcionarioId: 101, empresaId: 1 });
    const minhas = await listMinhasEnrollments(db, { funcionarioId: 101, empresaId: 1, limit: 100, offset: 0 });
    expect((minhas.results ?? []).map((r) => r.id).sort()).toEqual(
      (ead.results ?? []).map((r) => r.id).sort(),
    );
  });

  it('nunca expõe matrícula de outro funcionário nem de outro tenant', async () => {
    const own = await listMinhasEnrollments(db, { funcionarioId: 102, empresaId: 1, limit: 100, offset: 0 });
    expect((own.results ?? []).map((r) => r.id)).toEqual([3]);
    // funcionário de outro tenant consultado com o tenant errado: vazio.
    const crossTenant = await listMinhasEnrollments(db, { funcionarioId: 201, empresaId: 1, limit: 100, offset: 0 });
    expect(crossTenant.results ?? []).toEqual([]);
    const crossTotal = await countMinhasEnrollments(db, { funcionarioId: 201, empresaId: 1 });
    expect(crossTotal?.n).toBe(0);
  });
});
