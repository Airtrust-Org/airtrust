import type { SqliteD1Database } from './qualification-history-sqlite-d1';

/**
 * Schema mínimo (SQLite em memória) para exercitar o PUT /sessoes/:id de Simuladores.
 * Estende as tabelas que o SqliteD1Database já cria (empresas, setores, funcionarios,
 * qualificacoes_*) com ALTER TABLE e ids que não colidem com o seed base.
 */
export function createSessoesUpdateSchema(sqlite: SqliteD1Database): void {
  sqlite.database.exec(`
    UPDATE empresas SET operational_domain_rbac_enabled = 0;
    INSERT OR IGNORE INTO empresas (id, operational_domain_rbac_enabled) VALUES (1, 0), (2, 0);

    CREATE TABLE simuladores (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, aeronave_codigo TEXT, codigo_aeronave TEXT,
      tipo TEXT, modelo TEXT, deleted_at TEXT
    );
    INSERT INTO simuladores (id, empresa_id, aeronave_codigo) VALUES (1, 1, 'AW139');

    CREATE TABLE simulador_agendamentos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, simulador_id INTEGER, data TEXT,
      hora_inicio TEXT, hora_fim TEXT, status TEXT, nome TEXT, tipo_sessao TEXT, observacoes TEXT,
      instrutor_id INTEGER, examinador_id INTEGER, is_check INTEGER DEFAULT 0, template_id INTEGER,
      modo_compartilhado INTEGER DEFAULT 0, tipo_dispositivo TEXT, aeronave_id INTEGER,
      duracao_minutos INTEGER, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO simulador_agendamentos
      (id, empresa_id, simulador_id, data, hora_inicio, hora_fim, status, nome, tipo_sessao, instrutor_id)
    VALUES
      (10, 1, 1, '2026-05-10', '08:00', '10:00', 'AGENDADA', 'Sessão A', 'PERIODICO', 100),
      (20, 2, 1, '2026-05-10', '12:00', '14:00', 'AGENDADA', 'Outra empresa', 'PERIODICO', NULL),
      (30, 1, 1, '2026-05-11', '08:00', '10:00', 'AGENDADA', 'Compartilhada', 'PERIODICO', NULL),
      (11, 1, 1, '2026-05-12', '08:00', '10:00', 'AGENDADA', 'Sem instrutor', 'PERIODICO', NULL);
    UPDATE simulador_agendamentos SET modo_compartilhado = 1 WHERE id = 30;

    ALTER TABLE funcionarios ADD COLUMN is_instrutor INTEGER DEFAULT 0;
    ALTER TABLE funcionarios ADD COLUMN is_examinador INTEGER DEFAULT 0;
    ALTER TABLE funcionarios ADD COLUMN is_checador INTEGER DEFAULT 0;
    INSERT INTO funcionarios (id, empresa_id, nome, is_instrutor, is_examinador, is_checador) VALUES
      (100, 1, 'Instrutor', 1, 0, 0),
      (200, 1, 'Examinador', 0, 1, 0),
      (201, 1, 'Checador', 0, 0, 1),
      (202, 1, 'Sem flag', 0, 0, 0),
      (300, 2, 'Examinador outra empresa', 0, 1, 0);

    ALTER TABLE qualificacoes_categorias ADD COLUMN codigo TEXT;
    ALTER TABLE qualificacoes_categorias ADD COLUMN ativo INTEGER DEFAULT 1;
    INSERT INTO qualificacoes_categorias (id, empresa_id, codigo, ativo) VALUES (91, 1, 'CHECK', 1), (92, 2, 'CHECK', 1);
    ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN descricao TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER DEFAULT 1;
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria_id) VALUES
      (501, 1, 'IFR-139', 'IFR AW139', 91),
      (502, 1, 'VFR-76', 'VFR SK76', 91),
      (503, 1, 'GERAL', 'Geral', 91),
      (504, 1, 'FAP13-EXA', 'FAP13', 91),
      (601, 2, 'OUTRA', 'Outra empresa', 92);

    CREATE TABLE sessoes_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER NOT NULL,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE sessoes_checks_resultados (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_check_id INTEGER NOT NULL, created_at TEXT,
      updated_at TEXT, deleted_at TEXT
    );
    ALTER TABLE qualificacoes_historico ADD COLUMN sessao_id INTEGER;

    CREATE TABLE tipos_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, deleted_at TEXT);
    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT, nome TEXT, tipo_sessao_id INTEGER,
      modelo_aeronave TEXT, deleted_at TEXT
    );
    INSERT INTO modelos_sessao (id, empresa_id, codigo) VALUES (77, 1, 'CRED-EXA'), (88, 2, 'CRED-EXA');
    CREATE TABLE fichas_sessao (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, agendamento_slot_id INTEGER, colaborador_id_aluno INTEGER,
      instrutor_id INTEGER, tipo_sessao TEXT, tipo_aeronave TEXT, data_sessao TEXT, status TEXT,
      template_id INTEGER, empresa_id INTEGER NOT NULL, assinatura_aluno_timestamp TEXT,
      assinatura_instrutor_timestamp TEXT, assinatura_aluno_imagem TEXT, assinatura_instrutor_imagem TEXT,
      data_conclusao TEXT, deleted_at TEXT
    );
    CREATE TABLE fichas_sessao_manobras (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ficha_id INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE auditoria_avancada_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tabela TEXT, acao TEXT, registro_id TEXT,
      dados_anteriores TEXT, dados_novos TEXT
    );
  `);
}

