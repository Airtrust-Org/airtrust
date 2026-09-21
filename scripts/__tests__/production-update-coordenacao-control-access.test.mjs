import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { REQUIRED_OVERRIDES } from '../production/update-coordenacao-control-access.mjs';

const workflow = fs.readFileSync('.github/workflows/production-update-coordenacao-control-access.yml', 'utf8');
const script = fs.readFileSync('scripts/production/update-coordenacao-control-access.mjs', 'utf8');
const required = new Map(REQUIRED_OVERRIDES.map((row) => [row.permissao, row.tipo]));

test('forces total Control de Voos capabilities and hides training area', () => {
  for (const permission of [
    'controle_voos.view','controle_voos.edit','controle_voos.sigvoos_preview',
    'voos.rdv.visualizar_proprio','voos.rdv.criar_proprio','voos.rdv.editar_rascunho_proprio',
    'voos.rdv.enviar','voos.rdv.visualizar_todos','voos.rdv.revisar','voos.rdv.corrigir',
    'voos.rdv.devolver','voos.rdv.aprovar_coordenacao','voos.rdv.aprovar_comercial',
    'voos.rdv.reabrir','voos.rdv.exportar_petrobras','voos.rdv.cancelar',
  ]) assert.equal(required.get(permission), 'GRANT', permission);
  assert.equal(required.get('treinamentos.view'), 'DENY');
});

test('preserves unrelated overrides instead of replacing blindly', () => {
  assert.match(script, /mergeRequiredOverrides/);
  assert.match(script, /for \(const row of current\)/);
  assert.match(script, /for \(const row of REQUIRED_OVERRIDES\)/);
});

test('workflow is production-scoped, SHA-pinned, gated and API-only', () => {
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /expected_production_sha/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_COORDENACAO_CONTROL_ACCESS/);
  assert.doesNotMatch(workflow, /wrangler\s+d1\s+execute|CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(script, /coordenacao@voecostadosol\.com\.br/i);
});
