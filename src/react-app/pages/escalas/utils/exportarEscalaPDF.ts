import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

interface ExportOptions {
  mes: number;
  ano: number;
  status: string;
  elaboradorNome?: string | null;
  elaboradoEm?: string | null;
  createdById?: string | null;
  aprovadorNome?: string | null;
  aprovadoEm?: string | null;
  aprovadoPorId?: string | null;
  publicadorNome?: string | null;
  publicadoEm?: string | null;
  publicadoPorId?: string | null;
  numeroRevisao?: number | null;
  visaoLabel?: string;
  logoUrl?: string | null;
  fileNameSuffix?: string | null;
  mode?: 'current-view' | 'equipment';
  selectedEquipmentIds?: Array<number | string>;
  revisoes?: Array<{
    revisao: number;
    elaboradoEm?: string | null;
    elaboradoPor?: string | null;
    elaboradoPorNome?: string | null;
    aprovadoEm?: string | null;
    aprovadoPor?: string | null;
    aprovadoPorNome?: string | null;
    publicadoEm?: string | null;
    publicadoPor?: string | null;
    publicadoPorNome?: string | null;
  }>;
  legendaTipos?: Array<{
    label: string;
    color: string;
    visible: boolean;
  }>;
}

const A4_LANDSCAPE_WIDTH_MM = 297;
const PRINT_MARGIN_MM = 4;
const MM_TO_PX = 96 / 25.4;
const PRINT_CONTENT_WIDTH_MM = A4_LANDSCAPE_WIDTH_MM - PRINT_MARGIN_MM * 2;
const PRINT_WIDTH_PX = Math.floor(PRINT_CONTENT_WIDTH_MM * MM_TO_PX);
const LOGO_FETCH_TIMEOUT_MS = 1500;
const POPUP_ASSET_TIMEOUT_MS = 2500;

interface ExportSection {
  content: HTMLElement;
  naturalWidth: number;
  visaoLabel?: string;
}

interface ExportSource {
  element: HTMLElement;
  kind: 'tripulantes' | 'aeronaves';
}

function formatStatusLabel(status: string) {
  const normalized = String(status || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  switch (normalized) {
    case 'rascunho':
      return 'Rascunho';
    case 'em revisao':
      return 'Em Revisão';
    case 'aprovada':
      return 'Aprovada';
    case 'publicada':
      return 'Publicada';
    case 'arquivada':
      return 'Arquivada';
    default:
      return normalized.replace(/\b\w/g, (char) => char.toUpperCase()) || 'Não informado';
  }
}

function escapeHtml(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function resolveLogoUrl(logoUrl?: string | null): string | null {
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

function buildAuthHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function fetchLogoBase64(
  logoUrl?: string | null,
  timeoutMs = LOGO_FETCH_TIMEOUT_MS,
): Promise<string | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = window.setTimeout(() => controller?.abort(), timeoutMs);

  try {
    const resolvedLogoUrl = resolveLogoUrl(logoUrl);

    if (resolvedLogoUrl?.startsWith('data:')) {
      return resolvedLogoUrl;
    }

    if (resolvedLogoUrl) {
      const logoResponse = await fetch(resolvedLogoUrl, {
        headers: buildAuthHeaders(),
        signal: controller?.signal,
      });
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

    const response = await fetch(`${API_BASE_URL}/empresas/minha/logo-base64`, {
      headers: buildAuthHeaders(),
      signal: controller?.signal,
    });
    if (!response.ok) return null;

    const result = (await response.json()) as { success?: boolean; data?: string | null };
    return result.success && result.data ? result.data : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function waitForAnimationFrames(targetWindow: Window, frames = 2) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      targetWindow.requestAnimationFrame(() => step(remaining - 1));
    };

    step(frames);
  });
}

function waitForPopupImages(targetWindow: Window, timeoutMs = POPUP_ASSET_TIMEOUT_MS) {
  return new Promise<void>((resolve) => {
    const pending = Array.from(targetWindow.document.images).filter((img) => !img.complete);
    if (pending.length === 0) {
      void waitForAnimationFrames(targetWindow).then(resolve);
      return;
    }

    let settled = false;
    let finished = 0;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      pending.forEach((img) => {
        img.removeEventListener('load', done);
        img.removeEventListener('error', done);
      });
      void waitForAnimationFrames(targetWindow).then(resolve);
    };

    const done = () => {
      if (settled) return;
      finished += 1;
      if (finished >= pending.length) cleanup();
    };

    const timeoutId = window.setTimeout(cleanup, timeoutMs);

    pending.forEach((img) => {
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });
  });
}

