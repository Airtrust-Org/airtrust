import { describe, expect, it } from 'vitest';
import {
  SameDayTrainingAlerts,
  type AlertIdentity,
} from '../../services/training-alert-same-day';
import type { TrainingCommunication } from '../../services/training-communication-history';

const base: TrainingCommunication = {
  id: 'lms:1:EMAIL',
  funcionario_id: 101,
  funcionario_nome: 'Aluno',
  setor_nome: null,
  qualificacao_tipo_id: 42,
  curso_id: 77,
  qualificacao_nome: 'CRM',
  status_compliance: null,
  tipo: 'EMAIL',
  destinatario: null,
  destinatario_fonte: null,
  status_envio: 'enviada',
  erro: null,
  enviado_em: '2026-11-06 01:20:00',
  gestor: false,
  origem: 'LMS_ALERTA',
  setor_id: null,
  funcao_id: null,
};
const identity: AlertIdentity = { funcionario_id: 101, qualificacao_tipo_id: 42, curso_id: 77 };

describe('same-day training alert deduplication', () => {
  it('recognizes a successful late-evening BRT LMS alert as already sent on the preceding UTC day', () => {
    const history = new SameDayTrainingAlerts([base], '2026-11-05');
    expect(history.wasSent(identity, 'EMAIL')).toBe(true);
    expect(history.wasSent(identity, 'WHATSAPP')).toBe(false);
    expect(history.wasSent({ ...identity, funcionario_id: 102 }, 'EMAIL')).toBe(false);
    expect(history.wasSent({ ...identity, qualificacao_tipo_id: 43 }, 'EMAIL')).toBe(false);
  });

  it('does not block failed, manager-only, or prior-day alerts', () => {
    const history = new SameDayTrainingAlerts([
      { ...base, id: 'failed', status_envio: 'erro' },
      { ...base, id: 'manager', gestor: true },
      { ...base, id: 'yesterday', enviado_em: '2026-11-05 02:59:59' },
    ], '2026-11-05');
    expect(history.wasSent(identity, 'EMAIL')).toBe(false);
    history.markAccepted(identity, 'EMAIL');
    expect(history.wasSent(identity, 'EMAIL')).toBe(true);
  });

  it('matches the same qualification across Compliance and LMS but keeps channels separate', () => {
    const history = new SameDayTrainingAlerts([{
      ...base, id: 'compliance:1', origem: 'COMPLIANCE', curso_id: null,
      tipo: 'WHATSAPP_COMPLIANCE',
    }], '2026-11-05');
    expect(history.wasSent(identity, 'WHATSAPP')).toBe(true);
    expect(history.wasSent(identity, 'EMAIL')).toBe(false);
  });

  it('bloqueia intenção LMS pendente sem reenviar, mas não bloqueia falha final', () => {
    const history = new SameDayTrainingAlerts([
      { ...base, id: 'lms:prepared:EMAIL', status_envio: 'pendente' },
      { ...base, id: 'lms:failed:WHATSAPP', status_envio: 'erro', tipo: 'WHATSAPP' },
    ], '2026-11-05');
    expect(history.wasSent(identity, 'EMAIL')).toBe(true);
    expect(history.wasSent(identity, 'WHATSAPP')).toBe(false);
  });

  it('pending intention from the prior BRT day is not an all-day block', () => {
    const history = new SameDayTrainingAlerts([
      { ...base, status_envio: 'pendente', enviado_em: '2026-11-05 02:59:59' },
    ], '2026-11-05');
    expect(history.wasSent(identity, 'EMAIL')).toBe(false);
  });

  it('falls back to the course identity for LMS courses with no qualification mapping', () => {
    const history = new SameDayTrainingAlerts([
      { ...base, qualificacao_tipo_id: null },
    ], '2026-11-05');
    expect(history.wasSent({ funcionario_id: 101, curso_id: 77 }, 'EMAIL')).toBe(true);
    expect(history.wasSent({ funcionario_id: 101, curso_id: 78 }, 'EMAIL')).toBe(false);
  });
});
