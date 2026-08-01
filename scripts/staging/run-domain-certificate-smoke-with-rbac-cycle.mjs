#!/usr/bin/env node

/**
 * Staging-only wrapper that prepares the synthetic QA tenant, temporarily
 * activates operational-domain RBAC, runs the certificate smoke, and restores
 * the original RBAC state in finally.
 *
 * Missing domain assignments for the known synthetic QA sectors are a seed
 * readiness defect, not temporary test data. They are classified once through
 * the audited admin API and intentionally retained. The qualification-type
 * override exercised by the delegated smoke remains temporary and is rolled
 * back there.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  assert,
  assertAllowedStagingBaseUrl,
  extractAccessToken,
  extractRefreshToken,
  fetchJson,
  login,
  logout,
  maskEmail,
} from '../smoke-auth-common.mjs';
import { planQaSectorClassifications } from './qa-sector-domain-plan.mjs';
import { runSmoke } from './smoke-operational-domain-certificate.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const REPORT_PATH = process.env.SMOKE_REPORT_PATH || 'staging-domain-certificate-smoke-report.json';

async function authJson(baseUrl, token, path, options = {}) {
  return fetchJson(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

function readinessSummary(data) {
  return {
    ready: data?.ready === true,
    setores_sem_dominio: Number(data?.setores_sem_dominio || 0),
    categorias_sem_dominio: Number(data?.categorias_sem_dominio || 0),
    gestores_sem_setor: Number(data?.gestores_sem_setor || 0),
    cursos_sem_classificacao: Number(data?.cursos_sem_classificacao || 0),
    dominios_desconhecidos_em_uso: Number(data?.dominios_desconhecidos_em_uso || 0),
    dominios_inativos_em_uso: Number(data?.dominios_inativos_em_uso || 0),
    bloqueios: Array.isArray(data?.bloqueios) ? data.bloqueios.map(String) : [],
  };
}

function readExistingReport() {
  if (!existsSync(REPORT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeAugmentedReport(report, rbacActivation, qaSectorBootstrap, error) {
  writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        ...report,
        rbacActivation,
        qaSectorBootstrap,
        ...(error
          ? { error: error instanceof Error ? error.message : String(error), success: false }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
}

async function getReadiness(baseUrl, token) {
  const response = await authJson(baseUrl, token, '/api/admin/operational-domain-rbac/readiness');
  assert(
    response.status === 200 && response.json?.success === true,
    `readiness retornou ${response.status}`,
  );
  return readinessSummary(response.json.data);
}

async function classifySector(baseUrl, token, sector) {
  const response = await authJson(baseUrl, token, '/api/admin/operational-domain-rbac/classify', {
    method: 'POST',
    body: JSON.stringify({
      resource_type: 'setor',
      resource_id: sector.id,
      dominio_codigo: sector.domain,
    }),
  });
  assert(
    response.status === 200 && response.json?.success === true,
    `classificação do setor QA ${sector.id} retornou ${response.status}`,
  );
}

async function ensureQaSectorReadiness(baseUrl, token, initialReadiness) {
  const bootstrap = {
    attempted: false,
    retained: true,
    readinessBefore: initialReadiness,
    classifications: [],
    readinessAfter: initialReadiness,
  };

  if (initialReadiness.ready) return bootstrap;

  assert(
    initialReadiness.setores_sem_dominio > 0 &&
      initialReadiness.categorias_sem_dominio === 0 &&
      initialReadiness.gestores_sem_setor === 0 &&
      initialReadiness.cursos_sem_classificacao === 0 &&
      initialReadiness.dominios_desconhecidos_em_uso === 0 &&
      initialReadiness.dominios_inativos_em_uso === 0,
    `tenant QA possui bloqueios além dos setores sintéticos esperados: ${initialReadiness.bloqueios.join('; ') || 'sem detalhe'}`,
  );

  const unclassifiedResponse = await authJson(
    baseUrl,
    token,
    '/api/admin/operational-domain-rbac/unclassified',
  );
  assert(
    unclassifiedResponse.status === 200 && unclassifiedResponse.json?.success === true,
    `unclassified retornou ${unclassifiedResponse.status}`,
  );

  const data = unclassifiedResponse.json.data || {};
  const categorias = Array.isArray(data.categorias) ? data.categorias : [];
  const cursos = Array.isArray(data.cursos) ? data.cursos : [];
  assert(categorias.length === 0, 'bootstrap QA recusado: existem categorias sem domínio');
  assert(cursos.length === 0, 'bootstrap QA recusado: existem cursos sem domínio');

  const sectors = planQaSectorClassifications(Array.isArray(data.setores) ? data.setores : []);
  assert(
    sectors.length === initialReadiness.setores_sem_dominio,
    `contagem de setores divergente: readiness=${initialReadiness.setores_sem_dominio}, unclassified=${sectors.length}`,
  );
  assert(
    sectors.length > 0,
    'readiness indicou setores pendentes, mas unclassified não retornou nenhum',
  );

  bootstrap.attempted = true;
  for (const sector of sectors) {
    await classifySector(baseUrl, token, sector);
    bootstrap.classifications.push(sector);
  }

  bootstrap.readinessAfter = await getReadiness(baseUrl, token);
  assert(
    bootstrap.readinessAfter.ready,
    `tenant QA continuou bloqueado após classificar setores sintéticos: ${bootstrap.readinessAfter.bloqueios.join('; ') || 'sem detalhe'}`,
  );
  return bootstrap;
}

async function setRbacState(baseUrl, token, enabled) {
  const response = await authJson(
    baseUrl,
    token,
    `/api/admin/operational-domain-rbac/${enabled ? 'activate' : 'deactivate'}`,
    { method: 'POST', body: '{}' },
  );
  assert(
    response.status === 200 && response.json?.success === true,
    `${enabled ? 'activate' : 'deactivate'} retornou ${response.status}`,
  );
}

async function getAccess(baseUrl, token) {
  const response = await authJson(baseUrl, token, '/api/me/operational-access');
  assert(response.status === 200 && response.json?.success === true, 'operational-access inválido');
  return response.json.data || {};
}

export async function runWithRbacCycle() {
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);
  const email = String(process.env.QA_EXAMINER_ADMIN_EMAIL || '').trim();
  const password = String(process.env.QA_EXAMINER_ADMIN_PASSWORD || '');
  assert(email && password, 'credenciais QA_EXAMINER_ADMIN_* são obrigatórias');

  const cycle = {
    actor: maskEmail(email),
    initialEnabled: null,
    activationAttempted: false,
    activatedTemporarily: false,
    readiness: null,
    restored: false,
    finalEnabled: null,
  };
  let qaSectorBootstrap = {
    attempted: false,
    retained: true,
    readinessBefore: null,
    classifications: [],
    readinessAfter: null,
  };

  let token = null;
  let refreshToken = null;
  let primaryError = null;

  try {
    const loginPayload = await login(baseUrl, email, password);
    token = extractAccessToken(loginPayload);
    refreshToken = extractRefreshToken(loginPayload);

    const initialAccess = await getAccess(baseUrl, token);
    cycle.initialEnabled = initialAccess.enabled === true;

    if (!cycle.initialEnabled) {
      cycle.readiness = await getReadiness(baseUrl, token);
      qaSectorBootstrap = await ensureQaSectorReadiness(baseUrl, token, cycle.readiness);
      cycle.readiness = qaSectorBootstrap.readinessAfter;

      cycle.activationAttempted = true;
      await setRbacState(baseUrl, token, true);
      cycle.activatedTemporarily = true;
      const activatedAccess = await getAccess(baseUrl, token);
      assert(activatedAccess.enabled === true, 'RBAC permaneceu desativado após activate');
    }

    await runSmoke();
  } catch (error) {
    primaryError = error;
  } finally {
    if (token && cycle.activatedTemporarily) {
      try {
        await setRbacState(baseUrl, token, false);
        const restoredAccess = await getAccess(baseUrl, token);
        cycle.finalEnabled = restoredAccess.enabled === true;
        assert(cycle.finalEnabled === false, 'RBAC não voltou ao estado desativado original');
        cycle.restored = true;
      } catch (restoreError) {
        cycle.restoreError =
          restoreError instanceof Error ? restoreError.message : String(restoreError);
        primaryError = new Error(
          `${primaryError ? `${primaryError instanceof Error ? primaryError.message : String(primaryError)}; ` : ''}RBAC_RESTORE_CRITICAL: ${cycle.restoreError}`,
        );
      }
    } else {
      cycle.finalEnabled = cycle.initialEnabled;
      cycle.restored = true;
    }

    if (token && refreshToken) {
      try {
        await logout(baseUrl, { accessToken: token, refreshToken });
      } catch {
        // Restoration above is the hard gate; session cleanup is best effort.
      }
    }

    writeAugmentedReport(readExistingReport(), cycle, qaSectorBootstrap, primaryError);
  }

  if (primaryError) throw primaryError;
  console.log(
    JSON.stringify({
      success: true,
      qaSectorBootstrapApplied: qaSectorBootstrap.classifications.length,
      activatedTemporarily: cycle.activatedTemporarily,
      rbacRestored: cycle.restored,
      finalEnabled: cycle.finalEnabled,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWithRbacCycle().catch((error) => {
    console.error(
      `STAGING_DOMAIN_CERTIFICATE_RBAC_CYCLE_FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
