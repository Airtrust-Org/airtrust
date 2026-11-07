/**
 * Fixture ISOLADA para o E2E sintetico "estudo -> prova -> /finalizar -> qualificacao -> certificado".
 *
 * Nao altera nem depende de ExamSqliteD1/lmsExamDb (usados por outros testes): constroi um
 * SQLite real (node:sqlite, em memoria) com o DDL exigido pelo caminho de finalizacao, reutilizando
 * as migrations reais 0346 (ciclos), 0557 (arquivo de evidencias) e as mudancas Schema V2 0571/0572.
 * Tudo sintetico: nenhum D1/R2/Cloudflare remoto, nenhum dado real.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  ADMIN_USER, LEARNER_USER, OTHER_USER, PKG, PREFIX, TENANT_B_ADMIN, ledger,
} from './exam-lms-fixture';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};
type SqliteValue = string | number | bigint | Uint8Array | null;
const norm = (v: unknown): SqliteValue =>
  v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqliteValue);

export type Fault = { match: RegExp; message?: string; remaining: number };

/** Fault-injection and barrier hooks, all opt-in per test. */
export interface D1Hooks {
  faults: Fault[];
  /** Holds batches whose SQL matches until `parties` batches are waiting, then releases them together. */
  barrier: { match: RegExp; parties: number; waiting: Array<() => void> } | null;
  batchLog: string[][];
}

class Stmt {
  constructor(private readonly owner: AtomicSqliteD1, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Stmt(this.owner, this.sql, values); }
  execRun() {
    this.owner.maybeFail(this.sql);
    const r = this.owner.database.prepare(this.sql).run(...this.values.map(norm));
    const changes = Number(r.changes || 0);
    return { success: true, meta: { changes, last_row_id: Number(r.lastInsertRowid || 0), changed_db: changes > 0 }, results: [] };
  }
  async run() { return this.execRun(); }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.owner.database.prepare(this.sql).get(...this.values.map(norm)) as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    return { success: true, results: this.owner.database.prepare(this.sql).all(...this.values.map(norm)) as T[], meta: { changes: 0 } };
  }
}

