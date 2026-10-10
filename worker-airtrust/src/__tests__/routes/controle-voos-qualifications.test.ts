import { describe, expect, it } from 'vitest';
import { summarizeFlightQualifications } from '../../routes/controle-voos-qualifications';

function item(input: Partial<{
  funcionario_id: number; registro_id: number; codigo: string;
  nome: string; data_conclusao: string; data_vencimento: string | null;
}> = {}) {
  return {
    funcionario_id: input.funcionario_id ?? 10,
    registro_id: input.registro_id ?? 1,
    codigo: input.codigo ?? 'CURSO_A',
    nome: input.nome ?? 'Curso A',
    data_conclusao: input.data_conclusao ?? '2026-09-01',
    data_vencimento: input.data_vencimento === undefined ? '2026-10-01' : input.data_vencimento,
  };
}
describe('qualificações da tripulação por voo', () => {
  it('marca vencidas e nunca afirma que registros ausentes são qualificações válidas', () => {
    const result = summarizeFlightQualifications([10, 20], [item()], '2026-10-10');
    expect(result[0]).toMatchObject({
      total_registros_atuais: 1, vencidas: 1, validas: 0,
      avisos: [{ codigo: 'CURSO_A', status: 'VENCIDA', vencimento: '2026-10-01' }],
    });
    expect(result[1]).toMatchObject({ total_registros_atuais: 0, validas: 0, vencidas: 0 });
  });

  it('prefere a última realização e não informa vencimento antigo após renovação', () => {
    const rows = [
      item({ registro_id: 8, data_conclusao: '2026-09-20', data_vencimento: '2027-09-20' }),
      item({ registro_id: 4, data_conclusao: '2025-09-20', data_vencimento: '2026-09-20' }),
      item({ registro_id: 9, codigo: 'FUTURO', data_conclusao: '2026-11-01', data_vencimento: '2027-11-01' }),
      item({ registro_id: 11, funcionario_id: 999, codigo: 'OUTRO', data_vencimento: '2025-01-01' }),
    ];
    const result = summarizeFlightQualifications([10], rows, '2026-10-10');
    expect(result).toMatchObject([{ total_registros_atuais: 1, validas: 1, vencidas: 0 }]);
  });

  it('mostra vencimento até 30 dias e ausência de data como pendência informativa', () => {
    const rows = [
      item({ registro_id: 2, codigo: 'A', data_vencimento: '2026-11-09' }),
      item({ registro_id: 3, codigo: 'B', data_vencimento: null }),
    ];
    const result = summarizeFlightQualifications([10], rows, '2026-10-10')[0];
    expect(result).toMatchObject({ validas: 0, vencendo: 1, vencidas: 0, sem_validade: 1 });
    expect(result.avisos.map((a) => a.status)).toEqual(['VENCENDO', 'SEM_VALIDADE']);
  });
});
