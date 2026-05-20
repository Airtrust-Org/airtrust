import type {
  FiraImportacaoPreview,
  FiraLoteUploadItem,
  FiraLoteUploadResponse,
} from './frmsFiraTypes';

export interface ProcessFiraFileWithFallbackOptions {
  fetchFrmsImport: (path: string, init: RequestInit) => Promise<Response>;
  token?: string | null;
  onStatusChange?: (message: string | null) => void;
}

interface OcrRowData {
  dia: number;
  situacao: string;
  local: string;
  inicio: string;
  termino: string;
  jornada: string;
  voo: string;
}

interface OcrCompactFiraData {
  company: string;
  year: number;
  monthName: string;
  name: string;
  canac: string;
  base: string;
  totalJornada: string;
  totalVoo: string;
  rows: Map<number, OcrRowData>;
}

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{
            str?: string;
            transform?: number[];
          }>;
        }>;
        getViewport: (params: { scale: number }) => { width: number; height: number };
        render: (params: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
        cleanup: () => void;
      }>;
    }>;
  };
}

interface TesseractModule {
  PSM: {
    SINGLE_LINE: number;
    SPARSE_TEXT: number;
  };
  recognize: (
    image: HTMLCanvasElement,
    langs?: string,
    options?: Record<string, unknown>,
  ) => Promise<{ data?: { text?: string | null } }>;
}

const FIRA_LAYOUT = {
  topCompany: [0.46, 0.005, 0.81, 0.05],
  topYear: [0.85, 0.092, 0.985, 0.127],
  topMonth: [0.85, 0.126, 0.985, 0.161],
  headerLine: [0.03, 0.154, 0.975, 0.185],
  headerName: [0.03, 0.154, 0.47, 0.185],
  headerCanac: [0.47, 0.154, 0.58, 0.185],
  headerBase: [0.75, 0.154, 0.975, 0.185],
  totalJornada: [0.792, 0.666, 0.89, 0.69],
  totalVoo: [0.89, 0.666, 0.972, 0.69],
  rowTop: 0.235,
  rowHeight: 0.01445,
  rowSituacao: [0.082, 0.138],
  rowLocal: [0.14, 0.245],
  rowInicio: [0.245, 0.345],
  rowTermino: [0.345, 0.445],
  rowJornada: [0.79, 0.888],
  rowVoo: [0.888, 0.972],
  rowStrip: [0.14, 0.972],
} as const;

const MONTH_NAMES = [
  'JANEIRO',
  'FEVEREIRO',
  'MARCO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
] as const;

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'] as const;
const STATUS_CODES = new Set(['FE', 'FR', 'FS', 'AM', 'DM', 'TS', 'TV', 'EX', 'ES', 'RE', 'SA']);

function buildAuthHeaders(token?: string | null): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

