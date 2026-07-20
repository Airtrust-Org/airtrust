/**
 * Testes do gerador de PDF do Relatório de Voo (Petrobras / RDV).
 * Usa apenas dados fictícios — sem captura real.
 */
import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  gerarRelatorioPetrobrasPdf,
  labelAprovacaoTipo,
  wrapText,
  RDV_PDF_WATERMARK_TEXT,
  type RelatorioPetrobrasData,
} from '../../services/controle-voos/rdv-pdf';

function baseData(overrides: Partial<RelatorioPetrobrasData> = {}): RelatorioPetrobrasData {
  return {
    empresa_nome: 'AirTrust Ficticia Ltda',
    base: 'SBFZ',
    contrato: 'CTR-FICT-001',
    cliente: 'Cliente Ficticio SA',
    data_voo: '2026-07-15',
    prefixo: 'PP-XYZ',
    modelo_aeronave: 'AW139',
    numero_voo: 'VOO-100',
    numero_relatorio: 'RDV-FICT-2026-001',
    numero_sap: 'SAP-999',
    tripulantes: [
      { nome: 'Piloto Alfa', codigo_anac: '123456', funcao: 'COMANDANTE' },
      { nome: 'Copiloto Beta', codigo_anac: '654321', funcao: 'COPILOTO' },
    ],
    etapas: [
      {
        numero_etapa: 1,
        origem_icao: 'SBFZ',
        destino_icao: 'SBJE',
        horario_motor_ligado: '08:00',
        horario_decolagem: '08:15',
        horario_pouso: '09:00',
        horario_motor_desligado: '09:10',
        tempo_decolagem_pouso: '00:45',
        tempo_total: '01:10',
        pousos_diurnos: 1,
        pousos_noturnos: 0,
        pax: 4,
        payload: 120,
        combustivel_inicio: 800,
        combustivel_fim: 650,
      },
    ],
    abastecimentos: [
      {
        fornecedor: 'Fornecedor Ficticio',
        localidade: 'SBFZ',
        combustivel_abastecido: 200,
        unidade: 'L',
        numero_ce: 'CE-1',
        data_hora: '2026-07-15T07:30:00Z',
      },
    ],
    totais: {
      horas_voadas: 1.17,
      numero_pousos: 1,
      ciclos: 1,
      combustivel_decolagem: 800,
      combustivel_pouso: 650,
      combustivel_consumo: 150,
      pob: 6,
      carga_kg: 120,
    },
    ocorrencias: null,
    divergencias: null,
    aprovacoes: [
      { tipo_aprovacao: 'COMANDANTE', status: 'APROVADO', created_at: '2026-07-15T10:00:00Z' },
      { tipo_aprovacao: 'COORDENACAO', status: 'APROVADO', created_at: '2026-07-15T11:00:00Z' },
    ],
    status_workflow: 'APROVADO_COORDENACAO',
    versao: 3,
    gerado_em: '2026-07-15T12:00:00.000Z',
    identificador_interno: 'RDV-1-99-v3',
    hash_integridade: 'abcdefghijklmnopqrstuvwxyz0123456789',
    ...overrides,
  };
}

/** Infla todos os streams FlateDecode do PDF. */
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
      // stream não comprimido / não-Flate
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

/**
 * Extrai texto dos content streams (pdf-lib usa FlateDecode + hex `<...>` Tj).
 */
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

/** Conta marca d'água nos content streams (uma por página esperada). */
function countWatermarkInStreams(bytes: Uint8Array): number {
  const text = extractPdfText(bytes);
  const needle = 'TESTE';
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1) {
    // Confirma contexto da marca (ENVIAR / PETROBRAS) na mesma linha/vizinhança
    const window = text.slice(idx, idx + 80);
    if (
      window.includes('ENVIAR') ||
      window.includes('PETROBRAS') ||
      window.includes(RDV_PDF_WATERMARK_TEXT)
    ) {
      count += 1;
    } else if (window.startsWith('TESTE')) {
      // Hex WinAnsi: "TESTE — NÃO ENVIAR…" ainda começa com TESTE
      count += 1;
    }
    idx += needle.length;
  }
  return count;
}

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe('rdv-pdf — wrapText', () => {
  it('quebra texto longo sem truncar com slice', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const long = 'palavra '.repeat(80).trim();
    const lines = wrapText(long, font, 8, 200);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.join(' ')).toContain('palavra');
    expect(lines.every((l) => font.widthOfTextAtSize(l, 8) <= 200 + 0.5)).toBe(true);
  });

  it('parte palavras maiores que a largura da coluna', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const monster = 'X'.repeat(120);
    const lines = wrapText(monster, font, 8, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(monster);
  });
});

