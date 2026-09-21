import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PERMISSION_OVERRIDES } from '../production/provision-coordenacao-user.mjs';

const workflow = fs.readFileSync('.github/workflows/production-provision-coordenacao-user.yml', 'utf8');
const script = fs.readFileSync('scripts/production/provision-coordenacao-user.mjs', 'utf8');

function typeFor(permission) {
  return PERMISSION_OVERRIDES.find((row) => row.permissao === permission)?.tipo || null;
}

test('coordination permission set is least-privilege and explicit', () => {
  assert.equal(typeFor('controle_voos.view'), 'GRANT');
  assert.equal(typeFor('controle_voos.edit'), 'GRANT');
  assert.equal(typeFor('escalas.create'), 'GRANT');
  assert.equal(typeFor('escalas.delete'), 'GRANT');
  assert.equal(typeFor('frms.view'), 'GRANT');
  assert.equal(typeFor('frms.team.view'), 'GRANT');
  assert.equal(typeFor('frms.edit'), 'DENY');
  assert.equal(typeFor('frms.checkin'), 'DENY');
  assert.equal(typeFor('voos.rdv.aprovar_comercial'), null);
});

test('production workflow is pinned, guarded, environment-scoped, and API-only', () => {
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_COORDENACAO_IDENTITY/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /expected_production_sha/);
  assert.match(workflow, /COORDENACAO_INITIAL_PASSWORD/);
  assert.doesNotMatch(workflow, /wrangler\s+d1\s+execute|CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(workflow, /STAGING_SMOKE_PASSWORD|STAGING_SMOKE_EMAIL/);
});

test('executor never hardcodes the real target identity or secret', () => {
  assert.doesNotMatch(script, /coordenacao@voecostadosol\.com\.br/i);
  assert.doesNotMatch(script, /Coordenacao123/);
  assert.match(script, /TARGET_EMAIL_DOMAIN_REJECTED/);
  assert.match(script, /TARGET_FRMS_CHECKIN_BACKEND_NOT_DENIED/);
});


test('FRMS production probe supplies the required date range and requires team scope', () => {
  assert.match(script, /operational-snapshot\?data_inicio=/);
  assert.match(script, /data_fim=/);
  assert.match(script, /TARGET_FRMS_TEAM_SCOPE_NOT_GRANTED/);
});
