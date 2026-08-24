import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { gerarCaePlanningPropostaPdf, type CaeProposalPdfData } from '../../services/cae-planning-proposal-pdf';

/** Infla todos os streams FlateDecode do PDF (mesmo padrão de rdv-pdf.test.ts). */
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

function decodePdfLiteral(inner: string): string {
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  const chars: string[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    chars.push(String.fromCharCode(parseInt(clean.slice(i, i + 2), 16)));
  }
  return chars.join('');
}

/** Extrai texto dos content streams (pdf-lib usa FlateDecode + hex `<...>` Tj). */
function extractPdfText(bytes: Uint8Array): string {
  const streams = inflatePdfStreams(bytes);
  const chunks: string[] = [];
  for (const stream of streams) {
    const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
    let match: RegExpExecArray | null;
    while ((match = hexRe.exec(stream)) !== null) {
      chunks.push(decodePdfHex(match[1]));
    }
    const litRe = /\((?:\\.|[^\\)])*\)\s*Tj/g;
    while ((match = litRe.exec(stream)) !== null) {
      chunks.push(decodePdfLiteral(match[0].slice(1).replace(/\)\s*Tj$/, '')));
    }
  }
  return chunks.join('\n');
}

function baseData(overrides: Partial<CaeProposalPdfData> = {}): CaeProposalPdfData {
  return {
    proposal_id: 15,
    empresa_nome: 'AirTrust QA Ltda',
    status: 'CONFIRMADO',
    approval_status: 'APROVADO',
    mode: 'COMPARTILHADA',
    generated_at: '2026-08-24T12:00:00Z',
    cae_slot: { equipment: 'AW139', date: '2026-09-25', start_time: '09:00', end_time: '11:00' },
    simulator_id: 3,
    instructor_id: 99,
    escala_considerada: 'Piloto Alfa: 2026-09-25 = FOLGA',
    participants: [
      {
        funcionario_id: 100,
        funcionario_nome: 'Piloto Alfa',
        qualificacao_nome: 'Recorrente AW139',
        qualificacao_vencimento: '2026-10-20',
        modelo_codigo: 'MODA',
        modelo_nome: 'Modelo A — Inicial',
      },
      {
        funcionario_id: 118,
        funcionario_nome: 'Piloto Beta',
        qualificacao_nome: 'Recorrente AW139',
        qualificacao_vencimento: '2026-10-22',
        modelo_codigo: 'MODB',
        modelo_nome: 'Modelo B — Avançado',
      },
    ],
    warnings: ['Slot fora da janela preferencial.'],
    aprovador_nome: 'Gerente QA',
    aprovado_em: '2026-08-24T11:00:00Z',
    observacoes: 'Aprovado conforme política vigente.',
    ...overrides,
  };
}

describe('gerarCaePlanningPropostaPdf', () => {
  it('gera um PDF válido (parseável pelo pdf-lib)', async () => {
    const bytes = await gerarCaePlanningPropostaPdf(baseData());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('inclui ID da proposta, empresa, status e modo', async () => {
    const bytes = await gerarCaePlanningPropostaPdf(baseData());
    const text = extractPdfText(bytes);
    expect(text).toContain('AirTrust QA Ltda');
    expect(text).toContain('#15');
    expect(text).toContain('COMPARTILHADA');
    expect(text).toContain('CONFIRMADO');
    expect(text).toContain('APROVADO');
  });

  it('inclui slot CAE, simulador e instrutor', async () => {
    const bytes = await gerarCaePlanningPropostaPdf(baseData());
    const text = extractPdfText(bytes);
    expect(text).toContain('AW139');
    expect(text).toContain('2026-09-25');
    expect(text).toContain('#3');
    expect(text).toContain('#99');
  });

  it('inclui currículo individual de cada participante (nomes e modelos distintos)', async () => {
    const bytes = await gerarCaePlanningPropostaPdf(baseData());
    const text = extractPdfText(bytes);
    expect(text).toContain('Piloto Alfa');
    expect(text).toContain('Piloto Beta');
    expect(text).toContain('Modelo A');
    expect(text).toContain('Modelo B');
  });

  it('inclui escala considerada, avisos e trilha de aprovação', async () => {
    const bytes = await gerarCaePlanningPropostaPdf(baseData());
    const text = extractPdfText(bytes);
    expect(text).toContain('FOLGA');
    expect(text).toContain('janela preferencial');
    expect(text).toContain('Gerente QA');
    expect(text).toContain('política vigente');
  });

  it('indica claramente recursos pendentes em vez de mostrar vazio', async () => {
    const bytes = await gerarCaePlanningPropostaPdf(
      baseData({ simulator_id: null, instructor_id: null }),
    );
    const text = extractPdfText(bytes);
    expect(text).toContain('pendente');
  });

  it('não trava com listas vazias (sem slot, sem participantes, sem avisos)', async () => {
    const bytes = await gerarCaePlanningPropostaPdf(
      baseData({ cae_slot: null, participants: [], warnings: [] }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('pagina corretamente com muitos participantes', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      funcionario_id: 1000 + i,
      funcionario_nome: `Piloto Teste ${i}`,
      qualificacao_nome: 'Recorrente AW139',
      qualificacao_vencimento: '2026-10-20',
      modelo_codigo: 'MODA',
      modelo_nome: 'Modelo A',
    }));
    const bytes = await gerarCaePlanningPropostaPdf(baseData({ participants: many }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