function isExtractionFailure(error?: string | null): boolean {
  const msg = String(error ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return msg.includes('extrair texto do pdf') || msg.includes('conteudo vazio');
}

function withPageSuffix(file: File, pageNumber: number, pageCount: number): File {
  if (pageCount <= 1) return file;

  const dot = file.name.lastIndexOf('.');
  const base = dot >= 0 ? file.name.slice(0, dot) : file.name;
  const ext = dot >= 0 ? file.name.slice(dot) : '.pdf';
  return new File([file], `${base} - pagina ${pageNumber}${ext}`, {
    type: file.type || 'application/pdf',
    lastModified: file.lastModified,
  });
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeUpperText(value: string): string {
  return normalizeSpaces(
    stripDiacritics(value)
      .toUpperCase()
      .replace(/[|\[\]{}()]/g, ' ')
      .replace(/[^A-Z0-9:./\-\s]/g, ' '),
  );
}

function normalizeMonthName(value: string): string {
  const normalized = sanitizeUpperText(value);
  const found = MONTH_NAMES.find((monthName) => normalized.includes(monthName));
  return found ?? 'ABRIL';
}

function normalizeYear(value: string): number {
  const match = sanitizeUpperText(value).match(/(20\d{2}|1?20\d{2})/);
  if (!match) return new Date().getFullYear();
  const digits = match[1].replace(/\D/g, '');
  return Number(digits.slice(-4));
}

function normalizeName(value: string): string {
  return normalizeSpaces(
    sanitizeUpperText(value)
      .replace(/\b(NOME|CANAC|FB|EQUIP|BASE CONTRATUAL|TRIPULANTE)\b/g, ' ')
      .replace(/\bRIO DE JANEIRO\b/g, ' '),
  );
}

function normalizeBase(value: string): string {
  return normalizeSpaces(
    sanitizeUpperText(value)
      .replace(/\b(TRIPULANTE|FB|EQUIP|BASE CONTRATUAL)\b/g, ' ')
      .replace(/\bRIO DE JANE\b/g, 'RIO DE JANEIRO')
      .replace(/\bRIO DE JANEIRO\s+RIO DE JANEIRO\b/g, 'RIO DE JANEIRO'),
  );
}

function normalizeCanac(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.slice(0, 8);
}

function normalizeLocationToken(value: string): string {
  const token = sanitizeUpperText(value)
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B')
    .replace(/[^A-Z]/g, '');
  if (!token) return '-';
  if (token.length <= 4) return token;
  const swMatch = token.match(/S[WB][A-Z]{2}/);
  if (swMatch) return swMatch[0];
  return token.slice(0, 4);
}

function normalizeTimeToken(value: string): string {
  const digits = sanitizeUpperText(value)
    .replace(/[OQ]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/[^0-9]/g, '');

  if (digits.length >= 4) {
    const token = digits.slice(0, 4);
    const minutes = Number(token.slice(2));
    if (Number.isNaN(minutes) || minutes > 59) {
      return '-';
    }
    return `${token.slice(0, 2)}:${token.slice(2)}`;
  }

  if (digits.length === 3) {
    const minutes = Number(digits.slice(1));
    if (Number.isNaN(minutes) || minutes > 59) {
      return '-';
    }
    return `0${digits[0]}:${digits.slice(1)}`;
  }

  return '-';
}

function getWeekday(year: number, month: number, day: number): string {
  return WEEKDAYS[new Date(year, month - 1, day).getDay()] ?? 'SEG';
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Não foi possível clonar o canvas para OCR');
  }
  context.drawImage(source, 0, 0);
  return canvas;
}

function cropCanvas(
  source: HTMLCanvasElement,
  xStartRatio: number,
  yStartRatio: number,
  xEndRatio: number,
  yEndRatio: number,
  padding = 0,
): HTMLCanvasElement {
  const x = Math.max(0, Math.floor(source.width * xStartRatio) + padding);
  const y = Math.max(0, Math.floor(source.height * yStartRatio) + padding);
  const width = Math.max(1, Math.floor(source.width * xEndRatio) - x - padding * 2);
  const height = Math.max(1, Math.floor(source.height * yEndRatio) - y - padding * 2);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Não foi possível recortar o canvas para OCR');
  }
  context.drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function binarizeCanvas(source: HTMLCanvasElement, threshold = 180): HTMLCanvasElement {
  const canvas = cloneCanvas(source);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Não foi possível binarizar o canvas para OCR');
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const value = gray < threshold ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function removeFormLines(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = binarizeCanvas(source);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Não foi possível remover linhas do formulário');
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let y = 0; y < canvas.height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4] === 0) darkPixels += 1;
    }
    if (darkPixels <= canvas.width * 0.7) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      const row = y + dy;
      if (row < 0 || row >= canvas.height) continue;
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (row * canvas.width + x) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
      }
    }
  }

  for (let x = 0; x < canvas.width; x += 1) {
    let darkPixels = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      if (data[(y * canvas.width + x) * 4] === 0) darkPixels += 1;
    }
    if (darkPixels <= canvas.height * 0.3) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const column = x + dx;
      if (column < 0 || column >= canvas.width) continue;
      for (let y = 0; y < canvas.height; y += 1) {
        const index = (y * canvas.width + column) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
      }
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

