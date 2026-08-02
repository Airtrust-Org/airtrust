import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REACT_APP_ROOT = path.resolve(process.cwd(), 'src/react-app');
const LEGACY_IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]@\/components\//;

// Ratchet only: these imports are existing architecture debt and must not grow.
// When a file is migrated away from the legacy component tree, remove it from this set.
const LEGACY_IMPORT_BASELINE = [
  'components/ImportarXLSX.tsx',
  'components/VirtualizedList.tsx',
  'components/modals/ModalAlertaEAD.tsx',
  'components/qualificacoes/CertificadoModalLoader.tsx',
  'components/qualificacoes/ModalCertificados.tsx',
  'pages/Configuracoes/NotificacoesConvocacao.tsx',
  'pages/Qualificacoes.tsx',
  'pages/TreinamentosPlanejadosPage.tsx',
  'pages/escalas/components/Modais/ModalAdicionarEvento.tsx',
  'pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx',
  'pages/escalas/components/Modais/ModalAlocarTripulante.tsx',
  'pages/escalas/components/Modais/ModalConfigModulo.tsx',
  'pages/escalas/components/Modais/ModalConfirmarTransicao.tsx',
  'pages/escalas/components/Modais/ModalCriarEscala.tsx',
  'pages/escalas/components/Modais/ModalDetalhesEvento.tsx',
  'pages/escalas/components/Modais/ModalExportarEscalaPdf.tsx',
  'pages/escalas/components/Modais/ModalFeriasAfastamentoGlobal.tsx',
  'pages/escalas/components/Modais/ModalNovaSituacao.tsx',
  'pages/escalas/components/Modais/ModalPublicarEscala.tsx',
  'pages/escalas/components/Modais/ModalSelecionarTripulante.tsx',
  'pages/escalas/components/Modais/ModalSnapshotRevisao.tsx',
  'pages/escalas/components/Modais/ModalVerificarConflitos.tsx',
  'pages/funcionarios/modals/ModalLancamentoHorasVoo.tsx',
  'pages/funcionarios/modals/ModalSaldoInicial.tsx',
].sort();

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') return [];
        return collectSourceFiles(absolutePath);
      }
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) return [];
      if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
      return [absolutePath];
    }),
  );

  return files.flat();
}

describe('legacy frontend component imports', () => {
  it('does not expand the existing legacy dependency surface', async () => {
    const sourceFiles = await collectSourceFiles(REACT_APP_ROOT);
    const actualLegacyImporters: string[] = [];

    for (const absolutePath of sourceFiles) {
      const source = await readFile(absolutePath, 'utf8');
      if (!LEGACY_IMPORT_PATTERN.test(source)) continue;

      actualLegacyImporters.push(
        path.relative(REACT_APP_ROOT, absolutePath).split(path.sep).join('/'),
      );
    }

    expect(actualLegacyImporters.sort()).toEqual(LEGACY_IMPORT_BASELINE);
  });
});
