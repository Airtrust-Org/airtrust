import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const qualificacoes = readFileSync('src/react-app/pages/Qualificacoes.tsx', 'utf8');
const modal = readFileSync(
  'src/react-app/components/modals/ModalAtribuirQualificacao.tsx',
  'utf8',
);
const lmsUi = readFileSync('src/react-app/pages/lms/lmsUi.tsx', 'utf8');

describe('read latency fan-out contracts', () => {
  it('não carrega datasets de abas/modais fechados', () => {
    expect(qualificacoes).toContain('useFuncionariosAtivos(showTurmaPlanejadaModal)');
    expect(qualificacoes).toContain('useAeronavesConfig(isHistoricoTab)');
    expect(qualificacoes).toMatch(
      /highlightedHistoricoId \|\| undefined,\s*usesHistoricoDataset,\s*historicoCategoriaId/,
    );
    expect(qualificacoes).toMatch(
      /useTreinamentosPlanejados\(\s*\{\},\s*showConvocacaoPlanejadaModal,\s*\)/,
    );
    expect(modal).toContain('useFuncionariosAtivos(isOpen)');
    expect(modal).toMatch(
      /useTiposQualificacao\(\s*Number\(form\.categoria\) \|\| undefined,\s*isOpen,\s*\)/,
    );
    expect(modal).toContain('useCategoriasQualificacao(isOpen)');
  });

  it('não duplica categorias nem estatísticas na montagem do Histórico', () => {
    expect(qualificacoes).not.toMatch(
      /Carregar categorias ao abrir a aba histórico[\s\S]*?refetchCategorias\(\)/,
    );
    expect(qualificacoes).not.toContain('/dashboard/qualificacoes');
  });

  it('thumbnails do LMS são buscadas sob demanda e respeitam cache', () => {
    expect(lmsUi).toContain('new IntersectionObserver(');
    expect(lmsUi).toContain("rootMargin: '400px'");
    expect(lmsUi).toContain('useLmsCourseThumbnailUrl(curso, thumbnailEnabled)');
    expect(lmsUi).not.toContain("'X-AirTrust-Bypass-Cache': '1'");
  });
});
