#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TITLE = 'Emergências Gerais';
const DEFAULT_BUCKET = 'airtrust-storage';
const CONFIRM_FLAG = '--confirm-emergencias-gerais-recovery';
const CONFIRM_ENV = 'CONFIRM_EMERGENCIAS_GERAIS_RECOVERY';

function usage() {
  return `
Uso local:
  node scripts/maintenance/recover-lms-emergencias-gerais.mjs --db-file <sqlite.db> --empresa-id 6 --source-curso-id 5 --shell-curso-id 35
  node scripts/maintenance/recover-lms-emergencias-gerais.mjs --apply --db-file <sqlite.db> --empresa-id 6 --source-curso-id 5 --shell-curso-id 35 ${CONFIRM_FLAG}

Uso remoto:
  node scripts/maintenance/recover-lms-emergencias-gerais.mjs --remote --database airtrust-db --env production --empresa-id 6 --source-curso-id 5 --shell-curso-id 35
  node scripts/maintenance/recover-lms-emergencias-gerais.mjs --apply --remote --database airtrust-db --env production --empresa-id 6 --source-curso-id 5 --shell-curso-id 35 ${CONFIRM_FLAG}

Regras:
  - default = dry-run
  - apply exige confirmação explícita
  - não move matrículas, progresso, ciclos ou histórico
  - não altera tipo_conteudo
  - não toca R2; apenas lê metadados do banco
`.trim();
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    confirm: false,
    remote: false,
    dbFile: '',
    database: '',
    env: 'production',
    empresaId: null,
    sourceCursoId: null,
    shellCursoId: null,
    expectedTitle: DEFAULT_TITLE,
    bucketName: DEFAULT_BUCKET,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dryRun = true;
      args.apply = false;
      continue;
    }
    if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
      continue;
    }
    if (arg === CONFIRM_FLAG) {
      args.confirm = true;
      continue;
    }
    if (arg === '--remote') {
      args.remote = true;
      continue;
    }
    if (arg === '--db-file') {
      args.dbFile = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (arg === '--database') {
      args.database = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (arg === '--env') {
      args.env = String(argv[index + 1] || 'production');
      index += 1;
      continue;
    }
    if (arg === '--empresa-id') {
      args.empresaId = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--source-curso-id') {
      args.sourceCursoId = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--shell-curso-id') {
      args.shellCursoId = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--expected-title') {
      args.expectedTitle = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (arg === '--bucket-name') {
      args.bucketName = String(argv[index + 1] || DEFAULT_BUCKET);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
  }

  if (!Number.isInteger(args.empresaId) || args.empresaId <= 0) {
    throw new Error('--empresa-id deve ser um número positivo.');
  }
  if (!Number.isInteger(args.sourceCursoId) || args.sourceCursoId <= 0) {
    throw new Error('--source-curso-id deve ser um número positivo.');
  }
  if (!Number.isInteger(args.shellCursoId) || args.shellCursoId <= 0) {
    throw new Error('--shell-curso-id deve ser um número positivo.');
  }
  if (args.sourceCursoId === args.shellCursoId) {
    throw new Error('source e shell não podem apontar para o mesmo curso.');
  }

  if (args.remote) {
    if (!args.database) {
      throw new Error('--remote exige --database <binding-ou-id>.');
    }
    if (args.dbFile) {
      throw new Error('Escolha apenas um alvo: --db-file local ou --remote.');
    }
  } else if (!args.dbFile) {
    throw new Error('Informe --db-file para alvo local ou use --remote com --database.');
  }

  if (args.apply && !args.confirm && String(process.env[CONFIRM_ENV] || '').trim() !== 'YES') {
    throw new Error(
      `--apply exige ${CONFIRM_FLAG} ou ${CONFIRM_ENV}=YES.`,
    );
  }

  return args;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function makeSqlTarget(dbFile) {
  const resolved = path.resolve(dbFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Banco SQLite não encontrado: ${resolved}`);
  }
  execFileSync('sqlite3', ['-version'], { encoding: 'utf8' });

  return {
    kind: 'sqlite',
    descriptor: resolved,
    queryRows(sql) {
      const output = execFileSync('sqlite3', ['-json', resolved, sql], {
        encoding: 'utf8',
      }).trim();
      return output ? JSON.parse(output) : [];
    },
    exec(sql) {
      execFileSync('sqlite3', [resolved, sql], { encoding: 'utf8' });
      return { changes: null };
    },
  };
}

function makeRemoteTarget(database, envName) {
  execFileSync('wrangler', ['--version'], { encoding: 'utf8' });

  return {
    kind: 'remote-d1',
    descriptor: `${database}:${envName}`,
    queryRows(sql) {
      const output = execFileSync(
        'wrangler',
        ['d1', 'execute', database, '--env', envName, '--remote', '--json', '--command', sql],
        { encoding: 'utf8' },
      ).trim();
      const parsed = output ? JSON.parse(output) : [];
      return parsed[0]?.results ?? [];
    },
    exec(sql) {
      const tempFile = path.join(
        process.cwd(),
        `.recover-lms-emergencias-gerais-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`,
      );
      fs.writeFileSync(tempFile, sql);
      try {
        execFileSync(
          'wrangler',
          ['d1', 'execute', database, '--env', envName, '--remote', '--file', tempFile],
          { encoding: 'utf8' },
        );
        return { changes: null };
      } finally {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // ignore cleanup failures
        }
      }
    },
  };
}

function queryRows(target, sql) {
  return target.queryRows(sql);
}

function queryOne(target, sql) {
  const rows = queryRows(target, sql);
  return rows[0] ?? null;
}

function tableColumns(target, tableName) {
  return queryRows(target, `PRAGMA table_info(${tableName});`).map((row) => String(row.name));
}

function hasColumns(columns, required) {
  const columnSet = new Set(columns);
  return required.every((column) => columnSet.has(column));
}

function getCursoSnapshot(target, cursoId) {
  return queryOne(
    target,
    `
      SELECT id,
             empresa_id,
             titulo,
             categoria,
             formato_id,
             tipo_conteudo,
             publicado,
             ativo,
             deleted_at,
             scorm_launch_file,
             scorm_package_r2_prefix,
             thumbnail_r2_key,
             conteudo_arquivo_nome,
             created_at,
             updated_at,
             qualificacao_tipo_id
        FROM lms_cursos
       WHERE id = ${cursoId}
       LIMIT 1;
    `,
  );
}

function getCursoCounters(target, empresaId, cursoId) {
  return queryOne(
    target,
    `
      SELECT
        (
          SELECT COUNT(*)
            FROM lms_matriculas
           WHERE empresa_id = ${empresaId}
             AND curso_id = ${cursoId}
             AND deleted_at IS NULL
        ) AS matriculas_total,
        (
          SELECT COUNT(*)
            FROM lms_matriculas
           WHERE empresa_id = ${empresaId}
             AND curso_id = ${cursoId}
             AND deleted_at IS NULL
             AND UPPER(TRIM(COALESCE(status, ''))) = 'CONCLUIDO'
        ) AS concluidas,
        (
          SELECT COUNT(*)
            FROM lms_matriculas
           WHERE empresa_id = ${empresaId}
             AND curso_id = ${cursoId}
             AND deleted_at IS NULL
             AND UPPER(TRIM(COALESCE(status, ''))) = 'EM_ANDAMENTO'
        ) AS em_andamento,
        (
          SELECT COUNT(*)
            FROM lms_matricula_ciclos
           WHERE empresa_id = ${empresaId}
             AND curso_id = ${cursoId}
             AND deleted_at IS NULL
        ) AS ciclos_total,
        (
          SELECT COUNT(*)
            FROM lms_progresso_scorm ps
            JOIN lms_matriculas m
              ON m.id = ps.matricula_id
             AND m.empresa_id = ${empresaId}
           WHERE m.curso_id = ${cursoId}
             AND m.deleted_at IS NULL
        ) AS progressos_scorm_total,
        (
          SELECT COUNT(*)
            FROM qualificacoes_historico qh
            JOIN lms_matriculas m
              ON m.id = qh.lms_matricula_id
             AND m.empresa_id = ${empresaId}
           WHERE qh.empresa_id = ${empresaId}
             AND qh.deleted_at IS NULL
             AND m.curso_id = ${cursoId}
        ) AS historicos_vinculados
    `,
  );
}

function buildPlan({ args, source, shell, sourceCounters, shellCounters }) {
  return {
    mode: args.apply ? 'apply' : 'dry-run',
    target: {
      kind: args.remote ? 'remote-d1' : 'sqlite',
      env: args.remote ? args.env : null,
      database: args.remote ? args.database : null,
      db_file: args.remote ? null : path.resolve(args.dbFile),
    },
    empresa_id: args.empresaId,
    source_curso_id: args.sourceCursoId,
    shell_curso_id: args.shellCursoId,
    source,
    shell,
    source_counters: sourceCounters,
    shell_counters: shellCounters,
    actions: [
      'reativar o curso source se estiver inativo ou soft-deleted',
      'preservar pacote SCORM, capa, matrícula, progresso e histórico no source',
      'desativar e soft-deletar o shell se ainda estiver ativo',
      'não mover vínculos entre cursos',
    ],
    rollback: {
      description:
        'rollback lógico: restaurar o estado anterior do source/shell com os mesmos IDs; não executado automaticamente',
      source_previous_deleted_at: source.deleted_at,
      source_previous_ativo: source.ativo,
      shell_previous_deleted_at: shell.deleted_at,
      shell_previous_ativo: shell.ativo,
    },
  };
}

function assertExpectedCourse(row, expectedTitle, roleLabel) {
  if (!row?.id) {
    throw new Error(`${roleLabel} não encontrado.`);
  }
  if (normalizeTitle(row.titulo) !== normalizeTitle(expectedTitle)) {
    throw new Error(
      `${roleLabel} inválido: título divergente. Esperado "${expectedTitle}", encontrado "${row.titulo}".`,
    );
  }
}

function validateState({ args, source, shell, sourceCounters, shellCounters }) {
  assertExpectedCourse(source, args.expectedTitle, 'source');
  assertExpectedCourse(shell, args.expectedTitle, 'shell');

  if (Number(source.empresa_id) !== args.empresaId || Number(shell.empresa_id) !== args.empresaId) {
    throw new Error('source/shell pertencem a empresa diferente do escopo informado.');
  }

  if (String(source.tipo_conteudo || '').trim().toLowerCase() !== 'scorm') {
    throw new Error('source não possui tipo_conteudo=scorm.');
  }

  if (!String(source.scorm_package_r2_prefix || '').trim() || !String(source.scorm_launch_file || '').trim()) {
    throw new Error('source não possui pacote SCORM válido.');
  }

  if (Number(sourceCounters.matriculas_total ?? 0) <= 0 && Number(sourceCounters.progressos_scorm_total ?? 0) <= 0) {
    throw new Error('source não possui matrículas nem progresso suficientes para recovery seguro.');
  }

  if (
    Number(shellCounters.matriculas_total ?? 0) > 0 ||
    Number(shellCounters.progressos_scorm_total ?? 0) > 0 ||
    Number(shellCounters.ciclos_total ?? 0) > 0 ||
    Number(shellCounters.historicos_vinculados ?? 0) > 0
  ) {
    throw new Error('shell possui vínculos ativos; abortando recovery por ambiguidade.');
  }
}

function buildApplySql({ empresaId, sourceCursoId, shellCursoId }) {
  return `
UPDATE lms_cursos
   SET ativo = 1,
       deleted_at = NULL,
       updated_at = datetime('now')
 WHERE empresa_id = ${empresaId}
   AND id = ${sourceCursoId}
   AND (COALESCE(ativo, 1) <> 1 OR deleted_at IS NOT NULL);

UPDATE lms_cursos
   SET ativo = 0,
       deleted_at = COALESCE(deleted_at, datetime('now')),
       updated_at = datetime('now')
 WHERE empresa_id = ${empresaId}
  AND id = ${shellCursoId}
   AND (COALESCE(ativo, 1) <> 0 OR deleted_at IS NULL);
`.trim();
}

function buildApplyStatements({ empresaId, sourceCursoId, shellCursoId }) {
  return [
    `
UPDATE lms_cursos
   SET ativo = 1,
       deleted_at = NULL,
       updated_at = datetime('now')
 WHERE empresa_id = ${empresaId}
   AND id = ${sourceCursoId}
   AND (COALESCE(ativo, 1) <> 1 OR deleted_at IS NOT NULL);
`.trim(),
    `
UPDATE lms_cursos
   SET ativo = 0,
       deleted_at = COALESCE(deleted_at, datetime('now')),
       updated_at = datetime('now')
 WHERE empresa_id = ${empresaId}
   AND id = ${shellCursoId}
   AND (COALESCE(ativo, 1) <> 0 OR deleted_at IS NULL);
`.trim(),
  ];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.remote
    ? makeRemoteTarget(args.database, args.env)
    : makeSqlTarget(args.dbFile);

  const requiredColumns = {
    lms_cursos: [
      'id',
      'empresa_id',
      'titulo',
      'categoria',
      'formato_id',
      'tipo_conteudo',
      'publicado',
      'ativo',
      'deleted_at',
      'scorm_launch_file',
      'scorm_package_r2_prefix',
      'thumbnail_r2_key',
      'conteudo_arquivo_nome',
      'updated_at',
    ],
    lms_matriculas: ['id', 'empresa_id', 'curso_id', 'status', 'deleted_at'],
    lms_matricula_ciclos: ['id', 'empresa_id', 'curso_id', 'deleted_at'],
    lms_progresso_scorm: ['id', 'empresa_id', 'matricula_id'],
    qualificacoes_historico: ['id', 'empresa_id', 'lms_matricula_id', 'deleted_at'],
  };

  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    const tableInfo = tableColumns(target, tableName);
    if (!hasColumns(tableInfo, columns)) {
      throw new Error(`Tabela ${tableName} não possui colunas esperadas: ${columns.join(', ')}`);
    }
  }

  const source = getCursoSnapshot(target, args.sourceCursoId);
  const shell = getCursoSnapshot(target, args.shellCursoId);
  const sourceCounters = getCursoCounters(target, args.empresaId, args.sourceCursoId);
  const shellCounters = getCursoCounters(target, args.empresaId, args.shellCursoId);

  validateState({ args, source, shell, sourceCounters, shellCounters });

  const plan = buildPlan({ args, source, shell, sourceCounters, shellCounters });

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ...plan,
          sql: buildApplySql(args),
          bucket_name: args.bucketName,
        },
        null,
        2,
      ),
    );
    return;
  }

  const sql = buildApplySql(args);
  const execution = { changes: 0 };
  for (const statement of buildApplyStatements(args)) {
    const result = target.exec(statement);
    execution.changes += Number(result?.changes ?? 0);
  }
  const sourceAfter = getCursoSnapshot(target, args.sourceCursoId);
  const shellAfter = getCursoSnapshot(target, args.shellCursoId);
  const sourceCountersAfter = getCursoCounters(target, args.empresaId, args.sourceCursoId);
  const shellCountersAfter = getCursoCounters(target, args.empresaId, args.shellCursoId);

  console.log(
    JSON.stringify(
      {
        ...plan,
        writes_executed: true,
        execution,
        after: {
          source: sourceAfter,
          shell: shellAfter,
          source_counters: sourceCountersAfter,
          shell_counters: shellCountersAfter,
        },
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
