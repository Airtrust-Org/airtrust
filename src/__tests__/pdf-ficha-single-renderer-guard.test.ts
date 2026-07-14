import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de arquitetura: garante que existe um único caminho de código
 * para gerar a ficha-modelo V6.2 em branco (18 técnicas + 15 NOTECHS) e
 * que os arquivos órfãos/legacy não voltem a ser referenciados sem
 * revisão deliberada. Ver comentários de escopo em:
 *   - src/react-app/services/pdf-ficha-client.ts
 *   - src/react-app/pages/simuladores/fichas/fichaModeloPdf.ts
 *   - worker-airtrust/src/services/pdf-ficha.service.ts
 */

function readSource(relativePath: string): string {
  return readFileSync(`${process.cwd()}/${relativePath}`, 'utf8');
}

const FICHA_MODELO_FLOW = 'src/react-app/pages/simuladores/fichas/index.tsx';
const WORKER_FICHA_ROUTE = 'worker-airtrust/src/routes/simuladores-fichas.ts';
const APP_ROUTES = 'src/react-app/App.tsx';
const CLIENT_RENDERER = 'src/react-app/services/pdf-ficha-client.ts';
const WORKER_RENDERER = 'worker-airtrust/src/services/pdf-ficha.service.ts';

const ORPHAN_FILES = [
  'src/react-app/pages/FichaVoo.tsx',
  'src/react-app/pages/VisualizarFicha.tsx',
  'src/react-app/components/simuladores/AcoesFicha.tsx',
  'src/react-app/pages/simuladores/components/PDFGenerator.tsx',
];

describe('ficha PDF — fonte única de renderer (V6.2)', () => {
  it('fluxo de ficha-modelo usa exclusivamente o renderer cliente pdf-ficha-client', () => {
    const source = readSource(FICHA_MODELO_FLOW);
    expect(source).toContain('pdf-ficha-client');
    expect(source).toContain('buildFichaModeloPdfData');
    expect(source).not.toContain('pdf-ficha.service');
    expect(source).not.toMatch(/from ['"].*PDFGenerator['"]/);
  });

  it('rota de PDF do worker nunca constrói ficha-modelo em branco', () => {
    const source = readSource(WORKER_FICHA_ROUTE);
    expect(source).toContain('pdf-ficha.service');
    expect(source).not.toContain('buildFichaModeloPdfData');
    // A query de origem exige linha real em fichas_sessao com aluno e
    // instrutor — estrutura que impede servir um modelo em branco.
    expect(source).toMatch(/FROM fichas_sessao/);
    expect(source).toMatch(/INNER JOIN funcionarios/);
  });

  it('renderizadores client e backend compartilham o helper canônico do cabeçalho', () => {
    const clientSource = readSource(CLIENT_RENDERER);
    const workerSource = readSource(WORKER_RENDERER);

    expect(clientSource).toContain('buildFichaHeaderRows');
    expect(workerSource).toContain('buildFichaHeaderRows');
  });

  it('App.tsx não referencia nenhum dos arquivos órfãos de ficha', () => {
    const appSource = readSource(APP_ROUTES);
    expect(appSource).not.toMatch(/FichaVoo/);
    expect(appSource).not.toMatch(/VisualizarFicha/);
    expect(appSource).not.toMatch(/AcoesFicha/);
    expect(appSource).not.toMatch(/simuladores\/components\/PDFGenerator/);
  });

  it.each(ORPHAN_FILES)('%s permanece marcado como órfão/@deprecated', (relativePath) => {
    const source = readSource(relativePath);
    expect(source).toContain('@deprecated');
  });
});