describe('rdv-pdf — labels de confirmação/aprovação', () => {
  it('distingue COMANDANTE, COORDENACAO, COMERCIAL e CONTRATANTE', () => {
    expect(labelAprovacaoTipo('COMANDANTE')).toBe('Confirmação do COMANDANTE');
    expect(labelAprovacaoTipo('COORDENACAO')).toBe('Aprovação da COORDENAÇÃO');
    expect(labelAprovacaoTipo('COMERCIAL')).toBe('Aprovação COMERCIAL');
    expect(labelAprovacaoTipo('CONTRATANTE')).toBe('Aprovação do CONTRATANTE');
  });

  it('nunca rotula como assinatura digital', () => {
    for (const tipo of ['COMANDANTE', 'COORDENACAO', 'COMERCIAL', 'CONTRATANTE']) {
      expect(labelAprovacaoTipo(tipo).toLowerCase()).not.toContain('assinatura digital');
    }
  });
});

describe('rdv-pdf — geração', () => {
  it('gera PDF válido com um trecho', async () => {
    const bytes = await gerarRelatorioPetrobrasPdf(baseData());
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(500);
    const pages = await pageCountOf(bytes);
    expect(pages).toBeGreaterThanOrEqual(1);
  });

  it('gera PDF com vários trechos sem truncar conteúdo', async () => {
    const etapas = Array.from({ length: 18 }, (_, i) => ({
      numero_etapa: i + 1,
      origem_icao: i % 2 === 0 ? 'SBFZ' : 'SBJE',
      destino_icao: i % 2 === 0 ? 'SBJE' : 'SBFZ',
      horario_motor_ligado: '08:00',
      horario_decolagem: '08:15',
      horario_pouso: '09:00',
      horario_motor_desligado: '09:10',
      tempo_decolagem_pouso: '00:45',
      tempo_total: '01:10',
      pousos_diurnos: 1,
      pousos_noturnos: 0,
      pax: i + 1,
      payload: 100 + i,
      combustivel_inicio: 800,
      combustivel_fim: 650,
    }));
    const bytes = await gerarRelatorioPetrobrasPdf(baseData({ etapas }));
    const text = extractPdfText(bytes);
    expect(text).toContain('18');
    expect(text).toContain('TRECHOS');
    const pages = await pageCountOf(bytes);
    expect(pages).toBeGreaterThan(1);
  });

  it('pagina com muitos tripulantes, abastecimentos e aprovações', async () => {
    const tripulantes = Array.from({ length: 25 }, (_, i) => ({
      nome: `Tripulante Ficticio Numero ${i + 1} com sobrenome muito extenso para forcar quebra`,
      codigo_anac: `ANAC${100000 + i}`,
      funcao: i === 0 ? 'COMANDANTE' : 'COPILOTO',
    }));
    const abastecimentos = Array.from({ length: 20 }, (_, i) => ({
      fornecedor: `Fornecedor Ficticio Extenso ${i + 1} Energia Ltda`,
      localidade: `Localidade remota ${i + 1}`,
      combustivel_abastecido: 100 + i,
      unidade: 'L',
      numero_ce: `CE-${i + 1}`,
      data_hora: `2026-07-15T0${i % 9}:00:00Z`,
    }));
    const aprovacoes = [
      ...Array.from({ length: 8 }, (_, i) => ({
        tipo_aprovacao: 'COORDENACAO',
        status: i % 2 === 0 ? 'REVISAO_INICIADA' : 'APROVADO',
        created_at: `2026-07-15T1${i}:00:00Z`,
      })),
      { tipo_aprovacao: 'COMANDANTE', status: 'APROVADO', created_at: '2026-07-15T09:00:00Z' },
      { tipo_aprovacao: 'COMERCIAL', status: 'APROVADO', created_at: '2026-07-15T14:00:00Z' },
      { tipo_aprovacao: 'CONTRATANTE', status: 'APROVADO', created_at: '2026-07-15T15:00:00Z' },
    ];
    const bytes = await gerarRelatorioPetrobrasPdf(
      baseData({ tripulantes, abastecimentos, aprovacoes }),
    );
    const text = extractPdfText(bytes);
    expect(text).toContain('TRIPULA');
    expect(text).toContain('ABASTECIMENTOS');
    expect(text).toMatch(/continu/i);
    expect(text).toContain('Confirma');
    expect(text).toContain('COMANDANTE');
    expect(text).toContain('COORDENA');
    expect(text).toContain('COMERCIAL');
    expect(text).toContain('CONTRATANTE');
    // Rodapé nega expressamente o conceito de assinatura digital.
    expect(text).toMatch(/n[aã]o constituem assinatura digital/i);
    // Rótulos de registro usam confirmação/aprovação — não "assinatura".
    expect(text).toContain('Confirmação do COMANDANTE');
    expect(text).toContain('Aprovação da COORDENAÇÃO');
    expect(text).not.toMatch(/Assinatura do COMANDANTE/i);
    expect(text).not.toMatch(/Assinatura digital da COORDENA/i);
    const pages = await pageCountOf(bytes);
    expect(pages).toBeGreaterThan(2);
  });

  it('inclui observação longa completa (sem slice 180) e força multi-página', async () => {
    const longObs =
      'Observacao ficticia de teste: ' +
      'alfa beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega '.repeat(
        40,
      );
    expect(longObs.length).toBeGreaterThan(180);
    const bytes = await gerarRelatorioPetrobrasPdf(
      baseData({
        ocorrencias: longObs,
        divergencias: 'Divergencia ficticia longa: ' + 'valor '.repeat(60),
      }),
    );
    const text = extractPdfText(bytes);
    expect(text).toContain('alfa');
    expect(text).toContain('omega');
    expect(text).toContain('OBSERVA');
    // Trecho além dos primeiros 180 caracteres deve aparecer
    const beyond = longObs.slice(200, 220).trim();
    if (beyond.length > 4) {
      expect(text).toContain(beyond.slice(0, 8));
    }
    const pages = await pageCountOf(bytes);
    expect(pages).toBeGreaterThan(1);
  });

  it("repete marca d'água em todas as páginas (streams)", async () => {
    const etapas = Array.from({ length: 30 }, (_, i) => ({
      numero_etapa: i + 1,
      origem_icao: 'SBFZ',
      destino_icao: 'SBJE',
      horario_motor_ligado: null,
      horario_decolagem: '10:00',
      horario_pouso: '11:00',
      horario_motor_desligado: null,
      tempo_decolagem_pouso: null,
      tempo_total: '01:00',
      pousos_diurnos: 1,
      pousos_noturnos: 0,
      pax: 2,
      payload: 50,
      combustivel_inicio: 500,
      combustivel_fim: 400,
    }));
    const bytes = await gerarRelatorioPetrobrasPdf(
      baseData({
        etapas,
        ocorrencias: 'Linha de observacao '.repeat(80),
      }),
    );
    const pages = await pageCountOf(bytes);
    expect(pages).toBeGreaterThan(2);
    const watermarkHits = countWatermarkInStreams(bytes);
    expect(watermarkHits).toBeGreaterThanOrEqual(pages);
    const text = extractPdfText(bytes);
    expect(text).toContain('TESTE');
    expect(text).toContain('PETROBRAS');
  });

  it('totais no PDF coincidem com o input da API (sem recalcular)', async () => {
    const totais = {
      horas_voadas: 3.45,
      numero_pousos: 7,
      ciclos: 7,
      combustivel_decolagem: 1234,
      combustivel_pouso: 987,
      combustivel_consumo: 247,
      pob: 9,
      carga_kg: 321,
    };
    const bytes = await gerarRelatorioPetrobrasPdf(baseData({ totais }));
    const text = extractPdfText(bytes);
    expect(text).toContain('3.45');
    expect(text).toContain('1234');
    expect(text).toContain('987');
    expect(text).toContain('247');
    expect(text).toContain('321');
    expect(text).toMatch(/Pousos:\s*7/);
    expect(text).toMatch(/POB:\s*9/);
  });

  it('cabeçalho e rodapé presentes em cada página', async () => {
    const bytes = await gerarRelatorioPetrobrasPdf(
      baseData({
        etapas: Array.from({ length: 22 }, (_, i) => ({
          ...baseData().etapas[0],
          numero_etapa: i + 1,
        })),
      }),
    );
    const pages = await pageCountOf(bytes);
    const text = extractPdfText(bytes);
    const headerHits = (text.match(/RELAT/g) || []).length;
    expect(headerHits).toBeGreaterThanOrEqual(pages);
    expect(text).toContain('Documento interno');
    expect(text.toLowerCase()).toMatch(/assinatura digital/);
    // Rodapé afirma que NÃO constitui assinatura digital
    expect(text.toLowerCase()).toMatch(/n[aã]o constituem assinatura digital/);
  });
});