async function recognizeCanvas(
  Tesseract: TesseractModule,
  canvas: HTMLCanvasElement,
  options?: Record<string, unknown>,
): Promise<string> {
  const result = await Tesseract.recognize(canvas, 'por+eng', {
    logger: () => {},
    ...options,
  });
  return normalizeSpaces(result.data?.text ?? '');
}

function buildCompactText(data: OcrCompactFiraData): string {
  const monthIndex = MONTH_NAMES.indexOf(data.monthName as (typeof MONTH_NAMES)[number]) + 1;
  const totalDays = new Date(data.year, monthIndex, 0).getDate();
  const rows: string[] = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const row = data.rows.get(day) ?? {
      dia: day,
      situacao: '-',
      local: '-',
      inicio: '-',
      termino: '-',
      jornada: '-',
      voo: '-',
    };

    rows.push(
      `${String(day).padStart(2, '0')} ${getWeekday(data.year, monthIndex, day)} ${row.situacao || '-'} ${row.local || '-'} ${row.inicio || '-'} ${row.termino || '-'} ${row.jornada || '-'} ${row.voo || '-'}`,
    );
  }

  return normalizeSpaces(
    `${data.company} FICHA INDIVIDUAL DE REGULAMENTACAO DO AERONAUTA ano ${data.year} mes ${data.monthName} Base Contratual ${data.name} ${data.canac} TRIPULANTE ${data.base} Dia ${rows.join(' ')} Totais do Mes ${data.totalJornada} ${data.totalVoo}`,
  );
}

