import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import {
  runSigvoosImporterBatch,
  type SigvoosImporterRunnerPayloadInput,
  type SigvoosImporterRunnerReport,
} from './sigvoos-importer-runner';

export const STAGING_TARGET = 'staging';
export const STAGING_DB_NAME: string = 'airtrust-db-staging';
export const STAGING_DB_ID: string = 'b7f50907-c110-45f5-ad17-e97ea47f2826';
export const PRODUCTION_DB_NAME: string = 'airtrust-db';
export const PRODUCTION_DB_ID: string = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
export const SYNTHETIC_TENANT_A = 906;
export const SYNTHETIC_TENANT_B = 907;

const serviceDir = dirname(fileURLToPath(import.meta.url));
export const WORKER_ROOT = resolve(serviceDir, '../../..');
export const FIXTURE_ROOT = resolve(serviceDir, '../../__tests__/fixtures/sigvoos');

type RunnerMode = 'preview' | 'apply';

interface WranglerExecuteResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
  };
}

interface WranglerListEvidence {
  raw: string;
  stagingMatched: boolean;
  productionMatched: boolean;
}

export interface RemoteValidationCliOptions {
  mode: RunnerMode;
  target: string;
}

export interface ValidationScenarioPlan {
  label: string;
  fixture: string;
  empresaId: number;
}

export interface ValidationCounts {
  cvVoos: number;
  cvVooEtapas: number;
  cvSigvoosStaging: number;
  cvConflitosIntegracao: number;
  cvVooTripulantes: number;
  frmsJornada: number;
  frmsAlerta: number;
  trgCvCount: number;
  cvVoosSigvoosColumns: number;
  cvTripSigvoosColumns: number;
}

export interface SyntheticSupportCounts {
  cvAeroportos: number;
  cvTiposVoo: number;
  cvNaturezasVoo: number;
  cvMotivosOperacionais: number;
  funcionarios: number;
  cvVoos: number;
  cvVooEtapas: number;
  cvVooTripulantes: number;
  cvSigvoosStaging: number;
  cvConflitosIntegracao: number;
}

export interface ValidationBaseline {
  global: ValidationCounts;
  synthetic: SyntheticSupportCounts;
}

export interface StagingValidationPreview {
  mode: 'preview';
  target: string;
  targetEvidence: WranglerListEvidence;
  baseline: ValidationBaseline;
  plannedScenarios: ValidationScenarioPlan[];
}

export interface StagingValidationApplyReport {
  mode: 'apply';
  target: string;
  targetEvidence: WranglerListEvidence;
  baselineBefore: ValidationBaseline;
  baselineAfterSupportSeed: ValidationBaseline;
  baselineAfterValidation: ValidationBaseline;
  plannedScenarios: ValidationScenarioPlan[];
  firstRun: SigvoosImporterRunnerReport;
  secondRun: SigvoosImporterRunnerReport;
}

type StagingValidationResult = StagingValidationPreview | StagingValidationApplyReport;

function fail(message: string): never {
  throw new Error(message);
}

function sqlString(value: unknown): string {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolate(sql: string, args: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => sqlString(args[index++]));
}

function runWrangler(args: string[]): string {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: WORKER_ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'WRANGLER_COMMAND_FAILED').trim());
  }

  return result.stdout.trim();
}

function runWranglerJson<T = Record<string, unknown>>(args: string[]): WranglerExecuteResult<T> {
  const stdout = runWrangler(args);
  const payload = JSON.parse(stdout) as WranglerExecuteResult<T> | WranglerExecuteResult<T>[];
  return Array.isArray(payload) ? payload[0] : payload;
}

export function parseRemoteValidationCliArgs(argv: string[]): RemoteValidationCliOptions {
  let mode: RunnerMode = 'preview';
  let target: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--mode') {
      mode = (argv[index + 1] as RunnerMode | undefined) || fail('SIGVOOS_STAGING_VALIDATION_MODE_REQUIRED');
      index += 1;
      continue;
    }
    if (current === '--target') {
      target = argv[index + 1] || fail('SIGVOOS_STAGING_VALIDATION_TARGET_REQUIRED');
      index += 1;
      continue;
    }
  }

  if (mode !== 'preview' && mode !== 'apply') {
    fail('SIGVOOS_STAGING_VALIDATION_INVALID_MODE');
  }

  if (!target) {
    fail('SIGVOOS_STAGING_VALIDATION_TARGET_REQUIRED');
  }

  if (target === 'production') {
    fail('BLOQUEADO — REQUER FASE SENSÍVEL');
  }

  if (target !== STAGING_TARGET) {
    fail('SIGVOOS_STAGING_VALIDATION_TARGET_MUST_BE_STAGING');
  }

  return { mode, target };
}

