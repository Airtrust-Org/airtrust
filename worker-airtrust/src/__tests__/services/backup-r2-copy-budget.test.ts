import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_R2_COPY_DEFAULT_MAX_OBJECTS,
  BackupOrchestrator,
} from '../../services/backup/orchestrator';
import type { Env } from '../../types';
import { BackupSqliteD1 } from '../helpers/backup-sqlite-d1';
import { FakeR2Bucket } from '../helpers/fake-r2-bucket';

const CONFIG_TABLES = [
  'system_config', 'funcoes', 'setores', 'aeronaves', 'modelos_aeronave', 'empresas', 'papeis',
];

function setup(objectCount: number, extraEnv: Partial<Env> = {}) {
  const db = new BackupSqliteD1();
  for (const t of CONFIG_TABLES) db.exec(`CREATE TABLE "${t}" (id INTEGER PRIMARY KEY)`);
  const initial: Record<string, string> = {};
  for (let i = 0; i < objectCount; i++) initial[`scorm/pkg/file-${i}.js`] = `conteudo ${i}`;
  const r2 = new FakeR2Bucket(initial);
  const orchestrator = new BackupOrchestrator({
    DB: db.asD1(),
    BUCKET: r2.asR2(),
    ...extraEnv,
  } as Env);
  return { db, r2, orchestrator };
}

const run = (orchestrator: BackupOrchestrator) =>
  orchestrator.executarBackupManual({
    tipo: 'COMPLETO',
    modulos: ['CONFIGURACOES'],
    triggered_by: 'UNIT_TEST',
    escopo: 'SYSTEM_GLOBAL',
  });

describe('BackupOrchestrator - orcamento da copia completa do R2 (P08-03 / P13-03)', () => {
  it('falha ANTES de copiar quando o bucket excede o limite, sem copias parciais nem manifesto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db, r2, orchestrator } = setup(BACKUP_R2_COPY_DEFAULT_MAX_OBJECTS + 1);
    const putsAntes = r2.ops.put;

    await expect(run(orchestrator)).rejects.toThrow('R2_BACKUP_COPY_EXCEEDS_INVOCATION_BUDGET');

    expect(r2.keys().filter((k) => k.includes('/r2-files/'))).toEqual([]);
    expect(r2.keys().some((k) => k.endsWith('/r2-manifest.json'))).toBe(false);
    expect(r2.keys().some((k) => k.endsWith('/checksum-manifest.json'))).toBe(false);
    // so o JSON do modulo D1 foi gravado; nenhum put por objeto
    expect(r2.ops.put - putsAntes).toBe(1);
    const row = db.database.prepare('SELECT status, r2_checksum_sha256 c FROM backups_controle').get() as {
      status: string;
      c: string | null;
    };
    expect(row.status).toBe('FALHOU');
    expect(row.c).toBeNull();
  });

  it('copia e fecha com checksum quando o bucket cabe no limite', async () => {
    const { db, r2, orchestrator } = setup(5);

    await run(orchestrator);

    expect(r2.keys().filter((k) => k.includes('/r2-files/'))).toHaveLength(5);
    expect(r2.keys().some((k) => k.endsWith('/checksum-manifest.json'))).toBe(true);
    const row = db.database.prepare('SELECT status, r2_checksum_sha256 c FROM backups_controle').get() as {
      status: string;
      c: string;
    };
    expect(row.status).toBe('CONCLUIDO');
    expect(row.c).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('respeita BACKUP_R2_COPY_MAX_OBJECTS e ignora valor invalido', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(run(setup(3, { BACKUP_R2_COPY_MAX_OBJECTS: '2' }).orchestrator)).rejects.toThrow(
      'limite 2',
    );
    await expect(run(setup(3, { BACKUP_R2_COPY_MAX_OBJECTS: 'abc' }).orchestrator)).resolves.toBeTypeOf(
      'number',
    );
  });
});
