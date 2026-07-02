import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'maintenance', 'recover-lms-emergencias-gerais.mjs');

function createTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-emergencias-'));
  const dbPath = join(dir, 'recovery.sqlite');

  execFileSync(
    'sqlite3',
    [dbPath, `
      CREATE TABLE lms_cursos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        categoria TEXT,
        formato_id INTEGER,
        tipo_conteudo TEXT NOT NULL,
        publicado INTEGER NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT,
        scorm_launch_file TEXT,
        scorm_package_r2_prefix TEXT,
        thumbnail_r2_key TEXT,
        conteudo_arquivo_nome TEXT,
        created_at TEXT,
        updated_at TEXT,
        qualificacao_tipo_id INTEGER
      );
      CREATE TABLE lms_matriculas (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        curso_id INTEGER NOT NULL,
        status TEXT,
        deleted_at TEXT
      );
      CREATE TABLE lms_matricula_ciclos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        matricula_id INTEGER,
        curso_id INTEGER,
        deleted_at TEXT
      );
      CREATE TABLE lms_progresso_scorm (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        matricula_id INTEGER NOT NULL
      );
      CREATE TABLE qualificacoes_historico (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        lms_matricula_id INTEGER,
        deleted_at TEXT
      );
    `],
    { encoding: 'utf8' },
  );

  return {
    dir,
    dbPath,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedCanonicalScenario(dbPath, overrides = {}) {
  const source = {
    empresaId: 6,
    shellEmpresaId: 6,
    sourceHasPackage: true,
    shellHasLinks: false,
    sourceAtivo: 0,
    sourceDeletedAt: '2026-07-02 15:56:44',
    shellAtivo: 1,
    shellDeletedAt: null,
    sourceTitle: 'Emergências Gerais',
    shellTitle: 'Emergências Gerais',
    ...overrides,
  };

  execFileSync(
    'sqlite3',
    [dbPath, `
      INSERT INTO lms_cursos (
        id, empresa_id, titulo, categoria, formato_id, tipo_conteudo, publicado, ativo, deleted_at,
        scorm_launch_file, scorm_package_r2_prefix, thumbnail_r2_key, conteudo_arquivo_nome, created_at, updated_at, qualificacao_tipo_id
      ) VALUES (
        5, ${source.empresaId}, '${source.sourceTitle}', 'EAD', 1, 'scorm', 1, ${source.sourceAtivo},
        ${source.sourceDeletedAt ? `'${source.sourceDeletedAt}'` : 'NULL'},
        ${source.sourceHasPackage ? "'index.html'" : 'NULL'},
        ${source.sourceHasPackage ? "'lms/scorm/6/5/'" : 'NULL'},
        'lms/course-thumbnails/6/5/1781455432443.png',
        ${source.sourceHasPackage ? "'TRIP_Emergencias_Gerais_SCORM12_RevLMS2026-06-28.zip'" : 'NULL'},
        '2026-04-19 15:08:50', '2026-07-02 15:56:44', 20
      );

      INSERT INTO lms_cursos (
        id, empresa_id, titulo, categoria, formato_id, tipo_conteudo, publicado, ativo, deleted_at,
        scorm_launch_file, scorm_package_r2_prefix, thumbnail_r2_key, conteudo_arquivo_nome, created_at, updated_at, qualificacao_tipo_id
      ) VALUES (
        35, ${source.shellEmpresaId}, '${source.shellTitle}', 'EAD', 1, 'scorm', 0, ${source.shellAtivo},
        ${source.shellDeletedAt ? `'${source.shellDeletedAt}'` : 'NULL'},
        NULL, NULL, NULL, NULL, '2026-07-02 15:58:27', '2026-07-02 15:58:27', 20
      );

      INSERT INTO lms_matriculas (id, empresa_id, curso_id, status, deleted_at) VALUES
        (2, ${source.empresaId}, 5, 'EM_ANDAMENTO', NULL),
        (5, ${source.empresaId}, 5, 'CONCLUIDO', NULL),
        (30, ${source.empresaId}, 5, 'CONCLUIDO', NULL);

      INSERT INTO lms_matricula_ciclos (id, empresa_id, matricula_id, curso_id, deleted_at) VALUES
        (100, ${source.empresaId}, 2, 5, NULL),
        (101, ${source.empresaId}, 5, 5, NULL);

      INSERT INTO lms_progresso_scorm (id, empresa_id, matricula_id) VALUES
        (200, ${source.empresaId}, 2),
        (201, ${source.empresaId}, 5);

      INSERT INTO qualificacoes_historico (id, empresa_id, lms_matricula_id, deleted_at) VALUES
        (300, ${source.empresaId}, 5, NULL);
    `],
    { encoding: 'utf8' },
  );

  if (source.shellHasLinks) {
    execFileSync(
      'sqlite3',
      [dbPath, `
        INSERT INTO lms_matriculas (id, empresa_id, curso_id, status, deleted_at) VALUES
          (400, ${source.shellEmpresaId}, 35, 'NAO_INICIADO', NULL);
      `],
      { encoding: 'utf8' },
    );
  }
}

function runScript(dbPath, extraArgs = [], env = {}) {
  const result = spawnSync(
    'node',
    [
      SCRIPT,
      '--db-file',
      dbPath,
      '--empresa-id',
      '6',
      '--source-curso-id',
      '5',
      '--shell-curso-id',
      '35',
      ...extraArgs,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 15000,
    },
  );

  return {
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function queryOne(dbPath, sql) {
  return JSON.parse(execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim())[0];
}

test('dry-run não altera o banco e imprime o plano', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath);
    const before = queryOne(
      fixture.dbPath,
      'SELECT ativo, deleted_at FROM lms_cursos WHERE id = 5;',
    );
    const result = runScript(fixture.dbPath);
    const after = queryOne(
      fixture.dbPath,
      'SELECT ativo, deleted_at FROM lms_cursos WHERE id = 5;',
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(after, before);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.mode, 'dry-run');
    assert.equal(payload.source_counters.matriculas_total, 3);
    assert.equal(payload.shell_counters.matriculas_total, 0);
  } finally {
    fixture.cleanup();
  }
});

