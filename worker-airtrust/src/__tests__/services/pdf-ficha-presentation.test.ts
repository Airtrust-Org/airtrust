import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { gerarPDFFicha, getFichaPdfStatusPresentation } from '../../services/pdf-ficha.service';

const longInstructorName =
  'Instrutor QA Nome Composto Muito Longo Para Validar Que Nenhum Sobrenome Seja Perdido';

function decodePdfText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const chunks: string[] = [];
  let position = 0;
  while (position < buffer.length) {
    const streamIndex = buffer.indexOf(Buffer.from('stream'), position);
    if (streamIndex < 0) break;
    let dataStart = streamIndex + 6;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buffer[dataStart] === 0x0a) dataStart += 1;
    const endIndex = buffer.indexOf(Buffer.from('endstream'), dataStart);
    if (endIndex < 0) break;
    let dataEnd = endIndex;
    if (buffer[dataEnd - 1] === 0x0a) dataEnd -= 1;
    if (buffer[dataEnd - 1] === 0x0d) dataEnd -= 1;
    const stream = buffer.subarray(dataStart, dataEnd);
    try {
      chunks.push(inflateSync(stream).toString('latin1'));
    } catch {
      chunks.push(stream.toString('latin1'));
    }
    position = endIndex + 9;
  }

  return chunks
    .join('\n')
    .replace(/<([0-9A-Fa-f\s]+)>\s*Tj/g, (_, value) =>
      Buffer.from(value.replace(/\s+/g, ''), 'hex').toString('latin1'),
    )
    .replace(/\((?:\\.|[^\\)])*\)\s*Tj/g, (value) =>
      value
        .slice(1)
        .replace(/\)\s*Tj$/, '')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\'),
    );
}

function fixture(status: string, resultado: number | 'NR' | null) {
  return {
    fichaId: 'FICHA-PRESENTACAO-001',
    sessao_codigo: 'TREINAMENTO',
    sessao_titulo: 'Sessão de treinamento',
    tripulante_nome: 'Tripulante QA',
    tripulante_codigo_anac: '123456',
    tripulante_funcao: 'PF',
    instrutor_nome: longInstructorName,
    instrutor_codigo_anac: '654321',
    data: '2026-08-13',
    horario_inicio: '09:00',
    horario_fim: '10:00',
    simulador: 'Simulador QA',
    carga_horaria_total: '01:00',
    status,
    observacoes_gerais: 'Observação QA',
    assinatura_aluno_timestamp: '2026-08-13T10:01:00.000Z',
    assinatura_instrutor_timestamp: '2026-08-13T10:02:00.000Z',
    templateVersion: 'v6' as const,
    manobras: [
      {
        ordem: 1,
        descricao: 'Manobra QA',
        codigo: 'QA-001',
        resultado,
        tripulante: 'AB',
      },
    ],
  };
}

describe('gerarPDFFicha presentation', () => {
  it('uses canonical status labels for approved and not-approved fichas', () => {
    expect(getFichaPdfStatusPresentation('APROVADO')).toBe('APROVADO');
    expect(getFichaPdfStatusPresentation('NAO_APROVADO')).toBe('NÃO APROVADO');
  });

  it('renders NR, numeric notes, and only uses a dash for a missing note', async () => {
    for (const [resultado, expected] of [
      ['NR', 'NR'],
      [8, '8'],
      [null, '-'],
    ] as const) {
      const bytes = await gerarPDFFicha(fixture('APROVADO', resultado));
      const document = await PDFDocument.load(bytes);
      expect(document.getPageCount()).toBe(1);
      expect(decodePdfText(bytes)).toContain(expected);
    }
  });

  it('wraps and preserves a long instructor name without an ellipsis', async () => {
    const bytes = await gerarPDFFicha(fixture('APROVADO', 'NR'));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const text = decodePdfText(bytes);
    expect(text).toContain('Instrutor QA Nome Composto');
    expect(text).toContain('Muito Longo Para Validar Que');
    expect(text).toContain('Nenhum Sobrenome Seja');
    expect(text).toContain('Perdido');
    expect(text).not.toContain('Nenhum Sobrenome Seja...');
  });

  it('renders canonical final statuses in the generated PDF', async () => {
    const approved = decodePdfText(await gerarPDFFicha(fixture('APROVADO', 8)));
    expect(approved).toContain('APROVADO');
    expect(approved).not.toContain('ASSINADO');

    const notApproved = decodePdfText(await gerarPDFFicha(fixture('NAO_APROVADO', 8)));
    expect(notApproved).toContain('NÃO APROVADO');
  });
});
