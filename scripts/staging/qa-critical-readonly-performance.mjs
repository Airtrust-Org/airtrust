#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  assertAllowedStagingBaseUrl,
  buildReadOnlyEndpointSpecs,
  extractAccessToken,
  extractRefreshToken,
  login,
  logout,
} from '../smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const DEFAULT_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('samples vazias');
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) throw new Error('samples vazias');
  const latencies = samples.map((sample) => sample.elapsedMs);
  const bytes = samples.map((sample) => sample.bytes);
  return {
    requests: samples.length,
    minMs: Math.min(...latencies),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    maxMs: Math.max(...latencies),
    avgBytes: Math.round(bytes.reduce((sum, value) => sum + value, 0) / bytes.length),
    maxBytes: Math.max(...bytes),
  };
}

async function fetchMeasuredJson(url, accessToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const rawText = await response.text();
    const elapsedMs = Math.round(performance.now() - started);
    const bytes = Buffer.byteLength(rawText, 'utf8');
    let json = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new Error(`${url} retornou corpo nao JSON (${response.status})`);
    }
    return { status: response.status, json, elapsedMs, bytes };
  } finally {
    clearTimeout(timer);
  }
}

export async function runReadonlyPerformanceBaseline({ baseUrl, email, password, attempts = DEFAULT_ATTEMPTS }) {
  if (!email || !password) throw new Error('STAGING_SMOKE_EMAIL/STAGING_SMOKE_PASSWORD ausentes');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error('PERF_ATTEMPTS deve estar entre 1 e 10');
  }

  const safeBaseUrl = assertAllowedStagingBaseUrl(baseUrl || DEFAULT_BASE_URL);
  const loginPayload = await login(safeBaseUrl, email, password);
  const accessToken = extractAccessToken(loginPayload);
  const refreshToken = extractRefreshToken(loginPayload);
  let totalRequests = 0;

  try {
    for (const spec of buildReadOnlyEndpointSpecs(email)) {
      const samples = [];
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const result = await fetchMeasuredJson(`${safeBaseUrl}${spec.path}`, accessToken);
        if (result.status !== spec.expectedStatus) {
          throw new Error(`${spec.name} retornou ${result.status}`);
        }
        spec.validate(result.json);
        samples.push(result);
      }
      totalRequests += samples.length;
      const summary = summarizeSamples(samples);
      process.stdout.write(
        `PERF_BASELINE endpoint=${spec.name} requests=${summary.requests} min_ms=${summary.minMs} p50_ms=${summary.p50Ms} p95_ms=${summary.p95Ms} max_ms=${summary.maxMs} avg_bytes=${summary.avgBytes} max_bytes=${summary.maxBytes}\n`,
      );
    }
  } finally {
    const logoutResult = await logout(safeBaseUrl, { accessToken, refreshToken });
    if (logoutResult.status !== 200 || logoutResult.json?.success !== true) {
      throw new Error(`logout retornou HTTP ${logoutResult.status}`);
    }
  }

  process.stdout.write(`PERF_BASELINE_TOTAL requests=${totalRequests}\n`);
  return { totalRequests };
}

async function main() {
  const baseUrl = process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL;
  const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.STAGING_SMOKE_PASSWORD || '');
  const attempts = Number(process.env.PERF_ATTEMPTS || DEFAULT_ATTEMPTS);
  await runReadonlyPerformanceBaseline({ baseUrl, email, password, attempts });
  process.stdout.write('STAGING_READONLY_PERFORMANCE_BASELINE_PASS\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`STAGING_READONLY_PERFORMANCE_BASELINE_FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