async function extractStructuredCompactText(
  Tesseract: TesseractModule,
  page: {
    getViewport: (params: { scale: number }) => { width: number; height: number };
    render: (params: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
    cleanup: () => void;
  },
  pageNumber: number,
  pageCount: number,
  onStatusChange?: (message: string | null) => void,
): Promise<string> {
  onStatusChange?.(`Aplicando OCR na página ${pageNumber} de ${pageCount}...`);

  const viewport = page.getViewport({ scale: 2.8 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Não foi possível inicializar o canvas para OCR');
  }

  await page.render({ canvasContext: context, viewport }).promise;
  const cleanCanvas = removeFormLines(canvas);

  const companyCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.topCompany, 6);
  const yearCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.topYear, 6);
  const monthCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.topMonth, 6);
  const nameCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.headerName, 6);
  const canacCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.headerCanac, 6);
  const baseCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.headerBase, 6);
  const totalJornadaCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.totalJornada, 4);
  const totalVooCanvas = cropCanvas(cleanCanvas, ...FIRA_LAYOUT.totalVoo, 4);

  const [fullText, companyText, yearText, monthText, nameText, canacText, baseText, totalJornadaText, totalVooText] =
    await Promise.all([
      recognizeCanvas(Tesseract, cleanCanvas, { tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT }),
      recognizeCanvas(Tesseract, companyCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ',
      }),
      recognizeCanvas(Tesseract, yearCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: '0123456789',
      }),
      recognizeCanvas(Tesseract, monthCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      }),
      recognizeCanvas(Tesseract, nameCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ',
      }),
      recognizeCanvas(Tesseract, canacCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: '0123456789',
      }),
      recognizeCanvas(Tesseract, baseCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ',
      }),
      recognizeCanvas(Tesseract, totalJornadaCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: '0123456789:',
      }),
      recognizeCanvas(Tesseract, totalVooCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: '0123456789:',
      }),
    ]);

  const canac = normalizeCanac(canacText);

  if (!canac) {
    throw new Error('OCR não conseguiu identificar o CANAC da FIRA escaneada');
  }

  const name = normalizeName(nameText);
  const base = normalizeBase(baseText) || 'RIO DE JANEIRO';
  const monthName = normalizeMonthName(monthText || fullText);
  const year = normalizeYear(yearText || fullText);
  const company =
    sanitizeUpperText(companyText || 'COSTA DO SOL TAXI AEREO').replace(/\s+\d.*$/, '').trim() ||
    'COSTA DO SOL TAXI AEREO';
  const totalJornada = normalizeTimeToken(totalJornadaText);
  const totalVoo = normalizeTimeToken(totalVooText);
  const monthIndex = MONTH_NAMES.indexOf(monthName as (typeof MONTH_NAMES)[number]) + 1;
  const totalDays = new Date(year, monthIndex, 0).getDate();

  const rows = new Map<number, OcrRowData>();

  for (let day = 1; day <= totalDays; day += 1) {
    if (day === 1 || day % 5 === 0 || day === totalDays) {
      onStatusChange?.(`Aplicando OCR na página ${pageNumber} de ${pageCount} para o dia ${day}...`);
    }

    const yStart = FIRA_LAYOUT.rowTop + (day - 1) * FIRA_LAYOUT.rowHeight;
    const yEnd = yStart + FIRA_LAYOUT.rowHeight;

    const rowStripCanvas = cropCanvas(
      cleanCanvas,
      FIRA_LAYOUT.rowStrip[0],
      yStart,
      FIRA_LAYOUT.rowStrip[1],
      yEnd,
      2,
    );
    const rowStripText = sanitizeUpperText(
      await recognizeCanvas(Tesseract, rowStripCanvas, {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:- ',
      }),
    );
    const rowStripTimes = rowStripText
      .split(/\s+/)
      .map((token) => normalizeTimeToken(token))
      .filter((token) => token !== '-');
    const rowStripLocal = rowStripText.match(/\bS[WB][A-Z0-9]{2,3}\b/)?.[0] ?? '';
    const rowDigitCount = rowStripText.replace(/\D/g, '').length;
    const hasIcao = /\bS[WB][A-Z0-9]{2}\b/.test(rowStripText);
    if (!hasIcao && rowDigitCount < 6) {
      continue;
    }

    const situacaoCanvas = cropCanvas(
      cleanCanvas,
      FIRA_LAYOUT.rowSituacao[0],
      yStart,
      FIRA_LAYOUT.rowSituacao[1],
      yEnd,
      2,
    );
    const localCanvas = cropCanvas(
      cleanCanvas,
      FIRA_LAYOUT.rowLocal[0],
      yStart,
      FIRA_LAYOUT.rowLocal[1],
      yEnd,
      2,
    );
    const inicioCanvas = cropCanvas(
      cleanCanvas,
      FIRA_LAYOUT.rowInicio[0],
      yStart,
      FIRA_LAYOUT.rowInicio[1],
      yEnd,
      2,
    );
    const terminoCanvas = cropCanvas(
      cleanCanvas,
      FIRA_LAYOUT.rowTermino[0],
      yStart,
      FIRA_LAYOUT.rowTermino[1],
      yEnd,
      2,
    );
    const jornadaCanvas = cropCanvas(
      cleanCanvas,
      FIRA_LAYOUT.rowJornada[0],
      yStart,
      FIRA_LAYOUT.rowJornada[1],
      yEnd,
      2,
    );
    const vooCanvas = cropCanvas(
      cleanCanvas,
      FIRA_LAYOUT.rowVoo[0],
      yStart,
      FIRA_LAYOUT.rowVoo[1],
      yEnd,
      2,
    );

    const [situacaoText, localText, inicioText, terminoText, jornadaText, vooText] =
      await Promise.all([
        recognizeCanvas(Tesseract, situacaoCanvas, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-',
        }),
        recognizeCanvas(Tesseract, localCanvas, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        }),
        recognizeCanvas(Tesseract, inicioCanvas, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
          tessedit_char_whitelist: '0123456789:',
        }),
        recognizeCanvas(Tesseract, terminoCanvas, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
          tessedit_char_whitelist: '0123456789:',
        }),
        recognizeCanvas(Tesseract, jornadaCanvas, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
          tessedit_char_whitelist: '0123456789:',
        }),
        recognizeCanvas(Tesseract, vooCanvas, {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
          tessedit_char_whitelist: '0123456789:',
        }),
      ]);

    const situacaoToken = sanitizeUpperText(situacaoText).match(/\b[A-Z]{2}\b/)?.[0] ?? '-';
    let local = normalizeLocationToken(localText);
    let inicio = normalizeTimeToken(inicioText);
    let termino = normalizeTimeToken(terminoText);
    let jornada = normalizeTimeToken(jornadaText);
    let voo = normalizeTimeToken(vooText);

    if (local === '-' && rowStripLocal) {
      local = normalizeLocationToken(rowStripLocal);
    }

    const mergedTimes = [inicio, termino, jornada, voo];
    let stripIndex = 0;
    for (let index = 0; index < mergedTimes.length; index += 1) {
      if (mergedTimes[index] !== '-') continue;
      while (stripIndex < rowStripTimes.length && mergedTimes.includes(rowStripTimes[stripIndex])) {
        stripIndex += 1;
      }
      if (stripIndex < rowStripTimes.length) {
        mergedTimes[index] = rowStripTimes[stripIndex];
        stripIndex += 1;
      }
    }
    [inicio, termino, jornada, voo] = mergedTimes;

    const hasOperationalData = [local, inicio, termino, jornada, voo].some((value) => value !== '-');
    const situacao = hasOperationalData ? '-' : STATUS_CODES.has(situacaoToken) ? situacaoToken : '-';

    if ([local, inicio, termino, jornada, voo].every((value) => value === '-')) {
      continue;
    }

    rows.set(day, {
      dia: day,
      situacao,
      local,
      inicio,
      termino,
      jornada,
      voo,
    });
  }

  const compact = buildCompactText({
    company,
    year,
    monthName,
    name: name || 'AERONAUTA',
    canac,
    base,
    totalJornada: totalJornada === '-' ? '0:00' : totalJornada,
    totalVoo: totalVoo === '-' ? '0:00' : totalVoo,
    rows,
  });

  if (!name) {
    throw new Error('OCR estruturado não conseguiu normalizar o nome do tripulante');
  }

  return compact;
}

