import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function colInfo(output: string): ColumnInfo[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [cid, name, type, notnull, dflt_value, pk] = line.split('|');
      return {
        cid: Number(cid),
        name,
        type,
        notnull: Number(notnull),
        dflt_value: dflt_value === 'NULL' || dflt_value === '' ? null : dflt_value,
        pk: Number(pk),
      };
    });
}

function migrationSql(): string {
  return readFileSync(join(__dirname, '../../../migrations/0397_harden_empresa_id_wave2.sql'), 'utf8');
}

describe('Wave 2 — empresa_id hardening', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // noop
      }
    }
  });

  function setupTestDb(): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wave2-'));
    tempDirs.push(tmpDir);
    const dbPath = join(tmpDir, 'test.db');

    runSqlite(
      dbPath,
      `
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        empresa_id INTEGER,
        deleted_at TEXT,
        nascimento TEXT,
        matricula TEXT,
        cargo TEXT,
        email TEXT,
        codigo_anac TEXT
      );

      CREATE TABLE qualificacoes_tipos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        categoria TEXT,
        validade INTEGER,
        empresa_id INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE simulador_agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER,
        deleted_at TEXT,
        tipo_sessao TEXT,
        nome TEXT
      );

      CREATE TABLE lms_matriculas (
        id INTEGER PRIMARY KEY AUTOINCREMENT
      );

      CREATE TABLE lms_matricula_ciclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT
      );

      CREATE TABLE qualificacoes_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        qualificacao_id INTEGER,
        tipo_codigo TEXT,
        codigo TEXT,
        categoria TEXT,
        validade TEXT,
        numero_certificado TEXT,
        observacoes TEXT,
        arquivo_url TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        data_conclusao TEXT,
        validade_meses INTEGER,
        instrutor TEXT,
        nota REAL,
        carga_horaria REAL,
        data_vencimento TEXT,
        renovada INTEGER DEFAULT 0,
        certificado_arquivo_id INTEGER,
        funcionario_cpf TEXT,
        qualificacao_codigo TEXT,
        empresa_id INTEGER DEFAULT 1,
        status TEXT,
        tipo_check_id INTEGER,
        sessao_id INTEGER,
        tipo TEXT,
        data_confirmacao TEXT,
        confirmada_por INTEGER,
        tipo_treinamento TEXT CHECK(tipo_treinamento IN ('INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO')),
        renovacao_de INTEGER DEFAULT NULL,
        lms_matricula_id INTEGER REFERENCES lms_matriculas(id),
        origem_tipo TEXT CHECK(origem_tipo IS NULL OR origem_tipo IN ('LMS', 'PRESENCIAL', 'SIMULADOR', 'IMPORTADO_EDAPP', 'MANUAL')),
        lms_matricula_ciclo_id INTEGER REFERENCES lms_matricula_ciclos(id)
      );
      CREATE INDEX idx_qh_renovacao_de ON qualificacoes_historico(renovacao_de) WHERE renovacao_de IS NOT NULL;
      CREATE INDEX idx_qual_historico_lms_matricula ON qualificacoes_historico(lms_matricula_id) WHERE lms_matricula_id IS NOT NULL AND deleted_at IS NULL;
      CREATE INDEX idx_qual_historico_lms_matricula_ciclo ON qualificacoes_historico(lms_matricula_ciclo_id) WHERE lms_matricula_ciclo_id IS NOT NULL AND deleted_at IS NULL;
      CREATE INDEX idx_qual_historico_origem_tipo ON qualificacoes_historico(origem_tipo, empresa_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_qualificacoes_hist_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
      CREATE INDEX idx_qualificacoes_hist_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
      CREATE INDEX idx_qualificacoes_historico_empresa_deleted ON qualificacoes_historico(empresa_id, deleted_at);
      CREATE INDEX idx_qualificacoes_historico_empresa_funcionario ON qualificacoes_historico(empresa_id, funcionario_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_qualificacoes_historico_empresa_id ON qualificacoes_historico(empresa_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_qualificacoes_historico_sessao ON qualificacoes_historico(sessao_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
      CREATE INDEX idx_qualificacoes_historico_tipo ON qualificacoes_historico(tipo);
      CREATE UNIQUE INDEX idx_qualificacoes_historico_unique_active ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao) WHERE deleted_at IS NULL;
      CREATE TRIGGER trg_calc_vencimento_insert
      AFTER INSERT ON qualificacoes_historico
      FOR EACH ROW
      WHEN NEW.validade_meses IS NOT NULL
        AND NEW.validade_meses > 0
        AND NEW.data_conclusao IS NOT NULL
        AND NEW.data_vencimento IS NULL
      BEGIN
        UPDATE qualificacoes_historico
          SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
          WHERE id = NEW.id;
      END;
      CREATE TRIGGER trg_qualificacoes_historico_set_tipo
      AFTER INSERT ON qualificacoes_historico
      WHEN NEW.tipo IS NULL AND NEW.qualificacao_id IS NOT NULL
      BEGIN
        UPDATE qualificacoes_historico
        SET tipo = (
          SELECT nome FROM qualificacoes_tipos
          WHERE id = NEW.qualificacao_id
          LIMIT 1
        )
        WHERE id = NEW.id;
      END;
      CREATE TRIGGER trg_qualificacoes_historico_update_tipo
      AFTER UPDATE OF qualificacao_id ON qualificacoes_historico
      WHEN NEW.qualificacao_id IS NOT NULL
        AND (OLD.qualificacao_id IS NULL OR OLD.qualificacao_id != NEW.qualificacao_id)
      BEGIN
        UPDATE qualificacoes_historico
        SET tipo = (
          SELECT nome FROM qualificacoes_tipos
          WHERE id = NEW.qualificacao_id
          LIMIT 1
        )
        WHERE id = NEW.id;
      END;
      CREATE VIEW qualificacoes_historico_v AS
      SELECT qh.id, qh.funcionario_id, qh.qualificacao_id, qh.data_conclusao, qh.data_vencimento,
             qh.numero_certificado, qh.arquivo_url AS certificado_url, qh.nota, qh.instrutor,
             qh.observacoes, COALESCE(qt.nome, qh.tipo_codigo, qh.codigo) AS qualificacao_nome,
             COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
             COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
             qt.validade AS qualificacao_validade_meses,
             f.nome AS funcionario_nome, f.matricula AS funcionario_matricula, f.cargo AS funcionario_cargo,
             f.email AS funcionario_email, f.codigo_anac AS funcionario_codigo_anac,
             qh.created_at, qh.updated_at, qh.deleted_at
      FROM qualificacoes_historico qh
      LEFT JOIN qualificacoes_tipos qt ON CAST(qt.id AS TEXT) = CAST(qh.qualificacao_id AS TEXT) AND qt.deleted_at IS NULL
      LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = CAST(qh.funcionario_id AS TEXT) AND f.deleted_at IS NULL
      WHERE qh.deleted_at IS NULL;

      CREATE TABLE frms_jornada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tripulante_id INTEGER,
        data TEXT,
        horas_voo_minutos INTEGER,
        created_at TEXT,
        deleted_at TEXT
      );

      CREATE TABLE frms_alerta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tripulante_id INTEGER,
        nivel TEXT,
        resolvido INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE sessoes_participantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessao_id INTEGER,
        funcionario_id INTEGER,
        deleted_at TEXT
      );

      CREATE VIEW vw_tripulante_operacional AS
      SELECT
        f.id AS funcionario_id,
        f.nome,
        COALESCE(NULLIF(TRIM(f.guerra), ''), NULL) AS nome_guerra,
        COALESCE(NULLIF(TRIM(f.matricula), ''), CAST(f.id AS TEXT)) AS matricula,
        f.empresa_id,
        COALESCE(NULLIF(TRIM(f.funcao), ''), NULLIF(TRIM(f.cargo), ''), 'tripulante') AS role,
        COALESCE(f.modelo_aeronave_id, '') AS modelo_aeronave_id,
        COALESCE(f.aeronave, '') AS aeronave_legacy,
        CASE WHEN EXISTS (
          SELECT 1 FROM qualificacoes_historico qh
          LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
          WHERE qh.funcionario_id = f.id AND qh.deleted_at IS NULL
            AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
            AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
            AND COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) >= date('now')
        ) THEN 1 ELSE 0 END AS cma_valido,
        CAST((JULIANDAY((
          SELECT MAX(COALESCE(qh2.data_vencimento, date(qh2.data_conclusao, '+' || COALESCE(qh2.validade_meses, qt2.validade, 12) || ' months')))
          FROM qualificacoes_historico qh2
          LEFT JOIN qualificacoes_tipos qt2 ON qt2.id = qh2.qualificacao_id AND qt2.deleted_at IS NULL
          WHERE qh2.funcionario_id = f.id AND qh2.deleted_at IS NULL
            AND COALESCE(qh2.status, 'CONCLUIDA') != 'CANCELADA'
            AND UPPER(COALESCE(qh2.qualificacao_codigo, qt2.codigo, '')) = 'CMA'
        )) - JULIANDAY('now')) AS INTEGER) AS cma_dias_restantes,
        (SELECT MAX(COALESCE(qh3.data_vencimento, date(qh3.data_conclusao, '+' || COALESCE(qh3.validade_meses, qt3.validade, 12) || ' months')))
          FROM qualificacoes_historico qh3
          LEFT JOIN qualificacoes_tipos qt3 ON qt3.id = qh3.qualificacao_id AND qt3.deleted_at IS NULL
          WHERE qh3.funcionario_id = f.id AND qh3.deleted_at IS NULL
            AND COALESCE(qh3.status, 'CONCLUIDA') != 'CANCELADA'
            AND UPPER(COALESCE(qh3.qualificacao_codigo, qt3.codigo, '')) = 'CMA'
        ) AS cma_validade_fim,
        (WITH base AS (
          SELECT
            COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
            COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
            COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
          FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
        ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) AS frms_score,
        CASE
          WHEN EXISTS (SELECT 1 FROM frms_alerta fa WHERE fa.tripulante_id = f.id AND fa.deleted_at IS NULL AND COALESCE(fa.resolvido, 0) = 0 AND fa.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'critico'
          WHEN (WITH base AS (
            SELECT
              COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
              COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
              COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
            FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
          ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) >= 45 THEN 'atencao'
          ELSE 'ok'
        END AS frms_status,
        (SELECT MAX(created_at) FROM frms_jornada fj WHERE fj.tripulante_id = f.id AND fj.deleted_at IS NULL) AS frms_avaliacao_data,
        (SELECT COUNT(*) FROM sessoes_participantes sp JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
          WHERE sp.funcionario_id = f.id AND sp.deleted_at IS NULL AND sa.deleted_at IS NULL
            AND UPPER(COALESCE(sa.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa.data) >= date('now')
        ) AS simuladores_pendentes,
        (SELECT MIN(sa2.data) FROM sessoes_participantes sp2 JOIN simulador_agendamentos sa2 ON sa2.id = sp2.sessao_id
          WHERE sp2.funcionario_id = f.id AND sp2.deleted_at IS NULL AND sa2.deleted_at IS NULL
            AND UPPER(COALESCE(sa2.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa2.data) >= date('now')
        ) AS proximo_simulador_data,
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh4
            LEFT JOIN qualificacoes_tipos qt4 ON qt4.id = qh4.qualificacao_id AND qt4.deleted_at IS NULL
            WHERE qh4.funcionario_id = f.id AND qh4.deleted_at IS NULL AND COALESCE(qh4.status, 'CONCLUIDA') != 'CANCELADA'
              AND UPPER(COALESCE(qh4.qualificacao_codigo, qt4.codigo, '')) = 'CMA'
              AND COALESCE(qh4.data_vencimento, date(qh4.data_conclusao, '+' || COALESCE(qh4.validade_meses, qt4.validade, 12) || ' months')) >= date('now')
          ) THEN 'BLOQUEADO_CMA'
          WHEN EXISTS (SELECT 1 FROM frms_alerta fa2 WHERE fa2.tripulante_id = f.id AND fa2.deleted_at IS NULL AND COALESCE(fa2.resolvido, 0) = 0 AND fa2.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'BLOQUEADO_FRMS'
          WHEN CAST((JULIANDAY((
            SELECT MAX(COALESCE(qh5.data_vencimento, date(qh5.data_conclusao, '+' || COALESCE(qh5.validade_meses, qt5.validade, 12) || ' months')))
            FROM qualificacoes_historico qh5
            LEFT JOIN qualificacoes_tipos qt5 ON qt5.id = qh5.qualificacao_id AND qt5.deleted_at IS NULL
            WHERE qh5.funcionario_id = f.id AND qh5.deleted_at IS NULL AND COALESCE(qh5.status, 'CONCLUIDA') != 'CANCELADA'
              AND UPPER(COALESCE(qh5.qualificacao_codigo, qt5.codigo, '')) = 'CMA'
          )) - JULIANDAY('now')) AS INTEGER) <= 30 THEN 'ATENCAO_CMA'
          WHEN EXISTS (SELECT 1 FROM frms_alerta fa3 WHERE fa3.tripulante_id = f.id AND fa3.deleted_at IS NULL AND COALESCE(fa3.resolvido, 0) = 0 AND fa3.nivel = 'ATENCAO') THEN 'ATENCAO_FRMS'
          ELSE 'APTO'
        END AS status_operacional
      FROM funcionarios f
      WHERE f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1;

      CREATE TABLE qualificacoes_historico_reclass_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        historico_id INTEGER,
        target_tipo_id INTEGER,
        status TEXT
      );

      CREATE TABLE _data_recovery_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        etapa TEXT,
        detalhes TEXT
      );

      CREATE TRIGGER trg_apply_reclassification
      AFTER UPDATE ON qualificacoes_historico_reclass_queue
      WHEN NEW.status = 'APPLIED' AND NEW.target_tipo_id IS NOT NULL
      BEGIN
        UPDATE qualificacoes_historico
        SET qualificacao_id = NEW.target_tipo_id,
            codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
            tipo_codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
            categoria = (SELECT categoria FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
            updated_at = datetime('now')
        WHERE id = NEW.historico_id;
        INSERT INTO _data_recovery_log(etapa, detalhes)
        VALUES ('APPLY_RECLASS', 'historico_id=' || NEW.historico_id || ' -> tipo_id=' || NEW.target_tipo_id);
      END;

      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        agendamento_slot_id INTEGER,
        colaborador_id_aluno INTEGER NOT NULL,
        funcao_na_sessao TEXT DEFAULT 'PF',
        template_id INTEGER,
        instrutor_id INTEGER NOT NULL,
        instrutor_codigo_anac TEXT,
        carga_horaria_total DECIMAL(4,2) DEFAULT 2.0,
        carga_horaria_pf DECIMAL(4,2),
        carga_horaria_pm DECIMAL(4,2),
        tempo_acumulado DECIMAL(5,2) DEFAULT 0,
        status TEXT DEFAULT 'PENDENTE',
        resultado_final TEXT DEFAULT 'PENDENTE',
        nota_final REAL,
        nota_minima REAL,
        aprovado BOOLEAN DEFAULT 0,
        aluno_nome_validado TEXT,
        aluno_matricula_validado TEXT,
        observacoes TEXT,
        feedback_instrutor TEXT,
        pontos_fortes TEXT,
        pontos_melhoria TEXT,
        assinado BOOLEAN DEFAULT 0,
        data_assinatura DATETIME,
        hash_assinatura TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        observacoes_gerais TEXT,
        assinatura_instrutor_completa INTEGER DEFAULT 0,
        assinatura_aluno_completa INTEGER DEFAULT 0,
        data_conclusao TEXT,
        pdf_url TEXT,
        empresa_id INTEGER,
        assinatura_instrutor INTEGER DEFAULT 0,
        assinatura_instrutor_data DATETIME,
        assinatura_instrutor_usuario_id INTEGER,
        assinatura_tripulante INTEGER DEFAULT 0,
        assinatura_tripulante_data DATETIME,
        assinatura_tripulante_usuario_id INTEGER,
        tipo_sessao TEXT,
        tipo_aeronave TEXT,
        data_sessao TEXT,
        assinatura_aluno_ip TEXT,
        assinatura_aluno_timestamp TEXT,
        assinatura_instrutor_ip TEXT,
        assinatura_instrutor_timestamp TEXT,
        arquivado INTEGER DEFAULT 0,
        caminho_arquivo TEXT,
        data_arquivamento TEXT,
        assinatura_aluno_imagem TEXT,
        assinatura_instrutor_imagem TEXT
      );
      CREATE INDEX idx_fichas_agendamento ON fichas_sessao(agendamento_slot_id);
      CREATE INDEX idx_fichas_aluno ON fichas_sessao(colaborador_id_aluno);
      CREATE INDEX idx_fichas_assinatura_instrutor ON fichas_sessao(assinatura_instrutor);
      CREATE INDEX idx_fichas_assinatura_tripulante ON fichas_sessao(assinatura_tripulante);
      CREATE INDEX idx_fichas_instrutor ON fichas_sessao(instrutor_id);
      CREATE INDEX idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_fichas_sessao_aluno ON fichas_sessao(colaborador_id_aluno) WHERE deleted_at IS NULL;
      CREATE INDEX idx_fichas_sessao_arquivado ON fichas_sessao(arquivado);
      CREATE INDEX idx_fichas_sessao_data_sessao ON fichas_sessao(data_sessao);
      CREATE INDEX idx_fichas_sessao_deleted ON fichas_sessao(deleted_at);
      CREATE INDEX idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);
      CREATE INDEX idx_fichas_sessao_empresa_id ON fichas_sessao(empresa_id);
      CREATE INDEX idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id);
      CREATE INDEX idx_fichas_sessao_pdf_url ON fichas_sessao(pdf_url);
      CREATE INDEX idx_fichas_sessao_resultado ON fichas_sessao(resultado_final) WHERE deleted_at IS NULL;
      CREATE INDEX idx_fichas_sessao_status ON fichas_sessao(status);
      CREATE INDEX idx_fichas_sessao_tipo ON fichas_sessao(tipo_sessao);

      CREATE VIEW fichas_simulador AS
      SELECT f.id, f.agendamento_slot_id AS sessao_id, f.colaborador_id_aluno AS funcionario_id,
             f.instrutor_id, a.data AS data_sessao, f.status, f.observacoes,
             f.created_at, f.updated_at, f.deleted_at
      FROM fichas_sessao f
      LEFT JOIN simulador_agendamentos a ON f.agendamento_slot_id = a.id;

      CREATE TABLE certificados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habilitacao_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        qualificacao_id INTEGER NOT NULL,
        arquivo_url TEXT NOT NULL,
        arquivo_nome TEXT NOT NULL,
        arquivo_tamanho INTEGER,
        arquivo_hash TEXT,
        numero_certificado TEXT UNIQUE NOT NULL,
        tipo TEXT DEFAULT 'upload',
        data_emissao DATE,
        data_vencimento DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );
      CREATE INDEX idx_cert_deleted_v6 ON certificados(deleted_at);
      CREATE INDEX idx_cert_func_id_v6 ON certificados(funcionario_id);
      CREATE INDEX idx_cert_hab_id_v6 ON certificados(habilitacao_id);
      CREATE INDEX idx_cert_qual_id_v6 ON certificados(qualificacao_id);
      CREATE INDEX idx_certificados_deleted_at ON certificados(deleted_at);
      CREATE INDEX idx_certificados_funcionario_id ON certificados(funcionario_id);
      CREATE INDEX idx_certificados_habilitacao_id ON certificados(habilitacao_id);
      CREATE INDEX idx_certificados_qualificacao ON certificados(qualificacao_id, funcionario_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_certificados_qualificacao_id ON certificados(qualificacao_id);

      INSERT INTO funcionarios (id, nome, empresa_id, deleted_at, matricula, cargo, email, codigo_anac)
      VALUES
        (10, 'Aluno Tenant 6', 6, NULL, 'A10', 'Piloto', 'a10@test.com', 'ANAC10'),
        (11, 'Instrutor Tenant 6', 6, NULL, 'I11', 'Instrutor', 'i11@test.com', 'ANAC11'),
        (12, 'Aluno Tenant 7', 7, NULL, 'A12', 'Piloto', 'a12@test.com', 'ANAC12');

      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, validade, empresa_id, deleted_at)
      VALUES
        (91, 'PER', 'Periódico', 'SIM', 12, 6, NULL),
        (92, 'INI', 'Inicial', 'SIM', 12, 7, NULL);

      INSERT INTO simulador_agendamentos (id, empresa_id, deleted_at, tipo_sessao, nome)
      VALUES
        (66, 6, NULL, 'PER', 'Sessão 6'),
        (77, 7, NULL, 'INI', 'Sessão 7');

      INSERT INTO qualificacoes_historico (
        id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, empresa_id, sessao_id, status, deleted_at
      ) VALUES
        (4517, 0, 91, 'PER', '2026-01-10', 1, 66, 'CONCLUIDA', datetime('now')),
        (4518, 10, 91, 'PER', '2026-01-11', 1, NULL, 'CONCLUIDA', NULL),
        (4519, 12, 92, 'INI', '2026-02-11', 7, 77, 'CONCLUIDA', NULL);

      INSERT INTO fichas_sessao (
        id, uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status, empresa_id
      ) VALUES
        (201, 'fs-201', 66, 10, 11, 'PER', 'AW139', '2026-01-10', 'AVALIACAO_PENDENTE', NULL),
        (202, 'fs-202', NULL, 10, 11, 'PER', 'AW139', '2026-01-11', 'AVALIACAO_PENDENTE', NULL),
        (203, 'fs-203', 77, 12, 12, 'INI', 'SK76', '2026-02-11', 'AVALIACAO_PENDENTE', 7);

      INSERT INTO certificados (
        id, habilitacao_id, funcionario_id, qualificacao_id, arquivo_url, arquivo_nome, arquivo_tamanho, arquivo_hash, numero_certificado, tipo, data_emissao, data_vencimento
      ) VALUES
        (301, 1, 10, 91, '/cert/a.pdf', 'a.pdf', 100, 'hash-a', 'CERT-A', 'upload', '2026-01-11', '2027-01-11'),
        (302, 1, 12, 92, '/cert/b.pdf', 'b.pdf', 200, 'hash-b', 'CERT-B', 'upload', '2026-02-11', '2027-02-11');
      `,
    );

    return dbPath;
  }

  function snapshotColumn(dbPath: string, table: string, col: string): ColumnInfo {
    const out = runSqlite(
      dbPath,
      `SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}') WHERE name='${col}';`,
    );
    const cols = colInfo(out);
    expect(cols).toHaveLength(1);
    return cols[0];
  }

  function countRows(dbPath: string, table: string, where = ''): number {
    const clause = where ? ` WHERE ${where}` : '';
    const out = runSqlite(dbPath, `SELECT COUNT(*) FROM ${table}${clause};`);
    return Number(out.trim());
  }

  it('migration removes DEFAULT 1 and enforces NOT NULL on wave 2 targets', () => {
    const dbPath = setupTestDb();
    runSqlite(dbPath, migrationSql());

    const qh = snapshotColumn(dbPath, 'qualificacoes_historico', 'empresa_id');
    const fs = snapshotColumn(dbPath, 'fichas_sessao', 'empresa_id');
    const cert = snapshotColumn(dbPath, 'certificados', 'empresa_id');

    expect(qh.notnull).toBe(1);
    expect(qh.dflt_value).toBeNull();
    expect(fs.notnull).toBe(1);
    expect(fs.dflt_value).toBeNull();
    expect(cert.notnull).toBe(1);
    expect(cert.dflt_value).toBeNull();
  });

  it('backfills deterministic empresa_id values without changing row counts', () => {
    const dbPath = setupTestDb();
    const beforeQh = countRows(dbPath, 'qualificacoes_historico');
    const beforeFs = countRows(dbPath, 'fichas_sessao');
    const beforeCert = countRows(dbPath, 'certificados');

    runSqlite(dbPath, migrationSql());

    expect(countRows(dbPath, 'qualificacoes_historico')).toBe(beforeQh);
    expect(countRows(dbPath, 'fichas_sessao')).toBe(beforeFs);
    expect(countRows(dbPath, 'certificados')).toBe(beforeCert);

    const qhResolved = Number(runSqlite(dbPath, `SELECT empresa_id FROM qualificacoes_historico WHERE id = 4517;`).trim());
    const qhFuncBackfill = Number(runSqlite(dbPath, `SELECT empresa_id FROM qualificacoes_historico WHERE id = 4518;`).trim());
    const fichaBySlot = Number(runSqlite(dbPath, `SELECT empresa_id FROM fichas_sessao WHERE id = 201;`).trim());
    const fichaByAluno = Number(runSqlite(dbPath, `SELECT empresa_id FROM fichas_sessao WHERE id = 202;`).trim());
    const certA = Number(runSqlite(dbPath, `SELECT empresa_id FROM certificados WHERE id = 301;`).trim());
    const certB = Number(runSqlite(dbPath, `SELECT empresa_id FROM certificados WHERE id = 302;`).trim());

    expect(qhResolved).toBe(6);
    expect(qhFuncBackfill).toBe(6);
    expect(fichaBySlot).toBe(6);
    expect(fichaByAluno).toBe(6);
    expect(certA).toBe(6);
    expect(certB).toBe(7);
  });

  it('preserves indexes, triggers, view, and foreign key integrity', () => {
    const dbPath = setupTestDb();
    runSqlite(dbPath, migrationSql());

    const qhTriggerCount = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'qualificacoes_historico';`).trim());
    const externalTriggerExists = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_apply_reclassification';`).trim());
    const qhIndexes = runSqlite(
      dbPath,
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'qualificacoes_historico' AND sql IS NOT NULL ORDER BY name;`,
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    const fsIndexes = runSqlite(
      dbPath,
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'fichas_sessao' AND sql IS NOT NULL ORDER BY name;`,
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    const certIndexes = runSqlite(
      dbPath,
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'certificados' AND sql IS NOT NULL ORDER BY name;`,
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    const qhViewExists = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'view' AND name = 'qualificacoes_historico_v';`).trim());
    const operacionalViewExists = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'view' AND name = 'vw_tripulante_operacional';`).trim());
    const fichasViewExists = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'view' AND name = 'fichas_simulador';`).trim());
    const fkIssues = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_foreign_key_check();`).trim());

    expect(qhTriggerCount).toBe(3);
    expect(externalTriggerExists).toBe(1);
    expect(qhIndexes).toEqual([
      'idx_qh_renovacao_de',
      'idx_qual_historico_lms_matricula',
      'idx_qual_historico_lms_matricula_ciclo',
      'idx_qual_historico_origem_tipo',
      'idx_qualificacoes_hist_data_conclusao',
      'idx_qualificacoes_hist_data_vencimento',
      'idx_qualificacoes_historico_empresa_deleted',
      'idx_qualificacoes_historico_empresa_funcionario',
      'idx_qualificacoes_historico_empresa_id',
      'idx_qualificacoes_historico_sessao',
      'idx_qualificacoes_historico_status',
      'idx_qualificacoes_historico_tipo',
      'idx_qualificacoes_historico_unique_active',
    ]);
    expect(fsIndexes).toEqual([
      'idx_fichas_agendamento',
      'idx_fichas_aluno',
      'idx_fichas_assinatura_instrutor',
      'idx_fichas_assinatura_tripulante',
      'idx_fichas_instrutor',
      'idx_fichas_sessao_agendamento',
      'idx_fichas_sessao_aluno',
      'idx_fichas_sessao_arquivado',
      'idx_fichas_sessao_data_sessao',
      'idx_fichas_sessao_deleted',
      'idx_fichas_sessao_empresa',
      'idx_fichas_sessao_empresa_id',
      'idx_fichas_sessao_instrutor',
      'idx_fichas_sessao_pdf_url',
      'idx_fichas_sessao_resultado',
      'idx_fichas_sessao_status',
      'idx_fichas_sessao_tipo',
    ]);
    expect(certIndexes).toEqual([
      'idx_cert_deleted_v6',
      'idx_cert_func_id_v6',
      'idx_cert_hab_id_v6',
      'idx_cert_qual_id_v6',
      'idx_certificados_deleted_at',
      'idx_certificados_empresa_id',
      'idx_certificados_funcionario_id',
      'idx_certificados_habilitacao_id',
      'idx_certificados_qualificacao',
      'idx_certificados_qualificacao_id',
    ]);
    expect(qhViewExists).toBe(1);
    expect(operacionalViewExists).toBe(1);
    expect(fichasViewExists).toBe(1);
    expect(fkIssues).toBe(0);
  });

  it('rejects inserts without empresa_id after hardening', () => {
    const dbPath = setupTestDb();
    runSqlite(dbPath, migrationSql());

    expect(() => {
      runSqlite(
        dbPath,
        `INSERT INTO fichas_sessao (uuid, colaborador_id_aluno, instrutor_id, tipo_sessao) VALUES ('fs-fail', 10, 11, 'PER');`,
      );
    }).toThrow(/NOT NULL constraint failed/);
  });

  it('migration file exists and documents wave 2 hardening intent', () => {
    const content = migrationSql();
    expect(content).toContain('qualificacoes_historico');
    expect(content).toContain('fichas_sessao');
    expect(content).toContain('certificados');
    expect(content).toContain('PRAGMA foreign_keys = OFF');
    expect(content).toContain('PRAGMA foreign_key_check');
    expect(content).toContain('empresa_id INTEGER NOT NULL');
  });
});