export function resolveApprovedFixturePath(fileName: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(fileName)) {
    fail('BLOQUEADO — REQUER FASE SENSÍVEL');
  }

  const resolvedPath = resolve(FIXTURE_ROOT, fileName);
  if (resolvedPath !== FIXTURE_ROOT && !resolvedPath.startsWith(`${FIXTURE_ROOT}${sep}`)) {
    fail('SIGVOOS_STAGING_VALIDATION_FIXTURE_OUTSIDE_APPROVED_ROOT');
  }

  return resolvedPath;
}

export function buildValidationScenarioPlan(): ValidationScenarioPlan[] {
  return [
    { label: 'with-flight-report', fixture: 'sigvoos-com-flight-report-id.json', empresaId: SYNTHETIC_TENANT_A },
    { label: 'without-flight-report', fixture: 'sigvoos-sem-flight-report-id.json', empresaId: SYNTHETIC_TENANT_A },
    { label: 'multileg', fixture: 'sigvoos-multileg-flight-report-id.json', empresaId: SYNTHETIC_TENANT_A },
    { label: 'staff-conflict', fixture: 'sigvoos-staff-id-inscription-conflict.json', empresaId: SYNTHETIC_TENANT_A },
    { label: 'missing-canac', fixture: 'sigvoos-sem-canac.json', empresaId: SYNTHETIC_TENANT_A },
    {
      label: 'optional-sensitive',
      fixture: 'sigvoos-optional-missing-extra-sensitive.json',
      empresaId: SYNTHETIC_TENANT_A,
    },
    { label: 'tenant-b-isolation', fixture: 'sigvoos-com-flight-report-id.json', empresaId: SYNTHETIC_TENANT_B },
  ];
}

function readFixture(fileName: string): unknown {
  return JSON.parse(readFileSync(resolveApprovedFixturePath(fileName), 'utf8')) as unknown;
}

function buildRunnerInputs(): SigvoosImporterRunnerPayloadInput[] {
  return buildValidationScenarioPlan().map((scenario) => {
    if (scenario.label === 'tenant-b-isolation') {
      const payload = readFixture(scenario.fixture) as Record<string, unknown>;
      return {
        label: scenario.label,
        empresaId: scenario.empresaId,
        actorUserId: 20,
        payload: {
          ...payload,
          staff: {
            id: 9901,
            name: 'TRIPULANTE_SIG_B',
            inscription: '01234',
          },
        },
      };
    }

    return {
      label: scenario.label,
      empresaId: scenario.empresaId,
      actorUserId: 10,
      payload: readFixture(scenario.fixture),
    };
  });
}

class RemoteD1Statement {
  private binds: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly adapter: RemoteD1DatabaseAdapter,
  ) {}

  bind(...args: unknown[]) {
    this.binds = args;
    return this;
  }

  async first<T = unknown>() {
    const payload = this.adapter.executeInterpolated<T>(this.sql, this.binds);
    return payload.results[0] || null;
  }

  async all<T = unknown>() {
    const payload = this.adapter.executeInterpolated<T>(this.sql, this.binds);
    return { results: payload.results || [] };
  }

  async run() {
    const payload = this.adapter.executeInterpolated(this.sql, this.binds);
    return {
      meta: {
        changes: Number(payload.meta?.changes || 0),
        last_row_id: Number(payload.meta?.last_row_id || 0),
      },
    };
  }
}

class RemoteD1DatabaseAdapter {
  prepare(sql: string) {
    return new RemoteD1Statement(sql, this);
  }

  queryScalar(sql: string): number {
    const payload = this.executeInterpolated<{ total: number }>(sql, []);
    return Number(payload.results[0]?.total || 0);
  }

  executeInterpolated<T = Record<string, unknown>>(sql: string, binds: unknown[]) {
    const statement = interpolate(sql, binds);
    return runWranglerJson<T>([
      'd1',
      'execute',
      STAGING_DB_NAME,
      '--env',
      STAGING_TARGET,
      '--remote',
      '--json',
      '--command',
      statement,
    ]);
  }
}

function confirmStagingTarget(): WranglerListEvidence {
  const raw = runWrangler(['d1', 'list']);
  const stagingMatched = raw.includes(STAGING_DB_NAME) && raw.includes(STAGING_DB_ID);
  const productionMatched = raw.includes(PRODUCTION_DB_NAME) && raw.includes(PRODUCTION_DB_ID);

  if (!stagingMatched || !productionMatched || STAGING_DB_ID === PRODUCTION_DB_ID) {
    fail('BLOQUEADO — REQUER FASE SENSÍVEL');
  }

  return {
    raw,
    stagingMatched,
    productionMatched,
  };
}

