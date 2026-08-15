import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_FROM = '2026-02-01';
const DEFAULT_TO = '2026-04-30';
const DEFAULT_OUTPUT = 'audit-frms-sono-RBAC135.md';
const API_BASE = 'https://airtrust-api-production.airtrust.workers.dev/api';
const DEFAULT_EMAIL = process.env.AIRTRUST_AUDIT_EMAIL || 'admin@airtrust.com';
const DEFAULT_PASSWORD = process.env.AIRTRUST_AUDIT_PASSWORD || 'Admin@123';

const ROOT_DIR = resolve(decodeURIComponent(new URL('..', import.meta.url).pathname));
const WORKER_DIR = resolve(ROOT_DIR, 'worker-airtrust');

function parseArgs(argv) {
  const options = {
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    output: resolve(ROOT_DIR, DEFAULT_OUTPUT),
    empresaId: null,
  };

  for (let index = 2; index < argv.length; index++) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--from' && next) {
      options.from = next;
      index++;
      continue;
    }
    if (current === '--to' && next) {
      options.to = next;
      index++;
      continue;
    }
    if (current === '--output' && next) {
      options.output = resolve(ROOT_DIR, next);
      index++;
      continue;
    }
    if (current === '--empresa-id' && next) {
      options.empresaId = Number(next);
      index++;
      continue;
    }
    throw new Error(`Argumento nao suportado: ${current}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from)) {
    throw new Error(`Data inicial invalida: ${options.from}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
    throw new Error(`Data final invalida: ${options.to}`);
  }
  if (options.from > options.to) {
    throw new Error(`Intervalo invalido: ${options.from} > ${options.to}`);
  }
  if (options.empresaId != null && !Number.isInteger(options.empresaId)) {
    throw new Error(`empresaId invalido: ${options.empresaId}`);
  }

  return options;
}

function runD1(sql) {
  const raw = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'airtrust-db',
      '--remote',
      '--env',
      'production',
      '--command',
      sql,
      '--json',
    ],
    {
      cwd: WORKER_DIR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.flatMap((chunk) => chunk.results || [])
    : Array.isArray(parsed.results)
      ? parsed.results
      : [];
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hhmmToMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToHhmm(value) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function circularMinuteDiff(left, right) {
  if (left == null || right == null) return null;
  const diff = Math.abs(left - right);
  return Math.min(diff, 1440 - diff);
}

function isWakeInsideWocl(minutes) {
  return minutes != null && minutes >= 120 && minutes <= 359;
}

function formatSigned(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return 'n/a';
  const rounded = round(value, digits).toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return round(value, digits).toFixed(digits);
}

function toDateMs(day) {
  return Date.parse(`${day}T00:00:00Z`);
}

function daysBetween(left, right) {
  return Math.floor((toDateMs(right) - toDateMs(left)) / 86400000);
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

function markdownTable(headers, rows) {
  const head = `| ${headers.map(escapeCell).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.length
    ? rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n')
    : `| ${headers.map((_, index) => (index === 0 ? 'Sem dados' : '-')).join(' | ')} |`;
  return `${head}\n${separator}\n${body}`;
}

function statusLabel(pass, failText, passText = 'PASS') {
  return pass ? passText : failText;
}

function blockOutcome(fails, warnings = 0) {
  if (fails > 0) return 'FAIL';
  if (warnings > 0) return 'RISCO';
  return 'PASS';
}

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickSpotChecks(rows, count) {
  return [...rows]
    .sort(
      (left, right) =>
        hashText(`${left.jornada_id}:${left.data}`) - hashText(`${right.jornada_id}:${right.data}`),
    )
    .slice(0, count);
}

function getCircadianRange(horaAcordou) {
  const minutes = hhmmToMinutes(horaAcordou);
  if (minutes == null) return null;
  if (minutes >= 120 && minutes <= 239) return { min: 0.5, max: 0.6, label: '0.50-0.60' };
  if (minutes >= 240 && minutes <= 359) return { min: 0.55, max: 0.65, label: '0.55-0.65' };
  if (minutes >= 360 && minutes <= 479) return { min: 0.65, max: 0.75, label: '0.65-0.75' };
  if (minutes >= 480 && minutes <= 599) return { min: 0.8, max: 0.89, label: '0.80-0.89' };
  if (minutes >= 600 && minutes <= 719) return { min: 0.85, max: 0.89, label: '0.85-0.89' };
  if (minutes >= 720 && minutes <= 839) return { min: 0.82, max: 0.87, label: '0.82-0.87' };
  if (minutes >= 840 && minutes <= 1079) return { min: 0.75, max: 0.83, label: '0.75-0.83' };
  if (minutes >= 1080 && minutes <= 1319) return { min: 0.65, max: 0.75, label: '0.65-0.75' };
  return { min: 0.55, max: 0.67, label: '0.55-0.67' };
}

function getApresentacaoRange(acordouNaWocl, horaAcordou) {
  const minutes = hhmmToMinutes(horaAcordou);
  if (!acordouNaWocl) return { min: 0, max: 0, label: '0.00' };
  if (minutes != null && minutes >= 120 && minutes <= 239) {
    return { min: -0.3, max: -0.2, label: '-0.30 a -0.20' };
  }
  if (minutes != null && minutes >= 240 && minutes <= 359) {
    return { min: -0.15, max: -0.05, label: '-0.15 a -0.05' };
  }
  return { min: null, max: null, label: 'WOCL fora da faixa esperada' };
}

function regulatoryLimit(durationMinutes) {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) return null;
  if (durationMinutes <= 720) return 720;
  if (durationMinutes <= 780) return 720;
  if (durationMinutes <= 840) return 840;
  if (durationMinutes <= 900) return 960;
  return 960;
}

function monthlyKey(day) {
  return String(day).slice(0, 7);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? parseJson(text, {}) : {};
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${JSON.stringify(json).slice(0, 500)}`,
    );
  }
  return json;
}

