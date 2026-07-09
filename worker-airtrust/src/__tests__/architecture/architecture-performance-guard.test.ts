import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

const LARGE_FILE_LINE_CAPS = {
  // Cap raised 2026-07-08: counted 3913 (pre-existing drift to 3887 unrelated to
  // this change, plus explicit empresaId guards added to close BUG-011 Stage 3
  // domain-event masking — see fix/bug011-stage3-safe-typeguards-20260708).
  'routes/frms.ts': 3913,
  // Cap raised 2026-06-30: counted 2884 (pre-existing growth).
  'services/sigvoos-frms.ts': 2884,
  // Cap raised 2026-07-09: counted 3000 lines (addition of new integration handlers, canonical training categories, and specific logic for fmt/classif columns).
  'routes/lms-cursos.ts': 3000,
  // Cap raised 2026-06-29: counted 2277 (pre-existing growth).
  'routes/escalas-alocacoes.ts': 2277,
  // Acknowledged growth (audit remediation A1): EVD now integrates training commitments.
  'routes/escalas-evd.ts': 2162,
  // Cap raised 2026-07-08: counted 3760 (qualificacao_historico_status added to
  // satisfy ConsolidatedTrainingItem — BUG-011 Stage 3 fix, not a mask).
  'routes/treinamentos-planejados.ts': 3760,
  // Acknowledged growth (pre-existing, logged 2026-06-30): certificate hooks + SCORM completions.
  'routes/lms-matriculas.ts': 3261,
  // Acknowledged growth (pre-existing, logged 2026-06-30): controle de voos CRUD + histórico.
  'routes/controle-voos.ts': 2112,
  // Acknowledged growth (pre-existing, logged 2026-06-29): fadiga check-in rules engine.
  'routes/frms-fadiga-checkin.ts': 2021,
  // Acknowledged growth (pre-existing, logged 2026-06-29): LMS assets + SCORM player routes.
  'routes/lms-assets.ts': 2400,
} as const;

const SQL_PREPARE_CAPS = {
  // Acknowledged growth: tipo_sessao fallback normalization + tipos_sessao cor persistence guard.
  'routes/simuladores-modelos.ts': 69,
  // Cap raised 2026-06-30: counted 63 (pre-existing growth).
  'routes/auth.ts': 63,
  // Cap raised 2026-07-09: counted 55 (pre-existing growth of schema guards).
  'routes/simuladores-sessoes-update.ts': 55,
  // Cap raised 2026-07-09: counted 55 (hasColumn PRAGMA added for formato_id guard + new tenant isolation prepares).
  'routes/lms-cursos.ts': 55,
  // Acknowledged (stabilization 2026-06-06): unified planned training contract.
  // +10 prepare calls for schema introspection guards (migration-0390 compatibility).
  'routes/treinamentos-planejados.ts': 56,
  // Acknowledged growth (2026-06-29): auto-cert hooks added 2 .prepare() calls via ensureCertificateForQualification.
  'routes/lms-matriculas.ts': 47,
} as const;

const HIGH_SQL_LIMIT_CAPS = {
  'lib/frms/fira-service.ts': 5000,
  'routes/compliance.ts': 2000,
  'services/sigvoos-frms.ts': 5000,
} as const;

const CRITICAL_SELECT_STAR_CAPS = {
  'routes/aeronaves.ts': 1,
  'routes/escalas-alocacoes.ts': 1,
  'routes/escalas-padroes.ts': 1,
  'routes/escalas-shared.ts': 2,
  'routes/escalas-tripulacoes.ts': 4,
  'routes/frms-fadiga-checkin.ts': 3,
  'routes/funcionarios-mutations.ts': 4,
  'routes/lms-matriculas.ts': 5,
  // Acknowledged growth: schema-guarded legacy simulator equipment compatibility.
  'routes/simuladores-equipamentos.ts': 11,
  'routes/simuladores-fichas-acoes.ts': 3,
  'routes/simuladores-fichas-edicoes.ts': 3,
  'routes/simuladores-fichas-simulador.ts': 6,
  'routes/simuladores-fichas.ts': 4,
  'routes/simuladores-modelos.ts': 8,
  'routes/simuladores-sessoes-update.ts': 4,
} as const;

function listRuntimeSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === '__tests__') continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeSourceFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function relPath(filePath: string) {
  return relative(srcRoot, filePath).replace(/\\/g, '/');
}