function isVisibleElement(element: HTMLElement | null) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getExportSourceElement() {
  const tripulantes = document.querySelector<HTMLElement>('[data-testid="grade-tripulantes"]');
  const aeronaves = document.querySelector<HTMLElement>('[data-testid="grade-gantt"]');

  if (isVisibleElement(aeronaves)) {
    return { element: aeronaves, kind: 'aeronaves' as const };
  }

  if (isVisibleElement(tripulantes)) {
    return { element: tripulantes, kind: 'tripulantes' as const };
  }

  if (aeronaves) {
    return { element: aeronaves, kind: 'aeronaves' as const };
  }

  if (tripulantes) {
    return { element: tripulantes, kind: 'tripulantes' as const };
  }

  return null;
}

function getNaturalWidth(element: HTMLElement) {
  const rectWidth = Math.ceil(element.getBoundingClientRect().width);
  const scrollWidth = Math.ceil(element.scrollWidth);
  const childrenWidth = Array.from(
    element.querySelectorAll<HTMLElement>('table, [style*="min-width"]'),
  ).reduce((maxWidth, child) => {
    const inlineMinWidth = Number.parseFloat(child.style.minWidth || '0');
    return Math.max(
      maxWidth,
      Math.ceil(child.scrollWidth),
      Math.ceil(child.getBoundingClientRect().width),
      Number.isFinite(inlineMinWidth) ? Math.ceil(inlineMinWidth) : 0,
    );
  }, 0);

  return Math.max(rectWidth, scrollWidth, childrenWidth, PRINT_WIDTH_PX);
}

function extractAircraftBlockId(block: HTMLElement) {
  const token = block.getAttribute('data-testid') || block.id || '';
  const match = token.match(/bloco-aeronave-(.+)$/);
  return match?.[1] || null;
}