async function fetchSigvoosHistory() {
  const login = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }),
  });
  const token = login?.data?.accessToken;
  if (!token) {
    throw new Error('Nao foi possivel autenticar na API para consultar o historico SIGVOOS.');
  }
  const history = await fetchJson(`${API_BASE}/integracoes/sigvoos/historico?limit=30`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(history?.data) ? history.data : [];
}

function inferEmpresaId(explicitEmpresaId) {
  if (explicitEmpresaId != null) {
    return { empresaId: explicitEmpresaId, candidates: [] };
  }

  const candidates = runD1(`
    SELECT empresa_id,
           MAX(CASE WHEN chave = 'auto_sync_enabled' THEN valor END) AS auto_sync_enabled,
           MAX(CASE WHEN chave = 'auto_sync_hora_utc' THEN valor END) AS auto_sync_hora_utc,
           MAX(CASE WHEN chave = 'username' THEN valor END) AS username,
           MAX(CASE WHEN chave = 'last_sync_to' THEN valor END) AS last_sync_to
      FROM integracoes_sigvoos_config
     WHERE deleted_at IS NULL
     GROUP BY empresa_id
     ORDER BY CASE
                WHEN LOWER(COALESCE(MAX(CASE WHEN chave = 'auto_sync_enabled' THEN valor END), '0')) IN ('1', 'true', 'yes', 'on') THEN 0
                ELSE 1
              END,
              CASE WHEN MAX(CASE WHEN chave = 'username' THEN valor END) IS NOT NULL THEN 0 ELSE 1 END,
              empresa_id ASC
  `);

  if (candidates.length > 0) {
    return { empresaId: Number(candidates[0].empresa_id), candidates };
  }

  const fallback = runD1(`
    SELECT f.empresa_id, COUNT(*) AS total
      FROM frms_jornada j
      JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
     WHERE j.deleted_at IS NULL
       AND f.deleted_at IS NULL
       AND j.data BETWEEN ${sqlString(DEFAULT_FROM)} AND ${sqlString(DEFAULT_TO)}
     GROUP BY f.empresa_id
     ORDER BY total DESC, f.empresa_id ASC
     LIMIT 1
  `);
  if (fallback.length === 0) {
    throw new Error('Nao foi possivel inferir empresa_id para a auditoria.');
  }
  return { empresaId: Number(fallback[0].empresa_id), candidates };
}

function loadConfig(empresaId) {
  const rows = runD1(`
    SELECT nome, valor_numerico
      FROM frms_configuracao_limites
     WHERE ativo = 1
       AND deleted_at IS NULL
       AND nome IN ('MINUTOS_ANTES_APRESENTACAO', 'HORAS_SONO_PADRAO')
  `);
  const map = Object.fromEntries(rows.map((row) => [row.nome, safeNumber(row.valor_numerico)]));
  return {
    empresaId,
    minutosAntesApresentacao: map.MINUTOS_ANTES_APRESENTACAO ?? 90,
    horasSonoPadrao: map.HORAS_SONO_PADRAO ?? 8,
  };
}

function loadSchedulerConfig(empresaId) {
  const rows = runD1(`
    SELECT chave, valor
      FROM integracoes_sigvoos_config
     WHERE deleted_at IS NULL
       AND empresa_id = ${safeNumber(empresaId)}
       AND chave IN ('auto_sync_enabled', 'auto_sync_hora_utc', 'last_sync_to', 'notificar_falha_email')
  `);
  const map = Object.fromEntries(rows.map((row) => [row.chave, row.valor]));
  const parsedHour = Number.parseInt(String(map.auto_sync_hora_utc ?? '19'), 10);
  const autoSyncHourUtc = Number.isFinite(parsedHour) ? Math.max(0, Math.min(23, parsedHour)) : 19;
  return {
    autoSyncEnabled: String(map.auto_sync_enabled ?? 'true').toLowerCase() !== 'false',
    autoSyncHourUtc,
    lastSyncTo: map.last_sync_to ?? null,
    notificarFalhaEmail: map.notificar_falha_email ?? null,
  };
}

