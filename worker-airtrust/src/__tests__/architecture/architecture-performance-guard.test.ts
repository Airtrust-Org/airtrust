import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

const LARGE_FILE_LINE_CAPS = {
  // Cap raised 2026-07-08: counted 3913 (pre-existing drift to 3887 unrelated to
  // this change, plus explicit empresaId guards added to close BUG-011 Stage 3
  // domain-event masking — see fix/bug011-stage3-safe-typeguards-20260708).
  // Cap raised 2026-08-22: counted 3957 (fix/frms-parameter-governance-recalc
  // — wired jornada create/update, batch APUS import, explicação-do-dia,
  // comparar-dias, and escala-futura validation to governed operational
  // context, replacing legacy carregarLimites fallbacks).
  'routes/frms.ts': 3957,
  // Cap raised 2026-08-23: counted 2912 (test/frms-synthetic-sigvoos-sync —
  // added SigvoosSyncClient/SigvoosSyncDeps interfaces and the minimal
  // dependency-injection point in syncSigvoosForFrms so a staging-only QA
  // runner can inject a synthetic client at the exact external-client
  // boundary; production behavior is unchanged when deps is omitted).
  // Cap raised 2026-08-29: counted 2937 (fix/sigvoos-cv-operational-load-bridge
  // — after the FRMS import, the same fetched raw SIGVOOS payload is handed to
  // the governed Controle de Voos importer so cv_voos/cv_voo_etapas/
  // cv_voo_tripulantes — the leg-level source of Operational Load V1 — are
  // populated in one canonical read. Heavy logic lives in
  // lib/frms/controle-voos-frms-import-bridge.ts; the call site here is thin).
  'services/sigvoos-frms.ts': 2937,
  // Upload/storage logic was extracted into testable modules. The compatibility
  // router retains the prior CRUD implementation and is frozen at the old cap.
  'routes/lms-cursos-legacy.ts': 3000,
  // Cap raised 2026-06-29: counted 2277 (pre-existing growth).
  'routes/escalas-alocacoes.ts': 2277,
  // Acknowledged growth (audit remediation A1): EVD now integrates training commitments.
  'routes/escalas-evd.ts': 2162,
  // Cap raised 2026-08-03: counted 3826 after explicit partial-source diagnostics,
  // tenant-timezone guards, atomic PATCH writes and propagated scale-sync failures.
  'routes/treinamentos-planejados.ts': 3826,
  // Cap raised 2026-07-30: counted 3507 (hotfix/lms-compliance-final — all four
  // completion call sites (scorm/commit, xapi/statements, POST /:id/finalizar,
  // PATCH /:id/status) now delegate the entire completion write (Histórico,
  // vínculo, ciclo, matrícula, auditoria) to the canonical, atomic
  // completeLmsMatricula service (db.batch()) instead of ad-hoc
  // try/catch-and-continue; qualification-creation failures reject the whole
  // batch and surface as explicit LMS_QUALIFICATION_COMPLETION_FAILED (409),
  // including on scorm/commit and xapi/statements, which previously returned
  // 200 with qualification_failed:true; progresso_efetivo/completion_state
  // wired into /minhas, /minhas-ead, /:id, /curso/:id and PATCH /:id/status;
  // qualification_link_state and certificate_state exposed for the
  // CardMeusEAD Rever/certificate UI).
  // Cap raised 2026-08-18: counted 3564 (fix/lms-tenant-relations-fail-closed
  // — added empresa_id predicates to lms_cursos/qualificacoes_tipos/
  // funcionarios/qualificacoes_historico joins across ~10 sites so a
  // corrupted cross-tenant curso_id/funcionario_id/qualificacao_id can no
  // longer leak another tenant's data or feed a completion write).
  'routes/lms-matriculas.ts': 3565,
  // Acknowledged growth (pre-existing, logged 2026-06-29): fadiga check-in rules engine.
  // Cap raised 2026-08-22: counted 2048 (fix/frms-parameter-governance-recalc
  // — governed operational context wired into the check-in contexto-piloto
  // block, replacing the legacy carregarLimites fallback).
  'routes/frms-fadiga-checkin-legacy.ts': 2048,
  // Cap raised 2026-07-31: counted 2548 after scoped short-lived asset sessions,
  // request-aware cookie policy and CSP hardening in PR #565. Extraction remains
  // a follow-up and is not mixed into this security hotfix.
  // Cap raised 2026-08-11: counted 2562 after fixing GET course-assets/:cursoId/thumbnail
  // — added the missing empresa_id tenant filter (cross-tenant thumbnail leak) and
  // switched Access-Control-Allow-Origin from a hardcoded '*' to the shared
  // buildAssetHeaders() resolver (credentials-incompatible wildcard blocked thumbnails
  // in every tenant's browser). Same incident as the SCORM upload 500 hotfix.
  // Cap raised 2026-08-13: counted 2563 — protectSuspendDataValue() now allows
  // cmi.suspend_data to shrink when the current value is already near the
  // SCORM 1.2 ~4096-byte ceiling, treating it as intentional finalization
  // rather than the accidental mid-session reset the guard defends against
  // (see docs/AIRTRUST_LMS_SCORM_AW139_RECURRING_PROGRESS_RESET_20260623.md).
  // Cap raised 2026-08-13 (same day, live incident): counted 2568 — the
  // commit() fetch stopped setting keepalive:true unconditionally. Browsers
  // cap total in-flight keepalive body size per page; setting it on every
  // routine commit exhausted that shared quota during long sessions,
  // permanently breaking all further saves with "Failed to fetch" (observed
  // live on curso PT6C-67C, matricula 390).
  // Cap raised 2026-08-22: counted 2677 — SCORM Package Quality Gate V1 added
  // candidate-version listing, activation and Browser Run conformance routes.
  // (Independently also the value fix/frms-parameter-governance-recalc found
  // as pre-existing drift on this file, which that branch never touches —
  // both branches agree on 2677, this is the same number for two reasons.)
  'routes/lms-assets.ts': 2730,
  // Cap raised 2026-07-26: counted 2046 — aeronave inativa (status IN ('I',
  // 'INATIVO', 'INDISPONIVEL')) agora rejeitada em assertAeronaveBelongsToEmpresa,
  // mesma definicao de "ativa" ja usada por GET /api/aeronaves?somente_ativas=1.
  // Cap raised again 2026-07-26: counted 2095 — RDV draft CAS implementado.
  'routes/controle-voos.ts': 2095,
  // Reliability remediation added atomic ficha writes and fail-closed PDF generation.
  // Extraction remains a follow-up and is not mixed into this incident closure.
  'routes/simuladores-fichas.ts': 2500,
  // Shared-session compensation and notification reliability crossed the explicit baseline.
  // Extraction remains a follow-up and is not mixed into this incident closure.
  'routes/simuladores-sessoes.ts': 2500,
  // Cap raised 2026-08-24: counted 2186 (feat/cae-planning-proposal-pdf
  // — CAE Planning V3 resource-assignment endpoints (Fase E/I), the
  // per-participant curriculum resolver wiring in /recalcular (Fase F), and
  // the GET /:id/pdf proposal report endpoint (Fase G). Extraction remains
  // a follow-up.
  'routes/simuladores-planejamento.ts': 2186,
} as const;

