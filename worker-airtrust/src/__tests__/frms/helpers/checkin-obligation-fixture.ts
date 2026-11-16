import { createRequire } from 'node:module';

export type Sqlite = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
  close(): void;
};

/**
 * Banco SQLite real com as colunas usadas em produção e a matriz de aceitação da
 * obrigação de check-in. Tenant 7 é o avaliado; tenant 8 tenta vazar.
 * Q1 = 01–15/11, Q2 = 16–30/11.
 */
export function createCheckinObligationFixture(): Sqlite {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const sqlite = new DatabaseSync(':memory:') as Sqlite;
  sqlite.exec(`
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, cargo TEXT, funcao TEXT,
      quinzena TEXT, ativo INTEGER DEFAULT 1, status TEXT DEFAULT 'ATIVO', deleted_at TEXT);
    CREATE TABLE escalas_mensais (id TEXT PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
    CREATE TABLE escalas_quinzenas (id INTEGER PRIMARY KEY, empresa_id INTEGER, numero INTEGER,
      data_inicio TEXT, data_fim TEXT, deleted_at TEXT);
    CREATE TABLE escala_alocacoes (id TEXT PRIMARY KEY, escala_id TEXT, funcionario_id TEXT, aeronave_id INTEGER,
      situacao_tipo TEXT, quinzena_id INTEGER, data_inicio TEXT, data_fim TEXT, status TEXT DEFAULT 'planejado', deleted_at TEXT);
    CREATE TABLE escala_eventos (id TEXT PRIMARY KEY, escala_id TEXT, funcionario_id TEXT, tipo_evento TEXT,
      data_inicio TEXT, data_fim TEXT, status TEXT DEFAULT 'confirmado', gerado_automaticamente INTEGER DEFAULT 0, deleted_at TEXT);
    CREATE TABLE escala_voo_diaria (id TEXT PRIMARY KEY, empresa_id INTEGER, data TEXT, pic_id INTEGER, sic_id INTEGER,
      status TEXT DEFAULT 'RASCUNHO', deleted_at TEXT);
    CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, empresa_id INTEGER, tripulante_id INTEGER, data TEXT, status TEXT,
      origem TEXT, hora_apresentacao TEXT, hora_termino TEXT, horas_voo_minutos INTEGER, duracao_jornada_minutos INTEGER,
      hora_primeiro_acionamento TEXT, hora_primeira_decolagem TEXT, hora_ultimo_pouso TEXT, hora_corte_motor TEXT, deleted_at TEXT);
    CREATE TABLE treinamentos_planejados (id INTEGER PRIMARY KEY, empresa_id INTEGER, titulo TEXT, codigo_turma TEXT, status TEXT,
      sessao_id INTEGER, simulador_id INTEGER, instrutor_id INTEGER, data_prevista TEXT, data_inicio TEXT, data_fim TEXT,
      hora_inicio TEXT, hora_fim TEXT, deleted_at TEXT);
    CREATE TABLE treinamentos_dias (id INTEGER PRIMARY KEY, empresa_id INTEGER, treinamento_id INTEGER, data TEXT, status TEXT,
      sessao_id INTEGER, simulador_id INTEGER, hora_inicio TEXT, hora_fim TEXT, deleted_at TEXT);
    CREATE TABLE treinamentos_participantes (treinamento_id INTEGER, funcionario_id INTEGER);
    CREATE TABLE treinamentos_instrutores (treinamento_id INTEGER, funcionario_id INTEGER);
    CREATE TABLE simulador_agendamentos (id INTEGER PRIMARY KEY, empresa_id INTEGER, data TEXT, status TEXT, nome TEXT,
      tipo_sessao TEXT, hora_inicio TEXT, hora_fim TEXT, funcionario_id INTEGER, instrutor_id INTEGER, checador_id INTEGER,
      examinador_id INTEGER, deleted_at TEXT);
    CREATE TABLE sessoes_participantes (sessao_id INTEGER, funcionario_id INTEGER, deleted_at TEXT);
    CREATE TABLE frms_recovery_activity_day (id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER,
      reference_date TEXT, activity_type TEXT, notes TEXT, duty_start_time TEXT, duty_end_time TEXT, deleted_at TEXT);
    CREATE TABLE frms_recovery_activity_segment (id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER,
      recovery_day_id INTEGER, activity_type TEXT, start_time TEXT, end_time TEXT);
    CREATE TABLE cv_voos (id INTEGER PRIMARY KEY, empresa_id INTEGER, data_programacao TEXT, status TEXT,
      horario_real_partida TEXT, deleted_at TEXT);
    CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY, empresa_id INTEGER, voo_id INTEGER, funcionario_id INTEGER,
      funcao TEXT, deleted_at TEXT);
    CREATE TABLE frms_fadiga_checkin (id TEXT PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, data_checkin TEXT,
      jornada_inicio_prevista TEXT, hora_checkin TEXT, kss_score INTEGER, kss_provenance TEXT, horas_sono REAL,
      horas_sono_48h REAL, wake_time TEXT, fit_for_duty INTEGER, score_fadiga REAL, nivel_fadiga TEXT,
      status_operacional TEXT, computed_risk_level TEXT, requires_operational_review INTEGER, deleted_at TEXT);
  `);
  const crew = (id: number, empresa: number, quinzena: string | null, extra = "1, 'ATIVO'") =>
    `(${id}, ${empresa}, 'T${id}', 'PILOTO', 'PILOTO', ${quinzena ? `'${quinzena}'` : 'NULL'}, ${extra}, NULL)`;
  sqlite.exec(`
    INSERT INTO funcionarios VALUES
      ${crew(101, 7, 'primeira')}, ${crew(102, 7, 'primeira')}, ${crew(103, 7, 'primeira')},
      ${crew(104, 7, 'primeira')}, ${crew(105, 7, 'segunda')}, ${crew(106, 7, null)},
      ${crew(107, 7, 'primeira')}, ${crew(108, 7, 'primeira')}, ${crew(109, 7, 'primeira')},
      ${crew(110, 7, null)}, ${crew(111, 7, null)}, ${crew(112, 7, 'primeira')},
      ${crew(114, 7, 'primeira', "0, 'INATIVO'")}, ${crew(801, 8, 'primeira')},
      ${crew(115, 7, null)}, ${crew(116, 7, null)};
    INSERT INTO escalas_mensais VALUES ('E7', 7, NULL), ('E8', 8, NULL);
    INSERT INTO escalas_quinzenas VALUES
      (1, 7, 1, '2026-11-01', '2026-11-15', NULL), (2, 7, 2, '2026-11-16', '2026-11-30', NULL),
      (3, 8, 1, '2026-11-01', '2026-11-15', NULL);
    INSERT INTO escala_alocacoes (id, escala_id, funcionario_id, aeronave_id, situacao_tipo, quinzena_id, data_inicio, data_fim, status) VALUES
      ('a101', 'E7', '101', 1, NULL, 1, '2026-11-01', '2026-11-15', 'confirmado'),
      ('a103a', 'E7', '103', 1, NULL, 1, '2026-11-01', '2026-11-05', 'confirmado'),
      ('a103b', 'E7', '103', 1, NULL, 1, '2026-11-10', '2026-11-15', 'confirmado'),
      ('a104', 'E7', '104', NULL, 'FERIAS', 1, '2026-11-01', '2026-11-15', 'confirmado'),
      ('a105', 'E7', '105', NULL, 'FOLGA', 2, '2026-11-16', '2026-11-30', 'confirmado'),
      ('a107', 'E7', '107', NULL, 'FOLGA', 1, '2026-11-01', '2026-11-15', 'confirmado'),
      ('a108', 'E7', '108', 1, NULL, 1, '2026-11-01', '2026-11-15', 'confirmado'),
      ('a112a', 'E7', '112', 1, NULL, 1, '2026-11-01', '2026-11-15', 'confirmado'),
      ('a112b', 'E7', '112', NULL, 'AFT', 1, '2026-11-07', '2026-11-07', 'confirmado'),
      ('a114', 'E7', '114', 1, NULL, 1, '2026-11-01', '2026-11-15', 'confirmado'),
      ('acancel', 'E7', '109', 1, NULL, 1, '2026-11-01', '2026-11-15', 'cancelado'),
      ('a801', 'E8', '801', 1, NULL, 3, '2026-11-01', '2026-11-15', 'confirmado');
    INSERT INTO escala_eventos (id, escala_id, funcionario_id, tipo_evento, data_inicio, data_fim, gerado_automaticamente) VALUES
      ('ev108', 'E7', '108', 'folga', '2026-11-08', '2026-11-09', 0),
      ('ev108auto', 'E7', '108', 'folga', '2026-11-12', '2026-11-12', 1),
      ('ev-foreign', 'E8', '101', 'folga', '2026-11-05', '2026-11-05', 0);
    INSERT INTO escala_voo_diaria (id, empresa_id, data, pic_id, sic_id, status) VALUES
      ('v-cancel', 7, '2026-11-05', 106, NULL, 'CANCELADA'),
      ('v-pub', 7, '2026-11-06', 106, NULL, 'PUBLICADA'),
      ('v-sub', 7, '2026-11-05', 111, NULL, 'PUBLICADA'),
      ('v-foreign', 8, '2026-11-05', 109, NULL, 'PUBLICADA');
    INSERT INTO frms_jornada (id, empresa_id, tripulante_id, data, status, origem, hora_apresentacao, hora_termino, horas_voo_minutos) VALUES
      ('j105', 7, 105, '2026-11-20', 'ES', 'SIGVOOS', '07:00', '12:00', 95),
      ('j102', 7, 102, '2026-11-20', 'ES', 'SIGVOOS', '08:00', '11:00', 60),
      ('j102dup', 7, 102, '2026-11-20', 'ES', 'SIGVOOS', '08:00', '11:00', 60),
      ('j102folga', 7, 102, '2026-11-22', 'FR', 'SIGVOOS', NULL, NULL, 0),
      ('j102manual', 7, 102, '2026-11-23', 'ES', 'MANUAL', '08:00', '11:00', 60),
      ('j-foreign', 8, 109, '2026-11-05', 'ES', 'SIGVOOS', '07:00', '12:00', 95);
    INSERT INTO simulador_agendamentos (id, empresa_id, data, status, nome, hora_inicio, hora_fim, funcionario_id) VALUES
      (501, 7, '2026-11-25', 'CONCLUIDO', 'Sessão AW139', '09:00', '13:00', 115),
      (502, 7, '2026-11-26', 'CANCELADO', 'Sessão cancelada', '09:00', '13:00', 115),
      (503, 8, '2026-11-25', 'CONCLUIDO', 'Sessão outro tenant', '09:00', '13:00', 101);
    INSERT INTO frms_fadiga_checkin (id, empresa_id, funcionario_id, data_checkin) VALUES
      ('c107', 7, 107, '2026-11-05');
  `);
  return sqlite;
}

/** D1 mínimo sobre o SQLite, opcionalmente registrando as instruções executadas. */
export function sqliteAsD1(
  sqlite: Sqlite,
  log?: Array<{ sql: string; args: unknown[] }>,
): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          log?.push({ sql, args });
          return {
            all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
            first: async () => sqlite.prepare(sql).get(...args) ?? null,
          };
        },
      };
    },
  } as unknown as D1Database;
}
