import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const caderneta = read('src/react-app/pages/funcionarios/CadernetaHorasVoo.tsx');
const history = read('src/react-app/pages/funcionarios/PilotFlightHistory.tsx');
const meusVoos = read('src/react-app/pages/controle-voos/ControleVoosMeusVoos.tsx');
const rdvDetalhe = read('src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx');
const trechoCard = read(
  'src/react-app/pages/controle-voos/components/ControleVoosRdvTrechoCard.tsx',
);
const pilotIndex = read('public/pilot/index.html');
const pilotApp = read('public/pilot/pilot-app.js');
const workflowRoute = read('worker-airtrust/src/routes/controle-voos-rdv-workflow.ts');
const logbookService = read('worker-airtrust/src/services/controle-voos/pilot-logbook.ts');

describe('Pilot Logbook x RDV - contrato de lançamento único', () => {
  it('mantem a caderneta administrativa legada sem usa-la como formulario paralelo do piloto', () => {
    expect(caderneta).toContain('ModalLancamentoHorasVoo');
    expect(history).not.toContain('useCreateLancamentoHorasVoo');
    expect(history).not.toContain('ModalLancamentoHorasVoo');
  });

  it('apresenta ao piloto uma unica entrada pelo Pilot App', () => {
    expect(meusVoos).toContain('Abrir Pilot App');
    expect(meusVoos).toContain('/pilot/?flight=${voo.id}');
    expect(meusVoos).not.toContain('Preencher voo');
    expect(meusVoos).toContain('Criar meu voo');
    expect(meusVoos).toContain('mode="pilot"');
    expect(meusVoos).not.toContain('Meu RDV');
    expect(rdvDetalhe).toContain('window.location.replace(`/pilot/?flight=${encodeURIComponent(id)}`)');
    expect(pilotIndex).toContain('Voltar ao AirTrust');
    expect(pilotIndex).toContain('href="/controle-voos/meus-voos"');
    expect(pilotIndex).toContain('Lançamento do voo');
    expect(pilotApp).toContain('Enviar este lançamento para revisão da Coordenação?');
  });

  it('mantem Meus voos responsivo e o Pilot App com trechos em abas', () => {
    expect(meusVoos).toContain('data-testid="meus-voos-mobile-list"');
    expect(meusVoos).toContain('lg:hidden');
    expect(meusVoos).toContain('hidden overflow-hidden');
    expect(meusVoos).toContain('type="date"');
    expect(meusVoos).toContain('filteredVoos');
    expect(pilotApp).toContain("className = 'stage-tabs'");
    expect(trechoCard).not.toContain('#{trecho.id}');
  });

  it('oferece uma visualizacao de transcricao do diario sem criar formulario paralelo', () => {
    expect(pilotIndex).toContain('Diário de bordo — dados para transcrição');
    expect(pilotIndex).toContain('id="open-logbook-helper"');
    expect(pilotIndex).toContain('id="toggle-logbook-copy-mode"');
    expect(pilotApp).toContain('function renderLogbookHelper()');
    expect(pilotApp).toContain("stagesHeading.textContent = 'Etapas — copie da esquerda para a direita'");
    expect(pilotApp).toContain("['PARTIDA', toInputTime(fields.horario_motor_ligado)]");
    expect(pilotApp).toContain("['DECOLAGEM', toInputTime(fields.horario_decolagem)]");
    expect(pilotApp).toContain("['POUSO', toInputTime(fields.horario_pouso)]");
    expect(pilotApp).toContain("['CORTE', toInputTime(fields.horario_motor_desligado)]");
    expect(pilotApp).toContain("['COMB. INICIAL'");
    expect(pilotApp).toContain("['COMB. FINAL'");
    expect(pilotApp).toContain("['Nº de série', aircraft.numero_serie, 'Não cadastrado no AirTrust']");
    expect(pilotApp).not.toContain('logbookDraft');
  });

  it('gera o historico operacional somente de RDV finalizado e no escopo do tripulante', () => {
    expect(history).toContain('Não existe lançamento manual paralelo para o piloto');
    expect(workflowRoute).toContain("'/pilot/logbook'");
    expect(workflowRoute).toContain('getFuncionarioIdForUser');
    expect(logbookService).toContain("r.workflow_status = 'finalizado'");
    expect(logbookService).toContain("r.status = 'preenchimento_finalizado'");
    expect(logbookService).toContain('t.funcionario_id = ?');
    expect(logbookService).toContain('r.empresa_id = ?');
  });

  it('nao atribui pouso individual sem evidencia de quem executou o pouso', () => {
    expect(history).toContain('Pousos ainda não são creditados automaticamente');
    expect(logbookService).toContain("landing_credit: 'NAO_ATRIBUIDO'");
  });
});