/** Real SQLite exposed with the D1 surface used by the completion/certificate paths (atomic batch + last_row_id). */
export class AtomicSqliteD1 {
  readonly database = new NodeDatabaseSync(':memory:');
  readonly hooks: D1Hooks = { faults: [], barrier: null, batchLog: [] };
  constructor() { this.database.exec('PRAGMA foreign_keys=ON'); }
  exec(sql: string) { this.database.exec(sql); }
  prepare(sql: string) { return new Stmt(this, sql); }
  asD1(): D1Database { return this as unknown as D1Database; }
  maybeFail(sql: string) {
    const fault = this.hooks.faults.find((f) => f.remaining > 0 && f.match.test(sql));
    if (fault) { fault.remaining -= 1; throw new Error(fault.message ?? 'INJECTED_D1_FAILURE'); }
  }
  async batch(statements: Stmt[]) {
    const barrier = this.hooks.barrier;
    if (barrier && statements.some((s) => barrier.match.test(s.sql))) {
      await new Promise<void>((release) => {
        barrier.waiting.push(release);
        if (barrier.waiting.length >= barrier.parties) {
          const all = barrier.waiting; barrier.waiting = []; this.hooks.barrier = null; // one-shot
          all.forEach((r) => r());
        }
      });
    }
    this.hooks.batchLog.push(statements.map((s) => s.sql));
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((s) => s.execRun());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
  injectFault(match: RegExp, times = 1, message?: string) { this.hooks.faults.push({ match, remaining: times, message }); }
  clearFaults() { this.hooks.faults.length = 0; }
}

const migration = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

export const EMPRESA = 6;
export const CURSO = 26;
export const MATRICULA = 10;
export const FUNC_ALUNO = 70;
export const FUNC_OUTRO = 71;
export const TIPO_ID = 300;
export const TIPO_CODIGO = 'EAD-SINT-01';

/** Synthetic certificate template (plain HTML; the only variables are the template placeholders). */
export const TEMPLATE_HTML = '<html><head></head><body><h1>{{nome_empresa}}</h1><p>{{funcionario_nome}}</p>'
  + '<p>{{qualificacao_nome}} - {{data_conclusao}}</p><p>{{numero_certificado}}</p></body></html>';

export function finalizeCertificateDb(opts: { viewed?: number[]; template?: boolean } = {}): AtomicSqliteD1 {
  const db = new AtomicSqliteD1();
  db.exec(`
    CREATE TABLE usuarios(id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT);
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT, ativo INTEGER, status TEXT,
      nome TEXT, cpf TEXT, codigo_anac TEXT, matricula TEXT, funcao TEXT);
    CREATE TABLE empresas_config(empresa_id INTEGER PRIMARY KEY, certificado_logo_url TEXT, certificado_template_html TEXT);
    CREATE TABLE qualificacoes_categorias(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nome TEXT, codigo TEXT,
      ativo INTEGER DEFAULT 1, deleted_at TEXT, dominio_codigo TEXT, lms_integrada INTEGER DEFAULT 0);
    CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT, nome TEXT,
      categoria TEXT, categoria_id INTEGER, validade INTEGER, vencimento_fim_mes INTEGER DEFAULT 0, carga_horaria REAL,
      carga_horaria_inicial REAL, carga_horaria_recorrente REAL, conteudo_programatico TEXT, descricao TEXT,
      ativo INTEGER DEFAULT 1, deleted_at TEXT);
    CREATE TABLE qualificacoes_historico(
      id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_id INTEGER NOT NULL, qualificacao_id INTEGER,
      qualificacao_codigo TEXT, tipo_codigo TEXT, codigo TEXT, categoria_id INTEGER, categoria TEXT, categoria_codigo TEXT,
      data_conclusao TEXT, data_vencimento TEXT, validade_meses INTEGER, observacoes TEXT, empresa_id INTEGER NOT NULL,
      tipo TEXT, status TEXT, renovada INTEGER NOT NULL DEFAULT 0, renovacao_de INTEGER, lms_matricula_id INTEGER,
      origem_tipo TEXT, certificado_arquivo_id INTEGER, arquivo_url TEXT, numero_certificado TEXT, validacao_hash TEXT,
      instrutor TEXT, carga_horaria REAL, tipo_treinamento TEXT, local TEXT, nota TEXT, cpf TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT);
    CREATE UNIQUE INDEX idx_qualificacoes_historico_unique_active
      ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao) WHERE deleted_at IS NULL;
    CREATE TABLE lms_cursos(id INTEGER, empresa_id INTEGER, titulo TEXT, deleted_at TEXT, tipo_conteudo TEXT,
      scorm_package_r2_prefix TEXT, scorm_mastery_score REAL, scorm_assessment_policy TEXT,
      gerar_qualificacao_ao_concluir INTEGER DEFAULT 0, qualificacao_tipo_id INTEGER, ativo INTEGER DEFAULT 1,
      publicado INTEGER DEFAULT 1, PRIMARY KEY(empresa_id,id));
    CREATE TABLE lms_matriculas(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER, funcionario_id INTEGER, status TEXT, deleted_at TEXT,
      observacoes TEXT, data_matricula TEXT, data_inicio TEXT, data_conclusao TEXT, data_expiracao TEXT,
      progresso_pct REAL, score_final REAL, tentativas INTEGER, qualificacao_historico_id INTEGER, matriculado_por INTEGER,
      ultimo_slide INTEGER, ultima_pagina INTEGER, created_at TEXT, updated_at TEXT,
      UNIQUE(empresa_id,curso_id,funcionario_id));
    CREATE TABLE lms_historico_importado(id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, curso_id INTEGER,
      status TEXT, progresso_pct INTEGER, score_final REAL, qualificacao_historico_id INTEGER, data_conclusao TEXT,
      completed_at TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
    ${migration('migrations/0346_lms_matricula_ciclos_ssot.sql')}
    ALTER TABLE lms_matricula_ciclos ADD COLUMN assessment_policy TEXT;
    CREATE TABLE lms_scorm_package_versions(id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      package_sha256 TEXT, status TEXT, r2_prefix TEXT);
    CREATE TABLE lms_progresso_scorm(id INTEGER PRIMARY KEY, matricula_id INTEGER UNIQUE, empresa_id INTEGER,
      lesson_status TEXT, completion_status TEXT, success_status TEXT, score_raw REAL, score_min REAL, score_max REAL,
      score_scaled REAL, session_time TEXT, total_time TEXT, suspend_data TEXT, launch_data TEXT, cmi_json TEXT,
      session_count INTEGER, last_commit_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE lms_xapi_statements(id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER, actor_json TEXT,
      verb_id TEXT, verb_display TEXT, object_id TEXT, object_type TEXT, result_json TEXT, context_json TEXT,
      timestamp TEXT, created_at TEXT);
    CREATE TABLE lms_completion_diagnostics_snapshots(id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER,
      tentativa INTEGER, diagnostics_json TEXT);
    ${migration('migrations/0557_lms_cycle_evidence_archive.sql')}
    CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER,
      old_values TEXT, new_values TEXT, ip_address TEXT, user_agent TEXT, empresa_id INTEGER, created_at TEXT);
    CREATE TABLE auditoria(id INTEGER PRIMARY KEY, usuario_id TEXT, usuario_nome TEXT, acao TEXT, tabela_afetada TEXT,
      registro_id TEXT, dados_antes TEXT, dados_depois TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT);
    CREATE TABLE auditoria_avancada_v2(id INTEGER PRIMARY KEY, tabela TEXT, acao TEXT, registro_id TEXT,
      dados_anteriores TEXT, dados_novos TEXT, usuario_id TEXT, ip_address TEXT, user_agent TEXT, origem TEXT, created_at TEXT);
    CREATE TABLE documentos(id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, funcionario_id INTEGER, nome_arquivo TEXT,
      tipo TEXT, tamanho INTEGER, r2_key TEXT UNIQUE, descricao TEXT, empresa_id INTEGER, created_at TEXT, updated_at TEXT,
      deleted_at TEXT);
    CREATE TABLE pasta_virtual(id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_id INTEGER, documento_id INTEGER,
      certificacao_id INTEGER, empresa_id INTEGER, tipo_documento TEXT, categoria TEXT, caminho_arquivo TEXT,
      nome_arquivo TEXT, dataupload TEXT, descricao TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);

    INSERT INTO funcionarios VALUES(${FUNC_ALUNO},${EMPRESA},NULL,1,'ATIVO','Aluno Sintetico','00000000000',NULL,'MAT-70','Operador'),
      (${FUNC_OUTRO},${EMPRESA},NULL,1,'ATIVO','Outro Sintetico','00000000001',NULL,'MAT-71','Operador');
    INSERT INTO usuarios VALUES(${LEARNER_USER},${FUNC_ALUNO},NULL),(${OTHER_USER},${FUNC_OUTRO},NULL),(502,NULL,NULL);
    INSERT INTO qualificacoes_categorias VALUES(1,${EMPRESA},'EAD','EAD',1,NULL,'CORPORATIVO',1);
    INSERT INTO qualificacoes_tipos(id,empresa_id,codigo,nome,categoria,categoria_id,validade,carga_horaria)
      VALUES(${TIPO_ID},${EMPRESA},'${TIPO_CODIGO}','Treinamento Sintetico EAD','EAD',1,12,4);
    INSERT INTO lms_cursos(id,empresa_id,titulo,tipo_conteudo,scorm_package_r2_prefix,scorm_assessment_policy,
      gerar_qualificacao_ao_concluir,qualificacao_tipo_id)
      VALUES(${CURSO},${EMPRESA},'Curso Sintetico','scorm','${PREFIX}','FORMATIVE',1,${TIPO_ID});
    INSERT INTO lms_matriculas(id,empresa_id,curso_id,funcionario_id,status,progresso_pct,tentativas,ultimo_slide,ultima_pagina)
      VALUES(${MATRICULA},${EMPRESA},${CURSO},${FUNC_ALUNO},'EM_ANDAMENTO',99,0,4,4);
    INSERT INTO lms_matricula_ciclos(empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,origem,status,ciclo_atual,progresso_pct)
      VALUES(${EMPRESA},${MATRICULA},${CURSO},${FUNC_ALUNO},1,'LMS','EM_ANDAMENTO',1,99);
    INSERT INTO lms_scorm_package_versions VALUES('p1',${EMPRESA},${CURSO},'${PKG}','VALIDATED','${PREFIX}');
  `);
  if (opts.template !== false) {
    db.database.prepare('INSERT INTO empresas_config VALUES(?,?,?)').run(EMPRESA, null, TEMPLATE_HTML);
  }
  db.database.prepare(
    "INSERT INTO lms_progresso_scorm(matricula_id,empresa_id,lesson_status,completion_status,cmi_json,session_count) VALUES(?,?,'completed','completed',?,1)",
  ).run(MATRICULA, EMPRESA, ledger(opts.viewed ?? [1, 2, 3, 4]));
  // Exam module DDL (Schema V2 0571/0572) after the tables it joins at read time.
  db.exec(migration('schema-v2/changes/0571_lms_exam_question_bank.sql'));
  db.exec(migration('schema-v2/changes/0572_lms_exam_attempts.sql'));
  return db;
}

/** Tables read by the REAL auth + tenant middleware (synthetic identities only). */
export function addAuthTables(db: AtomicSqliteD1): void {
  db.exec(`
    ALTER TABLE usuarios ADD COLUMN perfil TEXT;
    ALTER TABLE usuarios ADD COLUMN ativo INTEGER DEFAULT 1;
    CREATE TABLE empresas(id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, plano TEXT, ativo INTEGER, deleted_at TEXT, logo_url TEXT);
    CREATE TABLE usuarios_empresas(usuario_id INTEGER, empresa_id INTEGER, role TEXT, is_primary INTEGER DEFAULT 1,
      PRIMARY KEY(usuario_id, empresa_id));
    CREATE TABLE token_blocklist(jti TEXT PRIMARY KEY, expires_at TEXT);
    INSERT INTO empresas(id,codigo,nome,plano,ativo) VALUES(6,'sint-a','Empresa Sintetica A','pro',1),(7,'sint-b','Empresa Sintetica B','pro',1);
    INSERT INTO usuarios(id,funcionario_id,deleted_at,perfil,ativo) VALUES(${ADMIN_USER},NULL,NULL,'ADMIN',1),(${TENANT_B_ADMIN},NULL,NULL,'ADMIN',1);
    INSERT INTO usuarios_empresas VALUES(${LEARNER_USER},6,'ALUNO',1),(${OTHER_USER},6,'ALUNO',1),(502,6,'ALUNO',1),
      (${ADMIN_USER},6,'ADMIN',1),(${TENANT_B_ADMIN},7,'ADMIN',1);
  `);
}

/** In-memory R2 with the real contract (get/put/delete) + the SCORM completion manifest under the active prefix. */
export function memoryBucket(opts: { assessmentMode?: string; putFails?: boolean } = {}) {
  const objects = new Map<string, { body: Uint8Array; contentType?: string }>();
  const manifest = {
    packageVersion: 'PKG-V2', content: { requiredSlides: ['s1', 's2', 's3', 's4'] },
    assessment: { mode: opts.assessmentMode ?? 'EXTERNAL' },
  };
  const state = { putFails: opts.putFails ?? false, puts: 0, deletes: 0 };
  const bucket = {
    get: async (key: string) => {
      if (key === `${PREFIX}airtrust-completion-manifest.json`) {
        const text = JSON.stringify(manifest);
        return { size: text.length, text: async () => text };
      }
      const o = objects.get(key);
      return o ? { size: o.body.length, arrayBuffer: async () => o.body.buffer, httpMetadata: { contentType: o.contentType } } : null;
    },
    put: async (key: string, value: Uint8Array, o?: { httpMetadata?: { contentType?: string } }) => {
      state.puts += 1;
      if (state.putFails) throw new Error('INJECTED_R2_PUT_FAILURE');
      objects.set(key, { body: value, contentType: o?.httpMetadata?.contentType });
    },
    delete: async (key: string) => { state.deletes += 1; objects.delete(key); },
  };
  return { bucket: bucket as unknown as R2Bucket, objects, state };
}
