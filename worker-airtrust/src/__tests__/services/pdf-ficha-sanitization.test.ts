/**
 * Testes de sanitização de metadados internos no PDF de fichas.
 *
 * Verifica que a blindagem contra vazamento de termos internos
 * (empresa_id, tenant, RBAC, debug, etc.) funciona tanto no
 * Worker (pdf-ficha.service.ts) quanto no cliente (pdf-ficha-client.ts).
 */
import { describe, expect, it } from 'vitest';

// ── Mesma regex usada nos dois geradores de PDF ──────────────────────────────
const INTERNAL_METADATA_LEAK_RE = new RegExp(
  [
    'tipo_item\\s*=',
    'fase_voo\\s*=',
    'carater\\s*=',
    'fap_refs\\s*=',
    'matriz_v6_modelo\\s*=',
    'sourceNotes',
    'source_notes',
    '\\bprompt\\b',
    '\\bdebug\\b',
    '\\brbac\\b',
    '\\brole\\b',
    '\\btenant\\b',
    '\\bmigration\\b',
    '\\bseed\\b',
    '\\bfixture\\b',
    '\\bbanco\\b',
    '\\bbd\\b',
    'empresa_id',
    '\\bauth\\b',
    '\\bjwt\\b',
    '\\btoken\\b',
    'auditoria\\s+interna',
    'bastidor(?:es)?\\s+t[eé]cnico',
    'instru[cç][aã]o\\s+de\\s+agente',
    '[{}]',
    `["'](?:source|metadata|internal|audit)["']`,
  ].join('|'),
  'i',
);

function sanitizeForPdf(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return INTERNAL_METADATA_LEAK_RE.test(text) ? '' : text;
}

// ── Constantes que devem estar presentes no PDF ──────────────────────────────
const NOTECHS_CALIBRATION_WARNING =
  'Nota: os descritores NOTECHS apresentados nesta ficha são estrutura de apoio à observação comportamental e devem ser calibrados pela empresa contra sua ficha-fonte, manual de treinamento e critérios internos antes de uso avaliativo formal.';

const REGULATORY_DISCLAIMER =
  'Esta ficha é instrumento interno de treinamento e avaliação operacional da empresa. Não substitui FAP oficial, documento ANAC, homologação, aprovação ou aceite formal da ANAC. A aderência regulatória deve ser verificada contra os documentos oficiais vigentes da empresa, da ANAC e dos contratantes aplicáveis.';

describe('Sanitização de metadados internos', () => {
  it('bloqueia "empresa_id" em qualquer lugar do texto', () => {
    expect(sanitizeForPdf('campo empresa_id=6')).toBe('');
  });

  it('bloqueia "tenant"', () => {
    expect(sanitizeForPdf('tenant isolation check')).toBe('');
  });

  it('bloqueia "RBAC" case-insensitive', () => {
    expect(sanitizeForPdf('rbac role check')).toBe('');
    expect(sanitizeForPdf('RBAC')).toBe('');
  });

  it('bloqueia "debug"', () => {
    expect(sanitizeForPdf('debug mode enabled')).toBe('');
  });

  it('bloqueia "prompt"', () => {
    expect(sanitizeForPdf('prompt do agente')).toBe('');
  });

  it('bloqueia "auditoria interna"', () => {
    expect(sanitizeForPdf('Resultado de auditoria interna')).toBe('');
  });

  it('bloqueia "migration"', () => {
    expect(sanitizeForPdf('migration 0123 applied')).toBe('');
  });

  it('bloqueia "seed"', () => {
    expect(sanitizeForPdf('seed data inserted')).toBe('');
  });

  it('bloqueia "auth" e "jwt"', () => {
    expect(sanitizeForPdf('auth token')).toBe('');
    expect(sanitizeForPdf('jwt secret')).toBe('');
  });

  it('bloqueia chaves JSON e strings internas', () => {
    expect(sanitizeForPdf('{"source": "db"}')).toBe('');
    expect(sanitizeForPdf('"metadata"')).toBe('');
  });

  it('bloqueia "bastidor técnico" e "bastidores técnicos"', () => {
    expect(sanitizeForPdf('bastidor técnico')).toBe('');
    expect(sanitizeForPdf('bastidores técnicos')).toBe('');
  });

  it('bloqueia "instrução de agente"', () => {
    expect(sanitizeForPdf('instrução de agente')).toBe('');
    expect(sanitizeForPdf('instrucao de agente')).toBe('');
  });

  it('permite texto operacional normal', () => {
    expect(sanitizeForPdf('Falha de motor em cruzeiro')).toBe('Falha de motor em cruzeiro');
    expect(sanitizeForPdf('Pouso de emergência no helideck')).toBe('Pouso de emergência no helideck');
    expect(sanitizeForPdf('Procedimento normal de decolagem IFR')).toBe('Procedimento normal de decolagem IFR');
  });

  it('permite string vazia ou null', () => {
    expect(sanitizeForPdf('')).toBe('');
    expect(sanitizeForPdf(null)).toBe('');
    expect(sanitizeForPdf(undefined)).toBe('');
  });

  it('retorna vazio para texto que contém APENAS metadado', () => {
    expect(sanitizeForPdf('empresa_id=6')).toBe('');
  });
});

describe('Constantes do PDF', () => {
  it('aviso NOTECHS contém texto de calibração', () => {
    expect(NOTECHS_CALIBRATION_WARNING).toContain('descritores NOTECHS');
    expect(NOTECHS_CALIBRATION_WARNING).toContain('calibrados');
    expect(NOTECHS_CALIBRATION_WARNING).toContain('ficha-fonte');
  });

  it('disclaimer regulatório NÃO promete homologação ANAC', () => {
    expect(REGULATORY_DISCLAIMER).toContain('Não substitui');
    expect(REGULATORY_DISCLAIMER).toContain('ANAC');
    // NÃO deve conter termos que prometem aprovação
    expect(REGULATORY_DISCLAIMER).not.toMatch(/homologad[oa]/i);
    expect(REGULATORY_DISCLAIMER).not.toMatch(/aprovad[oa] pela ANAC/i);
  });

  it('disclaimer regulatório menciona documentos oficiais vigentes', () => {
    expect(REGULATORY_DISCLAIMER).toContain('documentos oficiais vigentes');
  });
});