function sanitizeFilePart(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Nao informado';

  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatDateTimeCompact(value?: string | null) {
  if (!value) return null;

  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatActorIdentifier(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.includes('@')) return normalized;
  if (normalized.startsWith('#')) return normalized;
  return `#${normalized}`;
}

function formatActorPrimary(name?: string | null, identifier?: string | null) {
  const parts = [String(name || '').trim(), formatActorIdentifier(identifier)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nao informado';
}

function formatRevisionSummary(revisoes: ExportOptions['revisoes'], numeroRevisao?: number | null) {
  if (!revisoes || revisoes.length === 0) {
    return numeroRevisao != null
      ? numeroRevisao === 0
        ? 'Publicacao inicial'
        : `Revisao ${numeroRevisao}`
      : 'Sem revisoes publicadas';
  }

  return [...revisoes]
    .sort((a, b) => a.revisao - b.revisao)
    .map((item) => {
      const label = item.revisao === 0 ? 'Pub. inicial' : `Rev. ${item.revisao}`;
      const when = formatDateTimeCompact(item.publicadoEm);
      const by = item.publicadoPorNome || formatActorIdentifier(item.publicadoPor);
      return [label, when, by].filter(Boolean).join(' · ');
    })
    .join('  |  ');
}

function getRevisionSlotLabel(revisao: number) {
  return revisao === 0 ? 'Original' : `Revisão ${revisao}`;
}

function compactMissingValue(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '-';
  if (normalized === 'nao informado' || normalized === 'não informado') return '-';
  if (normalized === 'sem registro') return '-';
  if (normalized === 'data nao informada' || normalized === 'data não informada') return '-';
  return String(value).trim();
}

function buildRevisionActorsMap(
  options: Pick<
    ExportOptions,
    | 'revisoes'
    | 'numeroRevisao'
    | 'elaboradorNome'
    | 'elaboradoEm'
    | 'createdById'
    | 'aprovadorNome'
    | 'aprovadoEm'
    | 'aprovadoPorId'
    | 'publicadorNome'
    | 'publicadoEm'
    | 'publicadoPorId'
  >,
) {
  const map = new Map<number, NonNullable<ExportOptions['revisoes']>[number]>();

  options.revisoes?.forEach((item) => {
    map.set(item.revisao, { ...item });
  });

  const currentRevision = options.numeroRevisao ?? 0;
  const current = map.get(currentRevision) || { revisao: currentRevision };

  map.set(currentRevision, {
    ...current,
    revisao: currentRevision,
    elaboradoEm: current.elaboradoEm || options.elaboradoEm || null,
    elaboradoPor: current.elaboradoPor || options.createdById || null,
    elaboradoPorNome: current.elaboradoPorNome || options.elaboradorNome || null,
    aprovadoEm: current.aprovadoEm || options.aprovadoEm || null,
    aprovadoPor: current.aprovadoPor || options.aprovadoPorId || null,
    aprovadoPorNome: current.aprovadoPorNome || options.aprovadorNome || null,
    publicadoEm: current.publicadoEm || options.publicadoEm || null,
    publicadoPor: current.publicadoPor || options.publicadoPorId || null,
    publicadoPorNome: current.publicadoPorNome || options.publicadorNome || null,
  });

  return map;
}

function buildRevisionActorCard(
  targetDoc: Document,
  options: {
    revisao: number;
    etapa: 'elaborado' | 'aprovado';
    info?: NonNullable<ExportOptions['revisoes']>[number];
  },
) {
  const { revisao, etapa, info } = options;
  const card = targetDoc.createElement('div');
  const accent = etapa === 'elaborado' ? '#0f766e' : '#1d4ed8';
  const isAvailable =
    etapa === 'elaborado'
      ? Boolean(info?.elaboradoPorNome || info?.elaboradoPor || info?.elaboradoEm)
      : Boolean(info?.aprovadoPorNome || info?.aprovadoPor || info?.aprovadoEm);

  card.style.minWidth = '0';
  card.style.border = `1px solid ${isAvailable ? accent : '#dbe4ee'}`;
  card.style.borderRadius = '12px';
  card.style.background = isAvailable ? '#ffffff' : '#f8fafc';
  card.style.padding = '6px 8px';

  const eyebrow = targetDoc.createElement('div');
  eyebrow.style.display = 'flex';
  eyebrow.style.alignItems = 'center';
  eyebrow.style.justifyContent = 'space-between';
  eyebrow.style.gap = '6px';

  const slot = targetDoc.createElement('span');
  slot.style.fontSize = '8px';
  slot.style.fontWeight = '700';
  slot.style.letterSpacing = '0.08em';
  slot.style.textTransform = 'uppercase';
  slot.style.color = accent;
  slot.textContent = getRevisionSlotLabel(revisao);
  eyebrow.appendChild(slot);

  const stage = targetDoc.createElement('span');
  stage.style.fontSize = '8px';
  stage.style.fontWeight = '700';
  stage.style.color = '#64748b';
  stage.textContent = etapa === 'elaborado' ? 'Elaborado' : 'Aprovado';
  eyebrow.appendChild(stage);
  card.appendChild(eyebrow);

  const primary = targetDoc.createElement('div');
  primary.style.marginTop = '3px';
  primary.style.fontSize = '10px';
  primary.style.fontWeight = '700';
  primary.style.color = '#0f172a';
  primary.style.lineHeight = '1.15';
  primary.textContent = compactMissingValue(
    etapa === 'elaborado'
      ? formatActorPrimary(info?.elaboradoPorNome, info?.elaboradoPor)
      : formatActorPrimary(info?.aprovadoPorNome, info?.aprovadoPor),
  );
  card.appendChild(primary);

  const secondary = targetDoc.createElement('div');
  secondary.style.marginTop = '2px';
  secondary.style.fontSize = '8px';
  secondary.style.color = '#64748b';
  secondary.style.lineHeight = '1.2';
  secondary.textContent = compactMissingValue(
    isAvailable
      ? formatDateTimeCompact(etapa === 'elaborado' ? info?.elaboradoEm : info?.aprovadoEm) ||
          'Data nao informada'
      : 'Sem registro',
  );
  card.appendChild(secondary);

  return card;
}

function buildExportSections(
  source: ExportSource,
  mode: ExportOptions['mode'],
  visaoLabel?: string,
  selectedEquipmentIds?: Array<number | string>,
) {
  if (source.kind === 'tripulantes') {
    const gradeClone = source.element.cloneNode(true) as HTMLElement;
    sanitizeExportClone(gradeClone, { preserveButtons: true });
    gradeClone.style.width = '100%';
    gradeClone.style.overflow = 'visible';

    return [
      {
        content: gradeClone,
        naturalWidth: getNaturalWidth(source.element),
        visaoLabel: visaoLabel || 'Cobertura de tripulantes — pronto para impressão e PDF',
      },
    ] satisfies ExportSection[];
  }

  const directChildren = Array.from(source.element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );

  const aircraftBlocks = Array.from(
    source.element.querySelectorAll<HTMLElement>('[data-testid^="bloco-aeronave-"]'),
  );

  const selectedIds = new Set((selectedEquipmentIds || []).map((item) => String(item)));
  const filteredAircraftBlocks =
    selectedIds.size > 0
      ? aircraftBlocks.filter((child) => {
          const aircraftId = extractAircraftBlockId(child);
          return aircraftId ? selectedIds.has(aircraftId) : false;
        })
      : aircraftBlocks;

  const extras = directChildren.filter(
    (child) =>
      !child.matches('[data-testid^="bloco-aeronave-"]') &&
      !child.matches('[data-export-hide="true"]'),
  );

  const sectionSource =
    mode === 'equipment'
      ? filteredAircraftBlocks
      : directChildren.length > 0
        ? directChildren
        : aircraftBlocks.length > 0
          ? aircraftBlocks
          : extras;

  if (sectionSource.length === 0) {
    throw new Error('Nenhum conteúdo visível para exportar.');
  }

  return sectionSource.map((block, index) => {
    const clone = block.cloneNode(true) as HTMLElement;
    sanitizeExportClone(clone, { preserveButtons: true });
    clone.style.width = '100%';
    clone.style.overflow = 'visible';

    if (block.matches('[data-testid^="bloco-aeronave-"]')) {
      clone.setAttribute('data-airtrust-print-block', 'avoid-break');
    }
    return {
      content: clone,
      naturalWidth: getNaturalWidth(block),
      visaoLabel:
        index === 0
          ? visaoLabel ||
            (mode === 'equipment'
              ? 'Grade segmentada por equipamento'
              : 'Grade por aeronave — pronto para impressão e PDF')
          : undefined,
    };
  });
}

function injectPrintStyles(targetDoc: Document, fileName: string) {
  targetDoc.title = fileName;

  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    targetDoc.head.appendChild(node.cloneNode(true));
  });

  const printStyle = targetDoc.createElement('style');
  printStyle.textContent = `
    @page {
      size: A4 landscape;
      margin: 4mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .airtrust-export-shell {
      width: ${PRINT_CONTENT_WIDTH_MM}mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 0;
      background: #ffffff;
    }

    .airtrust-export-page {
      width: 100%;
      background: #ffffff;
    }

    .airtrust-export-page + .airtrust-export-page {
      margin-top: 3mm;
    }

    .airtrust-export-summary {
      margin-bottom: 6px;
      break-inside: avoid-page;
      page-break-inside: avoid;
    }

    .airtrust-export-grade {
      overflow: visible;
    }

    .airtrust-export-section-title {
      margin: 0 0 4px 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }

    .airtrust-export-section {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }

    .airtrust-export-scale-frame {
      width: 100%;
      overflow: visible;
    }

    .airtrust-export-scale-content {
      transform-origin: top left;
      overflow: visible;
    }

    .airtrust-export-stage,
    .airtrust-export-stage * {
      box-sizing: border-box;
    }

    .airtrust-export-stage [data-export-hide="true"] {
      display: none !important;
    }

    .airtrust-export-stage button,
    .airtrust-export-stage input,
    .airtrust-export-stage select,
    .airtrust-export-stage textarea {
      pointer-events: none;
    }

    .airtrust-export-stage table {
      border-collapse: separate;
      border-spacing: 0;
    }

    .airtrust-export-stage thead {
      display: table-header-group;
    }

    .airtrust-export-stage .overflow-auto,
    .airtrust-export-stage .overflow-x-auto,
    .airtrust-export-stage .overflow-y-auto,
    .airtrust-export-stage .overflow-hidden {
      overflow: visible !important;
      max-height: none !important;
    }

    .airtrust-export-stage [class*="sticky"] {
      position: static !important;
      left: auto !important;
      top: auto !important;
      z-index: auto !important;
    }

    .airtrust-export-stage .truncate {
      overflow: visible !important;
      text-overflow: clip !important;
      white-space: normal !important;
    }

    .airtrust-export-stage [data-airtrust-print-block="avoid-break"],
    .airtrust-export-stage [data-testid^="bloco-aeronave-"],
    .airtrust-export-stage [id^="bloco-aeronave-"] {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }

    @media print {
      .airtrust-export-shell {
        width: auto;
        max-width: none;
      }

      .airtrust-print-hint {
        display: none !important;
      }
    }
  `;
  targetDoc.head.appendChild(printStyle);
}

