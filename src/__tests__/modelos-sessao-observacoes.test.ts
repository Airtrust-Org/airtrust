import { describe, expect, it } from 'vitest';

import {
  hasUnsafeModeloSessaoObservacoes,
  resolveModeloSessaoObservacoesOverride,
  sanitizeModeloSessaoObservacoesForStorage,
  validateModeloSessaoObservacoesInput,
} from '@/shared/simuladores/modelos-sessao-observacoes';

const UNSAFE_VALUES = [
  'tipo_item=tecnica; fase_voo=pre_partida',
  'matriz_v6_modelo=A139-REQ-01',
  'ver sourceNotes do loader',
  'source_notes=interno',
  'prompt interno do agente',
  'debug only',
  'RBAC role tenant',
  'empresa_id=6 auth jwt token',
  '{"metadata":"internal"}',
  'auditoria interna - bastidor tecnico',
];

describe('modelos sessao observacoes', () => {
  it('preserva texto operacional limpo', () => {
    expect(resolveModeloSessaoObservacoesOverride('Checklist e preparação IFR')).toBe(
      'Checklist e preparação IFR',
    );
    expect(sanitizeModeloSessaoObservacoesForStorage('  Encerramento pós-voo  ')).toBe(
      'Encerramento pós-voo',
    );
  });

  it.each(UNSAFE_VALUES)('bloqueia metadado interno em "%s"', (value) => {
    expect(hasUnsafeModeloSessaoObservacoes(value)).toBe(true);
    expect(resolveModeloSessaoObservacoesOverride(value)).toBe('');
    expect(sanitizeModeloSessaoObservacoesForStorage(value)).toBeNull();
    expect(validateModeloSessaoObservacoesInput(value)).toMatchObject({ ok: false });
  });

  it('aceita vazio ou nulo sem quebrar compatibilidade', () => {
    expect(validateModeloSessaoObservacoesInput(null)).toEqual({ ok: true, value: null });
    expect(validateModeloSessaoObservacoesInput('   ')).toEqual({ ok: true, value: null });
    expect(resolveModeloSessaoObservacoesOverride(undefined)).toBe('');
  });
});