const SQL_PREPARE_CAPS = {
  // Cap raised 2026-07-21: current-version table detection keeps pre-0440 schemas compatible.
  'routes/simuladores-modelos.ts': 71,
  // Cap raised 2026-07-19: counted 64 (fail-closed sector check on manager invite/accept).
  'routes/auth.ts': 64,
  // Cap raised 2026-07-09: counted 55 (pre-existing growth of schema guards).
  'routes/simuladores-sessoes-update.ts': 55,
  // The extracted compatibility router retains the historical prepare count.
  'routes/lms-cursos-legacy.ts': 55,
  // Acknowledged (stabilization 2026-06-06): unified planned training contract.
  // +10 prepare calls for schema introspection guards (migration-0390 compatibility).
  'routes/treinamentos-planejados.ts': 56,
  // Cap raised 2026-07-30 (hotfix/lms-compliance-final): +1 .prepare() for the
  // resolveLmsEffectiveProgress-enriched /minhas-ead and /curso/:id mapping
  // plus the observações UPDATE split out of the canonical completion path.
  'routes/lms-matriculas.ts': 48,
  // New offender 2026-08-18 (fix/qualification-writer-convergence, TRAIN-002):
  // +1 .prepare() for the renovacao_de chain-link UPDATE, split out from the
  // status-transition UPDATE so both the fresh-realization and the
  // idempotent-retry-repair paths can atomically batch it.
  'services/treinamentos-planejados-integration.ts': 43,
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
  'routes/frms-fadiga-checkin-legacy.ts': 3,
  // Two schema-compatible reads support import and mutation reliability guards.
  'routes/funcionarios-mutations.ts': 6,
  'routes/lms-matriculas.ts': 5,
  // Acknowledged growth: schema-guarded legacy simulator equipment compatibility.
  'routes/simuladores-equipamentos.ts': 11,
  'routes/simuladores-fichas-acoes.ts': 3,
  'routes/simuladores-fichas-edicoes.ts': 3,
  'routes/simuladores-fichas-simulador.ts': 6,
  // Two additional schema-compatible reads support atomic evaluation and PDF guards.
  'routes/simuladores-fichas.ts': 6,
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

    expect(criticalScope.map(({ file }) => file)).toEqual(
      Object.keys(CRITICAL_SELECT_STAR_CAPS).sort(),
    );

    for (const { file, selectStarCount } of criticalScope) {
      expect(selectStarCount).toBeLessThanOrEqual(
        CRITICAL_SELECT_STAR_CAPS[file as keyof typeof CRITICAL_SELECT_STAR_CAPS],
      );
    }
  });
});