function sanitizeExportClone(root: HTMLElement, options?: { preserveButtons?: boolean }) {
  const { preserveButtons = false } = options || {};

  root.querySelectorAll<HTMLElement>('[data-export-hide="true"]').forEach((element) => {
    element.remove();
  });

  root
    .querySelectorAll<HTMLElement>('[class*="sticky"], [style*="position: sticky"]')
    .forEach((element) => {
      element.style.position = 'static';
      element.style.left = 'auto';
      element.style.top = 'auto';
      element.style.zIndex = 'auto';
    });

  root
    .querySelectorAll<HTMLElement>(
      '[class*="overflow-x-auto"], [class*="overflow-y-auto"], [class*="overflow-hidden"]',
    )
    .forEach((element) => {
      element.style.overflow = 'visible';
      element.style.maxHeight = 'none';
    });

  root.querySelectorAll<HTMLElement>('svg').forEach((element) => {
    element.style.flexShrink = '0';
  });

  root.querySelectorAll<HTMLElement>('.truncate').forEach((element) => {
    element.style.overflow = 'visible';
    element.style.textOverflow = 'clip';
    element.style.whiteSpace = 'normal';
  });

  root
    .querySelectorAll<HTMLElement>('p, span, h1, h2, h3, h4, h5, h6, th, td, div')
    .forEach((element) => {
      element.style.lineHeight = element.style.lineHeight || '1.25';
      element.style.textRendering = 'geometricPrecision';
      element.style.webkitFontSmoothing = 'antialiased';
      element.style.overflowWrap = 'anywhere';
      element.style.wordBreak = 'normal';
    });

  root.querySelectorAll<HTMLElement>('table').forEach((element) => {
    element.style.borderCollapse = 'separate';
    element.style.borderSpacing = '0';
  });

  if (preserveButtons) {
    root.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const pill = document.createElement('span');
      pill.className = button.className;
      pill.innerHTML = button.innerHTML;
      pill.setAttribute('title', button.title || '');
      button.replaceWith(pill);
    });
  }
}

