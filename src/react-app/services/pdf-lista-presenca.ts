/**
 * SERVICE: Geração de Lista de Presença (Cliente)
 * Stack: jsPDF
 * Output: PDF A4 portrait
 *
 * Gera no browser e abre imediatamente para visualização/download — sem arquivamento.
 */

import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';

export interface ListaPresencaData {
  cursoTreinamento: string; // nomeQualificacao
  codigoQualificacao: string; // ex: F1, FAP14
  dataRealizacao: string | null; // data_conclusao
  participante: {
    nome: string;
    matricula: string;
    codigoAnac?: string;
    setor?: string;
    base?: string;
    funcao?: string;
  };
  logoUrl?: string;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Falha ao converter logo para data URL'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler logo'));
    reader.readAsDataURL(blob);
  });
}

function resolveLogoUrl(logoUrl?: string): string | null {
  if (!logoUrl) return null;
  if (
    logoUrl.startsWith('data:') ||
    logoUrl.startsWith('http://') ||
    logoUrl.startsWith('https://')
  ) {
    return logoUrl;
  }
  if (logoUrl.startsWith('/api/')) {
    return `${API_BASE_URL.replace(/\/api$/, '')}${logoUrl}`;
  }
  return logoUrl;
}

async function loadLogoBase64(logoUrl?: string): Promise<string | null> {
  try {
    const resolvedLogoUrl = resolveLogoUrl(logoUrl);

    if (resolvedLogoUrl?.startsWith('data:')) {
      return resolvedLogoUrl;
    }

    if (resolvedLogoUrl) {
      const logoResponse = await fetchWithAuth(resolvedLogoUrl);
      if (logoResponse.ok) {
        const contentType = logoResponse.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = (await logoResponse.json()) as { success?: boolean; data?: string };
          if (json?.success && json?.data) {
            return json.data;
          }
        } else {
          const logoBlob = await logoResponse.blob();
          if (logoBlob.size > 0) {
            return await blobToDataUrl(logoBlob);
          }
        }
      }
    }

    const res = await fetchWithAuth('/api/empresas/minha/logo-base64');
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: string };
    return json?.success && json?.data ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * Gera o PDF da Lista de Presença e retorna como Blob para preview/download.
 */
