import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../shared/handlers', () => ({ processarEventosParaModulo: vi.fn() }));
import { processarEventosParaModulo } from '../../shared/handlers';
import { runDomainEventDispatchJob, DOMAIN_EVENT_MODULES } from '../../cron/resilient/domain-events';
const opened: SqliteD1Database[] = [];
afterEach(() => {
  vi.resetAllMocks();
  for (const db of opened.splice(0)) db.close();
});

describe('domain event durable cursor under D1 overload (#2149)', () => {
  it('aborts fan-out on first overloaded tenant module and retries the same tenant on recovery', async () => {
    const db = new SqliteD1Database();
    opened.push(db);
    db.database.exec(readFileSync(resolve(process.cwd(), 'schema-v2/changes/0451_cron_job_resilience_state_v2.sql'), 'utf8'));
    db.database.exec('ALTER TABLE empresas ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1; ALTER TABLE empresas ADD COLUMN deleted_at TEXT; UPDATE empresas SET ativo=0; INSERT OR IGNORE INTO empresas (id,ativo) VALUES (1,1),(2,1); UPDATE empresas SET ativo=1 WHERE id IN (1,2)');
    const mocked = vi.mocked(processarEventosParaModulo);
    mocked.mockRejectedValueOnce(new Error('D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window'));
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const failed = await runDomainEventDispatchJob(db as unknown as D1Database, logger);
    expect(failed.outcome).toBe('FAILED');
    expect(failed.errorCode).toContain('D1_DB_IS_OVERLOADED');
    expect(mocked).toHaveBeenCalledTimes(1);
    const before = db.database.prepare("SELECT cursor_value FROM cron_job_state WHERE job_name='domain-events-dispatch'").get() as {cursor_value:string|null};
    expect(before.cursor_value).toBeNull();
    mocked.mockResolvedValue({ processados: 0, erros: 0 } as never);
    const recovered = await runDomainEventDispatchJob(db as unknown as D1Database, logger);
    expect(recovered.outcome).toBe('SUCCEEDED');
    expect(mocked).toHaveBeenCalledTimes(1 + DOMAIN_EVENT_MODULES.length * 2);
    const after = db.database.prepare("SELECT cursor_value FROM cron_job_state WHERE job_name='domain-events-dispatch'").get() as {cursor_value:string|null};
    expect(after.cursor_value).toBe('0');
  });

  it('treats a swallowed D1 overload returned in domain-event actions as a tick breaker', async () => {
    const db = new SqliteD1Database();
    opened.push(db);
    db.database.exec(readFileSync(resolve(process.cwd(), 'schema-v2/changes/0451_cron_job_resilience_state_v2.sql'), 'utf8'));
    db.database.exec('ALTER TABLE empresas ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1; ALTER TABLE empresas ADD COLUMN deleted_at TEXT; UPDATE empresas SET ativo=0; UPDATE empresas SET ativo=1 WHERE id=1');
    const mocked = vi.mocked(processarEventosParaModulo);
    mocked.mockResolvedValueOnce({ processados: 0, erros: 1, acoes: [
      'ERR:frms←NOVO:D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window',
    ] });
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await runDomainEventDispatchJob(db as unknown as D1Database, logger);
    expect(result.outcome).toBe('FAILED');
    expect(result.errorCode).toContain('D1_DB_IS_OVERLOADED');
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});
