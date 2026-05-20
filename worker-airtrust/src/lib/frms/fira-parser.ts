/**
 * FRMS — Parser de FIRA (Ficha Individual do Aeronauta)
 *
 * Funções puras para extrair e mapear dados de FIRAs em PDF.
 * Sem acesso a banco de dados — totalmente testável isoladamente.
 *
 * RBAC 135, Art. 135.63(a)(4)(vii)
 */

import type { SalvarJornadaInput } from './db-service';

// ──────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────

export interface FiraLinhaDia {
  dia: number;
  diaSemana: string;
  situacao: string;
  local: string | null;
  inicio: string | null;
  termino: string | null;
  totalJornada: string | null;
  totalVoo: string | null;
}

export interface FiraCabecalho {
  nome: string;
  canac: string;
  baseContratual: string;
  ano: number;
  mes: number; // 1–12
  mesNome: string;
  empresa: string;
}

export interface FiraParseResult {
  cabecalho: FiraCabecalho;
  dias: FiraLinhaDia[];
  totalJornadaMes: string;
  totalVooMes: string;
  erros: string[];
}

// ──────────────────────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────────────────────

const MESES: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARÇO: 3,
  MARCO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

const MESES_NOMES = Object.keys(MESES).filter((k) => !k.includes('MARCO')); // sem alias
const MESES_NUM_TO_NOME = [
  '',
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

function normalizeMonthToken(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function resolveMonthFromText(value: string): string {
  const normalized = normalizeMonthToken(value);
  const direct = Object.keys(MESES).find(
    (monthName) => normalizeMonthToken(monthName) === normalized,
  );
  return direct || '';
}

// ──────────────────────────────────────────────────────────────
// Auxiliares
// ──────────────────────────────────────────────────────────────

/**
 * Converte "HH:MM" → minutos totais
 */
export function hhmmToMin(hhmm: string): number {
  if (!hhmm || hhmm === '-') return 0;
  const parts = hhmm.split(':');
  if (parts.length !== 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

function temMovimentoOperacional(dias: FiraLinhaDia[]): boolean {
  return dias.some((d) => {
    const jornadaMin = hhmmToMin(d.totalJornada ?? '0:00');
    const vooMin = hhmmToMin(d.totalVoo ?? '0:00');
    return !!(d.inicio || d.termino || jornadaMin > 0 || vooMin > 0);
  });
}

// ──────────────────────────────────────────────────────────────
// Parser principal
// ──────────────────────────────────────────────────────────────

/**
 * Parseia o texto extraído de uma FIRA e retorna dados estruturados.
 *
 * O PDF da FIRA da Costa do Sol é extraído de forma COLUNAR pelo pdfminer/unpdf:
 * cada coluna de dados aparece como bloco sequencial de linhas, não como linhas de tabela.
 *
 * Estrutura do texto extraído (linhas não-vazias):
 *   [0]  Empresa (ex: "COSTA DO SOL TÁXI AÉREO")
 *   [N-2] Nome do aeronauta (ex: "ADRIANA BRASIL")
 *   [N-1] CANAC (ex: "951681") — sempre 5-7 dígitos
 *   [N]   "TRIPULANTE"
 *   ...
 *   "Local" → 31 valores (SBME/-)
 *   "Início" / "Término" / ... (headers repetidos 3x)
 *   31 valores Jornada Início
 *   31 valores Jornada Término
 *   "Jornada" (2ª ocorrência = dados)
 *   31 durations jornada
 *   "Voo"
 *   31 durations voo
 *   "Dia"
 *   31 entradas (algumas split em 2 linhas para "TER")
 *   "Sit. " + "Reg"
 *   31 valores situação (ES, FR, etc.)
 *   "Totais do Mês:"
 *   total jornada (ex: "80:34")
 *   total voo (ex: "50:20")
 */
export function parseFira(textoExtraido: string): FiraParseResult {
  if (!textoExtraido || textoExtraido.trim().length < 20) {
    throw new Error('Não foi possível extrair texto do PDF (conteúdo vazio)');
  }

  const erros: string[] = [];

  // ── Construir lista de linhas não-vazias (sem form-feed) ─────
  const lines = textoExtraido
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== '\x0c');

  // Helper: índice da primeira linha que corresponde ao predicate
  const findIdx = (pred: (l: string) => boolean, from = 0): number => {
    for (let i = from; i < lines.length; i++) if (pred(lines[i])) return i;
    return -1;
  };

  // Helper: todos os índices que correspondem ao predicate
  const findAll = (pred: (l: string) => boolean): number[] => {
    const r: number[] = [];
    for (let i = 0; i < lines.length; i++) if (pred(lines[i])) r.push(i);
    return r;
  };

  // Helper: coletar exatamente n linhas a partir do índice start
  const collectN = (start: number, n: number): string[] =>
    start >= 0 ? lines.slice(start, start + n) : Array(n).fill('-');

  // ── 1. Empresa ───────────────────────────────────────────────
  const empresa = lines[0] ?? '';

  // ── 2. Ano ───────────────────────────────────────────────────
  const anoMatch = textoExtraido.match(/\b(20\d{2})\b/);
  if (!anoMatch) throw new Error('Ano não encontrado no cabeçalho da FIRA');
  const ano = parseInt(anoMatch[1], 10);

  // ── 3. Mês ───────────────────────────────────────────────────
  // Estratégia em cascata — cada passo é mais tolerante que o anterior.
  // ATENÇÃO: "RIO DE JANEIRO" pode aparecer no endereço/base contratual.
  //          Nunca usar regex global sem âncoras no texto cru.

  const TODOS_MESES = [...MESES_NOMES, 'MARÇO'];
  const mesNomeReFull = new RegExp(`^(${TODOS_MESES.join('|')})$`, 'i');
  const mesNomeParcial = new RegExp(`\\b(${TODOS_MESES.join('|')})\\b`, 'i');

  let mesNomeOriginal = '';

  // P0: regex direta no texto cru ancorada no label do cabeçalho.
  // Ex.: "Ano 2026 Mês ABRIL" ou "Mês: ABRIL".
  if (!mesNomeOriginal) {
    const headerMonthMatch = textoExtraido.match(
      /\bM[eê]s\b\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇ]{3,15})/i,
    );
    if (headerMonthMatch?.[1]) {
      mesNomeOriginal = resolveMonthFromText(headerMonthMatch[1]);
    }
  }

  // P1: âncora estrutural — label 'Mês'/'Mes' → próximas linhas com nome de mês
  const mesLabelIdx = lines.findIndex((l) => /^M[eê]s$/i.test(l));
  if (mesLabelIdx >= 0) {
    for (const offset of [2, 1, 3, 4]) {
      const cand = (lines[mesLabelIdx + offset] ?? '').toUpperCase().trim();
      if (mesNomeReFull.test(cand)) {
        mesNomeOriginal = cand;
        break;
      }
    }
  }

  // P2: qualquer linha cujo conteúdo COMPLETO é exatamente um nome de mês
  //     "RIO DE JANEIRO" não passa pois contém mais de uma palavra
  if (!mesNomeOriginal) {
    const found = lines.find((l) => mesNomeReFull.test(l.trim()));
    if (found) mesNomeOriginal = found.trim().toUpperCase();
  }

  // P3: linha curta (≤ 3 palavras) contendo nome de mês — primeiras 40 linhas
  if (!mesNomeOriginal) {
    const found = lines.slice(0, 40).find((l) => {
      const words = l.trim().split(/\s+/);
      return words.length <= 3 && mesNomeParcial.test(l);
    });
    if (found) {
      const m = found.match(mesNomeParcial);
      if (m) mesNomeOriginal = m[1].toUpperCase();
    }
  }

  // P4: no texto bruto, procurar ANO adjacente ao MÊS (dentro de 60 chars)
  //     "Rio de JANEIRO" nunca tem um ano ao lado → evita false-positive
  if (!mesNomeOriginal) {
    const yearStr = anoMatch[1]; // ex: "2026"
    const anoMesRe = new RegExp(
      `(?:${yearStr}[\\s\\S]{0,60}(${TODOS_MESES.join('|')})|(${TODOS_MESES.join('|')})[\\s\\S]{0,60}${yearStr})`,
      'i',
    );
    const m4 = textoExtraido.match(anoMesRe);
    if (m4) mesNomeOriginal = (m4[1] ?? m4[2]).toUpperCase();
  }

  // P5: fallback numérico extremamente restrito ao mesmo ano do cabeçalho.
  // Evita confundir "Data de Revisão: 02/08/2021" com o mês operacional da FIRA.
  if (!mesNomeOriginal) {
    const mesesDetectados: number[] = [];
    const yearStr = anoMatch[1];

    const reDataCompletaMesmoAno = new RegExp(
      `\\b\\d{1,2}[\\/-](0?[1-9]|1[0-2])[\\/-]${yearStr}\\b`,
      'g',
    );
    const reMesAnoMesmoAno = new RegExp(`\\b(0?[1-9]|1[0-2])\\s*[\\/-]\\s*${yearStr}\\b`, 'g');
    const reAnoMesMesmoAno = new RegExp(`\\b${yearStr}\\s*[\\/-]\\s*(0?[1-9]|1[0-2])\\b`, 'g');

    for (const m of textoExtraido.matchAll(reDataCompletaMesmoAno)) {
      mesesDetectados.push(parseInt(m[1], 10));
    }
    for (const m of textoExtraido.matchAll(reMesAnoMesmoAno)) {
      mesesDetectados.push(parseInt(m[1], 10));
    }
    for (const m of textoExtraido.matchAll(reAnoMesMesmoAno)) {
      mesesDetectados.push(parseInt(m[1], 10));
    }

    if (mesesDetectados.length > 0) {
      const freq = new Map<number, number>();
      for (const detectedMonth of mesesDetectados) {
        if (detectedMonth >= 1 && detectedMonth <= 12) {
          freq.set(detectedMonth, (freq.get(detectedMonth) ?? 0) + 1);
        }
      }
      const mesMaisFrequente = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (mesMaisFrequente && mesMaisFrequente >= 1 && mesMaisFrequente <= 12) {
        mesNomeOriginal = MESES_NUM_TO_NOME[mesMaisFrequente] || '';
      }
    }
  }

  if (!mesNomeOriginal) throw new Error('Mês não encontrado no cabeçalho da FIRA');

  const mesNomeNorm = normalizeMonthToken(mesNomeOriginal);
  const mes = MESES[mesNomeOriginal] ?? MESES[mesNomeNorm];
  if (!mes) throw new Error(`Mês inválido: "${mesNomeOriginal}"`);

  const normalizeCanac = (value: string): string => {
    const digits = (value ?? '').replace(/\D/g, '');
    return digits;
  };

  // ── 3.1. Modo compacto (unpdf colapsa tudo em 1 linha) ──────
  const DIAS_SEMANA_RE = '(SEG|TER|QUA|QUI|SEX|SÁB|SAB|DOM)';
  const compactText = lines.join(' ');
  const isCompactMode =
    lines.length <= 2 &&
    /\bTRIPULANTE\b/i.test(compactText) &&
    new RegExp(`\\b\\d{2}\\s+${DIAS_SEMANA_RE}\\b`, 'i').test(compactText);

  if (isCompactMode) {
    const empresaMatch = compactText.match(/^(.*?)\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    const empresaCompact = (empresaMatch?.[1] ?? '').trim() || 'Empresa';

    const nomeCanacMatch =
      compactText.match(
        /Base\s+Contratual\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇ\s]{4,}?)\s+(\d[\d.\-/]{3,12})\s+TRIPULANTE/i,
      ) ?? compactText.match(/([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇ\s]{4,}?)\s+(\d[\d.\-/]{3,12})\s+TRIPULANTE/i);

    const nomeCompact = nomeCanacMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
    let canacCompact = normalizeCanac(nomeCanacMatch?.[2]?.trim() ?? '');

    if (!canacCompact || !/^\d{5,8}$/.test(canacCompact)) {
      const mCanacLabel = compactText.match(/\b(?:CANAC|ANAC)\s*[:\-]?\s*(\d[\d.\-/]{3,12})/i);
      if (mCanacLabel) canacCompact = normalizeCanac(mCanacLabel[1]);
    }

    if (!canacCompact || !/^\d{5,8}$/.test(canacCompact)) {
      const mAntesTrip = compactText.match(/(\d[\d.\-/]{3,12})\s+TRIPULANTE/i);
      if (mAntesTrip) canacCompact = normalizeCanac(mAntesTrip[1]);
    }

    if (!canacCompact || !/^\d{5,8}$/.test(canacCompact)) {
      throw new Error('CANAC não encontrado no cabeçalho da FIRA (modo compacto)');
    }

    const baseMatch = compactText.match(/TRIPULANTE\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇ\s]{3,}?)\s+Dia\b/i);
    const baseContratualCompact = baseMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? '';

    const dayLineRe = new RegExp(
      `\\b(\\d{2})\\s+${DIAS_SEMANA_RE}\\s+([A-Z-]{1,2})\\s+([A-Z0-9-]{1,6})\\s+(-|\\d{1,3}:\\d{2})\\s+(-|\\d{1,3}:\\d{2})\\s+(-|\\d{1,3}:\\d{2})\\s+(-|\\d{1,3}:\\d{2})`,
      'gi',
    );

    const diasMap = new Map<number, FiraLinhaDia>();
    for (const m of compactText.matchAll(dayLineRe)) {
      const dia = parseInt(m[1], 10);
      if (isNaN(dia) || dia < 1 || dia > 31 || diasMap.has(dia)) continue;
      const diaSemana = (m[2] ?? '').toUpperCase();
      const situacao = (m[3] ?? '-').toUpperCase();
      const localRaw = (m[4] ?? '-').toUpperCase();
      const inicioRaw = m[5] ?? '-';
      const terminoRaw = m[6] ?? '-';
      const jornadaRaw = m[7] ?? '-';
      const vooRaw = m[8] ?? '-';

      diasMap.set(dia, {
        dia,
        diaSemana,
        situacao,
        local: localRaw === '-' ? null : localRaw,
        inicio: inicioRaw === '-' ? null : inicioRaw,
        termino: terminoRaw === '-' ? null : terminoRaw,
        totalJornada: jornadaRaw === '-' ? null : jornadaRaw,
        totalVoo: vooRaw === '-' ? null : vooRaw,
      });
    }

    const diasNoMesCompact = new Date(ano, mes, 0).getDate();
    const dias = Array.from(diasMap.values()).sort((a, b) => a.dia - b.dia);

    if (dias.length >= 20 && dias.length < diasNoMesCompact) {
      const existentes = new Set(dias.map((d) => d.dia));
      for (let dia = 1; dia <= diasNoMesCompact; dia++) {
        if (existentes.has(dia)) continue;
        dias.push({
          dia,
          diaSemana: '',
          situacao: '-',
          local: null,
          inicio: null,
          termino: null,
          totalJornada: null,
          totalVoo: null,
        });
      }
      dias.sort((a, b) => a.dia - b.dia);
      erros.push(
        `Modo compacto com ${diasMap.size} dias detectados; ${diasNoMesCompact - diasMap.size} dia(s) preenchidos como vazio`,
      );
    }

    if (dias.length < 20) {
      throw new Error(`Apenas ${dias.length} dias extraídos no modo compacto (esperado 28–31)`);
    }

    let totalJornadaMes = '0:00';
    let totalVooMes = '0:00';
    const totaisAntesLabel = compactText.match(
      /(\d{1,3}:\d{2})\s+(\d{1,3}:\d{2})\s*Totais\s+do\s+M[eê]s/i,
    );
    const totaisDepoisLabel = compactText.match(
      /Totais\s+do\s+M[eê]s:?\s*(\d{1,3}:\d{2})\s+(\d{1,3}:\d{2})/i,
    );
    if (totaisAntesLabel) {
      totalJornadaMes = totaisAntesLabel[1];
      totalVooMes = totaisAntesLabel[2];
    } else if (totaisDepoisLabel) {
      totalJornadaMes = totaisDepoisLabel[1];
      totalVooMes = totaisDepoisLabel[2];
    }

    const somaVooMinCompact = dias.reduce((acc, d) => acc + hhmmToMin(d.totalVoo ?? '0:00'), 0);
    const temMovimentoOperacionalCompacto = temMovimentoOperacional(dias);
    if (!temMovimentoOperacionalCompacto) {
      totalJornadaMes = '0:00';
      totalVooMes = '0:00';
    }

    const totalVooMinCompact = hhmmToMin(totalVooMes);

    if (
      temMovimentoOperacionalCompacto &&
      totalVooMinCompact > 0 &&
      Math.abs(somaVooMinCompact - totalVooMinCompact) > 5
    ) {
      erros.push(
        `Divergência nos totais de HV (compacto): soma = ${Math.floor(somaVooMinCompact / 60)}:${String(somaVooMinCompact % 60).padStart(2, '0')}, declarado = ${totalVooMes}`,
      );
    }

    const cabecalhoCompact: FiraCabecalho = {
      nome: nomeCompact || 'Aeronauta',
      canac: canacCompact,
      baseContratual: baseContratualCompact,
      ano,
      mes,
      mesNome: mesNomeOriginal,
      empresa: empresaCompact,
    };

    return {
      cabecalho: cabecalhoCompact,
      dias,
      totalJornadaMes,
      totalVooMes,
      erros,
    };
  }

  const isNomeLinhaValida = (line: string): boolean => {
    const l = (line ?? '').trim();
    if (!l || l.length < 4) return false;
    if (/\d/.test(l)) return false;
    if (/^(IN[IÍ]CIO|T[EÉ]RMINO|JORNADA|VOO|DIA|SIT\.?|REG|LOCAL|M[EÊ]S|ANO|EMPRESA)$/i.test(l)) {
      return false;
    }
    const words = l.split(/\s+/);
    return words.length >= 2;
  };

  // ── 4. CANAC e Nome ──────────────────────────────────────────
  // Padrão estrutural nas linhas não-vazias:
  //   [tripIdx - 2] = nome
  //   [tripIdx - 1] = CANAC (5-7 dígitos isolados)
  //   [tripIdx    ] = "TRIPULANTE"
  const tripIdx = lines.findIndex((l) => /^TRIPULANTE$/i.test(l) || /\bTRIPULANTE\b/i.test(l));
  if (tripIdx < 2) throw new Error('Cabeçalho FIRA inválido (TRIPULANTE não encontrado)');

  // Se TRIPULANTE está numa linha curta sozinha: nome = -2, canac = -1
  // Se TRIPULANTE está na mesma linha que outros dados: procurar canac nas 5 linhas anteriores
  let canac = '';
  let nome = '';

  // Estratégia 0: na própria linha do TRIPULANTE (mais confiável para layout da FIRA)
  const tripLine = lines[tripIdx] ?? '';
  const canacNaMesmaLinha = tripLine.match(/\b(\d{5,8})\b(?=[^\n]*\bTRIPULANTE\b)/i);
  if (canacNaMesmaLinha) {
    canac = normalizeCanac(canacNaMesmaLinha[1]);
    const nomeNaLinha = tripLine.match(/^(.+?)\s+\d{5,8}\s+TRIPULANTE\b/i);
    if (nomeNaLinha?.[1] && isNomeLinhaValida(nomeNaLinha[1])) {
      nome = nomeNaLinha[1].replace(/\s+/g, ' ').trim();
    }
  }

  // ── Estratégia 1: linha imediatamente antes de TRIPULANTE é só dígitos ──
  if (!canac && /^\d{5,8}$/.test(lines[tripIdx - 1]?.trim() ?? '')) {
    canac = normalizeCanac(lines[tripIdx - 1].trim());
    nome = lines[tripIdx - 2]?.trim() ?? '';
  } else if (!canac) {
    // ── Estratégia 2: busca regressiva até 10 linhas antes de TRIPULANTE ──
    // Para cada linha, extrair sequências de dígitos individuais (não concatenar tudo)
    for (let k = tripIdx - 1; k >= Math.max(0, tripIdx - 10) && !canac; k--) {
      const lineRaw = lines[k].trim();
      // Tentar extrair um número de 5-8 dígitos isolado na linha (com ou sem pontuação formatadora)
      const seqMatch = lineRaw.match(/\b(\d{5,8})\b/) ?? lineRaw.match(/(\d[\d.\-/]{4,9})/);
      if (seqMatch) {
        const candidate = normalizeCanac(seqMatch[1]);
        if (/^\d{5,8}$/.test(candidate)) {
          canac = candidate;
          // Nome: linha acima válida
          for (let n = k - 1; n >= Math.max(0, k - 5) && !nome; n--) {
            const l = lines[n].trim();
            if (isNomeLinhaValida(l)) nome = l;
          }
          break;
        }
      }
      // Fallback: normalizar linha inteira e checar se resulta em 5-8 dígitos
      const lineNorm = normalizeCanac(lineRaw);
      if (/^\d{5,8}$/.test(lineNorm)) {
        canac = lineNorm;
        for (let n = k - 1; n >= Math.max(0, k - 5) && !nome; n--) {
          const l = lines[n].trim();
          if (isNomeLinhaValida(l)) nome = l;
        }
        break;
      }
    }
  }

  // ── Estratégia 3: janela textual ao redor de TRIPULANTE (regex mais permissivo) ──
  if (!canac || canac.length < 5) {
    const winStart = Math.max(0, tripIdx - 15);
    const winEnd = Math.min(lines.length, tripIdx + 4);
    const janela = lines.slice(winStart, winEnd).join(' ');

    // 3a: nome + número + TRIPULANTE (mais permissivo — aceita qualquer texto como nome)
    const padraoNomeCanacAntesTrip =
      /(\S[\w\sÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇáéíóúâêîôûãõàèìòùç'.-]{2,}?)\s+(\d[\d.\-/]{3,12})\s+TRIPULANTE\b/i;
    const m1 = janela.match(padraoNomeCanacAntesTrip);
    if (m1) {
      if (!nome) nome = m1[1].replace(/\s+/g, ' ').trim();
      canac = normalizeCanac(m1[2]);
    }

    // 3b: label explícito CANAC/ANAC
    if (!canac || canac.length < 5) {
      const m2 = janela.match(/\b(?:CANAC|ANAC)\s*[:\-]?\s*(\d[\d.\-/]{3,12})\b/i);
      if (m2) canac = normalizeCanac(m2[1]);
    }

    // 3c: qualquer número 5-8 dígitos na janela — tomar o mais próximo antes de TRIPULANTE
    if (!canac || canac.length < 5) {
      const tripPosInJanela = janela.toUpperCase().lastIndexOf('TRIPULANTE');
      if (tripPosInJanela > 0) {
        const textAntesTrip = janela.slice(0, tripPosInJanela);
        const allNums = [...textAntesTrip.matchAll(/\b(\d{5,8})\b/g)].filter((m) => {
          const idx = m.index ?? -1;
          if (idx < 0) return false;
          const contexto = textAntesTrip.slice(Math.max(0, idx - 12), idx).toUpperCase();
          // Evitar capturar CEP (ex: "CEP 22775-904") como CANAC
          return !/CEP\s*$/.test(contexto);
        });
        if (allNums.length > 0) {
          // Pegar o número mais próximo do TRIPULANTE (último match)
          canac = allNums[allNums.length - 1][1];
        }
      }
    }

    if (!nome) {
      for (let n = tripIdx - 1; n >= Math.max(0, tripIdx - 10); n--) {
        const l = lines[n].trim();
        if (isNomeLinhaValida(l)) {
          nome = l;
          break;
        }
      }
    }
  }

  // ── Estratégia 4: varredura no texto bruto completo — número 5-8 dígitos antes de TRIPULANTE ──
  if (!canac || canac.length < 5) {
    const textUp = textoExtraido.toUpperCase();
    const firstTripPos = textUp.indexOf('TRIPULANTE');
    if (firstTripPos > 0) {
      const textBefore = textoExtraido.slice(Math.max(0, firstTripPos - 500), firstTripPos);
      const allNums = [...textBefore.matchAll(/\b(\d{5,8})\b/g)].filter((m) => {
        const idx = m.index ?? -1;
        if (idx < 0) return false;
        const contexto = textBefore.slice(Math.max(0, idx - 12), idx).toUpperCase();
        return !/CEP\s*$/.test(contexto);
      });
      if (allNums.length > 0) {
        canac = allNums[allNums.length - 1][1];
      }
    }
  }

  if (!canac || !/^\d{5,8}$/.test(canac)) {
    const contexto = lines.slice(Math.max(0, tripIdx - 5), Math.min(lines.length, tripIdx + 3));
    throw new Error(
      `CANAC não encontrado perto de TRIPULANTE — candidato: "${canac}" — contexto: ${contexto.join(' | ')}`,
    );
  }
  if (!nome || nome.length < 2) {
    nome = 'Aeronauta';
  }

  // ── 5. Base Contratual ───────────────────────────────────────
  // Vem logo após "TRIPULANTE" (ex: "RIO DE JANEIRO")
  const baseContratual =
    tripIdx + 1 < lines.length && !/^\d/.test(lines[tripIdx + 1]) && lines[tripIdx + 1] !== 'Nome'
      ? lines[tripIdx + 1]
      : '';

  // ── 6. Dias no mês ───────────────────────────────────────────
  const diasNoMes = new Date(ano, mes, 0).getDate();

  // ── 7. Blocos colunar ─────────────────────────────────────────

  // Helper: comparar strings normalizando acentos e espaços
  const normalizeStr = (s: string) =>
    s
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const eqNorm = (a: string, b: string) => normalizeStr(a) === normalizeStr(b);
  const HORA_RE = /\b(\d{1,3}:\d{2})\b/;
  const HORA_GLOBAL_RE = /\b(\d{1,3}:\d{2})\b/g;
  const DIAS_SEMANA_INLINE_RE = '(DOM|SEG|TER|QUA|QUI|SEX|SÁB|SAB)';

  const extrairHora = (raw: string): string | null => {
    const v = (raw ?? '').trim();
    if (!v || v === '-') return null;
    if (/^\d{1,3}:\d{2}$/.test(v)) return v;
    const m = v.match(HORA_RE);
    return m?.[1] ?? null;
  };

  const extrairLocal = (raw: string): string | null => {
    const v = (raw ?? '').trim().toUpperCase();
    if (!v || v === '-') return null;
    if (/^[A-Z0-9]{4}$/.test(v)) return v;
    const m = v.match(/\b[A-Z0-9]{4}\b/);
    return m?.[0] ?? null;
  };

  const extrairSituacao = (raw: string): string => {
    const v = (raw ?? '').trim().toUpperCase();
    if (!v || v === '-') return '-';
    const m = v.match(/\b(ES|FR|FE|FS|AM|DM|OT|RE|SA|TS|TV|EX|-)\b/);
    return m?.[1] ?? '-';
  };

  // 7x. Modo por LINHAS de tabela (layout clássico da FIRA da Costa do Sol)
  // Exemplo de linha: "01 DOM - SBME 10:30 19:25 ... 07:55 02:44"
  const linhaTabelaRe =
    /^(\d{1,2})\s+(DOM|SEG|TER|QUA|QUI|SEX|SÁB|SAB)\s+([A-Z-]{1,3})\s+([A-Z0-9-]{1,6})\s+(.*)$/i;
  const linhasTabela = lines
    .map((l) => {
      const m = l.match(linhaTabelaRe);
      if (!m) return null;
      const tokensRest = (m[5] ?? '').trim().split(/\s+/).filter(Boolean);
      const tokensHora = tokensRest.filter((t) => /^\d{1,3}:\d{2}$/.test(t) || t === '-');
      // Precisamos pelo menos de início, término, jornada e voo
      if (tokensHora.length < 4) return null;
      return {
        dia: parseInt(m[1], 10),
        diaSemana: m[2].toUpperCase(),
        situacao: m[3].toUpperCase(),
        local: m[4].toUpperCase(),
        inicio: tokensHora[0] ?? '-',
        termino: tokensHora[1] ?? '-',
        totalJornada: tokensHora[tokensHora.length - 2] ?? '-',
        totalVoo: tokensHora[tokensHora.length - 1] ?? '-',
      };
    })
    .filter((v): v is NonNullable<typeof v> => !!v)
    .filter((v) => !isNaN(v.dia) && v.dia >= 1 && v.dia <= 31);

  if (linhasTabela.length >= 20) {
    const diasMap = new Map<number, FiraLinhaDia>();
    for (const l of linhasTabela) {
      if (diasMap.has(l.dia)) continue;
      diasMap.set(l.dia, {
        dia: l.dia,
        diaSemana: l.diaSemana,
        situacao: l.situacao,
        local: l.local === '-' ? null : l.local,
        inicio: l.inicio === '-' ? null : l.inicio,
        termino: l.termino === '-' ? null : l.termino,
        totalJornada: l.totalJornada === '-' ? null : l.totalJornada,
        totalVoo: l.totalVoo === '-' ? null : l.totalVoo,
      });
    }

    const dias = Array.from(diasMap.values()).sort((a, b) => a.dia - b.dia);
    if (dias.length >= 20) {
      let totalJornadaMes = '0:00';
      let totalVooMes = '0:00';

      const totaisLinha = lines.find((l) => /Totais\s+do\s+M[eê]s/i.test(l));
      if (totaisLinha) {
        const horas = [...totaisLinha.matchAll(/\b(\d{1,3}:\d{2})\b/g)].map((m) => m[1]);
        if (horas.length >= 2) {
          totalJornadaMes = horas[horas.length - 2];
          totalVooMes = horas[horas.length - 1];
        }
      }
      if (totalJornadaMes === '0:00' && totalVooMes === '0:00') {
        const flatHoras = textoExtraido.match(
          /Totais\s+do\s+M[eê]s[\s\S]{0,40}?(\d{1,3}:\d{2})\s+(\d{1,3}:\d{2})/i,
        );
        if (flatHoras?.[1] && flatHoras?.[2]) {
          totalJornadaMes = flatHoras[1];
          totalVooMes = flatHoras[2];
        }
      }

      const temMov = temMovimentoOperacional(dias);
      if (!temMov) {
        totalJornadaMes = '0:00';
        totalVooMes = '0:00';
      }

      return {
        cabecalho: {
          nome,
          canac,
          baseContratual,
          ano,
          mes,
          mesNome: mesNomeOriginal,
          empresa,
        },
        dias,
        totalJornadaMes,
        totalVooMes,
        erros,
      };
    }
  }

  // 7a. Local: após label "Local", coletar diasNoMes valores
  const localIdx = findIdx((l) => eqNorm(l, 'Local'));
  const localVals = collectN(localIdx + 1, diasNoMes);

  // 7b. Início / Término data:
  //   O PDF tem 3 pares de headers "Início"/"Término" seguidos,
  //   depois os dados de Jornada Início (31 linhas) e Término (31 linhas).
  //   Pular todos os headers consecutivos (Início/Término) para chegar nos dados.
  const isIniOrTer = (l: string) =>
    eqNorm(l, 'Início') || eqNorm(l, 'Termino') || eqNorm(l, 'Término');
  let iniDataStart = findIdx((l) => eqNorm(l, 'Início'));
  if (iniDataStart >= 0) {
    while (iniDataStart < lines.length && isIniOrTer(lines[iniDataStart])) {
      iniDataStart++;
    }
  }
  const inicioVals = collectN(iniDataStart, diasNoMes);
  const terminoVals = collectN(iniDataStart + diasNoMes, diasNoMes);

  // 7c. Jornada durations: "Jornada" aparece 2x — usar a 2ª ocorrência (dados)
  const jornIdxs = findAll((l) => eqNorm(l, 'Jornada'));
  const jornDataIdx = jornIdxs.length >= 2 ? jornIdxs[1] : (jornIdxs[0] ?? -1);
  const jornVals = collectN(jornDataIdx + 1, diasNoMes);

  // 7d. Voo durations: "Voo" aparece apenas 1x como seção de dados
  const vooIdx = findIdx((l) => eqNorm(l, 'Voo'));
  const vooVals = collectN(vooIdx + 1, diasNoMes);

  // 7e. Dias (Dia + dia-da-semana): após label "Dia"
  //   Algumas entradas são split em 2 linhas: "02" e "TER" separados
  const diaIdx = findIdx((l) => eqNorm(l, 'Dia'));
  const diaEntries: { dia: number; diaSemana: string }[] = [];
  if (diaIdx >= 0) {
    let i = diaIdx + 1;
    while (i < lines.length && diaEntries.length < diasNoMes) {
      const l = lines[i];
      // Para no próximo bloco de metadados
      if (/^(Sit\.|Fora de|Em Servi|Situa)/i.test(l)) break;
      const fullM = l.match(/^(\d{1,2})\s+([A-ZÁÉÍÓÚ]{2,4})$/);
      const numM = l.match(/^(\d{1,2})$/);
      if (fullM) {
        diaEntries.push({ dia: parseInt(fullM[1], 10), diaSemana: fullM[2] });
        i++;
      } else if (numM) {
        const dayNum = parseInt(numM[1], 10);
        const next = lines[i + 1] ?? '';
        if (/^[A-ZÁÉÍÓÚ]{2,4}$/.test(next)) {
          diaEntries.push({ dia: dayNum, diaSemana: next });
          i += 2;
        } else {
          diaEntries.push({ dia: dayNum, diaSemana: '' });
          i++;
        }
      } else {
        i++;
      }
    }
  }

  // 7f. Situação Regulamentar: após "Sit." / "Sit. " / "Sit. Reg"
  const sitIdx = findIdx((l) => /^Sit\.?\s*(Reg)?$/i.test(l));
  const sitDataStart =
    sitIdx >= 0 ? (/^Reg$/i.test(lines[sitIdx + 1] ?? '') ? sitIdx + 2 : sitIdx + 1) : -1;
  const sitVals = collectN(sitDataStart, diasNoMes);

  // 7g. Totais do mês: após "Totais do Mês:" (ou variações)
  const totaisIdx = findIdx((l) => /totais\s+do\s+m/i.test(l));
  let totalJornadaMes =
    totaisIdx >= 0 && totaisIdx + 1 < lines.length ? lines[totaisIdx + 1] : '0:00';
  let totalVooMes = totaisIdx >= 0 && totaisIdx + 2 < lines.length ? lines[totaisIdx + 2] : '0:00';

  // ── 8. Montar linhas diárias ──────────────────────────────────
  const dias: FiraLinhaDia[] = [];

  for (let d = 0; d < diasNoMes; d++) {
    const diaInfo = diaEntries[d] ?? { dia: d + 1, diaSemana: '' };
    const sitRaw = (sitVals[d] ?? '-').trim();
    const localRaw = (localVals[d] ?? '-').trim();
    const iniRaw = (inicioVals[d] ?? '-').trim();
    const terRaw = (terminoVals[d] ?? '-').trim();
    const jornRaw = (jornVals[d] ?? '-').trim();
    const vooRaw = (vooVals[d] ?? '-').trim();

    let sit = extrairSituacao(sitRaw);
    let local = extrairLocal(localRaw);
    let ini = extrairHora(iniRaw);
    let ter = extrairHora(terRaw);
    let jorn = extrairHora(jornRaw);
    let voo = extrairHora(vooRaw);

    const combinado = `${sitRaw} ${localRaw} ${iniRaw} ${terRaw} ${jornRaw} ${vooRaw}`;
    const rowInline = combinado.match(
      new RegExp(
        `\\b(\\d{1,2})\\s+${DIAS_SEMANA_INLINE_RE}\\s+([A-Z-]{1,3})\\s+([A-Z0-9-]{1,6})\\s+(-|\\d{1,3}:\\d{2})\\s+(-|\\d{1,3}:\\d{2})\\s+(-|\\d{1,3}:\\d{2})\\s+(-|\\d{1,3}:\\d{2})`,
        'i',
      ),
    );

    if (rowInline) {
      sit = rowInline[2]?.toUpperCase?.() ?? sit;
      local = rowInline[3] === '-' ? null : rowInline[3]?.toUpperCase?.();
      ini = rowInline[4] === '-' ? null : rowInline[4];
      ter = rowInline[5] === '-' ? null : rowInline[5];
      jorn = rowInline[6] === '-' ? null : rowInline[6];
      voo = rowInline[7] === '-' ? null : rowInline[7];
    } else {
      const horasCombinadas = [...combinado.matchAll(HORA_GLOBAL_RE)].map((m) => m[1]);
      if (!ini && horasCombinadas.length >= 1) ini = horasCombinadas[0];
      if (!ter && horasCombinadas.length >= 2) ter = horasCombinadas[1];
      if (!jorn && horasCombinadas.length >= 3) jorn = horasCombinadas[horasCombinadas.length - 2];
      if (!voo && horasCombinadas.length >= 4) voo = horasCombinadas[horasCombinadas.length - 1];
    }

    dias.push({
      dia: diaInfo.dia || d + 1,
      diaSemana: diaInfo.diaSemana,
      situacao: sit,
      local,
      inicio: ini,
      termino: ter,
      totalJornada: jorn,
      totalVoo: voo,
    });
  }

  if (dias.length < 28) {
    erros.push(
      `Apenas ${dias.length} dias extraídos (esperado ${diasNoMes}). Verificar formato do PDF.`,
    );
  }

  // ── 9. Validação cruzada de totais ────────────────────────────
  const temMovimentoOperacionalDetectado = temMovimentoOperacional(dias);
  if (!temMovimentoOperacionalDetectado) {
    totalJornadaMes = '0:00';
    totalVooMes = '0:00';
  }

  const somaVooMin = dias.reduce((acc, d) => acc + hhmmToMin(d.totalVoo ?? '0:00'), 0);
  const totalVooMin = hhmmToMin(totalVooMes);

  if (
    temMovimentoOperacionalDetectado &&
    totalVooMin > 0 &&
    Math.abs(somaVooMin - totalVooMin) > 5
  ) {
    erros.push(
      `Divergência nos totais de HV: soma = ${Math.floor(somaVooMin / 60)}:${String(somaVooMin % 60).padStart(2, '0')}, ` +
        `declarado = ${totalVooMes}`,
    );
  }

  // ── Resultado ────────────────────────────────────────────────
  const cabecalho: FiraCabecalho = {
    nome,
    canac,
    baseContratual,
    ano,
    mes,
    mesNome: mesNomeOriginal,
    empresa,
  };

  return { cabecalho, dias, totalJornadaMes, totalVooMes, erros };
}

// ──────────────────────────────────────────────────────────────
// Mapeamento FIRA situação → status FRMS
// ──────────────────────────────────────────────────────────────

const FIRA_TO_FRMS_STATUS: Record<string, string> = {
  ES: 'ES',
  FR: 'FR',
  FE: 'FE',
  FS: 'FS',
  AM: 'AM',
  DM: 'DM',
  OT: 'OT',
  RE: 'RE',
  SA: 'SA',
  TS: 'TS',
  TV: 'TV',
  EX: 'EX',
};

export function mapFiraSituacaoToFrmsStatus(situacao: string, temJornada: boolean): string {
  const codigo = (situacao || '').toUpperCase().trim();
  const mapped = FIRA_TO_FRMS_STATUS[codigo];
  if (mapped) return mapped;
  // situacao = "-"
  return temJornada ? 'ES' : 'FR';
}

// ──────────────────────────────────────────────────────────────
// Conversor linha FIRA → SalvarJornadaInput
// ──────────────────────────────────────────────────────────────

export function firaLinhaToFrmsInput(
  linha: FiraLinhaDia,
  cabecalho: FiraCabecalho,
  tripulanteId: string,
  operadorId: string,
): SalvarJornadaInput {
  const temJornada = !!(linha.inicio && linha.termino);
  const status = mapFiraSituacaoToFrmsStatus(linha.situacao, temJornada);

  // Build date YYYY-MM-DD
  const mesStr = String(cabecalho.mes).padStart(2, '0');
  const diaStr = String(linha.dia).padStart(2, '0');
  const data = `${cabecalho.ano}-${mesStr}-${diaStr}`;

  return {
    tripulante_id: tripulanteId,
    data,
    status,
    hora_apresentacao: linha.inicio ?? null,
    hora_termino: linha.termino ?? null,
    horas_voo_minutos: hhmmToMin(linha.totalVoo ?? '') || null,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    observacao: null,
    registrado_por: operadorId,
    origem: 'FIRA',
    local_base: linha.local ?? null,
  } as SalvarJornadaInput & { local_base: string | null };
}