export async function gerarPDFListaPresenca(dados: ListaPresencaData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PW = doc.internal.pageSize.getWidth(); // 210
  const PH = doc.internal.pageSize.getHeight(); // 297
  const ML = 14;
  const MR = 14;
  const CW = PW - ML - MR;

  // Paleta de cores
  const DARK = '#1a2e3b';
  const GRAY = '#6b7280';
  const LIGHT = '#f8fafc';
  const BORD = '#cbd5e1';
  const BLUE = '#1d6fa4';
  const BLUE_L = '#e8f4fb';

  let Y = 0;

  // ─── CABEÇALHO PRINCIPAL ──────────────────────────────────────────────────
  const HDR_TOP = 5;
  const HDR_H = 22;
  const HDR_BOTTOM = HDR_TOP + HDR_H;

  // Fundo branco do cabeçalho
  doc.setFillColor('#FFFFFF');
  doc.rect(0, 0, PW, HDR_BOTTOM, 'F');

  // Barra azul inferior do cabeçalho
  doc.setFillColor(BLUE);
  doc.rect(0, HDR_BOTTOM, PW, 1.2, 'F');

  // ── Logo à esquerda ──
  const logoBase64 = await loadLogoBase64(dados.logoUrl);
  const LOGO_BOX_X = ML;
  const LOGO_BOX_Y = HDR_TOP + 2;
  const LOGO_BOX_W = 44;
  const LOGO_BOX_H = HDR_H - 4;

  if (logoBase64) {
    try {
      const imageProps = doc.getImageProperties(logoBase64);
      const imageFormat = imageProps.fileType === 'JPEG' ? 'JPEG' : 'PNG';
      const ratio = imageProps.width / imageProps.height;
      let lw = LOGO_BOX_W;
      let lh = LOGO_BOX_H;
      if (ratio > LOGO_BOX_W / LOGO_BOX_H) {
        lh = LOGO_BOX_W / ratio;
      } else {
        lw = LOGO_BOX_H * ratio;
      }
      const lx = LOGO_BOX_X + (LOGO_BOX_W - lw) / 2;
      const ly = LOGO_BOX_Y + (LOGO_BOX_H - lh) / 2;
      doc.addImage(logoBase64, imageFormat, lx, ly, lw, lh);
    } catch {
      // sem logo
    }
  }

  // ── Separador vertical entre logo e título ──
  doc.setDrawColor(BORD);
  doc.setLineWidth(0.4);
  doc.line(ML + LOGO_BOX_W + 4, HDR_TOP + 3, ML + LOGO_BOX_W + 4, HDR_BOTTOM - 3);

  // ── Título centralizado no espaço restante ──
  const titleX = ML + LOGO_BOX_W + 8;
  const titleAreaW = PW - MR - titleX;
  const titleCX = titleX + titleAreaW / 2;
  const titleCY = HDR_TOP + HDR_H / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(DARK);
  doc.text('FICHA DE PRESENÇA DE TREINAMENTO', titleCX, titleCY + 1.5, { align: 'center' });

  Y = HDR_BOTTOM + 1.2 + 5;

  // ─── BLOCO DE INFORMAÇÕES DO TREINAMENTO ─────────────────────────────────
  const INFO_H = 62;
  doc.setFillColor(LIGHT);
  doc.setDrawColor(BORD);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, Y, CW, INFO_H, 2, 2, 'FD');

  // Faixa de título do bloco
  doc.setFillColor(BLUE);
  doc.roundedRect(ML, Y, CW, 8, 2, 2, 'F');
  // Corrige cantos inferiores arredondados da faixa
  doc.rect(ML, Y + 4, CW, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor('#FFFFFF');
  doc.text('DADOS DO TREINAMENTO', ML + 4, Y + 5.5);

  const infoContentY = Y + 11;
  const ROW_SP = 10;

  // Função auxiliar para campo de info
  const drawField = (label: string, value: string, x: number, fy: number, w: number) => {
    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(GRAY);
    doc.text(label.toUpperCase(), x, fy);
    // Linha de fundo
    doc.setDrawColor(BORD);
    doc.setLineWidth(0.25);
    doc.line(x, fy + 5.5, x + w - 2, fy + 5.5);
    // Valor
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(DARK);
    const maxW = w - 2;
    const lines = doc.splitTextToSize(value || ' ', maxW) as string[];
    doc.text(lines[0] ?? '', x, fy + 4.5);
  };

  const c1 = ML + 4;
  const colMid = ML + CW * 0.55;
  const w1 = CW * 0.55 - 8;
  const w2 = CW * 0.45 - 6;

  // Linha 1: Curso (largura total)
  drawField('Curso / Treinamento', dados.cursoTreinamento, c1, infoContentY, CW - 8);

  // Linha 2: Código | Instrutor
  drawField('Código', dados.codigoQualificacao, c1, infoContentY + ROW_SP, w1);
  drawField('Instrutor Responsável', ' ', colMid, infoContentY + ROW_SP, w2);

  // Linha 3: Data | Local
  drawField('Data', '____/____/________', c1, infoContentY + ROW_SP * 2, w1);
  drawField('Local', ' ', colMid, infoContentY + ROW_SP * 2, w2);

  // Linha 4: Período | Horário
  drawField(
    'Período',
    '____/____/________ a ____/____/________',
    c1,
    infoContentY + ROW_SP * 3,
    w1,
  );
  drawField(
    'Horário',
    'Início: _________   Término: _________',
    colMid,
    infoContentY + ROW_SP * 3,
    w2,
  );

  // Linha 5: Carga Horária Diária | Carga Horária Total (campos manuais, sem preenchimento automático)
  drawField('Carga Horária Diária', '________', c1, infoContentY + ROW_SP * 4, w1);
  drawField('Carga Horária Total', '________', colMid, infoContentY + ROW_SP * 4, w2);

  Y += INFO_H + 5;

  // ─── NOTAS ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(GRAY);
  const notas = [
    '• Hora-aula de 50 minutos com 10 minutos de intervalo.',
    '• Pausa para almoço de 1 hora, se aplicável.',
    '• Este registro atende ao disposto na IS 135-003D, item 5.3.',
  ];
  notas.forEach((n) => {
    doc.text(n, ML, Y);
    Y += 3.8;
  });
  Y += 3;

  // ─── TABELA DE PARTICIPANTES ──────────────────────────────────────────────
  // Cabeçalho da seção
  doc.setFillColor(BLUE_L);
  doc.setDrawColor(BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, Y, CW, 7, 1, 1, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(BLUE);
  doc.text('RELAÇÃO DE PARTICIPANTES', ML + CW / 2, Y + 4.8, { align: 'center' });
  Y += 9;

  // Colunas
  const cols = [
    { label: 'Nº', w: 8 },
    { label: 'Matrícula /\nCód. ANAC', w: 26 },
    { label: 'Nome Completo', w: 58 },
    { label: 'Setor /\nBase', w: 24 },
    { label: 'Função', w: 28 },
    { label: 'Assinatura', w: CW - 8 - 26 - 58 - 24 - 28 },
  ];

  const NUM_ROWS = 15;
  const ROW_H = 7.5;
  const HEADER_H = 10;

  // Cabeçalho da tabela — mesmo azul do bloco "DADOS DO TREINAMENTO"
  doc.setFillColor(BLUE);
  doc.rect(ML, Y, CW, HEADER_H, 'F');

  let colX = ML;
  cols.forEach((col, idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor('#FFFFFF');
    const lines = col.label.split('\n');
    if (lines.length === 2) {
      doc.text(lines[0], colX + col.w / 2, Y + 3.5, { align: 'center' });
      doc.text(lines[1], colX + col.w / 2, Y + 7.2, { align: 'center' });
    } else {
      doc.text(col.label, colX + col.w / 2, Y + 5.8, { align: 'center' });
    }
    // separador entre colunas
    if (idx > 0) {
      doc.setDrawColor('#5a9ec8');
      doc.setLineWidth(0.2);
      doc.line(colX, Y + 1.5, colX, Y + HEADER_H - 1.5);
    }
    colX += col.w;
  });

  Y += HEADER_H;

  // Linhas de dados
  for (let i = 0; i < NUM_ROWS; i++) {
    const rowY = Y + i * ROW_H;
    const isEven = i % 2 === 0;

    doc.setFillColor(isEven ? LIGHT : '#FFFFFF');
    doc.rect(ML, rowY, CW, ROW_H, 'F');

    // Número da linha
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GRAY);
    doc.text(String(i + 1), ML + cols[0].w / 2, rowY + ROW_H / 2 + 1, { align: 'center' });

    // Bordas
    doc.setDrawColor(BORD);
    doc.setLineWidth(0.2);
    doc.rect(ML, rowY, CW, ROW_H);

    let bx = ML;
    cols.forEach((col) => {
      doc.line(bx, rowY, bx, rowY + ROW_H);
      bx += col.w;
    });
  }

  Y += NUM_ROWS * ROW_H + 8;

  // ─── RODAPÉ / DECLARAÇÃO ─────────────────────────────────────────────────
  if (Y > PH - 28) {
    doc.addPage();
    Y = 14;
  }

  // Caixa de declaração
  doc.setFillColor(LIGHT);
  doc.setDrawColor(BORD);
  doc.setLineWidth(0.3);
  const declText =
    'Declaro que os tripulantes acima listados participaram do treinamento conforme o conteúdo programático aprovado no PTO.';
  const declLines = doc.splitTextToSize(declText, CW - 8) as string[];
  const declBoxH = declLines.length * 4.5 + 6;
  doc.roundedRect(ML, Y, CW, declBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(GRAY);
  doc.text(declLines, ML + 4, Y + 5);
  Y += declBoxH + 6;

  // Linha data + assinatura
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(DARK);
  doc.text('Data: _____ / _____ / __________', ML, Y);
  doc.text(
    'Assinatura do Instrutor Responsável: _______________________________________',
    ML + CW * 0.4,
    Y,
  );

  // Linha separadora final
  Y += 10;
  doc.setDrawColor(BLUE);
  doc.setLineWidth(0.5);
  doc.line(ML, Y, PW - MR, Y);

  Y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(GRAY);
  doc.text('Gerado por AirTrust — Aeronautical Management System', PW / 2, Y, { align: 'center' });

  return doc.output('blob');
}

export interface ListaPresencaTurmaData {
  titulo: string;
  codigoQualificacao: string;
  dataInicio: string | null;
  dataFim?: string | null;
  horaInicio?: string | null;
  horaFim?: string | null;
  local?: string | null;
  instrutor?: string | null;
  participantes: Array<{
    nome: string;
    matricula?: string;
    setor?: string;
    funcao?: string;
  }>;
  logoUrl?: string;
}

/**
 * Gera o PDF da Lista de Presença para uma turma completa (múltiplos participantes).
 * Disponível antes, durante e após a conclusão da turma.
 */
export async function gerarPDFListaPresencaTurma(dados: ListaPresencaTurmaData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const ML = 14;
  const MR = 14;
  const CW = PW - ML - MR;

  const DARK = '#1a2e3b';
  const GRAY = '#6b7280';
  const LIGHT = '#f8fafc';
  const BORD = '#cbd5e1';
  const BLUE = '#1d6fa4';
  const BLUE_L = '#e8f4fb';

  let Y = 0;

  // ─── CABEÇALHO ───────────────────────────────────────────────────────────
  const HDR_TOP = 5;
  const HDR_H = 22;
  const HDR_BOTTOM = HDR_TOP + HDR_H;

  doc.setFillColor('#FFFFFF');
  doc.rect(0, 0, PW, HDR_BOTTOM, 'F');
  doc.setFillColor(BLUE);
  doc.rect(0, HDR_BOTTOM, PW, 1.2, 'F');

  const logoBase64 = await loadLogoBase64(dados.logoUrl);
  const LOGO_BOX_X = ML;
  const LOGO_BOX_Y = HDR_TOP + 2;
  const LOGO_BOX_W = 44;
  const LOGO_BOX_H = HDR_H - 4;

  if (logoBase64) {
    try {
      const imageProps = doc.getImageProperties(logoBase64);
      const imageFormat = imageProps.fileType === 'JPEG' ? 'JPEG' : 'PNG';
      const ratio = imageProps.width / imageProps.height;
      let lw = LOGO_BOX_W;
      let lh = LOGO_BOX_H;
      if (ratio > LOGO_BOX_W / LOGO_BOX_H) lh = LOGO_BOX_W / ratio;
      else lw = LOGO_BOX_H * ratio;
      const lx = LOGO_BOX_X + (LOGO_BOX_W - lw) / 2;
      const ly = LOGO_BOX_Y + (LOGO_BOX_H - lh) / 2;
      doc.addImage(logoBase64, imageFormat, lx, ly, lw, lh);
    } catch {
      // sem logo
    }
  }

  doc.setDrawColor(BORD);
  doc.setLineWidth(0.4);
  doc.line(ML + LOGO_BOX_W + 4, HDR_TOP + 3, ML + LOGO_BOX_W + 4, HDR_BOTTOM - 3);

  const titleX = ML + LOGO_BOX_W + 8;
  const titleAreaW = PW - MR - titleX;
  const titleCX = titleX + titleAreaW / 2;
  const titleCY = HDR_TOP + HDR_H / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(DARK);
  doc.text('LISTA DE PRESENÇA — TURMA', titleCX, titleCY + 1.5, { align: 'center' });

  Y = HDR_BOTTOM + 1.2 + 5;

  // ─── DADOS DA TURMA ───────────────────────────────────────────────────────
  const INFO_H = 52;
  doc.setFillColor(LIGHT);
  doc.setDrawColor(BORD);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, Y, CW, INFO_H, 2, 2, 'FD');
  doc.setFillColor(BLUE);
  doc.roundedRect(ML, Y, CW, 8, 2, 2, 'F');
  doc.rect(ML, Y + 4, CW, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor('#FFFFFF');
  doc.text('DADOS DO TREINAMENTO', ML + 4, Y + 5.5);

  const infoContentY = Y + 11;
  const ROW_SP = 10;

  const drawFieldTurma = (label: string, value: string, x: number, fy: number, w: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(GRAY);
    doc.text(label.toUpperCase(), x, fy);
    doc.setDrawColor(BORD);
    doc.setLineWidth(0.25);
    doc.line(x, fy + 5.5, x + w - 2, fy + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(DARK);
    const maxW = w - 2;
    const lines = doc.splitTextToSize(value || ' ', maxW) as string[];
    doc.text(lines[0] ?? '', x, fy + 4.5);
  };

  const c1 = ML + 4;
  const colMid = ML + CW * 0.55;
  const w1 = CW * 0.55 - 8;
  const w2 = CW * 0.45 - 6;

  const formatDataBR = (d?: string | null) => {
    if (!d) return '___/___/______';
    try {
      return new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');
    } catch {
      return d;
    }
  };

  const periodoStr =
    dados.dataFim && dados.dataFim !== dados.dataInicio
      ? `${formatDataBR(dados.dataInicio)} a ${formatDataBR(dados.dataFim)}`
      : formatDataBR(dados.dataInicio);

  const horarioStr =
    dados.horaInicio && dados.horaFim
      ? `${dados.horaInicio} – ${dados.horaFim}`
      : dados.horaInicio || '___';

  drawFieldTurma('Curso / Treinamento', dados.titulo, c1, infoContentY, CW - 8);
  drawFieldTurma('Código', dados.codigoQualificacao, c1, infoContentY + ROW_SP, w1);
  drawFieldTurma('Instrutor Responsável', dados.instrutor || '___', colMid, infoContentY + ROW_SP, w2);
  drawFieldTurma('Período', periodoStr, c1, infoContentY + ROW_SP * 2, w1);
  drawFieldTurma('Horário', horarioStr, colMid, infoContentY + ROW_SP * 2, w2);
  drawFieldTurma('Local / Sala', dados.local || '___', c1, infoContentY + ROW_SP * 3, CW - 8);

  Y += INFO_H + 6;

  // ─── TABELA DE PARTICIPANTES ──────────────────────────────────────────────
  doc.setFillColor(BLUE_L);
  doc.setDrawColor(BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, Y, CW, 7, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(BLUE);
  doc.text(`RELAÇÃO DE PARTICIPANTES (${dados.participantes.length} convocado(s))`, ML + CW / 2, Y + 4.8, { align: 'center' });
  Y += 9;

  const cols = [
    { label: 'Nº', w: 8 },
    { label: 'Matrícula', w: 24 },
    { label: 'Nome Completo', w: 60 },
    { label: 'Setor / Função', w: 40 },
    { label: 'Assinatura', w: CW - 8 - 24 - 60 - 40 },
  ];

  const ROW_H = 8;
  const HEADER_H = 10;

  const drawTableHeader = () => {
    doc.setFillColor(BLUE);
    doc.rect(ML, Y, CW, HEADER_H, 'F');
    let colX = ML;
    cols.forEach((col, idx) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor('#FFFFFF');
      doc.text(col.label, colX + col.w / 2, Y + 6, { align: 'center' });
      if (idx > 0) {
        doc.setDrawColor('#5a9ec8');
        doc.setLineWidth(0.2);
        doc.line(colX, Y + 1.5, colX, Y + HEADER_H - 1.5);
      }
      colX += col.w;
    });
    Y += HEADER_H;
  };

  drawTableHeader();

  const participantes = dados.participantes.length > 0 ? dados.participantes : Array(15).fill({ nome: '', matricula: '', setor: '', funcao: '' });

  participantes.forEach((participante, i) => {
    if (Y + ROW_H > PH - 20) {
      doc.addPage();
      Y = 14;
      drawTableHeader();
    }

    const isEven = i % 2 === 0;
    doc.setFillColor(isEven ? LIGHT : '#FFFFFF');
    doc.rect(ML, Y, CW, ROW_H, 'F');

    // Nº
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GRAY);
    doc.text(String(i + 1), ML + cols[0].w / 2, Y + ROW_H / 2 + 1.5, { align: 'center' });

    // Matrícula
    doc.setTextColor(DARK);
    doc.text(participante.matricula || '', ML + cols[0].w + 2, Y + ROW_H / 2 + 1.5);

    // Nome
    const nomeTxt = doc.splitTextToSize(participante.nome || '', cols[2].w - 2) as string[];
    doc.text(nomeTxt[0] || '', ML + cols[0].w + cols[1].w + 2, Y + ROW_H / 2 + 1.5);

    // Setor/Função
    const setorFuncao = [participante.setor, participante.funcao].filter(Boolean).join(' / ');
    const setorTxt = doc.splitTextToSize(setorFuncao, cols[3].w - 2) as string[];
    doc.text(setorTxt[0] || '', ML + cols[0].w + cols[1].w + cols[2].w + 2, Y + ROW_H / 2 + 1.5);

    // Bordas
    doc.setDrawColor(BORD);
    doc.setLineWidth(0.2);
    doc.rect(ML, Y, CW, ROW_H);
    let bx = ML;
    cols.forEach((col) => { doc.line(bx, Y, bx, Y + ROW_H); bx += col.w; });

    Y += ROW_H;
  });

  Y += 10;

  // ─── RODAPÉ ───────────────────────────────────────────────────────────────
  if (Y > PH - 30) {
    doc.addPage();
    Y = 14;
  }

  const declText =
    'Declaro que os participantes acima listados estiveram presentes no treinamento conforme o conteúdo programático aprovado no PTO.';
  doc.setFillColor(LIGHT);
  doc.setDrawColor(BORD);
  doc.setLineWidth(0.3);
  const declLines = doc.splitTextToSize(declText, CW - 8) as string[];
  const declBoxH = declLines.length * 4.5 + 6;
  doc.roundedRect(ML, Y, CW, declBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(GRAY);
  doc.text(declLines, ML + 4, Y + 5);
  Y += declBoxH + 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(DARK);
  doc.text('Data: _____ / _____ / __________', ML, Y);
  doc.text(
    'Assinatura do Instrutor Responsável: ________________________',
    ML + CW * 0.42,
    Y,
  );

  Y += 10;
  doc.setDrawColor(BLUE);
  doc.setLineWidth(0.5);
  doc.line(ML, Y, PW - MR, Y);

  Y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(GRAY);
  doc.text('Gerado por AirTrust — Aeronautical Management System', PW / 2, Y, { align: 'center' });

  return doc.output('blob');
}