async function uploadSingleFira(
  file: File,
  options: ProcessFiraFileWithFallbackOptions,
  extractedText?: string,
): Promise<FiraLoteUploadItem> {
  const formData = new FormData();
  formData.append('arquivo', file);
  if (extractedText && extractedText.trim()) {
    formData.append('texto_extraido', extractedText);
  }

  try {
    const response = await options.fetchFrmsImport('/frms/importacao/fira/upload', {
      method: 'POST',
      headers: buildAuthHeaders(options.token),
      body: formData,
    });

    const json = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: FiraImportacaoPreview;
      error?: string;
      code?: string;
    } | null;

    if (!response.ok || !json?.success || !json?.data) {
      return {
        arquivo_nome: file.name,
        success: false,
        error: json?.error ?? `Erro ao processar arquivo (${response.status})`,
        code: json?.code,
      };
    }

    return {
      arquivo_nome: file.name,
      success: true,
      data: json.data,
    };
  } catch (error) {
    return {
      arquivo_nome: file.name,
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao processar arquivo',
      code: 'FIRA_UPLOAD_ERROR',
    };
  }
}

function normalizePdfJsText(items: Array<{ str?: string; transform?: number[] }>): string {
  if (!Array.isArray(items) || items.length === 0) return '';

  const rows = items
    .map((item) => ({
      text: normalizeSpaces(String(item.str ?? '')),
      x: Array.isArray(item.transform) ? Number(item.transform[4] ?? 0) : 0,
      y: Array.isArray(item.transform) ? Number(item.transform[5] ?? 0) : 0,
    }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => {
      const yDelta = Math.abs(b.y - a.y);
      if (yDelta > 2) return b.y - a.y;
      return a.x - b.x;
    });

  if (rows.length === 0) return '';

  const lines: string[] = [];
  let currentLine: string[] = [];
  let lastY = rows[0].y;

  for (const row of rows) {
    if (Math.abs(row.y - lastY) > 2.5) {
      if (currentLine.length > 0) lines.push(normalizeSpaces(currentLine.join(' ')));
      currentLine = [row.text];
      lastY = row.y;
      continue;
    }
    currentLine.push(row.text);
  }

  if (currentLine.length > 0) lines.push(normalizeSpaces(currentLine.join(' ')));
  return lines.filter((line) => line.length > 0).join('\n');
}

async function extractPdfTextPages(
  file: File,
  onStatusChange?: (message: string | null) => void,
): Promise<string[]> {
  onStatusChange?.(`Extraindo texto digital de ${file.name}...`);

  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfJsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = normalizePdfJsText(textContent.items || []);
    if (pageText.trim().length >= 20) {
      pages.push(pageText);
    }
    page.cleanup();
  }

  onStatusChange?.(null);
  return pages;
}