function buildLegendBlock(targetDoc: Document, legendaTipos: ExportOptions['legendaTipos']) {
  if (!legendaTipos || legendaTipos.length === 0) return null;

  const wrapper = targetDoc.createElement('section');
  wrapper.style.marginBottom = '10px';
  wrapper.style.border = '1px solid #e2e8f0';
  wrapper.style.borderRadius = '14px';
  wrapper.style.background = '#ffffff';
  wrapper.style.padding = '7px 10px';

  const title = targetDoc.createElement('div');
  title.style.fontSize = '8px';
  title.style.fontWeight = '700';
  title.style.textTransform = 'uppercase';
  title.style.letterSpacing = '0.08em';
  title.style.color = '#94a3b8';
  title.style.marginBottom = '6px';
  title.textContent = 'Legenda e marcadores';
  wrapper.appendChild(title);

  const row = targetDoc.createElement('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '4px 6px';

  legendaTipos.forEach((item) => {
    const pill = targetDoc.createElement('div');
    pill.style.display = 'inline-flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '5px';
    pill.style.padding = '2px 6px';
    pill.style.border = '1px solid #e2e8f0';
    pill.style.borderRadius = '999px';
    pill.style.fontSize = '9px';
    pill.style.fontWeight = item.visible ? '600' : '500';
    pill.style.color = item.visible ? '#334155' : '#94a3b8';
    pill.style.background = item.visible ? '#ffffff' : '#f8fafc';
    pill.style.opacity = item.visible ? '1' : '0.65';
    pill.innerHTML = `<span style="width:8px;height:8px;border-radius:999px;display:inline-block;background:${escapeHtml(item.color)};"></span>${escapeHtml(item.label)}`;
    row.appendChild(pill);
  });

  const markers = [
    { label: 'Q1', color: '#d946ef' },
    { label: 'Q2', color: '#f59e0b' },
    { label: 'FDS', color: '#fde68a' },
    { label: 'OK', color: '#10b981' },
  ];

  markers.forEach((marker) => {
    const pill = targetDoc.createElement('div');
    pill.style.display = 'inline-flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '5px';
    pill.style.padding = '2px 6px';
    pill.style.border = '1px solid #e2e8f0';
    pill.style.borderRadius = '999px';
    pill.style.fontSize = '9px';
    pill.style.fontWeight = '600';
    pill.style.color = '#334155';
    pill.style.background = '#ffffff';
    pill.innerHTML = `<span style="width:8px;height:8px;border-radius:999px;display:inline-block;background:${marker.color};"></span>${marker.label}`;
    row.appendChild(pill);
  });

  wrapper.appendChild(row);
  return wrapper;
}

function buildMetaCard(
  targetDoc: Document,
  options: { label: string; primary: string; secondary?: string | null },
) {
  const card = targetDoc.createElement('div');
  card.style.minWidth = '0';
  card.style.border = '1px solid #e2e8f0';
  card.style.borderRadius = '12px';
  card.style.background = '#f8fafc';
  card.style.padding = '7px 9px';

  const label = targetDoc.createElement('div');
  label.style.fontSize = '8px';
  label.style.fontWeight = '700';
  label.style.textTransform = 'uppercase';
  label.style.letterSpacing = '0.06em';
  label.style.color = '#94a3b8';
  label.textContent = options.label;
  card.appendChild(label);

  const primary = targetDoc.createElement('div');
  primary.style.marginTop = '4px';
  primary.style.fontSize = '10px';
  primary.style.fontWeight = '600';
  primary.style.color = '#0f172a';
  primary.style.lineHeight = '1.3';
  primary.textContent = options.primary;
  card.appendChild(primary);

  if (options.secondary) {
    const secondary = targetDoc.createElement('div');
    secondary.style.marginTop = '3px';
    secondary.style.fontSize = '9px';
    secondary.style.color = '#64748b';
    secondary.style.lineHeight = '1.35';
    secondary.textContent = options.secondary;
    card.appendChild(secondary);
  }

  return card;
}

function buildSummarySection(
  options: ExportOptions & { logoSrc?: string | null; visaoLabel?: string },
) {
  const wrapper = document.createElement('section');
  wrapper.className = 'airtrust-export-summary';

  wrapper.appendChild(buildHeaderBlock(options));

  const legendBlock = buildLegendBlock(document, options.legendaTipos);
  if (legendBlock) {
    legendBlock.style.marginBottom = '0';
    wrapper.appendChild(legendBlock);
  }

  return wrapper;
}

function buildHeaderBlock({
  mes,
  ano,
  status,
  elaboradorNome,
  elaboradoEm,
  createdById,
  aprovadorNome,
  aprovadoEm,
  aprovadoPorId,
  publicadorNome,
  publicadoEm,
  publicadoPorId,
  numeroRevisao,
  revisoes,
  visaoLabel,
  logoSrc,
}: ExportOptions & { logoSrc?: string | null }) {
  const header = document.createElement('section');
  header.style.padding = '0 0 4px 0';
  header.style.borderBottom = '1px solid #e2e8f0';
  header.style.marginBottom = '4px';
  const statusLabel = formatStatusLabel(status);
  const revisaoAtual =
    numeroRevisao != null
      ? numeroRevisao === 0
        ? 'Original'
        : `Revisão ${numeroRevisao}`
      : 'Sem revisão';
  const revisionActors = buildRevisionActorsMap({
    revisoes,
    numeroRevisao,
    elaboradorNome,
    elaboradoEm,
    createdById,
    aprovadorNome,
    aprovadoEm,
    aprovadoPorId,
    publicadorNome,
    publicadoEm,
    publicadoPorId,
  });

  const revisaoStr =
    numeroRevisao != null && numeroRevisao > 0 ? ` — Revisão ${numeroRevisao}` : '';
  const copy = document.createElement('div');
  copy.style.flex = '0 0 250px';
  copy.style.minWidth = '220px';
  copy.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;min-height:70px;">
      ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Logo da empresa" style="max-height:48px;max-width:165px;object-fit:contain;display:block;">` : ''}
      <div style="min-width:0;">
        <div style="font-size:17px;font-weight:700;letter-spacing:-0.02em;line-height:0.98;color:#0f172a;">Escala Operacional</div>
        <div style="margin-top:2px;font-size:12px;font-weight:600;color:#334155;">${MESES[mes]} ${ano}${revisaoStr}</div>
        <div style="margin-top:1px;font-size:10px;line-height:1.1;color:#64748b;">${escapeHtml(visaoLabel || 'Exportacao operacional consolidada da grade mensal.')}</div>
      </div>
    </div>
  `;

  const revisionGrid = document.createElement('div');
  revisionGrid.style.flex = '1 1 0';
  revisionGrid.style.minWidth = '430px';
  revisionGrid.style.display = 'grid';
  revisionGrid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  revisionGrid.style.gap = '6px';

  [0, 1, 2].forEach((revisao) => {
    const info = revisionActors.get(revisao);
    const column = document.createElement('div');
    column.style.display = 'grid';
    column.style.gridTemplateRows = 'repeat(2, minmax(0, 1fr))';
    column.style.gap = '6px';
    column.appendChild(buildRevisionActorCard(document, { revisao, etapa: 'elaborado', info }));
    column.appendChild(buildRevisionActorCard(document, { revisao, etapa: 'aprovado', info }));
    revisionGrid.appendChild(column);
  });

  const chip = document.createElement('div');
  chip.style.display = 'flex';
  chip.style.flexDirection = 'column';
  chip.style.alignItems = 'stretch';
  chip.style.justifyContent = 'center';
  chip.style.gap = '4px';
  chip.style.flex = '0 0 185px';
  chip.style.minWidth = '170px';
  chip.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;">
      <span style="display:inline-flex;align-items:center;border:1px solid #cbd5e1;background:#f8fafc;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;color:#334155;text-transform:capitalize;">
        Status: ${escapeHtml(statusLabel)}
      </span>
      <span style="display:inline-flex;align-items:center;border:1px solid #cbd5e1;background:#ffffff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;color:#334155;">
        ${escapeHtml(revisaoAtual)}
      </span>
    </div>
    <div style="font-size:10px;color:#64748b;text-align:right;line-height:1.2;">
      <div>Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    </div>
  `;

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.alignItems = 'center';
  topRow.style.justifyContent = 'space-between';
  topRow.style.gap = '10px';
  topRow.style.flexWrap = 'wrap';
  topRow.appendChild(copy);
  topRow.appendChild(revisionGrid);
  topRow.appendChild(chip);
  header.appendChild(topRow);

  return header;
}

export async function exportarEscalaPDF({
  mes,
  ano,
  status,
  elaboradorNome,
  elaboradoEm,
  createdById,
  aprovadorNome,
  aprovadoEm,
  aprovadoPorId,
  publicadorNome,
  publicadoEm,
  publicadoPorId,
  numeroRevisao,
  visaoLabel,
  logoUrl,
  fileNameSuffix,
  mode = 'current-view',
  selectedEquipmentIds,
  revisoes,
  legendaTipos,
}: ExportOptions) {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = sanitizeFilePart(fileNameSuffix);
  const fileName = `Escala_${MESES[mes]}_${ano}${suffix ? `_${suffix}` : ''}_${status}_${ts}.pdf`;
  const source = getExportSourceElement();
  if (!source) {
    throw new Error('A grade ativa não está disponível para exportação nesta tela.');
  }

  const logoSrc = await fetchLogoBase64(logoUrl);
  const sections = buildExportSections(source, mode, visaoLabel, selectedEquipmentIds);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-${PRINT_WIDTH_PX + 200}px;top:0;width:${PRINT_WIDTH_PX}px;height:400px;border:none;`;
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    const win = iframe.contentWindow!;

    doc.open();
    doc.write(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><title>${escapeHtml(fileName)}</title></head><body><main class="airtrust-export-shell"></main></body></html>`,
    );
    doc.close();
    injectPrintStyles(doc, fileName);

    const shell = doc.querySelector('main.airtrust-export-shell');
    if (!shell) {
      throw new Error('Não foi possível preparar o documento para impressão.');
    }

    const summary = buildSummarySection({
      mes,
      ano,
      status,
      elaboradorNome,
      elaboradoEm,
      createdById,
      aprovadorNome,
      aprovadoEm,
      aprovadoPorId,
      publicadorNome,
      publicadoEm,
      publicadoPorId,
      numeroRevisao,
      revisoes,
      visaoLabel: sections[0]?.visaoLabel,
      logoSrc,
      legendaTipos,
    });
    shell.appendChild(doc.importNode(summary, true));

    sections.forEach((section) => {
      const page = doc.createElement('section');
      page.className = 'airtrust-export-page';

      const gradeWrapper = doc.createElement('section');
      gradeWrapper.className = 'airtrust-export-grade';
      gradeWrapper.classList.add('airtrust-export-section');

      const frame = doc.createElement('div');
      frame.className = 'airtrust-export-scale-frame';
      frame.setAttribute('data-natural-width', String(section.naturalWidth));

      const scaledContent = doc.createElement('div');
      scaledContent.className = 'airtrust-export-scale-content';
      scaledContent.style.width = `${section.naturalWidth}px`;

      scaledContent.appendChild(doc.importNode(section.content, true));
      frame.appendChild(scaledContent);
      gradeWrapper.appendChild(frame);
      page.appendChild(gradeWrapper);
      shell.appendChild(page);
    });

    await waitForPopupImages(win);
    await waitForAnimationFrames(win);

    Array.from(doc.querySelectorAll<HTMLElement>('.airtrust-export-scale-frame')).forEach(
      (frame) => {
        const scaledContent = frame.querySelector<HTMLElement>('.airtrust-export-scale-content');
        if (!scaledContent) return;

        const naturalWidth = Number(frame.getAttribute('data-natural-width')) || PRINT_WIDTH_PX;
        const availableWidth = Math.max(
          Math.floor(frame.getBoundingClientRect().width),
          Math.floor(shell.getBoundingClientRect().width),
          PRINT_WIDTH_PX,
        );
        const naturalHeight = Math.max(
          scaledContent.scrollHeight,
          Math.ceil(scaledContent.getBoundingClientRect().height),
        );
        const scale = Math.min(1.08, Math.max(0.5, (availableWidth - 4) / naturalWidth));

        scaledContent.style.width = `${naturalWidth}px`;
        scaledContent.style.transform = `scale(${scale})`;
        frame.style.height = `${Math.ceil(naturalHeight * scale)}px`;
      },
    );

    await waitForAnimationFrames(win);
    win.print();
  } finally {
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // already removed
      }
    }, 500);
  }
}
