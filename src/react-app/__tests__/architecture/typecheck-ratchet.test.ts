import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ratchet for `npm run typecheck` (tsc -p tsconfig.app.json).
 *
 * Before 2026-07-15 the root "typecheck" script was `tsc --noEmit` with no
 * `-p`, which silently checked zero files (the root tsconfig.json is a
 * `references`-only solution file that plain `tsc --noEmit` does not follow).
 * Pointing it at tsconfig.app.json made it real and immediately surfaced 344
 * pre-existing errors across 115 files — too much to fix in one pass safely.
 * This test freezes that baseline so it can only shrink, never grow silently:
 * new files with errors, or existing files exceeding their baseline count,
 * fail CI. Fixing a file's errors to zero requires removing its entry below.
 *
 * 2026-07-16 (Ciclo 2 — fundação de tipos): fixed the true root causes behind
 * every error in usePermissions.ts, UsuariosPage.tsx, ManagerAlertCenter.tsx,
 * PermissoesPage.tsx, CardMeusEAD.tsx, lmsService.ts and PDFSystem.tsx
 * (auth/RBAC/tenant contracts and untyped `res.json<T>()` API boundary
 * calls). Those seven files now typecheck clean and were removed from the
 * baseline below, dropping the total from 344 to 318 errors.
 *
 * 2026-07-16 (Ciclo 3 — FRMS/Controle de Voos): fixed root causes in
 * FrmsDayExplanationPanel.tsx (non-generic `useFrmsMutation` silently
 * dropping the mutation response type), FrmsFadigaHistorico.tsx (unsafe
 * `null` casts when narrowing the API envelope) and
 * ControleVoosRdvDetalhe.tsx (`String.prototype.replaceAll`, unavailable
 * under the configured `lib` target). Dropped the total from 318 to 310.
 *
 * 2026-08-02 (Frente 6 — build metadata boundary): normalized the absent
 * VersionBadge query timestamp from `undefined` to its existing `null`
 * contract, dropping the baseline from 310 to 309 errors.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

