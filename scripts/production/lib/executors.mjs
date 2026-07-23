// Executors for the 0440 ledger reconciler.
//
// An executor exposes:
//   query(sql) -> Array<object>   (read-only; parses rows)
//   exec(sql)  -> void            (single write; only used with apply)
//
// Two implementations:
//   - sqliteExecutor: local sqlite3 CLI, used by tests against a disposable
//     fixture database file.
//   - wranglerExecutor: `wrangler d1 execute` (remote for production reads /
//     the single ledger write, or local for rehearsals). In dry-run the caller
//     constructs it with allowWrites=false so exec() throws — a hard,
//     defense-in-depth guarantee that a dry-run performs zero writes.

import { spawnSync } from 'node:child_process';

function parseWranglerJson(stdout) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    // wrangler sometimes prints banner lines before the JSON array.
    const start = trimmed.indexOf('[');
    if (start < 0) return [];
    payload = JSON.parse(trimmed.slice(start));
  }
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((block) => (block && block.results) || []);
}

export function sqliteExecutor(dbPath) {
  const run = (sql, json) => {
    const args = json ? ['-json', dbPath] : ['-bail', dbPath];
    const res = spawnSync('sqlite3', args, {
      input: `PRAGMA foreign_keys=ON;\n${sql};`,
      encoding: 'utf8',
    });
    if (res.status !== 0) {
      throw new Error(`sqlite3 falhou (${res.status}): ${res.stderr || res.stdout}`);
    }
    return res.stdout;
  };
  return {
    label: `sqlite:${dbPath}`,
    query(sql) {
      const out = run(sql, true).trim();
      return out ? JSON.parse(out) : [];
    },
    exec(sql) {
      run(sql, false);
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.database   D1 database name
 * @param {string} opts.config     wrangler config path
 * @param {boolean} [opts.remote]  true => --remote, false => --local
 * @param {string} [opts.env]      wrangler --env
 * @param {string} [opts.persistTo] local state dir
 * @param {boolean} [opts.allowWrites] gate for exec()
 * @param {(cmd:string,args:string[])=>void} [opts.onCommand] observer (audit log)
 */
export function wranglerExecutor(opts) {
  const {
    database,
    config,
    remote = true,
    env,
    persistTo,
    allowWrites = false,
    cwd,
    onCommand,
  } = opts;

  const baseArgs = ['--no-install', 'wrangler', 'd1', 'execute', database];
  baseArgs.push(remote ? '--remote' : '--local');
  if (config) baseArgs.push('--config', config);
  if (env) baseArgs.push('--env', env);
  if (persistTo) baseArgs.push('--persist-to', persistTo);

  const invoke = (command, json) => {
    const args = [...baseArgs];
    if (json) args.push('--json');
    args.push('--command', command);
    if (onCommand) onCommand('npx', args);
    const res = spawnSync('npx', args, { cwd, encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`wrangler falhou (${res.status}): ${res.stderr || res.stdout}`);
    }
    return res.stdout;
  };

  return {
    label: `wrangler:${database}:${remote ? 'remote' : 'local'}`,
    query(sql) {
      return parseWranglerJson(invoke(sql, true));
    },
    exec(sql) {
      if (!allowWrites) {
        throw new Error(
          'executor em modo somente-leitura: escrita bloqueada (dry-run). Nenhuma escrita foi feita.',
        );
      }
      invoke(sql, false);
    },
  };
}

export default { sqliteExecutor, wranglerExecutor };
