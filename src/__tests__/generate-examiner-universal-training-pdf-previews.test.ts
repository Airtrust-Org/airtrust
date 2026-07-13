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

const OUT_DIR = '/tmp/airtrust-test-output/examiner-event-pdf-previews-20260712';

vi.mock('@/react-app/utils/pdfPreview', () => ({
  previewPdfBeforeDownload: async (opts: {
    fileName: string;
    fetcher: () => Promise<Response>;
  }) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const res = await opts.fetcher();
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, opts.fileName), buf);
  },
}));

import { buildFichaModeloPdfData } from '@/react-app/pages/simuladores/fichas/fichaModeloPdf';
import { gerarPDFFichaCliente } from '@/react-app/services/pdf-ficha-client';

const EVENT_MODELS = [
  {
    codigo: 'EXA-E01',
    nome: 'Treinamento Prático de Examinador 1/2 — SOP Normal e Condução Inicial / SOP Anormal e Avaliação',
    itens: Array.from({ length: 18 }, (_, index) => ({
      ordem: index + 1,
      manobra_codigo: `EXA-E01-${String(index + 1).padStart(2, '0')}`,
      manobra_nome:
        index < 9 ? `Bloco A item ${index + 1}` : `Bloco B item ${index - 8}`,
      manobra_descricao:
        index < 9
          ? `Critério técnico do bloco A ${index + 1}`
          : `Critério técnico do bloco B ${index - 8}`,
      tripulante: 'AB' as const,
    })),
    expectedLine1: 'Treinamento Prático de Examinador 1/2',
    expectedLine2: 'SOP Normal e Condução Inicial / SOP Anormal e Avaliação',
  },
  {
    codigo: 'EXA-E02',
    nome: 'Treinamento Prático de Examinador 2/2 — Emergência, Intervenção e Segurança / Atuação Integrada do Examinador',
    itens: Array.from({ length: 18 }, (_, index) => ({
      ordem: index + 1,
      manobra_codigo: `EXA-E02-${String(index + 1).padStart(2, '0')}`,
      manobra_nome:
        index < 9 ? `Bloco A item ${index + 1}` : `Bloco B item ${index - 8}`,
      manobra_descricao:
        index < 9
          ? `Critério técnico do bloco A ${index + 1}`
          : `Critério técnico do bloco B ${index - 8}`,
      tripulante: 'AB' as const,
    })),
    expectedLine1: 'Treinamento Prático de Examinador 2/2',
    expectedLine2:
      'Emergência, Intervenção e Segurança / Atuação Integrada do Examinador',
  },
] as const;

describe('examiner event pdf previews (EXA-E01/EXA-E02)', () => {
  EVENT_MODELS.forEach((modelo, index) => {
    it(`${modelo.codigo} gera preview real A4 com 18 técnicos + 15 NOTECHS`, async () => {
      const pdfData = buildFichaModeloPdfData(
        {
          id: 9500 + index,
          codigo: modelo.codigo,
          nome: modelo.nome,
          tipo_sessao_nome: 'EXAMINADOR',
          modelo_aeronave: '',
        },
        modelo.itens,
        '/api/empresas/minha/logo-base64',
      );

      expect(pdfData.sessao_titulo_linha1).toBe(modelo.expectedLine1);
      expect(pdfData.sessao_titulo_linha2).toBe(modelo.expectedLine2);
      expect(pdfData.carga_horaria_total).toBe('120 minutos');
      expect(pdfData.manobras).toHaveLength(33);

      const fileName = `${modelo.codigo}_preview_20260712.pdf`;
      pdfData.fileName = fileName;
      await gerarPDFFichaCliente(pdfData);

      expect(existsSync(path.join(OUT_DIR, fileName))).toBe(true);
    });
  });
});