function loadJourneys(empresaId, from, to) {
  return runD1(`
    SELECT j.id AS jornada_id,
           CAST(j.tripulante_id AS TEXT) AS tripulante_id,
           f.nome AS tripulante_nome,
           j.data,
           j.status,
           j.hora_apresentacao,
           j.hora_termino,
           j.hora_corte_motor,
           j.duracao_jornada_minutos,
           j.horas_voo_minutos,
           j.hora_acordou,
           j.sono_efetivo_min,
           COALESCE(j.fonte_sono, 'PADRAO') AS fonte_sono,
           COALESCE(j.acordou_na_wocl, 0) AS acordou_na_wocl,
           j.repouso_regulatorio_min,
           j.origem,
           fj.fator_basica_pct,
           fj.fator_apresentacao_pct,
           fj.fator_repouso_pct,
           fj.effectiveness_pct,
           fj.effectiveness_componentes_json,
           fj.hora_despertar_estimada,
           fj.hora_inicio_sono_estimado,
           fj.duracao_sono_efetiva_min,
           fj.tempo_abaixo_limiar_min
      FROM frms_jornada j
      JOIN funcionarios f
        ON f.id = CAST(j.tripulante_id AS INTEGER)
      LEFT JOIN frms_fatorizacao_jornada fj
        ON fj.jornada_id = j.id
       AND fj.deleted_at IS NULL
     WHERE j.deleted_at IS NULL
       AND f.deleted_at IS NULL
       AND f.empresa_id = ${safeNumber(empresaId)}
       AND j.data BETWEEN ${sqlString(from)} AND ${sqlString(to)}
     ORDER BY f.nome ASC, j.data ASC, COALESCE(j.hora_apresentacao, '99:99') ASC
  `).map((row) => ({
    ...row,
    acordou_na_wocl: safeNumber(row.acordou_na_wocl) === 1,
    sono_efetivo_min: row.sono_efetivo_min == null ? null : safeNumber(row.sono_efetivo_min),
    duracao_jornada_minutos:
      row.duracao_jornada_minutos == null ? null : safeNumber(row.duracao_jornada_minutos),
    horas_voo_minutos: row.horas_voo_minutos == null ? null : safeNumber(row.horas_voo_minutos),
    repouso_regulatorio_min:
      row.repouso_regulatorio_min == null ? null : safeNumber(row.repouso_regulatorio_min),
    fator_basica_pct: row.fator_basica_pct == null ? null : safeNumber(row.fator_basica_pct),
    fator_apresentacao_pct:
      row.fator_apresentacao_pct == null ? null : safeNumber(row.fator_apresentacao_pct),
    fator_repouso_pct: row.fator_repouso_pct == null ? null : safeNumber(row.fator_repouso_pct),
  }));
}

function loadPreviewRows(from, to) {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  return runD1(`
    SELECT id,
           tripulante_id,
           nome_fira,
           ano,
           mes,
           status,
           preview_json,
           created_at
      FROM frms_importacao_fira
     WHERE deleted_at IS NULL
       AND tripulante_id IS NOT NULL
       AND ano BETWEEN ${fromYear} AND ${toYear}
     ORDER BY created_at DESC
  `);
}

