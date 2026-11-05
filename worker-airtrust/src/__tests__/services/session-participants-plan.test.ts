import { describe, expect, it } from 'vitest';
import { funcaoDoParticipante, planParticipantes } from '../../services/simuladores/session-participants';

describe('planParticipantes', () => {
  const atuais = [
    { funcionario_id: 200, funcao: 'PIC' },
    { funcionario_id: 201, funcao: 'SIC' },
  ];

  it('mesma lista (ids e funções, em qualquer ordem) não conta como alteração', () => {
    const plan = planParticipantes({
      atuais,
      enviados: [{ funcionario_id: '200' }, { funcionario_id: 201 }],
      instrutorEfetivo: 100,
    });
    expect(plan.alterados).toBe(false);
    expect(plan.removidos).toEqual([]);
  });

  it('troca de função ou de pessoa conta como alteração e lista os removidos', () => {
    expect(
      planParticipantes({
        atuais,
        enviados: [{ funcionario_id: 200, funcao: 'SIC' }, { funcionario_id: 201 }],
        instrutorEfetivo: 100,
      }).alterados,
    ).toBe(true);
    const plan = planParticipantes({
      atuais,
      enviados: [{ funcionario_id: 200 }, { funcionario_id: 202 }],
      instrutorEfetivo: 100,
    });
    expect(plan.alterados).toBe(true);
    expect(plan.removidos).toEqual([201]);
  });

  it('descarta itens sem funcionario_id e detecta o instrutor entre os participantes', () => {
    const plan = planParticipantes({
      atuais: [],
      enviados: [{ funcao: 'PIC' }, { funcionario_id: 100 }],
      instrutorEfetivo: '100',
    });
    expect(plan.novosValidos).toEqual([{ funcionario_id: 100 }]);
    expect(plan.instrutorEntreParticipantes).toBe(true);
    expect(planParticipantes({ atuais: [], enviados: [{ funcionario_id: 100 }], instrutorEfetivo: null }).instrutorEntreParticipantes).toBe(false);
  });

  it('funcaoDoParticipante: PIC no primeiro, SIC nos demais, função explícita vence', () => {
    expect(funcaoDoParticipante({ funcionario_id: 1 }, 0)).toBe('PIC');
    expect(funcaoDoParticipante({ funcionario_id: 1 }, 2)).toBe('SIC');
    expect(funcaoDoParticipante({ funcionario_id: 1, funcao: 'OBS' }, 0)).toBe('OBS');
  });
});
