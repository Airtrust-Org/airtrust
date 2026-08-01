#!/usr/bin/env node

/**
 * Synthetic staging-only end-to-end validation for the operational-domain
 * classification mechanism and qualification certificate generation.
 *
 * Safety contract:
 * - exact staging host only;
 * - synthetic QA admin credentials only;
 * - discovers a genuinely unclassified qualification type dynamically;
 * - applies classification through the audited admin API, never direct SQL;
 * - always rolls the temporary override back to NULL in finally;
 * - never prints credentials or employee PII;
 * - leaves any generated QA certificate in the synthetic tenant for evidence.
 */

import { writeFileSync } from 'node:fs';
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

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const TARGET_DOMAIN = 'OPERACOES';
const REPORT_PATH = process.env.SMOKE_REPORT_PATH || 'staging-domain-certificate-smoke-report.json';
const MAX_UNCLASSIFIED_TYPES_TO_SCAN = 10;
const MAX_HISTORIES_PER_TYPE = 5;

function asRows(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function responseCode(response) {
  return String(response?.json?.code || response?.json?.error_code || '').trim();
}

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

async function streamPdf(baseUrl, token, documentId) {
  const response = await fetch(`${baseUrl}/api/pasta-virtual/stream/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = Buffer.from(bytes.slice(0, 5)).toString('ascii');
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    bytes: bytes.length,
    hasPdfSignature: signature === '%PDF-',
  };
}

export function selectCandidate({ unclassifiedTypes, typeRows, historiesByType, managedSetorIds }) {
  const detailsById = new Map(typeRows.map((row) => [Number(row.id), row]));
  const managed = new Set(managedSetorIds.map(Number));

  const candidates = [];
  for (const entry of unclassifiedTypes) {
    const typeId = positiveInt(entry?.id);
    if (!typeId) continue;
    const type = detailsById.get(typeId);
    if (!type) continue;
    const typeCategoryId = positiveInt(type.categoria_id);
    const histories = historiesByType.get(typeId) || [];

    for (const history of histories) {
      const historyId = positiveInt(history?.id);
      const employeeId = positiveInt(history?.funcionario_id);
      const employeeSetorId = positiveInt(history?.funcionario_setor_id ?? history?.setor_id);
      if (!historyId || !employeeId || !employeeSetorId || !managed.has(employeeSetorId)) continue;
      if (!history?.data_realizacao && !history?.data_conclusao) continue;

      const historicCategoryId = positiveInt(history?.categoria_id_historico);
      if (historicCategoryId && typeCategoryId && historicCategoryId !== typeCategoryId) continue;

      candidates.push({
        typeId,
        typeCategoryId,
        historyId,
        employeeId,
        employeeSetorId,
        hasCertificate: Number(history?.tem_certificado || 0) === 1,
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.hasCertificate !== right.hasCertificate) return left.hasCertificate ? 1 : -1;
    return left.historyId - right.historyId;
  });
  return candidates[0] || null;
}

async function loadEmployeeSetor(baseUrl, token, employeeId) {
  const response = await authJson(baseUrl, token, `/api/funcionarios/${employeeId}`);
  if (response.status !== 200 || response.json?.success !== true) return null;
  const row = response.json?.data;
  return positiveInt(row?.setor_id);
}

async function discoverCandidate(baseUrl, token, managedSetorIds) {
  const [unclassifiedResponse, typesResponse] = await Promise.all([
    authJson(baseUrl, token, '/api/admin/operational-domain-rbac/unclassified'),
    authJson(baseUrl, token, '/api/qualificacoes/tipos?limit=500'),
  ]);

  assert(unclassifiedResponse.status === 200, `unclassified retornou ${unclassifiedResponse.status}`);
  assert(unclassifiedResponse.json?.success === true, 'unclassified sem success=true');
  assert(typesResponse.status === 200, `tipos retornou ${typesResponse.status}`);
  assert(typesResponse.json?.success === true, 'tipos sem success=true');

  const unclassifiedTypes = asRows({ data: unclassifiedResponse.json?.data?.tipos });
  assert(unclassifiedTypes.length > 0, 'tenant QA sem tipo genuinamente não classificado');
  const typesToScan = unclassifiedTypes.slice(0, MAX_UNCLASSIFIED_TYPES_TO_SCAN);
  const typeRows = asRows(typesResponse.json);
  const historiesByType = new Map();

  for (const entry of typesToScan) {
    const typeId = positiveInt(entry?.id);
    if (!typeId) continue;
    const historiesResponse = await authJson(
      baseUrl,
      token,
      `/api/qualificacoes/historico?tipo_id=${typeId}&limit=${MAX_HISTORIES_PER_TYPE}&stats=false&orderBy=created_at&order=DESC`,
    );
    if (historiesResponse.status !== 200 || historiesResponse.json?.success !== true) continue;

    const historyRows = asRows(historiesResponse.json).slice(0, MAX_HISTORIES_PER_TYPE);
    const enriched = await Promise.all(
      historyRows.map(async (history) => {
        const employeeId = positiveInt(history?.funcionario_id);
        if (!employeeId) return null;
        const setorId = await loadEmployeeSetor(baseUrl, token, employeeId);
        return { ...history, funcionario_setor_id: setorId };
      }),
    );
    historiesByType.set(typeId, enriched.filter(Boolean));
  }

  return selectCandidate({
    unclassifiedTypes: typesToScan,
    typeRows,
    historiesByType,
    managedSetorIds,
  });
}

async function classify(baseUrl, token, typeId, domain) {
  return authJson(baseUrl, token, '/api/admin/operational-domain-rbac/classify', {
    method: 'POST',
    body: JSON.stringify({
      resource_type: 'qualificacao_tipo',
      resource_id: typeId,
      dominio_codigo: domain,
    }),
  });
}

async function generate(baseUrl, token, historyId) {
  return authJson(baseUrl, token, `/api/certificados/historico/${historyId}/certificados/gerar`, {
    method: 'POST',
    body: '{}',
  });
}

function extractGeneratedDocument(response) {
  return {
    id: positiveInt(response?.json?.data?.id),
    uuid: String(response?.json?.data?.uuid || ''),
    r2Key: String(response?.json?.data?.r2_key || ''),
    size: Number(response?.json?.data?.tamanho || 0),
    state: String(response?.json?.estado || ''),
  };
}

async function candidateIsUnclassified(baseUrl, token, typeId) {
  const response = await authJson(baseUrl, token, '/api/admin/operational-domain-rbac/unclassified');
  assert(response.status === 200 && response.json?.success === true, 'falha ao verificar unclassified');
  return asRows({ data: response.json?.data?.tipos }).some((row) => Number(row?.id) === Number(typeId));
}

export async function runSmoke() {
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);
  const email = String(process.env.QA_EXAMINER_ADMIN_EMAIL || '').trim();
  const password = String(process.env.QA_EXAMINER_ADMIN_PASSWORD || '');
  assert(email && password, 'credenciais QA_EXAMINER_ADMIN_* são obrigatórias');

  const report = {
    success: false,
    baseUrl,
    actor: maskEmail(email),
    sourceSha: process.env.GITHUB_SHA || null,
    startedAtUtc: new Date().toISOString(),
    finishedAtUtc: null,
    auth: {},
    candidate: null,
    preClassification: null,
    classification: null,
    certificate: null,
    rollback: { attempted: false, success: false, postRollbackFailClosed: false },
    error: null,
  };

  let token = null;
  let refreshToken = null;
  let candidate = null;
  let classificationApplied = false;
  let primaryError = null;

  try {
    const loginPayload = await login(baseUrl, email, password);
    token = extractAccessToken(loginPayload);
    refreshToken = extractRefreshToken(loginPayload);

    const [me, access] = await Promise.all([
      authJson(baseUrl, token, '/api/auth/me'),
      authJson(baseUrl, token, '/api/me/operational-access'),
    ]);
    assert(me.status === 200 && me.json?.success === true, 'auth/me inválido');
    assert(access.status === 200 && access.json?.success === true, 'operational-access inválido');

    const role = String(me.json?.data?.role || access.json?.data?.administrative_role || '');
    const userId = positiveInt(me.json?.data?.id);
    const enabled = access.json?.data?.enabled === true;
    const domains = Array.isArray(access.json?.data?.domains) ? access.json.data.domains : [];
    const setorIds = Array.isArray(access.json?.data?.setor_ids)
      ? access.json.data.setor_ids.map(Number).filter((value) => Number.isInteger(value) && value > 0)
      : [];

    assert(/admin/i.test(role), `credencial QA não possui papel administrativo: ${role}`);
    assert(userId, 'auth/me sem user id válido');
    assert(enabled, 'RBAC operacional não está ativo no tenant QA');
    assert(domains.includes(TARGET_DOMAIN), 'admin QA sem acesso explícito ao domínio OPERACOES');
    assert(setorIds.length > 0, 'admin QA sem setor gerido ativo');
    report.auth = { userId, role, enabled, domains, managedSetorCount: setorIds.length };

    candidate = await discoverCandidate(baseUrl, token, setorIds);
    assert(candidate, 'nenhum histórico QA elegível ligado a tipo genuinamente não classificado');
    report.candidate = candidate;

    const pre = await generate(baseUrl, token, candidate.historyId);
    report.preClassification = { status: pre.status, code: responseCode(pre) };
    assert(pre.status === 403, `geração pré-classificação deveria retornar 403; recebeu ${pre.status}`);
    assert(
      responseCode(pre) === 'CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED',
      `código pré-classificação inesperado: ${responseCode(pre) || 'ausente'}`,
    );

    const applied = await classify(baseUrl, token, candidate.typeId, TARGET_DOMAIN);
    assert(applied.status === 200 && applied.json?.success === true, `classify retornou ${applied.status}`);
    classificationApplied = true;
    assert(!(await candidateIsUnclassified(baseUrl, token, candidate.typeId)), 'tipo continuou listado como não classificado');
    report.classification = { applied: true, domain: TARGET_DOMAIN, status: applied.status };

    const firstGeneration = await generate(baseUrl, token, candidate.historyId);
    assert(
      firstGeneration.status === 200 || firstGeneration.status === 201,
      `geração pós-classificação retornou ${firstGeneration.status} (${responseCode(firstGeneration) || 'sem código'})`,
    );
    assert(firstGeneration.json?.success === true, 'geração pós-classificação sem success=true');
    const firstDocument = extractGeneratedDocument(firstGeneration);
    assert(firstDocument.id, 'geração pós-classificação sem documento id');
    assert(firstDocument.r2Key, 'geração pós-classificação sem r2_key');
    assert(firstDocument.size > 0, 'geração pós-classificação produziu arquivo vazio');

    const secondGeneration = await generate(baseUrl, token, candidate.historyId);
    assert(secondGeneration.status === 200, `segunda geração idempotente retornou ${secondGeneration.status}`);
    assert(secondGeneration.json?.success === true, 'segunda geração sem success=true');
    const secondDocument = extractGeneratedDocument(secondGeneration);
    assert(secondDocument.state === 'EXISTS', `segunda geração não retornou EXISTS: ${secondDocument.state}`);
    assert(secondDocument.id === firstDocument.id, 'idempotência falhou: documento id mudou');

    const listed = await authJson(
      baseUrl,
      token,
      `/api/certificados/historico/${candidate.historyId}/certificados`,
    );
    assert(listed.status === 200 && listed.json?.success === true, `listagem retornou ${listed.status}`);
    const listedRows = asRows(listed.json);
    assert(
      listedRows.some((row) => Number(row?.documento_id ?? row?.id) === firstDocument.id),
      'documento gerado não apareceu na listagem do histórico',
    );

    const employeeCertificates = await authJson(
      baseUrl,
      token,
      `/api/certificados/funcionario/${candidate.employeeId}`,
    );
    assert(
      employeeCertificates.status === 200 && employeeCertificates.json?.success === true,
      `listagem do funcionário retornou ${employeeCertificates.status}`,
    );
    assert(
      asRows(employeeCertificates.json).some((row) => Number(row?.id) === firstDocument.id),
      'documento gerado não apareceu na pasta/certificados do funcionário',
    );

    const pdf = await streamPdf(baseUrl, token, firstDocument.id);
    assert(pdf.status === 200, `stream do certificado retornou ${pdf.status}`);
    assert(pdf.contentType.includes('application/pdf'), `content-type inesperado: ${pdf.contentType}`);
    assert(pdf.bytes > 0 && pdf.hasPdfSignature, 'stream não contém PDF válido');

    report.certificate = {
      firstStatus: firstGeneration.status,
      firstState: firstDocument.state,
      secondStatus: secondGeneration.status,
      secondState: secondDocument.state,
      documentId: firstDocument.id,
      r2KeyPresent: true,
      bytes: pdf.bytes,
      contentType: pdf.contentType,
      pdfSignature: pdf.hasPdfSignature,
      historyListLinked: true,
      employeeFolderLinked: true,
      idempotent: true,
    };
  } catch (error) {
    primaryError = error;
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (token && candidate && classificationApplied) {
      report.rollback.attempted = true;
      try {
        const rolledBack = await classify(baseUrl, token, candidate.typeId, null);
        assert(
          rolledBack.status === 200 && rolledBack.json?.success === true,
          `rollback classify retornou ${rolledBack.status}`,
        );
        assert(await candidateIsUnclassified(baseUrl, token, candidate.typeId), 'tipo não voltou à lista de não classificados');

        const postRollback = await generate(baseUrl, token, candidate.historyId);
        assert(postRollback.status === 403, `geração pós-rollback deveria retornar 403; recebeu ${postRollback.status}`);
        assert(
          responseCode(postRollback) === 'CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED',
          `código pós-rollback inesperado: ${responseCode(postRollback) || 'ausente'}`,
        );
        report.rollback.success = true;
        report.rollback.postRollbackFailClosed = true;
      } catch (rollbackError) {
        report.rollback.error = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        primaryError = new Error(
          `${report.error ? `${report.error}; ` : ''}ROLLBACK_CRITICAL: ${report.rollback.error}`,
        );
      }
    }

    if (token && refreshToken) {
      try {
        await logout(baseUrl, { accessToken: token, refreshToken });
      } catch {
        // Session expiry is non-critical; classification rollback above is the hard gate.
      }
    }

    report.success = !primaryError && report.rollback.success === true;
    report.finishedAtUtc = new Date().toISOString();
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (primaryError) throw primaryError;
  console.log(JSON.stringify({
    success: true,
    typeId: report.candidate?.typeId,
    historyId: report.candidate?.historyId,
    documentId: report.certificate?.documentId,
    classificationRolledBack: report.rollback.success,
    pdfBytes: report.certificate?.bytes,
  }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke().catch((error) => {
    console.error(`STAGING_DOMAIN_CERTIFICATE_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