function latestPreviewPerMonth(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.tripulante_id}:${row.ano}:${row.mes}`;
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function aggregateSigvoosDays(previewRows, from, to) {
  const days = new Map();
  for (const row of latestPreviewPerMonth(previewRows)) {
    const preview = parseJson(row.preview_json, null);
    const linhas = Array.isArray(preview?.linhas) ? preview.linhas : [];
    for (const linha of linhas) {
      if (!linha || typeof linha !== 'object') continue;
      if (typeof linha.data !== 'string' || linha.data < from || linha.data > to) continue;
      if (linha.situacao === 'DIA_VAZIO') continue;
      const key = `${row.tripulante_id}:${linha.data}`;
      const current = days.get(key) || {
        tripulante_id: String(row.tripulante_id),
        tripulante_nome: preview?.tripulante_nome_sistema || row.nome_fira,
        data: linha.data,
        hv_sigvoos_min: 0,
        importacao_id: row.id,
      };
      current.hv_sigvoos_min += safeNumber(linha.horas_voo_min, 0);
      days.set(key, current);
    }
  }
  return [...days.values()].sort((left, right) => {
    if (left.tripulante_nome !== right.tripulante_nome) {
      return String(left.tripulante_nome).localeCompare(String(right.tripulante_nome));
    }
    return String(left.data).localeCompare(String(right.data));
  });
}

function buildJourneyMaps(journeys) {
  const byTrip = new Map();
  const byTripDate = new Map();
  for (const row of journeys) {
    if (!byTrip.has(row.tripulante_id)) byTrip.set(row.tripulante_id, []);
    byTrip.get(row.tripulante_id).push(row);
    byTripDate.set(`${row.tripulante_id}:${row.data}`, row);
  }
  for (const rows of byTrip.values()) {
    rows.sort((left, right) => String(left.data).localeCompare(String(right.data)));
  }
  return { byTrip, byTripDate };
}

function auditBlock1(journeys, minutosAntesApresentacao) {
  let fails = 0;
  const rows = journeys.map((row) => {
    const presentationMin = hhmmToMinutes(row.hora_apresentacao);
    const wakeMin = hhmmToMinutes(row.hora_acordou);
    const expectedWakeMin =
      presentationMin == null ? null : presentationMin - minutosAntesApresentacao;
    const wakeDiff = circularMinuteDiff(
      wakeMin,
      expectedWakeMin == null ? null : ((expectedWakeMin % 1440) + 1440) % 1440,
    );
    const expectedWake = expectedWakeMin == null ? 'n/a' : minutesToHhmm(expectedWakeMin);
    const expectedWocl = isWakeInsideWocl(wakeMin);
    const issues = [];

    if (row.fonte_sono === 'PADRAO' && row.sono_efetivo_min !== 480) {
      issues.push(`sono_padrao=${row.sono_efetivo_min ?? 'n/a'} (esperado 480)`);
    }
    if (wakeDiff != null && wakeDiff > 1) {
      issues.push(
        `hora_acordou ${row.hora_acordou ?? 'n/a'} != ${expectedWake} (delta ${wakeDiff}m)`,
      );
    }
    if (wakeMin != null && row.acordou_na_wocl !== expectedWocl) {
      issues.push(`WOCL=${row.acordou_na_wocl} mas hora_acordou exige ${expectedWocl}`);
    }

    const pass = issues.length === 0;
    if (!pass) fails++;
    return {
      markdown: [
        row.tripulante_nome,
        row.data,
        row.hora_apresentacao ?? 'n/a',
        row.hora_acordou ?? 'n/a',
        row.sono_efetivo_min ?? 'n/a',
        row.fonte_sono,
        row.acordou_na_wocl ? 'true' : 'false',
        pass ? 'PASS' : `FAIL CRITICO: ${issues.join('; ')}`,
      ],
    };
  });

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Apresentacao',
        'Hora Acordou',
        'Sono Efetivo',
        'Fonte',
        'WOCL?',
        'STATUS',
      ],
      rows.map((row) => row.markdown),
    ),
  };
}

function auditBlock2(journeys) {
  let fails = 0;
  const rows = journeys.map((row) => {
    const expected = row.fonte_sono === 'PADRAO' ? 0 : 'pode variar';
    const pass = row.fonte_sono !== 'PADRAO' || row.fator_repouso_pct === 0;
    if (!pass) fails++;
    return [
      row.tripulante_nome,
      row.data,
      row.fonte_sono,
      row.sono_efetivo_min ?? 'n/a',
      row.fator_repouso_pct == null ? 'n/a' : formatSigned(row.fator_repouso_pct),
      expected,
      pass ? 'PASS' : 'FAIL',
    ];
  });

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Fonte Sono',
        'Sono Efetivo (min)',
        'Fator_Repouso',
        'Esperado',
        'STATUS',
      ],
      rows,
    ),
  };
}

function auditBlock3(journeys) {
  const eligible = journeys.filter((row) => row.hora_acordou && row.fator_basica_pct != null);
  const checks = pickSpotChecks(eligible, 5).map((row) => {
    const range = getCircadianRange(row.hora_acordou);
    const midpoint = range ? (range.min + range.max) / 2 : null;
    const delta =
      midpoint == null || row.fator_basica_pct == null
        ? null
        : Math.abs(row.fator_basica_pct - midpoint);
    const pass =
      range != null &&
      delta != null &&
      delta <= 0.05 &&
      row.fator_basica_pct >= range.min &&
      row.fator_basica_pct <= range.max;
    return {
      pass,
      row: [
        row.tripulante_nome,
        row.data,
        row.hora_acordou,
        formatNumber(row.fator_basica_pct, 2),
        range?.label ?? 'n/a',
        delta == null ? 'n/a' : formatNumber(delta, 2),
        pass ? 'PASS' : 'FAIL',
      ],
    };
  });

  return {
    fails: checks.filter((item) => !item.pass).length,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Hora Acordou',
        'Fator_Basica Registrado',
        'Range Esperado',
        'Delta',
        'STATUS',
      ],
      checks.map((item) => item.row),
    ),
  };
}

function auditBlock4(journeys) {
  let fails = 0;
  const rows = journeys
    .filter((row) => row.hora_acordou)
    .map((row) => {
      const range = getApresentacaoRange(row.acordou_na_wocl, row.hora_acordou);
      const value = row.fator_apresentacao_pct;
      const pass =
        value != null &&
        ((range.min === 0 && value === 0) ||
          (range.min != null && range.max != null && value >= range.min && value <= range.max));
      if (!pass) fails++;
      return [
        row.tripulante_nome,
        row.data,
        row.hora_acordou,
        row.acordou_na_wocl ? 'true' : 'false',
        value == null ? 'n/a' : formatSigned(value),
        range.label,
        pass ? 'PASS' : 'FAIL',
      ];
    });

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data',
        'Hora Acordou',
        'WOCL?',
        'Fator_Apresentacao Registrado',
        'Esperado',
        'STATUS',
      ],
      rows,
    ),
  };
}

function inferDurationMinutes(row) {
  if (Number.isFinite(row.duracao_jornada_minutos)) return row.duracao_jornada_minutos;
  const start = hhmmToMinutes(row.hora_apresentacao);
  const end = hhmmToMinutes(row.hora_corte_motor || row.hora_termino);
  if (start == null || end == null) return null;
  return end >= start ? end - start : end + 1440 - start;
}

function auditBlock5(byTrip) {
  let fails = 0;
  const rows = [];

  for (const tripRows of byTrip.values()) {
    for (let index = 1; index < tripRows.length; index++) {
      const previous = tripRows[index - 1];
      const current = tripRows[index];
      const duration = inferDurationMinutes(previous);
      const limit = duration == null ? null : regulatoryLimit(duration);
      const actualRest = current.repouso_regulatorio_min;
      const pass = limit != null && actualRest != null ? actualRest >= limit : false;
      if (!pass) fails++;
      rows.push([
        current.tripulante_nome,
        previous.data,
        duration == null ? 'n/a' : `${duration} min`,
        previous.hora_corte_motor || previous.hora_termino || 'n/a',
        current.hora_apresentacao || 'n/a',
        actualRest == null ? 'n/a' : `${actualRest}`,
        limit == null ? 'n/a' : `${limit}`,
        'RBAC 117 Apendice B item (j)',
        pass ? 'PASS' : 'FAIL',
      ]);
    }
  }

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data D1',
        'Duracao D1',
        'Corte D1',
        'Apresentacao D2',
        'Repouso Regulatorio (min)',
        'Limite RBAC (min)',
        'Artigo',
        'STATUS',
      ],
      rows,
    ),
  };
}

function auditBlock6(byTrip) {
  let fails = 0;
  const rows = [];

  for (const tripRows of byTrip.values()) {
    for (let index = 0; index < tripRows.length; index++) {
      const current = tripRows[index];
      let sum7 = 0;
      let sum28 = 0;
      let hv28 = 0;
      let hv365 = 0;

      for (let inner = 0; inner <= index; inner++) {
        const compared = tripRows[inner];
        const diff = daysBetween(compared.data, current.data);
        const duration = inferDurationMinutes(compared) ?? 0;
        const hv = safeNumber(compared.horas_voo_minutos, 0);
        if (diff <= 6) sum7 += duration;
        if (diff <= 27) {
          sum28 += duration;
          hv28 += hv;
        }
        if (diff <= 364) hv365 += hv;
      }

      const pass = sum7 <= 3600 && sum28 <= 10560 && hv28 <= 5580 && hv365 <= 55800;
      if (!pass) fails++;
      rows.push([
        current.tripulante_nome,
        current.data,
        `${sum7}`,
        '3600',
        `${sum28}`,
        '10560',
        `${hv28}`,
        '5580',
        `${hv365}`,
        '55800',
        pass ? 'PASS' : 'FAIL',
      ]);
    }
  }

  return {
    fails,
    table: markdownTable(
      [
        'Tripulante',
        'Data Ref',
        'Jornada 7d (min)',
        'Limite',
        'Jornada 28d',
        'Limite',
        'HV 28d',
        'Limite',
        'HV 365d',
        'Limite',
        'STATUS',
      ],
      rows,
    ),
  };
}

function auditBlock7(sigvoosDays, byTripDate) {
  let fails = 0;
  const tableG = [];
  const monthCoverage = new Map();

  for (const sourceDay of sigvoosDays) {
    const journey = byTripDate.get(`${sourceDay.tripulante_id}:${sourceDay.data}`);
    const hvFrms = journey?.horas_voo_minutos ?? null;
    const delta = hvFrms == null ? null : Math.abs(sourceDay.hv_sigvoos_min - hvFrms);
    const pass = hvFrms != null && delta != null && delta <= 5;
    if (!pass) fails++;
    tableG.push([
      sourceDay.tripulante_nome,
      sourceDay.data,
      `${sourceDay.hv_sigvoos_min}`,
      hvFrms == null ? 'n/a' : `${hvFrms}`,
      delta == null ? 'n/a' : `${delta}`,
      pass ? 'PASS' : hvFrms == null ? 'FAIL CRITICO: sem jornada FRMS' : 'FAIL',
    ]);

    const key = `${sourceDay.tripulante_id}:${monthlyKey(sourceDay.data)}`;
    const coverage = monthCoverage.get(key) || {
      tripulante_nome: sourceDay.tripulante_nome,
      mes: monthlyKey(sourceDay.data),
      dias_sigvoos: 0,
      dias_frms: 0,
    };
    coverage.dias_sigvoos += 1;
    if (journey) coverage.dias_frms += 1;
    monthCoverage.set(key, coverage);
  }

  const tableH = [...monthCoverage.values()]
    .sort((left, right) => {
      if (left.tripulante_nome !== right.tripulante_nome) {
        return String(left.tripulante_nome).localeCompare(String(right.tripulante_nome));
      }
      return String(left.mes).localeCompare(String(right.mes));
    })
    .map((row) => {
      const coveragePct = row.dias_sigvoos > 0 ? (row.dias_frms / row.dias_sigvoos) * 100 : 0;
      const pass = coveragePct >= 98;
      if (!pass) fails++;
      return [
        row.tripulante_nome,
        row.mes,
        `${row.dias_sigvoos}`,
        `${row.dias_frms}`,
        formatNumber(coveragePct, 1),
        pass ? 'PASS' : 'FAIL',
      ];
    });

  return {
    fails,
    tableG: markdownTable(
      ['Tripulante', 'Data', 'HV SIGVOOS (min)', 'HV FRMS (min)', 'Delta', 'STATUS'],
      tableG,
    ),
    tableH: markdownTable(
      ['Tripulante', 'Mes', 'Dias SIGVOOS', 'Dias FRMS', 'Cobertura%', 'STATUS'],
      tableH,
    ),
  };
}

function parseCronConfig() {
  const wrangler = readFileSync(resolve(ROOT_DIR, 'worker-airtrust/wrangler.toml'), 'utf8');
  const cron = wrangler.includes('"0 8 * * *"') ? '0 8 * * *' : 'nao localizado';
  return {
    cron,
    brasilia: cron === '0 8 * * *' ? '05:00 BRT (UTC-3)' : 'n/a',
  };
}

function inspectScheduledHandler() {
  const source = readFileSync(
    resolve(ROOT_DIR, 'worker-airtrust/src/cron/scheduled-handler.ts'),
    'utf8',
  );
  const usesCatchup =
    source.includes('let fromDate = lastSyncToDate ? addDays(lastSyncToDate, 1) : yesterday;') &&
    source.includes('const windows = buildWindows(fmtIso(fromDate), todayUtc, 1);') &&
    source.includes('const window = windows[0];');
  const usesPreviousDayWindow =
    source.includes('const window = { from: fmtIso(yesterday), to: fmtIso(yesterday) };') &&
    source.includes('if (currentUtcHour !== targetHour || currentUtcMinute >= 10) {');
  const hasFailureAlerting =
    source.includes('registrarEventoSigvoosFalha(') &&
    source.includes('enviarEmailAlert(') &&
    source.includes('config.notificar_falha_email');
  return {
    usesCatchup,
    usesPreviousDayWindow,
    hasFailureAlerting,
    summary: usesCatchup
      ? 'Handler sincroniza a primeira janela pendente entre last_sync_to+1 e hoje; nao esta fixado estritamente em ontem 00:00-23:59.'
      : usesPreviousDayWindow
        ? 'Handler confirma janela diaria fixa em ontem 00:00-23:59 UTC, no horario configurado.'
        : 'Nao foi possivel confirmar a janela diaria pelo codigo atual.',
  };
}

function parseEventPayload(event) {
  return typeof event.payload_json === 'string' ? parseJson(event.payload_json, {}) : {};
}

function isLikelyAutomaticCronEvent(event) {
  const payload = parseEventPayload(event);
  const hasWindow = typeof payload?.from === 'string' && typeof payload?.to === 'string';
  if (!hasWindow) return false;
  if (String(payload.from) !== String(payload.to)) return false;

  const hasManualChunkingHints =
    payload?.pageSize != null ||
    payload?.maxPages != null ||
    payload?.chunkDays != null ||
    payload?.retryAttempts != null;

  return !hasManualChunkingHints;
}

function classifyScheduledEvents(events, targetHourUtc) {
  const lastSevenDays = Date.now() - 7 * 86400000;
  return events.filter((event) => {
    const createdAt = Date.parse(String(event.created_at || event.updated_at || ''));
    if (!Number.isFinite(createdAt) || createdAt < lastSevenDays) return false;
    if (!isLikelyAutomaticCronEvent(event)) return false;

    if (Number.isFinite(targetHourUtc)) {
      const created = new Date(createdAt);
      const nearCronHour = created.getUTCHours() === Number(targetHourUtc);
      const nearCronMinute = created.getUTCMinutes() < 20;
      return nearCronHour && nearCronMinute;
    }

    return true;
  });
}

function auditBlock8(events, schedulerConfig) {
  const cronConfig = parseCronConfig();
  const handler = inspectScheduledHandler();
  const scheduled = classifyScheduledEvents(events, schedulerConfig?.autoSyncHourUtc);
  const failures = scheduled.filter((event) => String(event.status).toUpperCase() !== 'SUCESSO');
  const anyAlerting = handler.hasFailureAlerting;
  const checks = [];
  checks.push(`Cron em producao: ${cronConfig.cron} -> ${cronConfig.brasilia}`);
  checks.push(`auto_sync_hora_utc configurado: ${schedulerConfig?.autoSyncHourUtc ?? 'n/a'}:00`);
  checks.push(`Handler: ${handler.summary}`);
  checks.push(`Eventos automaticos ultimos 7 dias: ${scheduled.length}`);
  checks.push(`Falhas ultimos 7 dias: ${failures.length}`);
  checks.push(
    anyAlerting
      ? 'Alerta de falha: identificado'
      : 'Alerta de falha: nao identificado no codigo atual',
  );

  const tableRows = scheduled.map((event) => {
    const payload = parseJson(event.payload_json, {});
    const response = parseJson(event.resposta_json, {});
    const totalEtapas = response?.totalRegistrosBrutos ?? response?.totalImportacoes ?? 'n/a';
    const created = String(event.created_at || event.updated_at || 'n/a');
    const timestamp = created.replace('T', ' ').slice(0, 19);
    const pass = String(event.status).toUpperCase() === 'SUCESSO';
    return [
      String(event.tipo_evento || 'n/a'),
      timestamp,
      `${payload?.from ?? 'n/a'} -> ${payload?.to ?? 'n/a'}`,
      `${totalEtapas}`,
      String(event.status || 'n/a'),
      pass ? 'PASS' : 'FAIL CRITICO',
    ];
  });

  const failCount = failures.length;
  let warningCount = 0;
  if (!anyAlerting) warningCount += 1;
  if (scheduled.length === 0) warningCount += 1;

  return {
    fails: failCount,
    warnings: warningCount,
    notes: checks,
    table: markdownTable(
      ['Tipo', 'Timestamp', 'Janela', 'totalEtapas', 'Status', 'STATUS'],
      tableRows,
    ),
  };
}

function buildExecutiveSummary(preconditions, blocks) {
  const rows = [
    ['0', 'Pre-condicoes', preconditions.result, `${preconditions.fails}`],
    ['1', 'Sono efetivo calculado corretamente', blocks.block1.result, `${blocks.block1.fails}`],
    [
      '2',
      'Fator_Repouso coerente com sono efetivo',
      blocks.block2.result,
      `${blocks.block2.fails}`,
    ],
    ['3', 'Fator_Basica coerente com circadiano', blocks.block3.result, `${blocks.block3.fails}`],
    ['4', 'Fator_Apresentacao coerente com WOCL', blocks.block4.result, `${blocks.block4.fails}`],
    ['5', 'Repouso regulatorio RBAC 117 ok', blocks.block5.result, `${blocks.block5.fails}`],
    ['6', 'Limites acumulados 7d/28d/365d ok', blocks.block6.result, `${blocks.block6.fails}`],
    [
      '7',
      'Cross-validation SIGVOOS >=98% cobertura',
      blocks.block7.result,
      `${blocks.block7.fails}`,
    ],
    ['8', 'Scheduler diario funcionando', blocks.block8.result, `${blocks.block8.fails}`],
  ];

  return markdownTable(['Bloco', 'Verificacao', 'Resultado', 'FAILs'], rows);
}

function collectCorrections(blockFindings) {
  const corrections = [];
  for (const finding of blockFindings) {
    if (finding.fails === 0) continue;
    corrections.push(`- Bloco ${finding.id}: ${finding.action}`);
  }
  return corrections.length > 0
    ? corrections.join('\n')
    : '- Nenhuma correcao mandataria registrada; sem FAILs.';
}

async function main() {
  const options = parseArgs(process.argv);
  const { empresaId, candidates } = inferEmpresaId(options.empresaId);
  const config = loadConfig(empresaId);
  const schedulerConfig = loadSchedulerConfig(empresaId);
  const journeys = loadJourneys(empresaId, options.from, options.to);
  const previewRows = loadPreviewRows(options.from, options.to);
  const sigvoosDays = aggregateSigvoosDays(previewRows, options.from, options.to);
  const historyEvents = await fetchSigvoosHistory().catch((error) => {
    console.warn(`[audit] Falha ao consultar API historico SIGVOOS: ${error.message}`);
    return runD1(`
      SELECT tipo_evento, status, payload_json, resposta_json, created_at, updated_at
        FROM integracoes_sigvoos_eventos
       WHERE deleted_at IS NULL
         AND empresa_id = ${safeNumber(empresaId)}
       ORDER BY created_at DESC
       LIMIT 30
    `);
  });

  const { byTrip, byTripDate } = buildJourneyMaps(journeys);

  const preconditionFails = [];
  if (config.minutosAntesApresentacao !== 90) {
    preconditionFails.push(
      `MINUTOS_ANTES_APRESENTACAO=${config.minutosAntesApresentacao} (esperado 90)`,
    );
  }
  if (config.horasSonoPadrao !== 8) {
    preconditionFails.push(`HORAS_SONO_PADRAO=${config.horasSonoPadrao} (esperado 8)`);
  }
  if (journeys.length === 0) {
    preconditionFails.push('Nenhuma jornada encontrada no periodo');
  }

  const block1 = auditBlock1(journeys, config.minutosAntesApresentacao);
  const block2 = auditBlock2(journeys);
  const block3 = auditBlock3(journeys);
  const block4 = auditBlock4(journeys);
  const block5 = auditBlock5(byTrip);
  const block6 = auditBlock6(byTrip);
  const block7 = auditBlock7(sigvoosDays, byTripDate);
  const block8 = auditBlock8(historyEvents, schedulerConfig);

  const summary = {
    block1: { fails: block1.fails, result: blockOutcome(block1.fails) },
    block2: { fails: block2.fails, result: blockOutcome(block2.fails) },
    block3: { fails: block3.fails, result: blockOutcome(block3.fails) },
    block4: { fails: block4.fails, result: blockOutcome(block4.fails) },
    block5: { fails: block5.fails, result: blockOutcome(block5.fails) },
    block6: { fails: block6.fails, result: blockOutcome(block6.fails) },
    block7: { fails: block7.fails, result: blockOutcome(block7.fails) },
    block8: { fails: block8.fails, result: blockOutcome(block8.fails, block8.warnings) },
  };

  const preconditions = {
    fails: preconditionFails.length,
    result: preconditionFails.length === 0 ? 'PASS' : 'FAIL',
  };

  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const candidateText = candidates.length
    ? candidates
        .map((candidate) => {
          const auto = String(candidate.auto_sync_enabled ?? 'null');
          const hour = String(candidate.auto_sync_hora_utc ?? 'null');
          const syncTo = String(candidate.last_sync_to ?? 'null');
          return `empresa ${candidate.empresa_id}: auto_sync=${auto}, auto_sync_hora_utc=${hour}, last_sync_to=${syncTo}`;
        })
        .join('; ')
    : 'inferido sem candidatos de config';

  const report = [
    '# Auditoria Cientifica FRMS - Premissa de Sono + RBAC 135/117 + SAFTE-FAST',
    `Gerado em: ${generatedAt}`,
    `minutosAntesApresentacao configurado: ${config.minutosAntesApresentacao}`,
    `horasSonoPadrao configurado: ${config.horasSonoPadrao}`,
    `empresaId auditada: ${empresaId}`,
    `Candidatos SIGVOOS para inferencia da empresa: ${candidateText}`,
    `Periodo: ${options.from} a ${options.to}`,
    `Total jornadas auditadas: ${journeys.length}`,
    '',
    '## RESUMO EXECUTIVO',
    buildExecutiveSummary(preconditions, summary),
    '',
    '## BLOCO 0 - PRE-CONDICOES',
    preconditionFails.length === 0
      ? '- PASS: parametros basicos confirmados (90 min / 8 h).'
      : preconditionFails.map((item) => `- FAIL: ${item}`).join('\n'),
    '',
    '## TABELA A - Verificacao do Sono Efetivo',
    block1.table,
    '',
    '## TABELA B - Fator_Repouso',
    block2.table,
    '',
    '## TABELA C - Fator_Basica vs Hora Acordou',
    block3.table,
    '',
    '## TABELA D - Fator_Apresentacao',
    block4.table,
    '',
    '## TABELA E - Conformidade Regulatoria de Repouso (RBAC 117)',
    block5.table,
    '',
    '## TABELA F - Limites Acumulados por Tripulante',
    block6.table,
    '',
    '## TABELA G - Cross-validation HV',
    block7.tableG,
    '',
    '## TABELA H - Cobertura por tripulante/mes',
    block7.tableH,
    '',
    '## BLOCO 8 - Scheduler automatico',
    block8.notes.map((item) => `- ${item}`).join('\n'),
    '',
    block8.table,
    '',
    '## CORRECOES NECESSARIAS',
    collectCorrections([
      {
        id: 1,
        fails: block1.fails,
        action:
          'Consolidar a premissa PADRAO = 480 min e regravar hora_acordou = hora_apresentacao - 90 min; referencia: premissa SAFTE / regra operacional configurada.',
      },
      {
        id: 2,
        fails: block2.fails,
        action:
          'Desacoplar fator_repouso da referencia antiga de corte->apresentacao quando fonte_sono = PADRAO; esperado 0 com 8h fixas.',
      },
      {
        id: 3,
        fails: block3.fails,
        action:
          'Persistir fator_basica pela fase circadiana de hora_acordou, nao pela proporcao de FDP usado nem por vigilia indireta.',
      },
      {
        id: 4,
        fails: block4.fails,
        action:
          'Garantir penalidade WOCL nao nula quando acordou_na_wocl = true e zerar fora da janela 02:00-05:59.',
      },
      {
        id: 5,
        fails: block5.fails,
        action:
          'Revalidar repouso_regulatorio_min por par consecutivo de jornadas conforme RBAC 117 Apendice B item (j).',
      },
      {
        id: 6,
        fails: block6.fails,
        action:
          'Aplicar bloqueios/alertas para janelas 7d, 28d e 365d quando exceder limites RBAC 117 Apendice B Tabela 5.',
      },
      {
        id: 7,
        fails: block7.fails,
        action:
          'Fechar lacunas de ingestao SIGVOOS -> FRMS e rejeitar divergencias >5 min de HV por dia.',
      },
      {
        id: 8,
        fails: block8.fails,
        action:
          'Validar execucao automatica real do cron nos ultimos 7 dias e manter alerta ativo em falhas de sincronizacao.',
      },
    ]),
  ].join('\n');

  writeFileSync(options.output, report, 'utf8');
  console.log(`[audit] Relatorio gerado em ${options.output}`);
  console.log(
    `[audit] Empresa ${empresaId} | jornadas=${journeys.length} | sigvoos_dias=${sigvoosDays.length}`,
  );
}

main().catch((error) => {
  console.error(`[audit] Falha: ${error.stack || error.message}`);
  process.exitCode = 1;
});