const BASELINE_ERROR_COUNTS: Record<string, number> = {
  'src/lib/sw-manager.tsx': 1,
  'src/react-app/components/FuncionarioCard.tsx': 5,
  'src/react-app/components/HomeRouter.tsx': 1,
  'src/react-app/components/OptimizedMainSidebar.tsx': 2,
  'src/react-app/components/admin/FuncoesManagement.tsx': 4,
  'src/react-app/components/dashboard/AlertWidget.tsx': 2,
  'src/react-app/components/dashboard/EnhancedMetricCard.tsx': 2,
  'src/react-app/components/forms/AgendamentoForm.tsx': 1,
  'src/react-app/components/funcionarios/FuncionarioForm.tsx': 4,
  'src/react-app/components/funcionarios/FuncionarioList.tsx': 1,
  'src/react-app/components/layout/Header.tsx': 4,
  'src/react-app/components/modals/ModalAtribuirQualificacao.tsx': 1,
  'src/react-app/components/modals/ModalCertificado.tsx': 3,
  'src/react-app/components/modals/ModalNovaSessao.tsx': 4,
  'src/react-app/components/modals/SharedSessionForm.tsx': 2,
  'src/react-app/components/modals/index.ts': 2,
  'src/react-app/components/qualificacoes/ModalCertificados.tsx': 3,
  'src/react-app/components/shared/WizardModal.tsx': 1,
  'src/react-app/components/shared/index.ts': 5,
  'src/react-app/components/simuladores/AvaliacaoManobras.tsx': 2,
  'src/react-app/components/simuladores/ParticipantsEditor.tsx': 1,
  'src/react-app/config/deployment.ts': 2,
  'src/react-app/hooks/qualificacoes/useFuncionariosAtivos.ts': 6,
  'src/react-app/hooks/qualificacoes/useHistoricoQualificacoes.ts': 4,
  'src/react-app/hooks/qualificacoes/useTiposQualificacao.ts': 6,
  'src/react-app/hooks/useDataLayer.ts': 1,
  'src/react-app/hooks/useFormValidation.ts': 2,
  'src/react-app/hooks/useQualificacoesExt.ts': 1,
  'src/react-app/hooks/useSimuladores.ts': 5,
  'src/react-app/hooks/useTreinamentosPlanejados.ts': 3,
  'src/react-app/pages/Aeronaves.tsx': 16,
  'src/react-app/pages/AvaliarFicha.tsx': 2,
  'src/react-app/pages/Certificacoes.tsx': 1,
  'src/react-app/pages/Configuracoes/Backup.tsx': 2,
  'src/react-app/pages/Configuracoes/Importacao.tsx': 1,
  'src/react-app/pages/Configuracoes/Usuarios.tsx': 1,
  'src/react-app/pages/DashboardNew.tsx': 4,
  'src/react-app/pages/FichaFuncionarioPage.tsx': 3,
  'src/react-app/pages/Funcionarios.tsx': 1,
  'src/react-app/pages/LoginSimple.tsx': 2,
  'src/react-app/pages/Qualificacoes.tsx': 8,
  'src/react-app/pages/ReclassificacaoQualificacoes.tsx': 5,
  'src/react-app/pages/TreinamentosPlanejadosPage.tsx': 1,
  'src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx': 3,
  'src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx': 1,
  'src/react-app/pages/escalas/EscalaPageContext.tsx': 2,
  'src/react-app/pages/escalas/MinhaEscalaPage.tsx': 2,
  'src/react-app/pages/escalas/components/EscalaCalendario/DayCell.tsx': 3,
  'src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx': 6,
  'src/react-app/pages/escalas/components/EscalaCalendario/LinhaSituacao.tsx': 2,
  'src/react-app/pages/escalas/components/Modais/ModalAdicionarEvento.tsx': 1,
  'src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx': 4,
  'src/react-app/pages/escalas/components/Modais/ModalDetalhesEvento.tsx': 2,
  'src/react-app/pages/escalas/components/Modais/ModalExportarEscalaPdf.tsx': 1,
  'src/react-app/pages/escalas/components/Modais/ModalFeriasAfastamentoGlobal.tsx': 2,
  'src/react-app/pages/escalas/components/Modais/tripulacao-utils.ts': 1,
  'src/react-app/pages/escalas/hooks/queries/escalas-infra.ts': 1,
  'src/react-app/pages/escalas/hooks/queries/useEscalaQuery.ts': 3,
  'src/react-app/pages/escalas/quinzena-tokens.ts': 2,
  'src/react-app/pages/escalas/utils/dayCellState.ts': 4,
  'src/react-app/pages/escalas/utils/exportarEscalaPDF.ts': 2,
  'src/react-app/pages/escalas/views/EscalasDetalheView.tsx': 2,
  'src/react-app/pages/frms/FrmsCheckinFadiga.tsx': 1,
  'src/react-app/pages/frms/FrmsControleOperacional.tsx': 6,
  'src/react-app/pages/frms/FrmsFadigaAcumulada.tsx': 1,
  'src/react-app/pages/frms/FrmsFichaTripulante.tsx': 5,
  'src/react-app/pages/frms/firaUploadFallback.ts': 3,
  'src/react-app/pages/funcionarios/FuncionariosDashboard.tsx': 1,
  'src/react-app/pages/funcionarios/FuncionariosWrapper.tsx': 1,
  'src/react-app/pages/funcionarios/ListaDocumentos.tsx': 3,
  'src/react-app/pages/funcionarios/ModalFuncionario.tsx': 3,
  'src/react-app/pages/funcionarios/PerfilFuncionario.tsx': 1,
  'src/react-app/pages/lms/LmsCatalogo.tsx': 3,
  'src/react-app/pages/lms/LmsMatriculas.tsx': 1,
  'src/react-app/pages/lms/LmsPlayer.tsx': 1,
  'src/react-app/pages/lms/LmsPlayerH5p.tsx': 3,
  'src/react-app/pages/lms/LmsPreviewPlayer.tsx': 3,
  'src/react-app/pages/lms/LmsRelatorios.tsx': 1,
  'src/react-app/pages/mro/data/mroMockData.ts': 7,
  'src/react-app/pages/qualificacoes/Dashboard.tsx': 1,
  'src/react-app/pages/qualificacoes/DashboardGraficos.tsx': 14,
  'src/react-app/pages/qualificacoes/FormularioQualificacao.tsx': 2,
  'src/react-app/pages/qualificacoes/components/QualificacoesFilters.tsx': 3,
  'src/react-app/pages/qualificacoes/hooks/useQualificacoesFiltros.ts': 1,
  'src/react-app/pages/qualificacoes/hooks/useQualificacoesMutations.ts': 1,
  'src/react-app/pages/simuladores/agenda/CalendarioAgendamentos.tsx': 2,
  'src/react-app/pages/simuladores/cadastros/categorias/index.tsx': 3,
  'src/react-app/pages/simuladores/cadastros/configuracoes/index.tsx': 5,
  'src/react-app/pages/simuladores/cadastros/manobras/index.tsx': 4,
  'src/react-app/pages/simuladores/cadastros/modelos-sessao/index.tsx': 13,
  'src/react-app/pages/simuladores/cadastros/tipos-sessao/index.tsx': 3,
  'src/react-app/pages/simuladores/relatorios/index.tsx': 3,
  'src/react-app/pages/simuladores/sessoes/[id]/editar-modelo.tsx': 7,
  'src/react-app/pages/simuladores/sessoes/[id]/executar.tsx': 1,
  'src/react-app/pages/simuladores/sessoes/components/FormularioSessao.tsx': 2,
  'src/react-app/pages/simuladores/tabs/TabGestaoWrapper.tsx': 6,
  'src/react-app/services/agendamentos.service.ts': 8,
  'src/react-app/services/funcionarios.service.ts': 6,
  'src/react-app/services/index.ts': 1,
  'src/react-app/services/pdf-ficha-client.ts': 1,
  'src/react-app/styles/DESIGN_SYSTEM_GUIDE.tsx': 1,
  'src/react-app/utils/api-cache.ts': 1,
  'src/react-app/utils/e2e-test.ts': 1,
  'src/react-app/utils/timezone.ts': 2,
  'src/shared/types.ts': 1,
};

