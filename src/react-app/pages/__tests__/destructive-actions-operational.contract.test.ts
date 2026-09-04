import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const evd = readFileSync('src/react-app/pages/escalas/EvdPage.tsx', 'utf8');
const licencas = readFileSync('src/react-app/pages/LicencasPage.tsx', 'utf8');
const certificacoes = readFileSync('src/react-app/pages/Certificacoes.tsx', 'utf8');
const hospedagem = readFileSync('src/react-app/pages/HospedagemPage.tsx', 'utf8');

function section(source: string, start: string, end: string) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  expect(first, `start marker not found: ${start}`).toBeGreaterThanOrEqual(0);
  expect(last, `end marker not found: ${end}`).toBeGreaterThan(first);
  return source.slice(first, last);
}

describe('P0 destructive actions on operational runtime pages', () => {
  it.each([
    ['EVD', evd, 'Excluir voo'],
    ['licenças', licencas, 'Excluir licença'],
    ['certificações', certificacoes, 'Excluir certificação'],
    ['hospedagem', hospedagem, 'Remover hospedagem'],
  ])('%s only exposes its destructive action through RowActionsMenu', (_, source, label) => {
    expect(source).toContain("import RowActionsMenu");
    expect(source).toContain('<RowActionsMenu');
    expect(source).toContain(`label: '${label}'`);
    expect(source).toContain('destructive: true');
  });

  it('EVD opens a confirmation and makes no DELETE mutation when it is cancelled', () => {
    const handler = section(evd, 'async function handleDelete', 'async function handlePublish');
    expect(handler).toContain('await confirmDialog');
    expect(handler).toContain('if (!confirmed) return;');
    expect(handler).toContain('deleteMutation.mutate(voo.id)');
  });

  it.each([
    ['licenças', licencas, "await confirmDialog('Confirma exclusão desta licença?')", "apiClient.delete<{ success?: boolean; error?: string }>(`/licencas/${id}`)"],
    ['certificações', certificacoes, 'await confirmDialog(', "apiFetch(`/api/qualificacoes/historico/${certificacaoId}`, {"],
    ['hospedagem', hospedagem, 'await confirmDialog(', 'fetch(`${API_BASE_URL}/hospedagem/${h.id}`, {'],
  ])('%s keeps its existing confirmation before the mutation', (_, source, confirmation, mutation) => {
    const start = source.indexOf(confirmation);
    const end = source.indexOf(mutation, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(source.slice(start, end)).toContain('return;');
  });

  it('loads certificações from the same canonical historico resource used by DELETE', () => {
    expect(certificacoes).toContain(
      '`/api/qualificacoes/historico?page=${page}&limit=${limit}&stats=true`',
    );
    expect(certificacoes).toContain('row.tipo_nome || row.tipo');
    expect(certificacoes).toContain('pagination.pages');
    expect(certificacoes).not.toContain('/api/qualificacoes?page=');
  });

  it('preserves the active DELETE endpoint and method for every surface', () => {
    expect(evd).toContain("apiFetch(`/api/evd/${id}`, { method: 'DELETE'");
    expect(licencas).toContain("apiClient.delete<{ success?: boolean; error?: string }>(`/licencas/${id}`)");
    expect(certificacoes).toContain("apiFetch(`/api/qualificacoes/historico/${certificacaoId}`, {");
    expect(certificacoes).toContain("method: 'DELETE'");
    expect(hospedagem).toContain('fetch(`${API_BASE_URL}/hospedagem/${h.id}`, {');
    expect(hospedagem).toContain("method: 'DELETE'");
  });

  it('keeps EVD affordance gated by the existing operational role check', () => {
    expect(evd).toContain('canManageEscalaOperations(user?.role)');
    expect(evd).toContain("podeGerenciarOperacoes && voo.status === 'RASCUNHO'");
  });
});
