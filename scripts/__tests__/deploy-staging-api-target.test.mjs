import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const frontendJob = workflow.slice(
  workflow.indexOf('\n  deploy-frontend:'),
  workflow.indexOf('\n  smoke:'),
);
const buildStep = frontendJob.slice(
  frontendJob.indexOf('- name: Build frontend against staging API'),
  frontendJob.indexOf('- name: Stamp build version'),
);

test('staging frontend build binds only the staging API', () => {
  assert.match(
    buildStep,
    /VITE_API_URL: https:\/\/airtrust-api-staging\.airtrust\.workers\.dev\/api/,
  );
  assert.doesNotMatch(buildStep, /https:\/\/api\.airtrust\.online\/api/);
});
