import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertNewPtoV18ApplyReady } from '../lib/simuladores-pto-v18-apply-approval.mjs';
import { assertPtoV18CanonicalPlan, PTO_V18_CANONICAL_SESSIONS_SHA } from '../lib/simuladores-pto-v18-canonical-match.mjs';

const source = '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912';
const sourceSessions = JSON.parse(readFileSync(new URL(
  '../../../scripts/operations/pto-v18-canonical/sessoes_pto_v18.json', import.meta.url,
), 'utf8'));
const sourceNotechs = JSON.parse(readFileSync(new URL(
  '../../../scripts/operations/pto-v18-canonical/notechs_pto_v18.json', import.meta.url,
), 'utf8'));

const sourceFunctional = JSON.parse(readFileSync(new URL(
  '../../../scripts/operations/pto-v18-canonical/funcionais_pto_v18.json', import.meta.url,
), 'utf8'));
const plan = Object.freeze({
  schema_version: 2,
  approved_source_sha256: source,
  canonical_contract_sha256: PTO_V18_CANONICAL_SESSIONS_SHA,
  plan_sha256: 'b'.repeat(64),
  models: [
    ...sourceSessions.map((s) => ({
      codigo: s.codigo, titulo: s.titulo, carga_sessao: s.carga,
      aeronave: s.aeronave === 'S76' ? 'SK76' : 'AW139',
      tipo_estruturado: 'INICIAL',
    })),
    ...sourceFunctional.map((session) => ({
      codigo: session.codigo, titulo: session.titulo, carga_sessao: session.carga,
      aeronave: null,
      tipo_estruturado: session.codigo.startsWith('INST') ? 'INSTRUTOR' : 'EXAMINADOR',
    })),
  ],
  items: [
    ...sourceSessions.flatMap((s) => s.itens.map((item) => ({
      modelo: s.codigo,
      aeronave: s.aeronave === 'S76' ? 'SK76' : 'AW139',
      ordem: item.ordem,
      codigo: item.codigo,
      nome: item.nome,
      execucao_pf: item.ordem <= 9 ? 'A' : 'B',
    }))),
    ...sourceFunctional.flatMap((session) => session.itens.map((item) => ({
      modelo: session.codigo, aeronave: null, ordem: item.ordem,
      codigo: item.codigo, nome: item.nome, execucao_pf: 'AB',
    }))),
  ],
  notechs: sourceNotechs.map((row, index) => ({
    codigo: row.codigo,
    nome: row.elemento,
    categoria: row.categoria,
    evidencia_observavel: row.evidencia,
    ordem: 1001 + index,
  })),
});
const approval = Object.freeze({
  status: 'VALIDADO_PARA_PRODUCAO',
  pto_sha256: source,
  contract_sha256: PTO_V18_CANONICAL_SESSIONS_SHA,
  plan_sha256: 'b'.repeat(64),
  guide_count: 82,
  technical_items_verified: 1476,
  notechs_verified: 15,
  functional_guides_verified: 6,
  functional_technical_items_verified: 108,
  functional_notechs_links_verified: 90,
  reviewer: 'responsavel-tecnico',
  reviewed_at: '2026-11-12T21:00:00Z',
  evidence_ref: 'auditoria/versao-controlada',
});

test('legacy schema is refused for any new import', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan: { ...plan, schema_version: 1 }, existingState: 'NEW', dryRun: false,
  }), /plano curricular legado/);
});

test('old imports may be recognized as already applied without rewriting history', () => {
  assert.equal(assertNewPtoV18ApplyReady({
    plan: { schema_version: 1 }, existingState: 'IDEMPOTENT_APPLIED', dryRun: false,
  }).mode, 'HISTORICAL_READBACK');
});

test('new v18 plan can dry-run without operational approval', () => {
  assert.equal(assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: true,
  }).mode, 'CURRICULAR_DRY_RUN_ONLY');
});

test('canonical V18 gate rejects hash-only forgery even in dry-run', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan: { ...plan, canonical_contract_sha256: 'a'.repeat(64) },
    existingState: 'NEW', dryRun: true,
  }), /checksum não é o do contrato canônico/);
});

