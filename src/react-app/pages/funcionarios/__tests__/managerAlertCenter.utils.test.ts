import { describe, expect, it } from 'vitest';
import { buildManagerAlerts, sanitizeInternalHref } from '../managerAlertCenter.utils';

describe('managerAlertCenter.utils', () => {
  it('prioriza SGSO crítico acima de atenção de simuladores', () => {
    const alerts = buildManagerAlerts({
      todayLabel: '21/06/2026',
      enableFrms: false,
      enableQualificacoes: false,
      enableLms: false,
      enableSgso: true,
      enableSimuladores: true,
      sgsoChecklist: {
        checklist: [
          {
            codigo: 'RBAC121_MITIGACOES',
            referencia: 'RBAC 121 / CAPA em prazo',
            status: 'NAO_CONFORME',
            valor: 2,
            detalhe: 'Ações corretivas/preventivas vencidas',
          },
        ],
        resumo: { ok: 0, atencao: 0, nao_conforme: 1 },
      },
      simuladoresAlerts: {
        fichas_pendentes_avaliacao: 3,
        fichas_aguardando_assinatura_aluno: 0,
        fichas_aguardando_assinatura_instrutor: 0,
        fichas_aguardando_assinatura: 0,
        sessoes_proximas_sem_ficha_completa: 0,
        edicoes_pendentes: 0,
        janela_sessoes_proximas_horas: 24,
      },
    });

    expect(alerts[0]).toMatchObject({
      module: 'SGSO',
      severity: 'CRITICO',
    });
    expect(alerts[1]).toMatchObject({
      module: 'SIMULADORES',
      severity: 'ATENCAO',
    });
  });

  it('mantem sessão próxima com ficha incompleta em atenção, não crítico', () => {
    const alerts = buildManagerAlerts({
      todayLabel: '21/06/2026',
      enableFrms: false,
      enableQualificacoes: false,
      enableLms: false,
      enableSgso: false,
      enableSimuladores: true,
      simuladoresAlerts: {
        fichas_pendentes_avaliacao: 0,
        fichas_aguardando_assinatura_aluno: 0,
        fichas_aguardando_assinatura_instrutor: 0,
        fichas_aguardando_assinatura: 0,
        sessoes_proximas_sem_ficha_completa: 2,
        edicoes_pendentes: 0,
        janela_sessoes_proximas_horas: 24,
      },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: 'simuladores-sessoes-incompletas',
      severity: 'ATENCAO',
    });
  });

  it('ordena FRMS crítico acima de SGSO e simuladores', () => {
    const alerts = buildManagerAlerts({
      todayLabel: '21/06/2026',
      enableFrms: true,
      enableQualificacoes: false,
      enableLms: false,
      enableSgso: true,
      enableSimuladores: true,
      frmsAlerts: [{ id: 'fr-1', tripulante_id: '1', nivel: 'CRITICO' }],
      sgsoChecklist: {
        checklist: [
          {
            codigo: 'RBAC121_RELATOS_TRIAGEM',
            referencia: 'RBAC 121 / SGSO - triagem tempestiva',
            status: 'NAO_CONFORME',
            valor: 1,
            detalhe: 'Relatos em triagem fora do SLA',
          },
        ],
        resumo: { ok: 0, atencao: 0, nao_conforme: 1 },
      },
      simuladoresAlerts: {
        fichas_pendentes_avaliacao: 1,
        fichas_aguardando_assinatura_aluno: 0,
        fichas_aguardando_assinatura_instrutor: 0,
        fichas_aguardando_assinatura: 0,
        sessoes_proximas_sem_ficha_completa: 0,
        edicoes_pendentes: 0,
        janela_sessoes_proximas_horas: 24,
      },
    });

    expect(alerts.map((item) => item.id)).toEqual([
      'frms-critical',
      'sgso-rbac121_relatos_triagem',
      'simuladores-avaliacao-pendente',
    ]);
  });

  it('sanitiza links externos para fallback interno', () => {
    expect(sanitizeInternalHref('https://externo.exemplo', '/lms/dashboard')).toBe(
      '/lms/dashboard',
    );
    expect(sanitizeInternalHref('/sgso/frat', '/lms/dashboard')).toBe('/sgso/frat');
    expect(sanitizeInternalHref('/\\evil.example', '/lms/dashboard')).toBe('/lms/dashboard');
  });
});
