// @vitest-environment jsdom

import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/config/api', () => ({
  getAccessToken: () => 'fake-test-token',
}));

vi.mock('@/react-app/lib/apiFetch', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const logoBuf = readFileSync(resolve(process.cwd(), 'public/favicon-32x32.png'));
  const logoDataUrl = `data:image/png;base64,${logoBuf.toString('base64')}`;
  return {
    apiFetch: async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('logo-base64')) {
        return new Response(JSON.stringify({ success: true, data: logoDataUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    },
  };
});

vi.mock('@/react-app/utils/pdfPreview', () => ({
  previewPdfBeforeDownload: async (opts: {
    fileName: string;
    fetcher: () => Promise<Response>;
  }) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const outDir = resolve(process.cwd(), 'docs/analysis/matriz-v6-pdf-previews-20260703');
    await mkdir(outDir, { recursive: true });
    const res = await opts.fetcher();
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(resolve(outDir, opts.fileName), buf);
  },
}));

import { gerarPDFFichaCliente } from '@/react-app/services/pdf-ficha-client';
import { buildFichaModeloPdfData } from '@/react-app/pages/simuladores/fichas/fichaModeloPdf';
import { loadSimuladoresMatrizV6Data } from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

const OUT_DIR = path.resolve(process.cwd(), 'docs/analysis/matriz-v6-pdf-previews-20260703');

const PREVIEWS = [
  { code: 'SK76-I-01/12', fileName: 'S76_SK76_INICIAL_01_12_20260703.pdf', simulador: 'SK76' },
  { code: 'SK76-I-12/12', fileName: 'S76_SK76_LOFT_CHECK_12_12_20260703.pdf', simulador: 'SK76' },
  { code: 'A139-I-01/12', fileName: 'AW139_INICIAL_01_12_20260703.pdf', simulador: 'AW139' },
  { code: 'A139-I-12/12', fileName: 'AW139_LOFT_CHECK_12_12_20260703.pdf', simulador: 'AW139' },
];

describe('simuladores matriz v6 pdf previews', () => {
  const data = loadSimuladoresMatrizV6Data();
  const modelsByCode = new Map(data.models.map((model) => [model.modelCode, model]));

  PREVIEWS.forEach(({ code, fileName, simulador }) => {
    it(code, async () => {
      const model = modelsByCode.get(code);
      expect(model).toBeDefined();

      const pdfData = buildFichaModeloPdfData(
        {
          id: Math.abs(
            [...code].reduce((acc, char) => ((acc * 33) ^ char.charCodeAt(0)) >>> 0, 5381),
          ),
          codigo: model!.modelCode,
          nome: model!.modelName,
          tipo_sessao_nome: model!.kind.toUpperCase(),
          modelo_aeronave: simulador,
        },
        model!.rows.map((row) => ({
          ordem: row.ordem,
          manobra_codigo: row.codigo,
          manobra_nome: row.nome,
          manobra_descricao: row.nome,
          observacoes: row.observacao,
          tripulante: 'AB',
        })),
        '/api/empresas/minha/logo-base64',
      );

      pdfData.fileName = fileName;
      await gerarPDFFichaCliente(pdfData);

      expect(existsSync(path.join(OUT_DIR, fileName))).toBe(true);
    });
  });
});