function collectBaseline(db: RemoteD1DatabaseAdapter): ValidationBaseline {
  return {
    global: {
      cvVoos: db.queryScalar("SELECT COUNT(*) AS total FROM cv_voos WHERE deleted_at IS NULL;"),
      cvVooEtapas: db.queryScalar("SELECT COUNT(*) AS total FROM cv_voo_etapas WHERE deleted_at IS NULL;"),
      cvSigvoosStaging: db.queryScalar("SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE deleted_at IS NULL;"),
      cvConflitosIntegracao: db.queryScalar(
        "SELECT COUNT(*) AS total FROM cv_conflitos_integracao WHERE deleted_at IS NULL;",
      ),
      cvVooTripulantes: db.queryScalar(
        "SELECT COUNT(*) AS total FROM cv_voo_tripulantes WHERE deleted_at IS NULL;",
      ),
      frmsJornada: db.queryScalar('SELECT COUNT(*) AS total FROM frms_jornada;'),
      frmsAlerta: db.queryScalar('SELECT COUNT(*) AS total FROM frms_alerta;'),
      trgCvCount: db.queryScalar(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_cv_%';",
      ),
      cvVoosSigvoosColumns: db.queryScalar(
        "SELECT COUNT(*) AS total FROM pragma_table_info('cv_voos') WHERE name IN ('sigvoos_flight_report_id','sigvoos_flight_report_id_confident','sigvoos_report_number','sigvoos_flight_number','sigvoos_client_name','sigvoos_contract_name','sigvoos_importado_em','sigvoos_content_hash','origem_importacao','campos_editados_json');",
      ),
      cvTripSigvoosColumns: db.queryScalar(
        "SELECT COUNT(*) AS total FROM pragma_table_info('cv_voo_tripulantes') WHERE name IN ('etapa_id','sigvoos_staff_id','sigvoos_staff_inscription','funcao_origem','resolucao_funcionario_fonte','sigvoos_content_hash');",
      ),
    },
    synthetic: {
      cvAeroportos: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_aeroportos WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvTiposVoo: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_tipos_voo WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvNaturezasVoo: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_naturezas_voo WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvMotivosOperacionais: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_motivos_operacionais WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      funcionarios: db.queryScalar(
        `SELECT COUNT(*) AS total FROM funcionarios WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvVoos: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_voos WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvVooEtapas: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_voo_etapas WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvVooTripulantes: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_voo_tripulantes WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvSigvoosStaging: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
      cvConflitosIntegracao: db.queryScalar(
        `SELECT COUNT(*) AS total FROM cv_conflitos_integracao WHERE empresa_id IN (${SYNTHETIC_TENANT_A}, ${SYNTHETIC_TENANT_B}) AND deleted_at IS NULL;`,
      ),
    },
  };
}

async function seedSyntheticSupportData(db: D1Database): Promise<void> {
  const tenantCatalogConfigs = [
    {
      empresaId: SYNTHETIC_TENANT_A,
      aeroportos: [
        { id: 906101, codigo: 'SBRJ', nome: 'Santos Dumont 906', ordem: 1 },
        { id: 906102, codigo: 'SBSP', nome: 'Congonhas 906', ordem: 2 },
        { id: 906103, codigo: 'SBMI', nome: 'Macae 906', ordem: 3 },
        { id: 906104, codigo: 'SBJR', nome: 'Jacarepagua 906', ordem: 4 },
      ],
      tipoId: 906201,
      naturezaId: 906301,
      motivoId: 906401,
      funcionarios: [
        { id: 906001, nome: 'Tripulante Um 906', matricula: '01234', codigoAnac: '99001' },
        { id: 906002, nome: 'Tripulante Dois 906', matricula: '04567', codigoAnac: '99002' },
        { id: 906003, nome: 'Tripulante Tres 906', matricula: '00252', codigoAnac: '99003' },
        { id: 906004, nome: 'Tripulante Quatro 906', matricula: '07890', codigoAnac: '99004' },
      ],
    },
    {
      empresaId: SYNTHETIC_TENANT_B,
      aeroportos: [
        { id: 907101, codigo: 'SBRJ', nome: 'Santos Dumont 907', ordem: 1 },
        { id: 907102, codigo: 'SBSP', nome: 'Congonhas 907', ordem: 2 },
        { id: 907103, codigo: 'SBMI', nome: 'Macae 907', ordem: 3 },
        { id: 907104, codigo: 'SBJR', nome: 'Jacarepagua 907', ordem: 4 },
      ],
      tipoId: 907201,
      naturezaId: 907301,
      motivoId: 907401,
      funcionarios: [{ id: 907001, nome: 'Tripulante Tenant B 907', matricula: '01234', codigoAnac: '99901' }],
    },
  ];

  for (const config of tenantCatalogConfigs) {
    for (const aeroporto of config.aeroportos) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO cv_aeroportos (
             id, empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem
           ) VALUES (?, ?, ?, ?, ?, 'aeroporto', 1, ?)`,
        )
        .bind(aeroporto.id, config.empresaId, aeroporto.codigo, aeroporto.codigo, aeroporto.nome, aeroporto.ordem)
        .run();
    }

    await db
      .prepare(
        `INSERT OR IGNORE INTO cv_tipos_voo (id, empresa_id, codigo, nome, ativo, ordem)
         VALUES (?, ?, 'REG', ?, 1, 1)`,
      )
      .bind(config.tipoId, config.empresaId, `Regular ${config.empresaId}`)
      .run();

    await db
      .prepare(
        `INSERT OR IGNORE INTO cv_naturezas_voo (id, empresa_id, codigo, nome, ativo, ordem)
         VALUES (?, ?, 'PAX', ?, 1, 1)`,
      )
      .bind(config.naturezaId, config.empresaId, `Passageiro ${config.empresaId}`)
      .run();

    await db
      .prepare(
        `INSERT OR IGNORE INTO cv_motivos_operacionais (id, empresa_id, codigo, nome, tipo, ativo, ordem)
         VALUES (?, ?, 'WX', ?, 'atraso', 1, 1)`,
      )
      .bind(config.motivoId, config.empresaId, `Meteorologia ${config.empresaId}`)
      .run();

    for (const funcionario of config.funcionarios) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO funcionarios (
             id, nome, matricula, codigo_anac, empresa_id, deleted_at, ativo, status
           ) VALUES (?, ?, ?, ?, ?, NULL, 1, 'ATIVO')`,
        )
        .bind(
          funcionario.id,
          funcionario.nome,
          funcionario.matricula,
          funcionario.codigoAnac,
          config.empresaId,
        )
        .run();
    }
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO cv_voos (
         id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
         tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada,
         status, origem_importacao, created_by, updated_by
       ) VALUES (
         906600, ?, 'ATX-MAP', '2026-06-13', 906101, 906102,
         906201, 906301, '2026-06-13T08:00:00', '2026-06-13T09:00:00',
         'planejado', 'SIGVOOS', 10, 10
       )`,
    )
    .bind(SYNTHETIC_TENANT_A)
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO cv_voo_etapas (
         id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
       ) VALUES (
         906610, ?, 906600, 1, 1, 'SBRJ', 'SBSP', 'SIGVOOS'
       )`,
    )
    .bind(SYNTHETIC_TENANT_A)
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO cv_voo_tripulantes (
         id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, created_by, updated_by
       ) VALUES (
         906620, ?, 906600, 906002, 'PIC', 906610, 8899, 10, 10
       )`,
    )
    .bind(SYNTHETIC_TENANT_A)
    .run();
}

