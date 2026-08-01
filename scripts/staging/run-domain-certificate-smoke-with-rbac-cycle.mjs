#!/usr/bin/env node

/**
 * Staging-only wrapper that temporarily activates operational-domain RBAC
 * through the official audited admin API when the synthetic QA tenant is
 * ready but still disabled. The original state is restored in finally.
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

function writeAugmentedReport(report, rbacActivation, error) {
  writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        ...report,
        rbacActivation,
        ...(error ? { error: error instanceof Error ? error.message : String(error), success: false } : {}),
      },
      null,
      2,
    )}\n`,
  );
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
      const readinessResponse = await authJson(
        baseUrl,
        token,
        '/api/admin/operational-domain-rbac/readiness',
      );
      assert(
        readinessResponse.status === 200 && readinessResponse.json?.success === true,
        `readiness retornou ${readinessResponse.status}`,
      );
      cycle.readiness = readinessSummary(readinessResponse.json.data);
      assert(
        cycle.readiness.ready,
        `tenant QA não está pronto para ativação temporária: ${cycle.readiness.bloqueios.join('; ') || 'bloqueios não detalhados'}`,
      );

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
        cycle.restoreError = restoreError instanceof Error ? restoreError.message : String(restoreError);
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

    writeAugmentedReport(readExistingReport(), cycle, primaryError);
  }

  if (primaryError) throw primaryError;
  console.log(
    JSON.stringify({
      success: true,
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
