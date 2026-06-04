export interface MonthlyAgendaPrintSession {
  id: number;
  simulador_nome: string;
  simulador_tipo?: string;
  simulador_modelo?: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_sessao: string;
  tema_sessao?: string;
  instrutor_nome: string;
  examinador_nome?: string | null;
  status: string;
  observacoes?: string;
  participantes?: Array<{
    nome?: string;
    funcao?: string;
  }>;
}

interface MonthlyAgendaPrintOptions {
  monthDate: Date;
  generatedAt?: Date;
  sessions: MonthlyAgendaPrintSession[];
  filters?: {
    instrutor?: string;
    status?: string;
    busca?: string;
  };
}

function escapeHtml(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTime(value: string | undefined): string {
  return (value || '').slice(0, 5);
}

function calculateDurationMinutes(start: string, end: string): number {
  const [startHour, startMinute] = normalizeTime(start).split(':').map(Number);
  const [endHour, endMinute] = normalizeTime(end).split(':').map(Number);

  if ([startHour, startMinute, endHour, endMinute].some((part) => Number.isNaN(part))) {
    return 0;
  }

  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;

  if (endTotal <= startTotal) {
    endTotal += 24 * 60;
  }

  return endTotal - startTotal;
}

function formatDurationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function formatDateLong(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getStatusLabel(status: string): string {
  const normalized = (status || '').toUpperCase();
  const mapping: Record<string, string> = {
    AGENDADO: 'Agendada',
    AGENDADA: 'Agendada',
    EM_ANDAMENTO: 'Em andamento',
    CONCLUIDO: 'Concluída',
    CONCLUIDA: 'Concluída',
    CANCELADO: 'Cancelada',
    CANCELADA: 'Cancelada',
    CONFIRMADO: 'Confirmada',
    CONFIRMADA: 'Confirmada',
    PLANEJADA: 'Planejada',
  };

  return mapping[normalized] || normalized || 'Sem status';
}

function getStatusClass(status: string): string {
  const normalized = (status || '').toUpperCase();
  if (normalized.startsWith('CONCLUID')) return 'status-completed';
  if (normalized.startsWith('CANCELAD')) return 'status-cancelled';
  if (normalized === 'EM_ANDAMENTO') return 'status-live';
  return 'status-default';
}

function buildFilterChips(filters?: MonthlyAgendaPrintOptions['filters']): string {
  const chips: string[] = [];

  if (filters?.instrutor) {
    chips.push(`<span class="chip">Instrutor: ${escapeHtml(filters.instrutor)}</span>`);
  }

  if (filters?.status) {
    chips.push(`<span class="chip">Status: ${escapeHtml(getStatusLabel(filters.status))}</span>`);
  }

  if (filters?.busca) {
    chips.push(`<span class="chip">Busca: ${escapeHtml(filters.busca)}</span>`);
  }

  if (chips.length === 0) {
    chips.push('<span class="chip muted">Sem filtros adicionais</span>');
  }

  return chips.join('');
}

function buildParticipantsList(
  participantes: MonthlyAgendaPrintSession['participantes'] | undefined,
): string {
  if (!participantes || participantes.length === 0) {
    return '<span class="muted">Sem tripulantes vinculados</span>';
  }

  return participantes
    .map((participante) => {
      return `<div class="participant-name"><span class="participant-dot"></span>${escapeHtml(participante.nome || 'Tripulante sem nome')}</div>`;
    })
    .join('');
}

export function buildMonthlyAgendaPrintHtml({
  monthDate,
  generatedAt = new Date(),
  sessions,
  filters,
}: MonthlyAgendaPrintOptions): string {
  const groupedByDay = new Map<string, MonthlyAgendaPrintSession[]>();
  const simulatorSummary = new Map<string, { count: number; minutes: number }>();
  let totalMinutes = 0;
  let totalChecks = 0;

  sessions
    .slice()
    .sort((a, b) => {
      const dateCompare = a.data.localeCompare(b.data);
      if (dateCompare !== 0) return dateCompare;
      const timeCompare = normalizeTime(a.hora_inicio).localeCompare(normalizeTime(b.hora_inicio));
      if (timeCompare !== 0) return timeCompare;
      return a.simulador_nome.localeCompare(b.simulador_nome);
    })
    .forEach((session) => {
      if (!groupedByDay.has(session.data)) groupedByDay.set(session.data, []);
      groupedByDay.get(session.data)!.push(session);

      const duration = calculateDurationMinutes(session.hora_inicio, session.hora_fim);
      totalMinutes += duration;

      const simulatorKey = session.simulador_nome || 'Simulador não informado';
      const simulatorItem = simulatorSummary.get(simulatorKey) || { count: 0, minutes: 0 };
      simulatorItem.count += 1;
      simulatorItem.minutes += duration;
      simulatorSummary.set(simulatorKey, simulatorItem);

      if (session.examinador_nome) totalChecks += 1;
    });

  const summaryCards = [
    { label: 'Sessões no mês', value: String(sessions.length) },
    { label: 'Carga prevista', value: formatDurationLabel(totalMinutes) },
    { label: 'Simuladores utilizados', value: String(simulatorSummary.size) },
    { label: 'Checks agendados', value: String(totalChecks) },
  ]
    .map(
      (item) => `
        <div class="summary-card">
          <div class="summary-label">${escapeHtml(item.label)}</div>
          <div class="summary-value">${escapeHtml(item.value)}</div>
        </div>
      `,
    )
    .join('');

  const simulatorCards = Array.from(simulatorSummary.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([name, item]) => `
        <div class="sim-card">
          <div class="sim-name">${escapeHtml(name)}</div>
          <div class="sim-meta">${escapeHtml(`${item.count} ${item.count === 1 ? 'sessão' : 'sessões'}`)} · ${escapeHtml(
            formatDurationLabel(item.minutes),
          )}</div>
        </div>
      `,
    )
    .join('');

  const daySections =
    Array.from(groupedByDay.entries())
      .map(([date, daySessions]) => {
        const dayMinutes = daySessions.reduce(
          (sum, item) => sum + calculateDurationMinutes(item.hora_inicio, item.hora_fim),
          0,
        );

        const rows = daySessions
          .map((session) => {
            const duration = calculateDurationMinutes(session.hora_inicio, session.hora_fim);
            const sessionTitle = session.tema_sessao || session.tipo_sessao || 'Sessão sem tema';

            return `
              <tr>
                <td style="width:72px">
                  <div class="time-badge">${escapeHtml(normalizeTime(session.hora_inicio))}–${escapeHtml(normalizeTime(session.hora_fim))}</div>
                  <div><span class="duration-badge">${escapeHtml(formatDurationLabel(duration))}</span></div>
                </td>
                <td>
                  <div class="primary-text">${escapeHtml(session.simulador_nome)}</div>
                  <div class="secondary-text">${escapeHtml(session.simulador_tipo || session.simulador_modelo || '')}</div>
                </td>
                <td>
                  <div class="primary-text">${escapeHtml(sessionTitle)}</div>
                  <div class="secondary-text">${escapeHtml(session.tipo_sessao || '')}</div>
                </td>
                <td>${buildParticipantsList(session.participantes)}</td>
                <td>
                  <div class="crew-row"><span class="crew-label crew-instr">Instr</span>${escapeHtml(session.instrutor_nome || 'Não informado')}</div>
                  ${session.examinador_nome
                    ? `<div class="crew-row"><span class="crew-label crew-exam">Exam</span>${escapeHtml(session.examinador_nome)}</div>`
                    : '<div class="muted">Sem examinador</div>'}
                </td>
                <td style="width:82px">
                  <span class="status-pill ${getStatusClass(session.status)}">${escapeHtml(getStatusLabel(session.status))}</span>
                </td>
                <td>${session.observacoes ? `<span class="obs-text">${escapeHtml(session.observacoes)}</span>` : '<span class="muted">—</span>'}</td>
              </tr>
            `;
          })
          .join('');

        return `
          <section class="day-section">
            <div class="day-header">
              <h2>${escapeHtml(formatDateLong(date))}</h2>
              <span class="day-badge">${daySessions.length} ${daySessions.length === 1 ? 'sessão' : 'sessões'} · ${escapeHtml(formatDurationLabel(dayMinutes))}</span>
            </div>
            <table class="schedule-table">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Simulador</th>
                  <th>Sessão / Tema</th>
                  <th>Tripulantes</th>
                  <th>Equipe</th>
                  <th>Status</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </section>
        `;
      })
      .join('') ||
    `
      <section class="empty-state">
        <h2>Nenhum agendamento encontrado</h2>
        <p>Não há sessões de simulador para este mês com os filtros aplicados.</p>
      </section>
    `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agenda mensal de simuladores - ${escapeHtml(getMonthLabel(monthDate))}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
        background: #fff;
        font-size: 9.2px;
        line-height: 1.45;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      /* ── HEADER BANNER ── */
      .header-banner {
        background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 60%, #2563eb 100%);
        color: #fff;
        padding: 10px 12px 9px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        break-after: avoid;
        page-break-after: avoid;
      }
      .header-eyebrow {
        font-size: 7.5px;
        font-weight: 700;
        letter-spacing: .14em;
        text-transform: uppercase;
        color: #93c5fd;
        margin-bottom: 4px;
      }
      .header-title {
        font-size: 20px;
        font-weight: 800;
        line-height: 1;
        text-transform: capitalize;
        color: #fff;
      }
      .header-sub {
        font-size: 8.5px;
        color: #bfdbfe;
        margin-top: 3px;
      }
      .header-meta {
        text-align: right;
        font-size: 8px;
        color: #bfdbfe;
        line-height: 1.5;
      }
      .header-meta strong { color: #fff; font-size: 8.5px; }

      /* ── STATS BAR ── */
      .stats-bar {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        background: #f0f7ff;
        border-bottom: 1px solid #bfdbfe;
        break-after: avoid;
        page-break-after: avoid;
      }
      .stat-item {
        padding: 6px 10px;
        border-right: 1px solid #bfdbfe;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .stat-item:last-child { border-right: none; }
      .stat-dot {
        width: 8px; height: 8px; border-radius: 50%;
        display: inline-block; margin-right: 4px; vertical-align: middle;
      }
      .stat-label { font-size: 7.5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
      .stat-value { font-size: 15px; font-weight: 800; line-height: 1; }
      .stat-blue  { color: #1d4ed8; }
      .stat-green { color: #059669; }
      .stat-amber { color: #d97706; }
      .stat-purple{ color: #7c3aed; }

      /* ── CONTENT WRAPPER ── */
      .content { padding: 8px 0 10px; display: flex; flex-direction: column; gap: 8px; }

      /* ── CHIPS ── */
      .chips-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .chips-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-right: 2px; }
      .chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 9px; border-radius: 999px;
        background: #dbeafe; color: #1e40af;
        font-size: 7.5px; font-weight: 700; border: 1px solid #bfdbfe;
      }
      .chip.muted { background: #f1f5f9; color: #64748b; border-color: #e2e8f0; }

      /* ── SIMULATOR DISTRIBUTION ── */
      .sim-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .sim-card {
        border-radius: 8px; padding: 7px 9px;
        border-left: 4px solid #3b82f6;
        background: #f8fafc; border-top: 1px solid #e2e8f0;
        border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .sim-name { font-size: 9px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
      .sim-meta { font-size: 7.8px; color: #64748b; }
      .sim-pill {
        display: inline-block; padding: 1px 7px; border-radius: 999px;
        background: #dbeafe; color: #1e40af; font-size: 9px; font-weight: 700;
        margin-right: 3px;
      }

      /* ── SECTION TITLES ── */
      .section-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .1em; color: #64748b;
        display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
        break-after: avoid;
        page-break-after: avoid;
      }
      .section-title::before {
        content: ''; display: inline-block;
        width: 3px; height: 12px; border-radius: 99px;
        background: #3b82f6;
      }

      /* ── DAY SECTION ── */
      .day-section {
        break-inside: auto;
        page-break-inside: auto;
        border-radius: 10px; overflow: hidden;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 2px rgba(0,0,0,.05);
      }
      .day-header {
        padding: 6px 10px;
        background: linear-gradient(90deg, #1e3a5f 0%, #1e40af 100%);
        display: flex; justify-content: space-between; align-items: center;
        break-after: avoid;
        page-break-after: avoid;
      }
      .day-header h2 { font-size: 10px; font-weight: 700; text-transform: capitalize; color: #fff; }
      .day-header .day-meta { font-size: 8px; color: #bfdbfe; }
      .day-badge {
        background: rgba(255,255,255,.2); color: #fff;
        padding: 2px 8px; border-radius: 999px; font-size: 7.5px; font-weight: 700;
      }

      /* ── SCHEDULE TABLE ── */
      .schedule-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        page-break-inside: auto;
      }
      .schedule-table thead { display: table-header-group; }
      .schedule-table tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .schedule-table th {
        text-align: left; font-size: 7.4px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .07em; color: #475569;
        background: #f8fafc; padding: 4px 6px;
        border-bottom: 1px solid #e2e8f0;
      }
      .schedule-table td {
        vertical-align: top; padding: 5px 6px;
        border-bottom: 1px solid #f1f5f9;
      }
      .schedule-table tbody tr:last-child td { border-bottom: none; }
      .schedule-table tbody tr:nth-child(even) td { background: #fafbff; }

      /* time cell */
      .time-badge {
        display: inline-block;
        background: #1e40af; color: #fff;
        padding: 2px 6px; border-radius: 5px;
        font-size: 8.5px; font-weight: 800; letter-spacing: .02em;
        white-space: nowrap;
      }
      .duration-badge {
        display: inline-block; margin-top: 3px;
        background: #dbeafe; color: #1e40af;
        padding: 1px 5px; border-radius: 999px;
        font-size: 7.4px; font-weight: 700;
      }

      /* primary / secondary */
      .primary-text { font-weight: 700; color: #1e293b; }
      .secondary-text { color: #64748b; font-size: 7.8px; margin-top: 1px; }
      .muted { color: #94a3b8; font-size: 7.8px; }

      /* participants */
      .participant-name {
        display: flex; align-items: center; gap: 4px;
        font-size: 8.2px; padding: 1px 0;
      }
      .participant-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #3b82f6; flex-shrink: 0;
      }

      /* instructor / examiner */
      .crew-row { font-size: 8.2px; padding: 1px 0; }
      .crew-label {
        display: inline-block; font-size: 6.8px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .06em;
        color: #fff; border-radius: 3px; padding: 0 4px; margin-right: 4px;
      }
      .crew-instr { background: #0891b2; }
      .crew-exam  { background: #7c3aed; }

      /* status pills */
      .status-pill {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 7px; border-radius: 999px;
        font-weight: 700; font-size: 7.8px; white-space: nowrap;
      }
      .status-pill::before { content: '●'; font-size: 7px; }
      .status-default   { background: #fef9c3; color: #92400e; }
      .status-live      { background: #dbeafe; color: #1d4ed8; }
      .status-completed { background: #dcfce7; color: #166534; }
      .status-cancelled { background: #fee2e2; color: #991b1b; }

      /* obs cell */
      .obs-text { font-size: 7.8px; color: #475569; font-style: italic; }

      /* empty state */
      .empty-state {
        border: 2px dashed #cbd5e1; border-radius: 12px;
        padding: 32px; text-align: center; color: #94a3b8;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .empty-state h2 { font-size: 14px; color: #64748b; margin-bottom: 6px; }

      /* ── FOOTER ── */
      .page-footer {
        background: #f8fafc; border-top: 1px solid #e2e8f0;
        padding: 5px 0 0;
        display: flex; justify-content: space-between;
        font-size: 7.5px; color: #94a3b8;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .page-footer strong { color: #475569; }

      @media print {
        .day-section,
        .sim-card {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>

    <!-- HEADER BANNER -->
    <div class="header-banner">
      <div>
        <div class="header-eyebrow">✈ AirTrust · Módulo Simuladores</div>
        <div class="header-title">${escapeHtml(getMonthLabel(monthDate))}</div>
        <div class="header-sub">Agenda mensal detalhada de sessões de treinamento</div>
      </div>
      <div class="header-meta">
        <div><strong>Emitido em</strong> ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
        <div><strong>Período</strong> ${escapeHtml(getMonthLabel(monthDate))}</div>
      </div>
    </div>

    <!-- STATS BAR -->
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label"><span class="stat-dot" style="background:#3b82f6"></span>Sessões</div>
        <div class="stat-value stat-blue">${sessions.length}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><span class="stat-dot" style="background:#059669"></span>Carga horária</div>
        <div class="stat-value stat-green">${escapeHtml(formatDurationLabel(totalMinutes))}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><span class="stat-dot" style="background:#d97706"></span>Simuladores</div>
        <div class="stat-value stat-amber">${simulatorSummary.size}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><span class="stat-dot" style="background:#7c3aed"></span>Checks</div>
        <div class="stat-value stat-purple">${totalChecks}</div>
      </div>
    </div>

    <div class="content">

      <!-- FILTROS -->
      <div class="chips-row">
        <span class="chips-label">Filtros:</span>
        ${buildFilterChips(filters)}
      </div>

      <!-- DISTRIBUIÇÃO POR SIMULADOR -->
      ${simulatorSummary.size > 0 ? `
      <div>
        <div class="section-title">Distribuição por simulador</div>
        <div class="sim-grid">
          ${Array.from(simulatorSummary.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([name, item]) => `
            <div class="sim-card">
              <div class="sim-name">${escapeHtml(name)}</div>
              <div class="sim-meta">
                <span class="sim-pill">${item.count} ${item.count === 1 ? 'sessão' : 'sessões'}</span>
                ${escapeHtml(formatDurationLabel(item.minutes))}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- AGENDA DETALHADA -->
      <div>
        <div class="section-title">Agenda detalhada por data</div>
        ${daySections}
      </div>

    </div>

    <!-- FOOTER -->
    <div class="page-footer">
      <div><strong>AirTrust</strong> — Documento gerado automaticamente. Não requer assinatura para uso interno.</div>
      <div><strong>${sessions.length}</strong> ${sessions.length === 1 ? 'sessão' : 'sessões'} · Emitido ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
    </div>

  </body>
</html>`;
}

export function openMonthlyAgendaPrint(options: MonthlyAgendaPrintOptions): boolean {
  return printHtmlViaIframe(buildMonthlyAgendaPrintHtml(options));
}

// =====================================================================
// IMPRESSÃO EM GRADE DE CALENDÁRIO (visual, estilo calendário mensal)
// =====================================================================

function buildCalendarGridHtml(options: MonthlyAgendaPrintOptions): string {
  const { monthDate, generatedAt = new Date(), sessions, filters } = options;

  // Mapeia sessões por data (YYYY-MM-DD)
  const byDay = new Map<string, MonthlyAgendaPrintSession[]>();
  for (const s of sessions) {
    const key = s.data.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth(); // 0-based

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  // Dia da semana do primeiro dia (0=dom)
  const startDow = firstDay.getDay();

  const DAYS_HEADER = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Gera células: preenchimento inicial + dias do mês
  const cells: Array<{ day: number | null; date: string | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= totalDays; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push({ day: d, date: `${year}-${mm}-${dd}` });
  }
  // Completa até múltiplo de 7
  while (cells.length % 7 !== 0) cells.push({ day: null, date: null });

  const rows: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const headersHtml = DAYS_HEADER.map(
    (d) => `<th>${escapeHtml(d)}</th>`,
  ).join('');

  const rowsHtml = rows
    .map((row) => {
      const cells = row
        .map(({ day, date }, colIdx) => {
          const isWeekend = colIdx === 0 || colIdx === 6;
          if (!day || !date) return `<td class="empty${isWeekend ? ' weekend-col' : ''}"></td>`;

          const daySessions = byDay.get(date) || [];
          const hasSessions = daySessions.length > 0;
          const sessionsHtml = daySessions
            .map((s) => {
              const start = normalizeTime(s.hora_inicio);
              const end = normalizeTime(s.hora_fim);
              const nome = s.tema_sessao || s.simulador_nome || '—';
              const statusCls = getStatusClass(s.status);
              return `<div class="cal-session ${statusCls}">
                <span class="cal-time">${escapeHtml(start)}–${escapeHtml(end)}</span>
                <span class="cal-name">${escapeHtml(nome)}</span>
                <span class="cal-instr">${escapeHtml(s.instrutor_nome || '')}</span>
              </div>`;
            })
            .join('');

          const tdClass = [
            isWeekend ? 'weekend-col' : '',
            hasSessions ? 'has-sessions' : '',
          ].filter(Boolean).join(' ');

          return `<td class="${tdClass}">
            <div class="cal-day-num">${day}${hasSessions ? `<span class="cal-count">${daySessions.length}</span>` : ''}</div>
            <div class="cal-sessions">${sessionsHtml}</div>
          </td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const totalMinutesGrid = sessions.reduce(
    (sum, s) => sum + calculateDurationMinutes(s.hora_inicio, s.hora_fim), 0
  );

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Calendário – ${escapeHtml(getMonthLabel(monthDate))}</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        font-size: 7.5px; color: #0f172a; background: #fff;
        print-color-adjust: exact; -webkit-print-color-adjust: exact;
      }

      /* HEADER */
      .cal-header {
        background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 60%, #2563eb 100%);
        color: #fff; padding: 14px 16px 12px;
        display: flex; justify-content: space-between; align-items: flex-end;
      }
      .cal-eyebrow { font-size: 8px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #93c5fd; margin-bottom: 4px; }
      .cal-title { font-size: 22px; font-weight: 800; line-height: 1; text-transform: capitalize; }
      .cal-meta { text-align: right; font-size: 8px; color: #bfdbfe; line-height: 1.9; }
      .cal-meta strong { color: #fff; }

      /* STATS */
      .cal-stats {
        display: grid; grid-template-columns: repeat(4, 1fr);
        background: #f0f7ff; border-bottom: 2px solid #bfdbfe;
      }
      .cs-item { padding: 7px 10px; border-right: 1px solid #bfdbfe; }
      .cs-item:last-child { border-right: none; }
      .cs-label { font-size: 7px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
      .cs-val { font-size: 16px; font-weight: 800; line-height: 1.2; }
      .cv-blue{color:#1d4ed8} .cv-green{color:#059669} .cv-amber{color:#d97706} .cv-purple{color:#7c3aed}

      /* CHIPS */
      .cal-chips { display: flex; gap: 4px; flex-wrap: wrap; padding: 6px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
      .chip { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; border-radius: 99px; padding: 1px 7px; font-size: 7px; font-weight: 700; }
      .chip.muted { background: #f1f5f9; color: #64748b; border-color: #e2e8f0; }

      /* CALENDAR GRID */
      .cal-wrap { padding: 8px 12px 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }

      /* day headers row */
      .dow-header th {
        text-align: center; padding: 5px 2px; font-size: 8px; font-weight: 700;
        letter-spacing: .06em; text-transform: uppercase; color: #fff;
      }
      .dow-header th.weekday { background: #1e40af; }
      .dow-header th.weekend { background: #475569; }

      td {
        border: 1px solid #e2e8f0; vertical-align: top;
        padding: 4px; height: 26mm;
      }
      td.empty { background: #f8fafc; }
      td.weekend-col { background: #fafbff; }
      td.has-sessions { border-top: 3px solid #3b82f6; }

      .cal-day-num {
        font-size: 10px; font-weight: 800; color: #1e293b;
        margin-bottom: 3px; line-height: 1;
      }
      td.weekend-col .cal-day-num { color: #64748b; }
      td.has-sessions .cal-day-num { color: #1e40af; }

      .cal-count {
        display: inline-block; font-size: 6.5px; font-weight: 700;
        background: #1e40af; color: #fff;
        border-radius: 99px; padding: 0 5px; margin-left: 3px; vertical-align: middle;
      }

      .cal-sessions { display: flex; flex-direction: column; gap: 2px; }
      .cal-session { border-radius: 3px; padding: 2px 4px; line-height: 1.3; overflow: hidden; }
      .cal-session.status-default   { background: #fef9c3; border-left: 3px solid #f59e0b; }
      .cal-session.status-completed { background: #dcfce7; border-left: 3px solid #16a34a; }
      .cal-session.status-cancelled { background: #fee2e2; border-left: 3px solid #dc2626; }
      .cal-session.status-live      { background: #dbeafe; border-left: 3px solid #2563eb; }
      .cal-time { display: block; font-size: 6px; color: #64748b; font-weight: 700; }
      .cal-name { display: block; font-size: 6.5px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cal-instr { display: block; font-size: 6px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* FOOTER */
      .cal-footer {
        background: #f8fafc; border-top: 1px solid #e2e8f0;
        padding: 5px 14px; display: flex; justify-content: space-between;
        font-size: 7px; color: #94a3b8;
      }
      .cal-footer strong { color: #475569; }
    </style>
  </head>
  <body>

    <div class="cal-header">
      <div>
        <div class="cal-eyebrow">✈ AirTrust · Agenda de Simuladores</div>
        <div class="cal-title">${escapeHtml(getMonthLabel(monthDate))}</div>
      </div>
      <div class="cal-meta">
        <div><strong>Emitido</strong> ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
        <div><strong>${sessions.length}</strong> ${sessions.length === 1 ? 'sessão' : 'sessões'}</div>
      </div>
    </div>

    <div class="cal-stats">
      <div class="cs-item">
        <div class="cs-label">Sessões</div>
        <div class="cs-val cv-blue">${sessions.length}</div>
      </div>
      <div class="cs-item">
        <div class="cs-label">Carga horária</div>
        <div class="cs-val cv-green">${escapeHtml(formatDurationLabel(totalMinutesGrid))}</div>
      </div>
      <div class="cs-item">
        <div class="cs-label">Dias com sessão</div>
        <div class="cs-val cv-amber">${byDay.size}</div>
      </div>
      <div class="cs-item">
        <div class="cs-label">Checks</div>
        <div class="cs-val cv-purple">${sessions.filter(s => s.examinador_nome).length}</div>
      </div>
    </div>

    <div class="cal-chips">${buildFilterChips(filters)}</div>

    <div class="cal-wrap">
      <table>
        <thead>
          <tr class="dow-header">
            ${DAYS_HEADER.map((d, i) =>
              `<th class="${i === 0 || i === 6 ? 'weekend' : 'weekday'}">${escapeHtml(d)}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div class="cal-footer">
      <div><strong>AirTrust</strong> — Documento gerado automaticamente</div>
      <div>Impresso em ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
    </div>

  </body>
</html>`;
}

function printHtmlViaIframe(html: string): boolean {
  if (typeof window === 'undefined') return false;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) { document.body.removeChild(iframe); return false; }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  const triggerPrint = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 2000);
  };

  if (iframeDoc.readyState === 'complete') {
    setTimeout(triggerPrint, 250);
  } else {
    iframe.addEventListener('load', triggerPrint, { once: true });
  }
  return true;
}

export function openCalendarGridPrint(options: MonthlyAgendaPrintOptions): boolean {
  return printHtmlViaIframe(buildCalendarGridHtml(options));
}

// =====================================================================
// IMPRESSÃO SEMANAL (grade de 7 colunas × horas do dia)
// =====================================================================

export interface WeeklyPrintOptions {
  weekStart: Date;               // segunda (ou dom) da semana
  sessions: MonthlyAgendaPrintSession[];
  generatedAt?: Date;
  filters?: { instrutor?: string; status?: string; busca?: string };
}

function getWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d);
  return `${fmt(weekStart)} – ${fmt(weekEnd)} de ${weekEnd.getFullYear()}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
}

function buildWeeklyHtml({ weekStart, sessions, generatedAt = new Date(), filters }: WeeklyPrintOptions): string {
  // Gera os 7 dias da semana a partir de weekStart
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push(`${d.getFullYear()}-${mm}-${dd}`);
  }

  // Agrupa sessões por dia
  const byDay = new Map<string, MonthlyAgendaPrintSession[]>();
  days.forEach(d => byDay.set(d, []));
  for (const s of sessions) {
    const key = s.data.slice(0, 10);
    if (byDay.has(key)) byDay.get(key)!.push(s);
  }

  // Ordena por hora_inicio
  byDay.forEach(arr => arr.sort((a, b) => normalizeTime(a.hora_inicio).localeCompare(normalizeTime(b.hora_inicio))));

  const totalMinutes = sessions.reduce((sum, s) => sum + calculateDurationMinutes(s.hora_inicio, s.hora_fim), 0);
  const checks = sessions.filter(s => s.examinador_nome).length;
  const daysWithSessions = [...byDay.values()].filter(a => a.length > 0).length;

  // Cabeçalho de dias
  const dayHeaders = days.map((date, i) => {
    const isWeekend = i === 0 || i === 6;
    const count = byDay.get(date)!.length;
    const label = formatShortDate(date);
    return `<th class="${isWeekend ? 'weekend' : 'weekday'}">
      <div class="dh-label">${escapeHtml(label)}</div>
      ${count > 0 ? `<div class="dh-count">${count} ${count === 1 ? 'sessão' : 'sessões'}</div>` : ''}
    </th>`;
  }).join('');

  // Células de sessões por dia
  const dayCells = days.map((date, i) => {
    const isWeekend = i === 0 || i === 6;
    const daySessions = byDay.get(date)!;
    if (daySessions.length === 0) {
      return `<td class="${isWeekend ? 'weekend-empty' : 'empty'}"><span class="no-session">—</span></td>`;
    }
    const cards = daySessions.map(s => {
      const dur = calculateDurationMinutes(s.hora_inicio, s.hora_fim);
      const statusCls = getStatusClass(s.status);
      const nome = s.tema_sessao || s.tipo_sessao || s.simulador_nome || '—';
      return `<div class="session-card ${statusCls}">
        <div class="sc-time">${escapeHtml(normalizeTime(s.hora_inicio))}–${escapeHtml(normalizeTime(s.hora_fim))} <span class="sc-dur">${escapeHtml(formatDurationLabel(dur))}</span></div>
        <div class="sc-name">${escapeHtml(nome)}</div>
        <div class="sc-sim">${escapeHtml(s.simulador_nome)}</div>
        <div class="sc-instr">Instr: ${escapeHtml(s.instrutor_nome || '—')}</div>
        ${s.examinador_nome ? `<div class="sc-exam">Exam: ${escapeHtml(s.examinador_nome)}</div>` : ''}
        ${(s.participantes || []).length > 0
          ? `<div class="sc-crew">${(s.participantes || []).map(p => escapeHtml(p.nome || '')).join(', ')}</div>`
          : ''}
        <span class="sc-status ${statusCls}">${escapeHtml(getStatusLabel(s.status))}</span>
      </div>`;
    }).join('');
    return `<td class="${isWeekend ? 'weekend' : ''}">${cards}</td>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Semana – ${escapeHtml(getWeekLabel(weekStart))}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI','Helvetica Neue',Arial,sans-serif;
      font-size: 8px; color: #0f172a; background: #fff;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }

    /* HEADER */
    .wk-header {
      background: linear-gradient(135deg,#1e3a5f 0%,#1e40af 60%,#2563eb 100%);
      color:#fff; padding:12px 16px 10px;
      display:flex; justify-content:space-between; align-items:flex-end;
    }
    .wk-eyebrow { font-size:8px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#93c5fd; margin-bottom:3px; }
    .wk-title   { font-size:18px; font-weight:800; line-height:1; }
    .wk-meta    { text-align:right; font-size:8px; color:#bfdbfe; line-height:1.8; }
    .wk-meta strong { color:#fff; }

    /* STATS */
    .wk-stats { display:grid; grid-template-columns:repeat(4,1fr); background:#f0f7ff; border-bottom:2px solid #bfdbfe; }
    .ws-item  { padding:6px 10px; border-right:1px solid #bfdbfe; }
    .ws-item:last-child { border-right:none; }
    .ws-label { font-size:7px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
    .ws-val   { font-size:15px; font-weight:800; line-height:1.2; }
    .wv-blue{color:#1d4ed8} .wv-green{color:#059669} .wv-amber{color:#d97706} .wv-purple{color:#7c3aed}

    /* CHIPS */
    .wk-chips { display:flex; gap:4px; flex-wrap:wrap; padding:5px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    .chip { background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe; border-radius:99px; padding:1px 7px; font-size:7px; font-weight:700; }
    .chip.muted { background:#f1f5f9; color:#64748b; border-color:#e2e8f0; }

    /* GRID */
    .wk-wrap { padding:8px 12px; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th { text-align:center; padding:6px 4px; vertical-align:bottom; }
    th.weekday { background:#1e40af; color:#fff; }
    th.weekend { background:#475569; color:#fff; }
    .dh-label { font-size:8.5px; font-weight:700; text-transform:capitalize; }
    .dh-count { font-size:7px; color:#bfdbfe; margin-top:2px; }

    td { border:1px solid #e2e8f0; vertical-align:top; padding:4px; min-height:30mm; }
    td.empty      { background:#f8fafc; }
    td.weekend-empty { background:#f1f5f9; }
    td.weekend    { background:#fafbff; }
    .no-session   { color:#cbd5e1; font-size:10px; display:block; text-align:center; margin-top:8px; }

    /* SESSION CARDS */
    .session-card {
      border-radius:4px; padding:4px 5px; margin-bottom:4px;
      line-height:1.35;
    }
    .session-card.status-default   { background:#fef9c3; border-left:3px solid #f59e0b; }
    .session-card.status-completed { background:#dcfce7; border-left:3px solid #16a34a; }
    .session-card.status-cancelled { background:#fee2e2; border-left:3px solid #dc2626; }
    .session-card.status-live      { background:#dbeafe; border-left:3px solid #2563eb; }

    .sc-time  { font-size:8px; font-weight:800; color:#1e293b; }
    .sc-dur   { font-size:7px; color:#64748b; font-weight:400; }
    .sc-name  { font-size:8px; font-weight:700; color:#1e293b; margin-top:1px; }
    .sc-sim   { font-size:7px; color:#475569; }
    .sc-instr { font-size:7px; color:#0891b2; }
    .sc-exam  { font-size:7px; color:#7c3aed; }
    .sc-crew  { font-size:7px; color:#64748b; margin-top:1px; }
    .sc-status {
      display:inline-block; margin-top:2px;
      font-size:6.5px; font-weight:700; border-radius:99px; padding:0px 5px;
    }
    .sc-status.status-default   { background:#fef3c7; color:#92400e; }
    .sc-status.status-completed { background:#d1fae5; color:#065f46; }
    .sc-status.status-cancelled { background:#fee2e2; color:#991b1b; }
    .sc-status.status-live      { background:#dbeafe; color:#1e40af; }

    /* FOOTER */
    .wk-footer {
      background:#f8fafc; border-top:1px solid #e2e8f0;
      padding:5px 14px; display:flex; justify-content:space-between;
      font-size:7px; color:#94a3b8;
    }
    .wk-footer strong { color:#475569; }
  </style>
</head>
<body>

  <div class="wk-header">
    <div>
      <div class="wk-eyebrow">✈ AirTrust · Agenda Semanal de Simuladores</div>
      <div class="wk-title">${escapeHtml(getWeekLabel(weekStart))}</div>
    </div>
    <div class="wk-meta">
      <div><strong>Emitido</strong> ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
      <div><strong>${sessions.length}</strong> ${sessions.length === 1 ? 'sessão' : 'sessões'}</div>
    </div>
  </div>

  <div class="wk-stats">
    <div class="ws-item"><div class="ws-label">Sessões</div><div class="ws-val wv-blue">${sessions.length}</div></div>
    <div class="ws-item"><div class="ws-label">Carga horária</div><div class="ws-val wv-green">${escapeHtml(formatDurationLabel(totalMinutes))}</div></div>
    <div class="ws-item"><div class="ws-label">Dias com sessão</div><div class="ws-val wv-amber">${daysWithSessions}</div></div>
    <div class="ws-item"><div class="ws-label">Checks</div><div class="ws-val wv-purple">${checks}</div></div>
  </div>

  <div class="wk-chips">${buildFilterChips(filters)}</div>

  <div class="wk-wrap">
    <table>
      <thead><tr><th style="width:0"></th>${dayHeaders}</tr></thead>
      <tbody><tr><td style="display:none"></td>${dayCells}</tr></tbody>
    </table>
  </div>

  <div class="wk-footer">
    <div><strong>AirTrust</strong> — Documento gerado automaticamente</div>
    <div>Impresso em ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
  </div>

</body>
</html>`;
}

export function openWeeklyAgendaPrint(options: WeeklyPrintOptions): boolean {
  return printHtmlViaIframe(buildWeeklyHtml(options));
}

// =====================================================================
// IMPRESSÃO DA VIEW AGENDA (lista cronológica compacta)
// =====================================================================

function buildAgendaListHtml({ sessions, generatedAt = new Date(), filters }: { sessions: MonthlyAgendaPrintSession[]; generatedAt?: Date; filters?: MonthlyAgendaPrintOptions['filters'] }): string {
  const sorted = [...sessions].sort((a, b) => {
    const dc = a.data.localeCompare(b.data);
    return dc !== 0 ? dc : normalizeTime(a.hora_inicio).localeCompare(normalizeTime(b.hora_inicio));
  });

  const grouped = new Map<string, MonthlyAgendaPrintSession[]>();
  for (const s of sorted) {
    const key = s.data.slice(0, 10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }

  const totalMinutes = sessions.reduce((sum, s) => sum + calculateDurationMinutes(s.hora_inicio, s.hora_fim), 0);
  const checks = sessions.filter(s => s.examinador_nome).length;

  const dayRows = Array.from(grouped.entries()).map(([date, daySessions]) => {
    const dayMin = daySessions.reduce((sum, s) => sum + calculateDurationMinutes(s.hora_inicio, s.hora_fim), 0);
    const rows = daySessions.map(s => {
      const dur = calculateDurationMinutes(s.hora_inicio, s.hora_fim);
      const nome = s.tema_sessao || s.tipo_sessao || '—';
      return `<tr>
        <td>
          <span class="ag-time">${escapeHtml(normalizeTime(s.hora_inicio))}–${escapeHtml(normalizeTime(s.hora_fim))}</span>
          <span class="ag-dur">${escapeHtml(formatDurationLabel(dur))}</span>
        </td>
        <td><div class="ag-primary">${escapeHtml(s.simulador_nome)}</div><div class="ag-sec">${escapeHtml(s.simulador_modelo || s.simulador_tipo || '')}</div></td>
        <td><div class="ag-primary">${escapeHtml(nome)}</div><div class="ag-sec">${escapeHtml(s.tipo_sessao || '')}</div></td>
        <td>${(s.participantes || []).map(p => `<div class="ag-part">· ${escapeHtml(p.nome || '')}</div>`).join('') || '<span class="ag-muted">—</span>'}</td>
        <td>
          <div><span class="ag-badge ag-instr">Instr</span> ${escapeHtml(s.instrutor_nome || '—')}</div>
          ${s.examinador_nome ? `<div><span class="ag-badge ag-exam">Exam</span> ${escapeHtml(s.examinador_nome)}</div>` : ''}
        </td>
        <td><span class="ag-status ${getStatusClass(s.status)}">${escapeHtml(getStatusLabel(s.status))}</span></td>
      </tr>`;
    }).join('');

    return `
      <tr class="ag-day-header">
        <td colspan="6">
          <span class="ag-date">${escapeHtml(formatDateLong(date))}</span>
          <span class="ag-day-meta">${daySessions.length} ${daySessions.length === 1 ? 'sessão' : 'sessões'} · ${escapeHtml(formatDurationLabel(dayMin))}</span>
        </td>
      </tr>
      ${rows}`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Agenda – ${escapeHtml(formatGeneratedAt(generatedAt))}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin:0; padding:0; }
    body {
      font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
      font-size:9px; color:#0f172a; background:#fff;
      print-color-adjust:exact; -webkit-print-color-adjust:exact;
    }

    /* HEADER */
    .ag-header {
      background:linear-gradient(135deg,#1e3a5f 0%,#1e40af 60%,#2563eb 100%);
      color:#fff; padding:14px 16px 12px;
      display:flex; justify-content:space-between; align-items:flex-end;
    }
    .ag-eyebrow { font-size:8px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#93c5fd; margin-bottom:4px; }
    .ag-title   { font-size:20px; font-weight:800; line-height:1; }
    .ag-meta    { text-align:right; font-size:8.5px; color:#bfdbfe; line-height:1.8; }
    .ag-meta strong { color:#fff; }

    /* STATS */
    .ag-stats { display:grid; grid-template-columns:repeat(4,1fr); background:#f0f7ff; border-bottom:2px solid #bfdbfe; }
    .as-item  { padding:7px 10px; border-right:1px solid #bfdbfe; }
    .as-item:last-child { border-right:none; }
    .as-label { font-size:7px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
    .as-val   { font-size:16px; font-weight:800; line-height:1.2; }
    .av-blue{color:#1d4ed8} .av-green{color:#059669} .av-amber{color:#d97706} .av-purple{color:#7c3aed}

    /* CHIPS */
    .ag-chips { display:flex; gap:4px; flex-wrap:wrap; padding:6px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    .chip { background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe; border-radius:99px; padding:1px 7px; font-size:7px; font-weight:700; }
    .chip.muted { background:#f1f5f9; color:#64748b; border-color:#e2e8f0; }

    /* TABLE */
    .ag-wrap { padding:10px 14px; }
    table { width:100%; border-collapse:collapse; }

    .ag-day-header td {
      background:linear-gradient(90deg,#1e3a5f,#1e40af);
      padding:6px 10px; border-radius:0;
    }
    .ag-date { font-size:11px; font-weight:700; color:#fff; text-transform:capitalize; margin-right:10px; }
    .ag-day-meta { font-size:9px; color:#bfdbfe; }

    thead th {
      background:#f8fafc; border-bottom:2px solid #e2e8f0;
      text-align:left; padding:5px 8px;
      font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#475569;
    }
    tbody tr:not(.ag-day-header) td {
      padding:6px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top;
    }
    tbody tr:not(.ag-day-header):nth-child(even) td { background:#fafbff; }

    .ag-time { display:inline-block; background:#1e40af; color:#fff; border-radius:5px; padding:2px 6px; font-size:9px; font-weight:800; margin-right:4px; }
    .ag-dur  { font-size:8px; color:#64748b; }
    .ag-primary { font-weight:700; color:#1e293b; font-size:9px; }
    .ag-sec     { font-size:8px; color:#64748b; }
    .ag-part    { font-size:8.5px; color:#334155; }
    .ag-muted   { color:#94a3b8; }
    .ag-badge   { display:inline-block; font-size:7px; font-weight:700; text-transform:uppercase; border-radius:3px; padding:0 4px; color:#fff; margin-right:3px; }
    .ag-instr   { background:#0891b2; }
    .ag-exam    { background:#7c3aed; }

    .ag-status { display:inline-flex; align-items:center; gap:3px; padding:2px 8px; border-radius:999px; font-weight:700; font-size:8px; }
    .ag-status::before { content:'●'; font-size:6px; }
    .status-default   { background:#fef9c3; color:#92400e; }
    .status-live      { background:#dbeafe; color:#1d4ed8; }
    .status-completed { background:#dcfce7; color:#166534; }
    .status-cancelled { background:#fee2e2; color:#991b1b; }

    /* FOOTER */
    .ag-footer { background:#f8fafc; border-top:1px solid #e2e8f0; padding:6px 14px; display:flex; justify-content:space-between; font-size:8px; color:#94a3b8; }
    .ag-footer strong { color:#475569; }
  </style>
</head>
<body>

  <div class="ag-header">
    <div>
      <div class="ag-eyebrow">✈ AirTrust · Agenda de Simuladores</div>
      <div class="ag-title">Próximos Agendamentos</div>
    </div>
    <div class="ag-meta">
      <div><strong>Emitido</strong> ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
      <div><strong>${sessions.length}</strong> ${sessions.length === 1 ? 'sessão' : 'sessões'}</div>
    </div>
  </div>

  <div class="ag-stats">
    <div class="as-item"><div class="as-label">Sessões</div><div class="as-val av-blue">${sessions.length}</div></div>
    <div class="as-item"><div class="as-label">Carga horária</div><div class="as-val av-green">${escapeHtml(formatDurationLabel(totalMinutes))}</div></div>
    <div class="as-item"><div class="as-label">Dias</div><div class="as-val av-amber">${grouped.size}</div></div>
    <div class="as-item"><div class="as-label">Checks</div><div class="as-val av-purple">${checks}</div></div>
  </div>

  <div class="ag-chips">${buildFilterChips(filters)}</div>

  <div class="ag-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:70px">Horário</th>
          <th>Simulador</th>
          <th>Sessão / Tema</th>
          <th>Tripulantes</th>
          <th>Equipe</th>
          <th style="width:80px">Status</th>
        </tr>
      </thead>
      <tbody>${dayRows}</tbody>
    </table>
  </div>

  <div class="ag-footer">
    <div><strong>AirTrust</strong> — Documento gerado automaticamente</div>
    <div>Impresso em ${escapeHtml(formatGeneratedAt(generatedAt))}</div>
  </div>

</body>
</html>`;
}

export function openAgendaListPrint(options: { sessions: MonthlyAgendaPrintSession[]; generatedAt?: Date; filters?: MonthlyAgendaPrintOptions['filters'] }): boolean {
  return printHtmlViaIframe(buildAgendaListHtml(options));
}
