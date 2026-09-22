import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const source = readFileSync(join(ROOT, 'scripts/staging/smoke-rdv-cas.mjs'), 'utf8');

describe('smoke-rdv-cas governed cleanup contract', () => {
  it('uses the dedicated status-transition endpoint, never generic PATCH for cancellation', () => {
    const start = source.indexOf('async function cancelSyntheticFlight');
    const end = source.indexOf('// FASE 4:', start);
    const block = source.slice(start, end);
    assert.match(block, /`\/api\/controle-voos\/voos\/\$\{vooId\}\/status`/);
    assert.match(block, /method:\s*'POST'/);
    assert.match(block, /status:\s*'cancelado'/);
    assert.match(block, /cancelado_motivo_id:\s*canceladoMotivoId/);
    assert.match(block, /versao/);
    assert.doesNotMatch(block, /method:\s*'PATCH'/);
  });

  it('fails the smoke when an attempted cleanup fails instead of only logging the error', () => {
    assert.match(source, /let cleanupFailed = false/);
    assert.match(source, /cleanupFailed = true/);
    assert.match(source, /if \(cleanupFailed\) \{[\s\S]*throw new Error\('RDV CAS funcional passou, mas o cleanup governado falhou/);
    assert.match(source, /incluindo cleanup governado/);
  });

  it('uses the governed contract catalog and no longer sends legacy natureza for synthetic flight creation', () => {
    assert.match(source, /ensureQaContractId/);
    assert.match(source, /\/api\/controle-voos\/catalogos\/contratos/);
    assert.match(source, /codigo:\s*'QA-RDV-SMOKE'/);
    assert.match(source, /contrato_id:\s*contratoId/);
    const payloadStart = source.indexOf('const vooPayload = {');
    const payloadEnd = source.indexOf('validateVooPayload(vooPayload)', payloadStart);
    const payloadBlock = source.slice(payloadStart, payloadEnd);
    assert.doesNotMatch(payloadBlock, /natureza_voo_id/);
  });

  it('keeps historical cleanup tenant/prefix/status/version scoped', () => {
    assert.match(source, /SMOKE_PREFIX_MARKER/);
    assert.match(source, /CANCELLABLE_STATUSES/);
    assert.match(source, /typeof flight\.versao !== 'number'/);
    assert.match(source, /nao identifica voo sintetico deste smoke/);
  });

  it('validates the structured flight-plan contract on the disposable QA flight', () => {
    assert.match(source, /exerciseStructuredFlightPlan/);
    assert.match(source, /\/plano-voo\/preview/);
    assert.match(source, /status:\s*'rascunho'/);
    assert.match(source, /status:\s*'pronto'/);
    assert.match(source, /CONTROLE_VOOS_FLIGHT_PLAN_VERSION_CONFLICT/);
    assert.match(source, /transmission\?\.provider === 'MANUAL'/);
    assert.match(source, /transmission\?\.enabled === false/);
    assert.match(source, /preview\.includes\('\(FPL-'/);
    assert.match(source, /await exerciseStructuredFlightPlan\(EXPECTED_API_URL, token, vooId\)/);
  });
});
