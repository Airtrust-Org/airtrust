/**
 * Testes de caracterização dos fluxos transacionais de Qualificacoes.tsx
 * e do modal ModalRenovarQualificacao.
 *
 * Estratégia: análise estática de string/regex para documentar e proteger
 * o contrato dos handlers antes da extração de useQualificacoesMutations.
 *
 * Cobre:
 * 1. Renovação de qualificação (ModalRenovarQualificacao — fetch + Bearer token)
 * 2. Confirmação de planejada (handleConfirmar — POST /confirmar)
 * 3. Reagendamento de planejada (handleReagendarPlanejada — PATCH /reagendar)
 * 4. Deleção (handleConfirmDelete — DELETE /historico/:id)
 * 5. Cancelamento de qualificação (handleCancelar — PATCH /cancelar)
 * 6. Content-Type e autenticação em todas as mutations
 * 7. Invalidação/refetch após sucesso
 * 8. Nenhuma mutation por mudança de view state (useQualificacoesFiltros isolado)
 * 9. Preservação de tenant/RBAC no frontend sem bypass
 * 10. Upload/deleção de certificados como callbacks locais
 */

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

const src = readFileSync('src/react-app/pages/Qualificacoes.tsx', 'utf-8');
const srcRenovar = readFileSync('src/react-app/components/modals/ModalRenovarQualificacao.tsx', 'utf-8');
const srcFiltros = readFileSync('src/react-app/pages/qualificacoes/hooks/useQualificacoesFiltros.ts', 'utf-8');
const srcMutationsHook = readFileSync(
  'src/react-app/pages/qualificacoes/hooks/useQualificacoesMutations.ts',
  'utf-8',
);

/** Extrai um trecho de `source` a partir da linha que contém `anchor` */
function chunkAfter(source: string, anchor: string, lines = 60): string {
  const idx = source.indexOf(anchor);
  if (idx < 0) return '';
  return source.slice(idx, idx + lines * 50);
}