test('apply reativa o source e desativa o shell sem mover vínculos', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath);
    const result = runScript(fixture.dbPath, ['--apply', '--confirm-emergencias-gerais-recovery']);
    assert.equal(result.status, 0, result.stderr);

    const source = queryOne(
      fixture.dbPath,
      'SELECT ativo, deleted_at FROM lms_cursos WHERE id = 5;',
    );
    const shell = queryOne(
      fixture.dbPath,
      'SELECT ativo, deleted_at FROM lms_cursos WHERE id = 35;',
    );
    const counters = queryOne(
      fixture.dbPath,
      'SELECT COUNT(*) AS total, SUM(CASE WHEN curso_id = 5 THEN 1 ELSE 0 END) AS curso5, SUM(CASE WHEN curso_id = 35 THEN 1 ELSE 0 END) AS curso35 FROM lms_matriculas;',
    );

    assert.equal(source.ativo, 1);
    assert.equal(source.deleted_at, null);
    assert.equal(shell.ativo, 0);
    assert.ok(shell.deleted_at);
    assert.equal(counters.curso5, 3);
    assert.equal(counters.curso35, 0);
  } finally {
    fixture.cleanup();
  }
});

test('apply é idempotente quando o estado já está recuperado', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath, {
      sourceAtivo: 1,
      sourceDeletedAt: null,
      shellAtivo: 0,
      shellDeletedAt: '2026-07-02 16:10:00',
    });
    const before = queryOne(
      fixture.dbPath,
      'SELECT ativo, deleted_at FROM lms_cursos WHERE id = 35;',
    );
    const result = runScript(fixture.dbPath, ['--apply', '--confirm-emergencias-gerais-recovery']);
    const after = queryOne(
      fixture.dbPath,
      'SELECT ativo, deleted_at FROM lms_cursos WHERE id = 35;',
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(after, before);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.after.shell_counters.matriculas_total, 0);
  } finally {
    fixture.cleanup();
  }
});

test('falha se shell tiver matrículas', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath, { shellHasLinks: true });
    const result = runScript(fixture.dbPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /shell possui vínculos ativos/i);
  } finally {
    fixture.cleanup();
  }
});

test('falha se source não tiver pacote SCORM', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath, { sourceHasPackage: false });
    const result = runScript(fixture.dbPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source não possui pacote SCORM válido/i);
  } finally {
    fixture.cleanup();
  }
});

test('falha se empresa_id divergir entre source e shell', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath, { shellEmpresaId: 7 });
    const result = runScript(fixture.dbPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /empresa diferente/i);
  } finally {
    fixture.cleanup();
  }
});

test('apply também aceita confirmação via env', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath);
    const result = runScript(fixture.dbPath, ['--apply'], {
      CONFIRM_EMERGENCIAS_GERAIS_RECOVERY: 'YES',
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fixture.cleanup();
  }
});

test('apply sem confirmação explícita falha fechado', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath);
    const result = runScript(fixture.dbPath, ['--apply']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exige --confirm-emergencias-gerais-recovery/i);
  } finally {
    fixture.cleanup();
  }
});

test('falha se source tiver título inesperado', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath, { sourceTitle: 'Outro Curso' });
    const result = runScript(fixture.dbPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /título divergente/i);
  } finally {
    fixture.cleanup();
  }
});

test('shell continua sem vínculos após apply', () => {
  const fixture = createTempDb();
  try {
    seedCanonicalScenario(fixture.dbPath);
    const result = runScript(fixture.dbPath, ['--apply', '--confirm-emergencias-gerais-recovery']);
    assert.equal(result.status, 0, result.stderr);
    const shellCounters = JSON.parse(result.stdout).after.shell_counters;
    assert.equal(shellCounters.matriculas_total, 0);
    assert.equal(shellCounters.progressos_scorm_total, 0);
    assert.equal(shellCounters.ciclos_total, 0);
    assert.equal(shellCounters.historicos_vinculados, 0);
  } finally {
    fixture.cleanup();
  }
});