function runTypecheck(): string {
  // Invoke the local tsc binary directly rather than through `npx`, which adds
  // package-resolution overhead that made this test time out on CI hardware.
  const tscBin = join(repoRoot, 'node_modules', '.bin', 'tsc');
  try {
    execFileSync(tscBin, ['-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return '';
  } catch (err) {
    const { stdout } = err as { stdout?: string };
    return stdout ?? '';
  }
}

function countErrorsPerFile(output: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(.+?\.tsx?)\(\d+,\d+\): error TS\d+:/);
    if (!match) continue;
    const file = relative(repoRoot, join(repoRoot, match[1])).replace(/\\/g, '/');
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}

describe('frontend typecheck ratchet', () => {
  it('does not introduce new type errors beyond the known baseline', () => {
    const output = runTypecheck();
    const current = countErrorsPerFile(output);

    const newOffenders = Object.keys(current)
      .filter((file) => !(file in BASELINE_ERROR_COUNTS))
      .sort();
    expect(newOffenders, 'new files with type errors not yet in the baseline').toEqual([]);

    const regressions = Object.entries(current)
      .filter(([file, count]) => count > BASELINE_ERROR_COUNTS[file])
      .sort(([a], [b]) => a.localeCompare(b));
    expect(regressions, 'files whose error count grew past the baseline').toEqual([]);
  }, 120_000);
});