async function tryMultipageUpload(
  file: File,
  options: ProcessFiraFileWithFallbackOptions,
): Promise<FiraLoteUploadResponse | null> {
  const formData = new FormData();
  formData.append('arquivo', file);

  try {
    const response = await options.fetchFrmsImport('/frms/importacao/fira/upload-multipagina', {
      method: 'POST',
      headers: buildAuthHeaders(options.token),
      body: formData,
    });

    const json = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: FiraLoteUploadResponse;
      error?: string;
    } | null;

    if (!response.ok || !json?.success || !json?.data) {
      return null;
    }

    return json.data;
  } catch {
    return null;
  }
}

async function ocrPdfPages(
  file: File,
  onStatusChange?: (message: string | null) => void,
): Promise<string[]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfJsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const Tesseract = (await import('tesseract.js')) as TesseractModule;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const compact = await extractStructuredCompactText(
      Tesseract,
      page,
      pageNumber,
      pdf.numPages,
      onStatusChange,
    );
    if (compact.trim()) {
      pageTexts.push(compact);
    }
    page.cleanup();
  }

  onStatusChange?.(null);

  if (pageTexts.length === 0) {
    throw new Error('OCR não encontrou texto utilizável no PDF');
  }

  return pageTexts;
}

export async function processFiraFileWithFallback(
  file: File,
  options: ProcessFiraFileWithFallbackOptions,
): Promise<FiraLoteUploadItem[]> {
  const digitalPageTexts = await extractPdfTextPages(file, options.onStatusChange).catch(() => []);
  if (digitalPageTexts.length > 0) {
    const digitalItems: FiraLoteUploadItem[] = [];
    for (let index = 0; index < digitalPageTexts.length; index += 1) {
      const pageFile = withPageSuffix(file, index + 1, digitalPageTexts.length);
      const uploaded = await uploadSingleFira(pageFile, options, digitalPageTexts[index]);
      digitalItems.push(uploaded);
    }

    const hasSuccess = digitalItems.some((item) => item.success);
    const hasOnlyExtractionFailures = digitalItems.every(
      (item) => !item.success && isExtractionFailure(item.error),
    );

    if (hasSuccess || !hasOnlyExtractionFailures) {
      options.onStatusChange?.(null);
      return digitalItems;
    }
  }

  options.onStatusChange?.(`PDF sem texto detectado em ${file.name}. Iniciando OCR...`);
  const pageTexts = await ocrPdfPages(file, options.onStatusChange);

  const items: FiraLoteUploadItem[] = [];
  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageFile = withPageSuffix(file, index + 1, pageTexts.length);
    const uploaded = await uploadSingleFira(pageFile, options, pageTexts[index]);
    items.push(uploaded);
  }

  options.onStatusChange?.(null);
  return items;
}