describe('Qualificacoes mutations — caracterização de contrato', () => {

  // ─── 1. renovação (ModalRenovarQualificacao) ──────────────────────────────────
  describe('1. Renovação de qualificação (ModalRenovarQualificacao)', () => {
    it('usa método POST', () => {
      expect(srcRenovar).toMatch(/method:\s*['"]POST['"]/);
    });

    it('URL aponta para /historico/:id/renovar', () => {
      expect(srcRenovar).toMatch(/qualificacoes\/historico\/\$\{[^}]+\}\/renovar/);
    });

    it('Não altera data de validade — validade não é enviada no body', () => {
      expect(srcRenovar).not.toMatch(/nova_data_validade/);
    });

    it('Emite evento de módulo após renovação bem-sucedida', () => {
      expect(srcRenovar).toMatch(/emitirEventoModulo/);
    });

    it('Usa Bearer token dinâmico — getAccessToken()', () => {
      expect(srcRenovar).toMatch(/getAccessToken\(\)/);
      expect(srcRenovar).toMatch(/Authorization.*Bearer/);
    });

    it('Não altera status RENOVADA manualmente', () => {
      expect(srcRenovar).not.toMatch(/status\s*[:=]\s*['"]RENOVADA['"]/);
    });
  });

  // ─── 2. confirmar planejada ───────────────────────────────────────────────────
  describe('2. handleConfirmar (planejada → concluída)', () => {
    const chunk = chunkAfter(srcMutationsHook, 'const handleConfirmar = async (', 70);

    it('usa POST para confirmar', () => {
      expect(chunk).toMatch(/method:\s*['"]POST['"]/);
    });

    it('URL aponta para /confirmar', () => {
      expect(chunk).toMatch(/\/confirmar/);
    });

    it('envia campo renovar_anterior no body', () => {
      expect(chunk).toMatch(/renovar_anterior/);
    });

    it('não muda status diretamente', () => {
      expect(chunk).not.toMatch(/status\s*[:=]\s*['"]CONCLUIDA['"]/);
    });

    it('refetcha/invalida após sucesso', () => {
      expect(chunk).toMatch(/carregarHistorico|recarregar|invalidateQueries|refetch/);
    });
  });

  // ─── 3. reagendar planejada ───────────────────────────────────────────────────
  describe('3. handleReagendarPlanejada', () => {
    const chunk = chunkAfter(srcMutationsHook, 'const handleReagendarPlanejada = async (', 70);

    it('usa PATCH', () => {
      expect(chunk).toMatch(/method:\s*['"]PATCH['"]/);
    });

    it('URL aponta para /reagendar', () => {
      expect(chunk).toMatch(/\/reagendar/);
    });

    it('envia nova_data_planejada no body', () => {
      expect(chunk).toMatch(/nova_data_planejada/);
    });

    it('não altera status para PLANEJADA manualmente', () => {
      expect(chunk).not.toMatch(/status\s*[:=]\s*['"]PLANEJADA['"]/);
    });

    it('mostra toast de erro quando API retorna não-ok', () => {
      expect(chunk).toMatch(/showToast\.error/);
    });

    it('refetcha/invalida após sucesso', () => {
      expect(chunk).toMatch(/carregarHistorico|recarregar|emitirEvento|invalidateQueries|refetch/);
    });
  });

  // ─── 4. deleção ──────────────────────────────────────────────────────────────
  describe('4. handleConfirmDelete', () => {
    const componentChunk = chunkAfter(src, 'const handleConfirmDelete = async () => {', 30);
    const hookChunk = chunkAfter(srcMutationsHook, 'const handleConfirmDeleteMutation = async (', 90);

    it('mantém a guarda para item ausente ou id inválido na mutation', () => {
      expect(hookChunk).toMatch(/!item\s*\|\|\s*item\.id\s*<=\s*0/);
    });

    it('o componente delega a deleção para a mutation e mantém o modal local', () => {
      expect(componentChunk).toMatch(/handleConfirmDeleteMutation\(item\)/);
      expect(componentChunk).toMatch(/setShowConfirmDelete\(null\)/);
    });

    it('usa DELETE', () => {
      expect(hookChunk).toMatch(/method:\s*['"]DELETE['"]/);
    });

    it('URL aponta para /qualificacoes/historico/:id', () => {
      expect(hookChunk).toMatch(/qualificacoes\/historico/);
    });

    it('mostra toast de sucesso após deletar', () => {
      expect(hookChunk).toMatch(/showToast\.success/);
    });

    it('refetcha/invalida após sucesso', () => {
      expect(hookChunk).toMatch(/carregarHistorico|recarregar|invalidateQueries|refetch/);
    });
  });

  // ─── 5. cancelamento ─────────────────────────────────────────────────────────
  describe('5. handleCancelar', () => {
    const chunk = chunkAfter(srcMutationsHook, 'const handleCancelar = async (', 70);

    it('usa PATCH (conforme código real)', () => {
      expect(chunk).toMatch(/method:\s*['"]PATCH['"]/);
    });

    it('URL aponta para /cancelar', () => {
      expect(chunk).toMatch(/\/cancelar/);
    });

    it('refetcha/invalida após sucesso', () => {
      expect(chunk).toMatch(/recarregarHistoricoEStats|carregarHistorico|invalidateQueries|refetch/);
    });

    it('mostra toast de sucesso após cancelar', () => {
      expect(chunk).toMatch(/showToast\.success/);
    });
  });

  // ─── 6. headers e autenticação ───────────────────────────────────────────────
  describe('6. Headers e autenticação', () => {
    it('mutations em Qualificacoes.tsx enviam Content-Type application/json', () => {
      const count =
        (src.match(/'Content-Type':\s*'application\/json'/g) || []).length +
        (srcMutationsHook.match(/'Content-Type':\s*'application\/json'/g) || []).length;
      expect(count).toBeGreaterThanOrEqual(4);
    });

    it('mutations usam fetchWithAuth (não fetch puro)', () => {
      expect(srcMutationsHook).toMatch(/fetchWithAuth\(/);
    });

    it('ModalRenovarQualificacao usa fetch + Bearer token para renovação', () => {
      expect(srcRenovar).toMatch(/Authorization.*Bearer/);
    });
  });

  // ─── 7. invalidação / refetch ─────────────────────────────────────────────────
  describe('7. Invalidação e refetch após mutations', () => {
    it('emite eventos moduloBus em mutations principais', () => {
      const qualCount =
        (src.match(/emitirEventoModulo\(/g) || []).length +
        (srcMutationsHook.match(/emitirEventoModulo\(/g) || []).length;
      const renovarCount = (srcRenovar.match(/emitirEventoModulo\(/g) || []).length;
      expect(qualCount + renovarCount).toBeGreaterThanOrEqual(4);
    });

    it('carregarHistorico/recarregar é chamado após mutations para refetch', () => {
      const count =
        (src.match(/carregarHistorico\(\)|recarregarHistoricoEStats\(\)/g) || []).length +
        (srcMutationsHook.match(/carregarHistorico\(\)|recarregarHistoricoEStats\(\)/g) || [])
          .length;
      expect(count).toBeGreaterThanOrEqual(4);
    });
  });

  // ─── 8. nenhuma mutation por filtros ──────────────────────────────────────────
  describe('8. View state não dispara mutations', () => {
    it('useQualificacoesFiltros não importa fetchWithAuth', () => {
      expect(srcFiltros).not.toMatch(/fetchWithAuth/);
      expect(srcFiltros).not.toMatch(/apiFetch/);
    });

    it('useQualificacoesFiltros não tem chamadas de rede', () => {
      expect(srcFiltros).not.toMatch(/\bfetch\(/);
    });

    it('useQualificacoesFiltros gerencia apenas useState/useEffect/localStorage', () => {
      expect(srcFiltros).toMatch(/useState/);
      expect(srcFiltros).toMatch(/localStorage|writeUserPreference/);
    });
  });

  // ─── 9. preservação de tenant / RBAC ─────────────────────────────────────────
  describe('9. Preservação de tenant e RBAC', () => {
    it('useAuth presente no componente principal', () => {
      expect(src).toMatch(/useAuth\(\)/);
    });

    it('RBAC verificado na UI (role/permissões)', () => {
      expect(src).toMatch(/role|permission|ADMINISTRADOR/);
    });

    it('useQualificacoesFiltros não tem lógica de RBAC (isolamento correto)', () => {
      expect(srcFiltros).not.toMatch(/useAuth/);
      expect(srcFiltros).not.toMatch(/ADMINISTRADOR/);
      expect(srcFiltros).not.toMatch(/permission/);
    });

    it('empresa_id não é hardcoded = 1 nas mutations', () => {
      expect(src).not.toMatch(/empresa_id\s*=\s*1[^0-9]/);
    });

    it('getAccessToken() usado dinamicamente (não token hardcoded)', () => {
      expect(srcRenovar).toMatch(/getAccessToken\(\)/);
    });
  });

  // ─── 10. upload / deleção de certificados ──────────────────────────────────────
  describe('10. Certificados (callbacks locais)', () => {
    it('handleCertificadosUploadSuccess não faz fetch diretamente', () => {
      const chunk = chunkAfter(src, 'handleCertificadosUploadSuccess', 25);
      expect(chunk.length).toBeGreaterThan(0);
      expect(chunk).not.toMatch(/fetchWithAuth\(/);
    });

    it('handleCertificadosDeleteSuccess não faz fetch diretamente', () => {
      const chunk = chunkAfter(src, 'handleCertificadosDeleteSuccess', 25);
      expect(chunk.length).toBeGreaterThan(0);
      expect(chunk).not.toMatch(/fetchWithAuth\(/);
    });
  });
});
