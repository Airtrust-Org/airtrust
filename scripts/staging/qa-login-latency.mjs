#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import {
  assertAllowedStagingBaseUrl,
  extractAccessToken,
  extractRefreshToken,
  logout,
} from '../smoke-auth-common.mjs';

const FRONTEND_TIMEOUT_MS = 10_000;
const RATE_LIMIT_BATCH = 5;
const RATE_LIMIT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 61_000);
const attempts = Number(process.env.LOGIN_ATTEMPTS || 10);
const baseUrl = assertAllowedStagingBaseUrl(
  process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev',
);
const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
const password = String(process.env.STAGING_SMOKE_PASSWORD || '');

if (!email || !password) throw new Error('STAGING_SMOKE_EMAIL/STAGING_SMOKE_PASSWORD ausentes');
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) {
  throw new Error('LOGIN_ATTEMPTS deve estar entre 1 e 20');
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FRONTEND_TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: password }),
      signal: controller.signal,
    });
    const elapsed = Math.round(performance.now() - started);
    const payload = await response.json().catch(() => null);
    return { elapsed, status: response.status, payload, timedOut: false };
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    if (error instanceof Error && error.name === 'AbortError') {
      return { elapsed, status: 0, payload: null, timedOut: true };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const durations = [];
let success = 0;
let timeouts = 0;

for (let index = 0; index < attempts; index += 1) {
  if (index > 0 && index % RATE_LIMIT_BATCH === 0) {
    console.log(`RATE_LIMIT_COOLDOWN_MS=${RATE_LIMIT_WINDOW_MS}`);
    await sleep(RATE_LIMIT_WINDOW_MS);
  }

  const result = await loginOnce();
  durations.push(result.elapsed);

  if (result.timedOut) {
    timeouts += 1;
    console.log(`LOGIN_ATTEMPT_${index + 1}=TIMEOUT:${result.elapsed}ms`);
    continue;
  }

  if (result.status !== 200 || result.payload?.success !== true) {
    throw new Error(`login ${index + 1} retornou HTTP ${result.status}`);
  }

  success += 1;
  console.log(`LOGIN_ATTEMPT_${index + 1}=PASS:${result.elapsed}ms`);

  const accessToken = extractAccessToken(result.payload);
  const refreshToken = extractRefreshToken(result.payload);
  const logoutResult = await logout(baseUrl, { accessToken, refreshToken });
  if (logoutResult.status !== 200 || logoutResult.json?.success !== true) {
    throw new Error(`logout ${index + 1} retornou HTTP ${logoutResult.status}`);
  }
}

const min = Math.min(...durations);
const max = Math.max(...durations);
const p50 = percentile(durations, 50);
const p95 = percentile(durations, 95);

console.log(`LOGIN_ATTEMPTS=${attempts}`);
console.log(`LOGIN_SUCCESS=${success}`);
console.log(`LOGIN_TIMEOUTS=${timeouts}`);
console.log(`MIN_LOGIN_LATENCY_MS=${min}`);
console.log(`MAX_LOGIN_LATENCY_MS=${max}`);
console.log(`P50_LOGIN_LATENCY_MS=${p50}`);
console.log(`P95_LOGIN_LATENCY_MS=${p95}`);

if (success !== attempts || timeouts !== 0 || max >= FRONTEND_TIMEOUT_MS) {
  throw new Error('STAGING_LOGIN_LATENCY_QA_FAILED');
}

console.log('STAGING_LOGIN_LATENCY_QA_PASS');
