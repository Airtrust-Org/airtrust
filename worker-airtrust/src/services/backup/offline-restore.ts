/**
 * Verificação e restore OFFLINE dos backups in-Worker (JSON no R2) para um banco descartável.
 *
 * ATENÇÃO: este módulo existe para ensaio/DR em ambiente isolado e para testes. Ele NÃO é
 * importado por rotas, cron nem entrypoints do Worker (há um teste que garante isso) e não
 * recebe D1/R2 de produção: quem chama injeta um leitor de objetos e um `RestoreTarget`
 * (por exemplo um SQLite local). O restore nunca sobrescreve: tabela de destino com linhas
 * aborta a operação.
 *
 * O RestoreService antigo (INSERT OR REPLACE direto no D1) foi removido (A-10) e a rota
 * /api/backup responde 503; o DR de produção suportado é o export/Time Travel do D1.
 */

import {
  BACKUP_MODULES,
  type ModuloBackup,
  ordenarModulosPorPrioridade,
} from '../../config/backup-modules';
import {
  type BackupChecksumManifest,
  type BackupRestoreDrillReport,
  sha256Hex,
  verifyBackupChecksumManifest,
} from './checksum-manifest';

export interface BackupObjectReader {
  get(key: string): Promise<Uint8Array | ArrayBuffer | null>;
  list(prefix: string): Promise<string[]>;
}

export interface VerifyBackupSetOptions {
  reader: BackupObjectReader;
  backupUuid: string;
  /** Valor de backups_controle.r2_checksum_sha256 (`sha256:<hex>`). Sem ele o manifesto não é autenticado. */
  expectedManifestSha256?: string | null;
  /** Módulos que o registro de controle diz ter sido incluídos (backups_controle.modulos_incluidos). */
  expectedModules?: string[];
}

export interface BackupSetVerification {
  ok: boolean;
  failures: string[];
  manifestKey: string;
  manifestSha256: string | null;
  drill: BackupRestoreDrillReport | null;
  /** módulo -> chave do JSON no R2, extraído do manifesto verificado. */
  moduleKeys: Record<string, string>;
  /** módulo -> digest SHA-256 esperado autenticado pelo manifesto. */
  moduleDigests: Record<string, string>;
}

const decoder = new TextDecoder();

function asBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export async function verifyBackupSet(
  options: VerifyBackupSetOptions,
): Promise<BackupSetVerification> {
  const { reader, backupUuid } = options;
  const manifestKey = `backups/${backupUuid}/checksum-manifest.json`;
  const failures: string[] = [];

  const manifestBytes = await reader.get(manifestKey);
  if (!manifestBytes) {
    return {
      ok: false,
      failures: [`Manifesto de checksum ausente: ${manifestKey}`],
      manifestKey,
      manifestSha256: null,
      drill: null,
      moduleKeys: {},
      moduleDigests: {},
    };
  }

  const manifestJson = decoder.decode(asBytes(manifestBytes));
  if (!options.expectedManifestSha256) {
    failures.push('SHA-256 esperado do manifesto não informado: manifesto não autenticado');
  }

  const drill = await verifyBackupChecksumManifest({
    manifestJson,
    expectedManifestSha256: options.expectedManifestSha256 || undefined,
    readArtifact: async (key) => {
      const bytes = await reader.get(key);
      return bytes ? asBytes(bytes) : null;
    },
  });
  failures.push(...drill.failures);
  // Never iterate scope prefixes or parse module pointers in an untrusted or
  // malformed backup. A failed integrity check must remain a structured FAIL.
  if (failures.length > 0) {
    return {
      ok: false, failures, manifestKey, manifestSha256: drill.manifestSha256,
      drill, moduleKeys: {}, moduleDigests: {},
    };
  }

  let manifest: BackupChecksumManifest | null = null;
  try {
    manifest = JSON.parse(manifestJson) as BackupChecksumManifest;
  } catch {
    // já reportado por verifyBackupChecksumManifest
  }

  const moduleKeys: Record<string, string> = {};
  const moduleDigests: Record<string, string> = {};
  if (manifest && Array.isArray(manifest.artifacts)) {
    if (manifest.backup_uuid !== backupUuid) {
      failures.push(
        `backup_uuid do manifesto (${String(manifest.backup_uuid)}) difere do solicitado (${backupUuid})`,
      );
    }

    const known = new Set(manifest.artifacts.map((artifact) => artifact.key));
    // Caminho oficial de módulos exportados: backups/(ano/mes/dia/)?{backupUuid}/{MODULO}.json
    // Exclui categoricamente arquivos de r2-files/ para impedir colisões de nomes.
    const moduleKeyPattern = new RegExp(
      `^backups/(?:\\d{4}/\\d{2}/\\d{2}/)?${backupUuid.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}/([A-Z_]+)\\.json$`,
    );
    for (const artifact of manifest.artifacts) {
      if (artifact.key.includes('/r2-files/')) continue;
      const match = moduleKeyPattern.exec(artifact.key);
      if (match && match[1] in BACKUP_MODULES) {
        moduleKeys[match[1]] = artifact.key;
        moduleDigests[match[1]] = artifact.sha256;
      }
    }

    for (const modulo of options.expectedModules ?? []) {
      if (!moduleKeys[modulo]) failures.push(`Módulo ${modulo} sem artefato no manifesto`);
    }

    // Objetos sob o escopo do backup que o manifesto não cobre = backup incompleto/adulterado.
    for (const prefix of manifest.scope_prefixes ?? []) {
      // The dated prefix is serialized without a trailing slash by the Worker.
      // Listing it verbatim also includes other backups whose UUID starts with
      // this UUID (e.g. "run-1" matching "run-1-retry"), yielding false FAILs.
      const scopedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
      for (const key of await reader.list(scopedPrefix)) {
        if (key.endsWith('/checksum-manifest.json')) continue;
        if (!known.has(key)) failures.push(`Objeto fora do manifesto: ${key}`);
      }
    }

    // O catálogo de cópias R2 é não confiável até validar formato e referências.
    // Um JSON inválido não pode abortar o ensaio por exceção nem produzir falso PASS.
    const r2ManifestKey = manifest.artifacts.find((a) => a.key.endsWith('/r2-manifest.json'))?.key;
    const copiedKeys = manifest.artifacts
      .filter((a) => a.key.includes('/r2-files/'))
      .map((a) => a.key);
    if (!r2ManifestKey && copiedKeys.length > 0) {
      failures.push('Cópias R2 presentes sem r2-manifest.json');
    }
    if (r2ManifestKey) {
      const raw = await reader.get(r2ManifestKey);
      if (!raw) {
        failures.push('Catálogo R2 ausente após verificação');
      } else {
        try {
          const catalog = JSON.parse(decoder.decode(asBytes(raw))) as unknown;
          if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) ||
              !('arquivos' in catalog) || !Array.isArray(catalog.arquivos)) {
            failures.push('Catálogo R2 inválido: arquivos ausentes ou malformados');
          } else {
            const entries = catalog.arquivos as unknown[];
            const listed = new Set<string>();
            for (const entry of entries) {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
                  !('backup_key' in entry) || typeof entry.backup_key !== 'string') {
                failures.push('Catálogo R2 com entrada inválida');
                continue;
              }
              if (listed.has(entry.backup_key)) failures.push('Catálogo R2 com chave duplicada');
              listed.add(entry.backup_key);
              if (!known.has(entry.backup_key) || !entry.backup_key.includes('/r2-files/')) {
                failures.push(`Arquivo R2 copiado fora do manifesto: ${entry.backup_key}`);
              }
            }
            for (const key of copiedKeys) {
              if (!listed.has(key)) failures.push(`Cópia R2 sem referência no catálogo: ${key}`);
            }
          }
        } catch {
          failures.push('Catálogo R2 contém JSON inválido');
        }
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    manifestKey,
    manifestSha256: drill.manifestSha256,
    drill,
    moduleKeys,
    moduleDigests,
  };
}

export interface RestoreTarget {
  /** Colunas da tabela no destino, ou null se ela não existe. */
  tableColumns(table: string): string[] | null;
  rowCount(table: string): number;
  insertRows(table: string, columns: string[], rows: unknown[][]): void;
  /** Executa fn atomicamente; se lançar, desfaz tudo. */
  transaction<T>(fn: () => T): T;
}

export interface RestoreOptions {
  /** Valor para colunas NOT NULL omitidas do backup por serem segredo (ex.: password_hash). */
  secretPlaceholder?: string;
  /** Restaura só linhas dessa empresa (tabelas sem empresa_id são puladas, exceto `empresas`). */
  onlyEmpresaId?: number;
}

export interface RestoredTableReport {
  table: string;
  modulo: string;
  backupRows: number;
  insertedRows: number;
  skippedByTenantFilter: number;
}

export interface RestoreReport {
  tables: RestoredTableReport[];
  skippedTablesWithoutTenantColumn: string[];
  placeholderedSecretColumns: Record<string, string[]>;
  totalInserted: number;
}

interface ModuleBackupFile {
  modulo: string;
  versao: string;
  tabelas_principais: Record<string, Array<Record<string, unknown>>>;
  tabelas_relacionadas: Record<string, Array<Record<string, unknown>>>;
  metadata?: { colunas_excluidas?: Record<string, string[]> };
}

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
export { quote as quoteSqlIdentifier };

