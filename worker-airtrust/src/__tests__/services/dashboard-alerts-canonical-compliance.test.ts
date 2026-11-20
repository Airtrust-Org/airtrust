import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/qualificacoes-alerta-config', () => ({
  getQualificacoesAlertaDias: vi.fn(async () => 30),
  getTodayIsoSaoPaulo: vi.fn(() => '2026-11-20'),
  getQualificacoesVencimentoExpr: vi.fn(() => 'qh.data_vencimento'),
}));
vi.mock('../../services/training-compliance-snapshot-builder', () => ({
  buildSnapshot: vi.fn(),
}));

import { buildSnapshot } from '../../services/training-compliance-snapshot-builder';
import { getDashboardAlerts } from '../../services/dashboardService';

function emptyQualificationDb(): D1Database {
  return {
    prepare: (sql: string) => {
      if (sql.includes('FROM requisitos_compliance')) {
        throw new Error('Consulta legada não pode alimentar alertas do Dashboard');
      }
      return { bind: (..._args: unknown[]) => ({ all: async () => ({ results: [] }) }) };
    },
  } as unknown as D1Database;
}

describe('F-06 — alertas do Dashboard usam requisitos canônicos', () => {
  it('exibe somente obrigações EAD efetivas e pendentes, com escopo correto', async () => {
    vi.mocked(buildSnapshot).mockResolvedValueOnce({
      people: [
        { id: 42, nome: 'Pessoa Teste', matricula: 'T-42', requisitos: [
          { qualificacao_tipo_id: 12, qualificacao_tipo_nome: 'Treinamento obrigatório',
            obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1,
            status_compliance: 'NAO_REALIZADO', evidencia_pendente_motivo: null },
          { qualificacao_tipo_id: 13, qualificacao_tipo_nome: 'Treinamento válido',
            obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1,
            status_compliance: 'CONFORME' },
          { qualificacao_tipo_id: 14, qualificacao_tipo_nome: 'Presencial',
            obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 0,
            status_compliance: 'NAO_REALIZADO' },
          { qualificacao_tipo_id: 15, qualificacao_tipo_nome: 'Exceção',
            obrigatoriedade: 'NAO_APLICA', auto_matricular_ead: 1,
            status_compliance: 'NAO_REALIZADO' },
        ] },
        { id: 43, nome: 'Pessoa 2', matricula: null, requisitos: [
          { qualificacao_tipo_id: 16, qualificacao_tipo_nome: 'Curso com histórico excluído',
            obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1,
            status_compliance: 'NAO_REALIZADO',
            evidencia_pendente_motivo: 'QUALIFICACAO_AUSENTE' },
        ] },
      ],
      employees: [], rules: [],
    } as unknown as Awaited<ReturnType<typeof buildSnapshot>>);

    const access = { mode: 'all' as const, setorIds: [] as [], funcionarioId: null };
    const rows = await getDashboardAlerts(emptyQualificationDb(), 6, access);
    expect(buildSnapshot).toHaveBeenCalledWith(
      expect.anything(), 6, access, undefined, { coalesce: true },
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.tripulanteId)).toEqual([43, 42]);
    expect(rows[1].mensagem).toContain('Treinamento obrigatório');
    expect(rows[0].mensagem).toContain('conclusão sem qualificação vinculada');
    expect(rows.every((r) => r.urlAcao === '/treinamentos/compliance')).toBe(true);
    const code = readFileSync(decodeURIComponent(new URL('../../services/dashboardService.ts', import.meta.url).pathname), 'utf8');
    expect(code.slice(code.indexOf('export async function getDashboardAlerts('),
      code.indexOf('export interface QualificationComplianceSummary'))).not.toContain('FROM requisitos_compliance');
  });

  it('não retorna lista limpa quando o motor canônico falha', async () => {
    vi.mocked(buildSnapshot).mockRejectedValueOnce(new Error('D1 indisponível'));
    await expect(getDashboardAlerts(emptyQualificationDb(), 6)).rejects.toThrow('D1 indisponível');
  });
});