export async function runSigvoosStagingRemoteValidation(
  options: RemoteValidationCliOptions,
): Promise<StagingValidationResult> {
  const targetEvidence = confirmStagingTarget();
  const db = new RemoteD1DatabaseAdapter();
  const plannedScenarios = buildValidationScenarioPlan();
  const baseline = collectBaseline(db);

  if (options.mode === 'preview') {
    return {
      mode: 'preview',
      target: options.target,
      targetEvidence,
      baseline,
      plannedScenarios,
    };
  }

  await seedSyntheticSupportData(db as unknown as D1Database);
  const baselineAfterSupportSeed = collectBaseline(db);
  const runnerInputs = buildRunnerInputs();
  const firstRun = await runSigvoosImporterBatch(db as unknown as D1Database, SYNTHETIC_TENANT_A, runnerInputs, {
    actorUserId: 10,
    continueOnError: true,
  });
  const secondRun = await runSigvoosImporterBatch(db as unknown as D1Database, SYNTHETIC_TENANT_A, runnerInputs, {
    actorUserId: 10,
    continueOnError: true,
  });
  const baselineAfterValidation = collectBaseline(db);

  return {
    mode: 'apply',
    target: options.target,
    targetEvidence,
    baselineBefore: baseline,
    baselineAfterSupportSeed,
    baselineAfterValidation,
    plannedScenarios,
    firstRun,
    secondRun,
  };
}
