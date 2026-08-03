import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { gerarPDFFicha } from '../../services/pdf-ficha.service';

function inflatePdfStreams(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const out: string[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const streamIdx = buf.indexOf(Buffer.from('stream'), pos);
    if (streamIdx < 0) break;
    let dataStart = streamIdx + 6;
    if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buf[dataStart] === 0x0a) dataStart += 1;
    const endIdx = buf.indexOf(Buffer.from('endstream'), dataStart);
    if (endIdx < 0) break;
    let dataEnd = endIdx;
    if (buf[dataEnd - 1] === 0x0a) dataEnd -= 1;
    if (buf[dataEnd - 1] === 0x0d) dataEnd -= 1;
    const data = buf.subarray(dataStart, dataEnd);
    try {
      out.push(inflateSync(data).toString('latin1'));
    } catch {
      out.push(data.toString('latin1'));
    }
    pos = endIdx + 9;
  }
  return out;
}

function decodePdfText(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (const stream of inflatePdfStreams(bytes)) {
    for (const match of stream.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
      const clean = match[1].replace(/\s+/g, '');
      let decoded = '';
      for (let i = 0; i + 1 < clean.length; i += 2) {
        decoded += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
      }
      chunks.push(decoded);
    }
    for (const match of stream.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
      chunks.push(
        match[0]
          .slice(1)
          .replace(/\)\s*Tj$/, '')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\'),
      );
    }
  }
  return chunks.join('\n');
}

describe('gerarPDFFicha pagination', () => {
  it('creates continuation pages and preserves signatures/disclaimer after a long table', async () => {
    const bytes = await gerarPDFFicha({
      fichaId: 'FICHA-PAGINACAO-001',
      sessao_codigo: 'A139-I-01/12',
      sessao_titulo: 'Sessão de treinamento de regressão',
      sessao_nome: 'Sessão de treinamento de regressão',
      tripulante_nome: 'Tripulante Teste',
      tripulante_codigo_anac: '123456',
      tripulante_funcao: 'PIC',
      instrutor_nome: 'Instrutor Teste',
      instrutor_codigo_anac: '654321',
      data: '2026-08-03',
      horario_inicio: '08:00',
      horario_fim: '10:00',
      simulador: 'FFS AW139',
      carga_horaria_total: '02:00',
      status: 'FINALIZADA',
      observacoes_gerais: 'Observação geral extensa '.repeat(120),
      assinatura_aluno_timestamp: '2026-08-03T10:05:00.000Z',
      assinatura_instrutor_timestamp: '2026-08-03T10:06:00.000Z',
      templateVersion: 'v6',
      manobras: Array.from({ length: 95 }, (_, index) => ({
        ordem: index + 1,
        descricao: `Manobra operacional ${index + 1} com descrição longa para exigir quebra de linha e cálculo dinâmico de altura`,
        codigo: `MAN-${String(index + 1).padStart(3, '0')}`,
        resultado: 4,
        categoria: index > 70 ? 'NOTECHS' : 'TECNICA',
        observacoes: `Evidência observada na manobra ${index + 1}; texto adicional para validar a preservação integral do conteúdo.`,
        tripulante: index % 2 === 0 ? 'A' : 'B',
      })),
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);

    const text = decodePdfText(bytes);
    expect(text).toContain('ASSINATURAS');
    expect(text).toContain('Assinado');
    expect(text).toContain('instrumento interno de treinamento');
    expect(text).toContain('Página');
  });
});
