import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const caderneta = read('src/react-app/pages/funcionarios/CadernetaHorasVoo.tsx');
const history = read('src/react-app/pages/funcionarios/PilotFlightHistory.tsx');
const meusVoos = read('src/react-app/pages/controle-voos/ControleVoosMeusVoos.tsx');
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

  it('apresenta ao piloto um unico lançamento do voo em vez de um segundo formulario RDV', () => {
    expect(meusVoos).toContain('Lançamento do voo');
    expect(meusVoos).not.toContain('Meu RDV');
    expect(pilotIndex).toContain('Lançamento do voo');
    expect(pilotIndex).not.toContain('Etapas / RDV');
    expect(pilotIndex).not.toContain('Resumo automático do RDV');
    expect(pilotApp).toContain('Enviar este lançamento para revisão da Coordenação?');
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