export async function restoreVerifiedBackupIntoScratch(
  verification: BackupSetVerification,
  reader: BackupObjectReader,
  target: RestoreTarget,
  options: RestoreOptions = {},
): Promise<RestoreReport> {
  if (!verification.ok) {
    throw new Error(
      `RESTORE_REFUSED_UNVERIFIED_BACKUP: ${verification.failures.slice(0, 3).join('; ')}`,
    );
  }

  // prioridade crescente: PESSOAS primeiro (dependências antes de quem depende delas)
  const modulos = ordenarModulosPorPrioridade(Object.keys(verification.moduleKeys) as ModuloBackup[]);

  const files: ModuleBackupFile[] = [];
  for (const modulo of modulos) {
    const key = verification.moduleKeys[modulo];
    const raw = await reader.get(key);
    if (!raw) throw new Error(`RESTORE_MODULE_OBJECT_MISSING: ${modulo}`);
    const bytes = asBytes(raw);

    // Reautentica os bytes efetivamente utilizados contra o digest do manifesto verificado (P2)
    const expectedSha256 = verification.moduleDigests?.[modulo];
    if (!expectedSha256) {
      throw new Error(`RESTORE_UNAUTHENTICATED_MODULE: ${modulo}`);
    }
    const actualDigest = `sha256:${await sha256Hex(bytes)}`;
    if (actualDigest !== expectedSha256) {
      throw new Error(
        `RESTORE_MODULE_DIGEST_MISMATCH: ${modulo} (${key}) esperado=${expectedSha256}, atual=${actualDigest}`,
      );
    }

    files.push(JSON.parse(decoder.decode(bytes)) as ModuleBackupFile);
  }

  const report: RestoreReport = {
    tables: [],
    skippedTablesWithoutTenantColumn: [],
    placeholderedSecretColumns: {},
    totalInserted: 0,
  };

  // Valida tudo ANTES de escrever: destino vazio e sem deriva de schema.
  const plans: Array<{
    modulo: string;
    table: string;
    rows: Array<Record<string, unknown>>;
    targetColumns: string[];
    secretColumns: string[];
  }> = [];
  for (const file of files) {
    const all = { ...file.tabelas_principais, ...file.tabelas_relacionadas };
    for (const [table, rows] of Object.entries(all)) {
      if (!TABLE_NAME.test(table)) throw new Error(`RESTORE_INVALID_TABLE_NAME: ${table}`);
      const targetColumns = target.tableColumns(table);
      if (!targetColumns) throw new Error(`RESTORE_TARGET_TABLE_MISSING: ${table}`);
      if (target.rowCount(table) > 0) throw new Error(`RESTORE_TARGET_NOT_EMPTY: ${table}`);

      const backupColumns = new Set(rows.flatMap((row) => Object.keys(row)));
      const unknown = [...backupColumns].filter((column) => !targetColumns.includes(column));
      if (unknown.length > 0) {
        throw new Error(`RESTORE_SCHEMA_DRIFT: ${table} tem colunas fora do destino: ${unknown.join(', ')}`);
      }

      const secretColumns = (file.metadata?.colunas_excluidas?.[table] ?? []).filter((column) =>
        targetColumns.includes(column),
      );
      plans.push({ modulo: file.modulo, table, rows, targetColumns, secretColumns });
    }
  }

  target.transaction(() => {
    for (const plan of plans) {
      const hasTenantColumn = plan.targetColumns.includes('empresa_id');
      const filtering = options.onlyEmpresaId !== undefined;
      let selected = plan.rows;
      let skipped = 0;

      if (filtering) {
        if (plan.table === 'empresas') {
          selected = plan.rows.filter((row) => row.id === options.onlyEmpresaId);
        } else if (hasTenantColumn) {
          selected = plan.rows.filter((row) => row.empresa_id === options.onlyEmpresaId);
        } else {
          selected = [];
          report.skippedTablesWithoutTenantColumn.push(plan.table);
        }
        skipped = plan.rows.length - selected.length;
      }

      const dataColumns = plan.targetColumns.filter((column) =>
        plan.rows.some((row) => column in row),
      );
      const insertColumns = [...dataColumns];
      if (options.secretPlaceholder !== undefined && plan.secretColumns.length > 0) {
        for (const column of plan.secretColumns) {
          if (!insertColumns.includes(column)) insertColumns.push(column);
        }
        report.placeholderedSecretColumns[plan.table] = plan.secretColumns;
      }

      if (selected.length > 0 && insertColumns.length > 0) {
        target.insertRows(
          plan.table,
          insertColumns,
          selected.map((row) =>
            insertColumns.map((column) =>
              column in row ? row[column] : (options.secretPlaceholder ?? null),
            ),
          ),
        );
      }

      report.tables.push({
        table: plan.table,
        modulo: plan.modulo,
        backupRows: plan.rows.length,
        insertedRows: selected.length,
        skippedByTenantFilter: skipped,
      });
      report.totalInserted += selected.length;
    }
  });

  return report;
}