test('canonical V18 gate rejects changed technical code and PF assignment', () => {
  for (const delta of [
    { codigo: 'A139-NOT-APPROVED' }, { execucao_pf: 'B' }, { ordem: 19 },
    { nome: 'Manobra alterada sem PTO' },
  ]) {
    const items = plan.items.map((item, i) => i === 0 ? { ...item, ...delta } : item);
    assert.throws(() => assertPtoV18CanonicalPlan({ ...plan, items }),
      /divergência código\/nome\/ordem\/perna/);
  }
});

test('canonical V18 gate rejects swapped model name, duration and aircraft', () => {
  for (const delta of [
    { titulo: 'Título não aprovado' }, { carga_sessao: '90 minutos' },
    { aeronave: 'SK76' },
  ]) {
    const models = plan.models.map((model, i) => i === 0 ? { ...model, ...delta } : model);
    assert.throws(() => assertPtoV18CanonicalPlan({ ...plan, models }),
      /modelo difere da fonte aprovada/);
  }
});

test('canonical V18 gate rejects changed functional title, load or instruction role', () => {
  for (const delta of [
    { titulo: 'Título antigo' }, { carga_sessao: '3 horas' },
    { tipo_estruturado: 'EXAMINADOR' }, { aeronave: 'AW139' },
  ]) {
    const models = plan.models.map((model, index) =>
      index === 82 ? { ...model, ...delta } : model);
    assert.throws(() => assertPtoV18CanonicalPlan({ ...plan, models }),
      /modelo funcional difere do PTO/);
  }
});

test('canonical V18 gate rejects altered functional procedure, code, order or aircraft', () => {
  for (const delta of [
    { codigo: 'FUNC-ALTERADO' }, { nome: 'Atividade inventada' },
    { ordem: 19 }, { aeronave: 'SK76' }, { execucao_pf: 'A' },
  ]) {
    const items = plan.items.map((item, index) =>
      index === 1476 ? { ...item, ...delta } : item);
    assert.throws(() => assertPtoV18CanonicalPlan({ ...plan, items }),
      /divergência funcional código\/nome\/ordem/);
  }
});

test('canonical V18 gate rejects altered NOTECHS name or observable evidence', () => {
  for (const delta of [
    { nome: 'Não corresponde ao PTO' },
    { categoria: 'Categoria inventada' },
    { evidencia_observavel: 'Sem evidência válida' },
    { ordem: 777 },
  ]) {
    const notechs = plan.notechs.map((row, i) => i === 0 ? { ...row, ...delta } : row);
    assert.throws(() => assertPtoV18CanonicalPlan({ ...plan, notechs }),
      /catálogo NOTECHS diferente/);
  }
});

test('canonical V18 gate rejects missing NOTECHS and a missing session', () => {
  assert.throws(() => assertPtoV18CanonicalPlan({
    ...plan, notechs: plan.notechs.slice(1),
  }), /15 competências NOTECHS obrigatórias/);
  assert.throws(() => assertPtoV18CanonicalPlan({
    ...plan, models: plan.models.slice(1),
  }), /exigidos 82 modelos/);
});

test('new v18 plan may not apply a review-only package', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, status: 'NAO_APROVADO_NAO_IMPORTAVEL_NAO_PUBLICAVEL' },
  }), /aprovação técnica/);
});

test('technical approval is tied to exact plan hash', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, plan_sha256: 'c'.repeat(64) },
  }), /plano exato/);
});

test('incomplete guide approval blocks application', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, guide_count: 51 },
  }), /não abrange integralmente/);
});

test('six functional instructor/examiner guides are also mandatory', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, functional_guides_verified: 0 },
  }), /não abrange integralmente/);
});

test('missing 90 functional NOTECHS links blocks production', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, functional_notechs_links_verified: 0 },
  }), /não abrange integralmente/);
});

test('complete technical approval accepts the exact sealed plan gate', () => {
  assert.equal(assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false, technicalApproval: approval,
  }).mode, 'TECHNICALLY_APPROVED_EXACT_PLAN');
});