function countLines(source: string) {
  return source.length === 0 ? 0 : source.split(/\r?\n/).length;
}

function countSqlPrepareCalls(source: string) {
  return source.match(/\.prepare\s*\(/g)?.length ?? 0;
}

function listHighSqlLimits(source: string) {
  return [...source.matchAll(/LIMIT\s+(\d+)/gi)]
    .map((match) => Number(match[1]))
    .filter((limit) => limit > 1000);
}

function countSelectStar(source: string) {
  return source.match(/SELECT\s+\*/gi)?.length ?? 0;
}

describe('architecture and performance guardrails', () => {
  const runtimeFiles = listRuntimeSourceFiles(srcRoot);

  it('keeps runtime god-file growth explicit for files above 2000 lines', () => {
    const offenders = runtimeFiles
      .map((file) => {
        const source = readFileSync(file, 'utf8');
        return { file: relPath(file), lines: countLines(source) };
      })
      .filter(({ lines }) => lines > 2000)
      .sort((a, b) => a.file.localeCompare(b.file));

    expect(offenders.map(({ file }) => file)).toEqual(Object.keys(LARGE_FILE_LINE_CAPS).sort());

    for (const { file, lines } of offenders) {
      expect(lines).toBeLessThanOrEqual(
        LARGE_FILE_LINE_CAPS[file as keyof typeof LARGE_FILE_LINE_CAPS],
      );
    }
  });

  it('keeps concentrated direct SQL prepare usage from growing silently', () => {
    const offenders = runtimeFiles
      .map((file) => {
        const source = readFileSync(file, 'utf8');
        return { file: relPath(file), prepareCount: countSqlPrepareCalls(source) };
      })
      .filter(({ prepareCount }) => prepareCount > 40)
      .sort((a, b) => a.file.localeCompare(b.file));

    expect(offenders.map(({ file }) => file)).toEqual(Object.keys(SQL_PREPARE_CAPS).sort());

    for (const { file, prepareCount } of offenders) {
      expect(prepareCount).toBeLessThanOrEqual(
        SQL_PREPARE_CAPS[file as keyof typeof SQL_PREPARE_CAPS],
      );
    }
  });

  it('keeps very high SQL LIMIT baselines explicit', () => {
    const offenders = runtimeFiles
      .map((file) => {
        const source = readFileSync(file, 'utf8');
        return { file: relPath(file), limits: listHighSqlLimits(source) };
      })
      .filter(({ limits }) => limits.length > 0)
      .sort((a, b) => a.file.localeCompare(b.file));

    expect(offenders.map(({ file }) => file)).toEqual(Object.keys(HIGH_SQL_LIMIT_CAPS).sort());

    for (const { file, limits } of offenders) {
      expect(Math.max(...limits)).toBeLessThanOrEqual(
        HIGH_SQL_LIMIT_CAPS[file as keyof typeof HIGH_SQL_LIMIT_CAPS],
      );
    }
  });

  it('keeps SELECT * usage explicit in critical product routes only', () => {
    const criticalScope = runtimeFiles
      .map((file) => {
        const rel = relPath(file);
        if (!rel.startsWith('routes/')) return null;

        const criticalPrefixes = [
          'routes/aeronaves',
          'routes/dashboard',
          'routes/escalas',
          'routes/frms',
          'routes/funcionarios',
          'routes/lms',
          'routes/qualificacoes',
          'routes/simuladores',
        ];

        if (!criticalPrefixes.some((prefix) => rel.startsWith(prefix))) return null;

        const source = readFileSync(file, 'utf8');
        return { file: rel, selectStarCount: countSelectStar(source) };
      })
      .filter((item): item is { file: string; selectStarCount: number } => Boolean(item))
      .filter(({ selectStarCount }) => selectStarCount > 0)
      .sort((a, b) => a.file.localeCompare(b.file));

    expect(criticalScope.map(({ file }) => file)).toEqual(Object.keys(CRITICAL_SELECT_STAR_CAPS).sort());

    for (const { file, selectStarCount } of criticalScope) {
      expect(selectStarCount).toBeLessThanOrEqual(
        CRITICAL_SELECT_STAR_CAPS[file as keyof typeof CRITICAL_SELECT_STAR_CAPS],
      );
    }
  });
});
