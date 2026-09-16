import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE = 'src/react-app/pages/simuladores/planejamento/PlanejamentoSimuladoresV3.tsx';
const ROUTE = 'worker-airtrust/src/routes/simuladores-planejamento-v2.ts';
const CREW_ROUTE = 'worker-airtrust/src/routes/simuladores-planejamento-v2-crew.ts';

function source(path: string) {
  return readFileSync(`${process.cwd()}/${path}`, 'utf8');
}

describe('simulator planning V3 priority, aircraft filter and report UX', () => {
  it('exposes a dynamic aircraft filter and sends it to proposal generation', () => {
    const page = source(PAGE);
    const route = source(ROUTE);
    expect(page).toContain('Todas as aeronaves');
    expect(page).toContain('config?.equipment_options');
    expect(page).toMatch(/JSON\.stringify\([\s\S]*?equipment,[\s\S]*?\)/);
    expect(route).toContain('equipment_options: equipmentOptions');
    expect(route).toContain('equipment_filter: equipmentFilter');
  });

  it('separates participant replacement from session/training replacement', () => {
    const page = source(PAGE);
    const crew = source(CREW_ROUTE);
    expect(page).toContain('Trocar participante');
    expect(page).toContain('Trocar sessão');
    expect(page).toContain('openSessionSwap');
    expect(page).toContain('role="dialog"');
    expect(page).toContain('aria-modal="true"');
    expect(page).toContain('fixed left-1/2 top-1/2');
    expect(crew).toContain("'/alternativas-sessao'");
    expect(crew).toContain('canManuallyShareSimulatorTrainingSessions');
  });

  it('surfaces recurring-over-semiannual coverage instead of presenting mixed curricula as neutral', () => {
    const page = source(PAGE);
    const route = source(ROUTE);
    expect(page).toContain('Periódico selecionado · atende também');
    expect(page).toContain('Periódico · também atende a obrigação Semestral');
    expect(page).not.toContain('Periódico prioritário · renova');
    expect(route).toContain('RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL');
    expect(route).toContain('satisfies_qualification_type_ids');
  });

  it('uses the canonical legacy-completion rule before promoting Semestral to Periódico', () => {
    const route = source(ROUTE);
    expect(route).toContain('AND data_conclusao IS NOT NULL');
    expect(route).toContain("AND date(data_conclusao) <= date('now')");
    expect(route).toContain(
      "'CONCLUIDA','CONCLUIDO','RENOVADA','VALIDA','VÁLIDA','VENCIDA','PROXIMA_VENCIMENTO','VENCENDO','VENCENDO_30'",
    );
    expect(route).toContain("OR TRIM(COALESCE(status,'')) = ''");
  });

  it('supports manual CAE windows, suggested dates, confirmed times and bulk calendar creation', () => {
    const page = source(PAGE);
    const crew = source(CREW_ROUTE);
    expect(page).toContain('Disponibilidade CAE e datas sugeridas');
    expect(page).toContain('Adicionar período');
    expect(page).toContain('/sugerir-datas');
    expect(page).toContain('/confirmar-horarios');
    expect(page).toContain('Criar todas as sessões no calendário');
    expect(page).toContain('/materializar');
    expect(page).toContain('Data sugerida');
    expect(crew).toContain("'/sugerir-datas'");
    expect(crew).toContain("'/confirmar-horarios'");
  });

  it('separates operational session identity from each participant obligation', () => {
    const page = source(PAGE);
    expect(page).toContain('Obrigação individual:');
    expect(page).toContain('{session.session_name} · {session.session_code}');
  });

  it('renders the PDF with visual hierarchy, status palettes and summary cards', () => {
    const page = source(PAGE);
    expect(page).toContain('doc.setFillColor(...navy)');
    expect(page).toContain('summaryCards');
    expect(page).toContain('statusPalette');
    expect(page).toContain('roundedRect');
    expect(page).toContain('Aeronaves:');
    expect(page).toContain('CRITÉRIO OPERACIONAL');
  });
});
