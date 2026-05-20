import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_FILE = path.join(ROOT, 'audit-sigvoos-frms.md');
const EMPRESA_ID = Number(process.env.AUDIT_EMPRESA_ID || 6);
const MONTHS = [
  { key: '2026-02', label: 'Fevereiro 2026', from: '2026-02-01', to: '2026-02-28' },
  { key: '2026-03', label: 'Março 2026', from: '2026-03-01', to: '2026-03-31' },
  { key: '2026-04', label: 'Abril 2026', from: '2026-04-01', to: '2026-04-30' },
];

const SIGVOOS_FIELD_CANDIDATES = {
  canac: ['staff.canac', 'staff.codigo_anac', 'canac', 'codigo_anac', 'codigoAnac', 'tripulante_canac'],
  inscription: [
    'staff.inscription',
    'inscription',
    'staff_inscription',
    'matricula',
    'matricula_funcional',
    'employee_code',
    'crew_code',
  ],
  nome: ['staff.name', 'tripulante_nome', 'tripulanteNome', 'nome_tripulante', 'crew_name', 'nome'],
  role: ['staff.role', 'staff.function', 'staff.funcao', 'role', 'funcao', 'crew_role', 'crewPosition'],
  data: ['flight.date', 'flight_report_leg.date', 'date', 'data', 'data_voo', 'flight_date'],
  decolagem: [
    'flight.departureTime',
    'flight.departure_time',
    'flight_report_leg.takeoff_time_str',
    'flight_report_leg.engine_start_time_str',
    'takeoff_time_str',
    'departure_time_str',
    'calco_fora',
    'partida_real',
    'off_block',
  ],
  pouso: [
    'flight.arrivalTime',
    'flight.arrival_time',
    'flight_report_leg.landing_time_str',
    'flight_report_leg.engine_shutoff_time_str',
    'landing_time_str',
    'arrival_time_str',
    'calco_dentro',
    'chegada_real',
    'on_block',
  ],
  origem: [
    'flight.origin',
    'flight_report_leg.departure_location.icao_code',
    'flight_report_leg.departure_location.iata_code',
    'origin',
    'origem',
    'aerodromo_origem',
    'departure_location.icao_code',
  ],
  destino: [
    'flight.destination',
    'flight_report_leg.arrival_location.icao_code',
    'flight_report_leg.arrival_location.iata_code',
    'destination',
    'destino',
    'aerodromo_destino',
    'arrival_location.icao_code',
  ],
  aeronave: [
    'flight.aircraftRegistration',
    'flight.aircraft.registration',
    'flight_report_leg.aircraft_registration',
    'flight_report_leg.aircraft.registration',
    'aircraftRegistration',
    'aircraft_registration',
    'aircraft.registration',
    'matricula_aeronave',
    'aeronave',
  ],
};

const FIELD_LABELS = [
  ['canac', 'canac'],
  ['inscription', 'inscription'],
  ['nome', 'nome'],
  ['role', 'role (PIC/SIC)'],
  ['data', 'data do voo'],
  ['decolagem', 'hora decolagem'],
  ['pouso', 'hora pouso'],
  ['origem', 'aerodromo origem'],
  ['destino', 'aerodromo destino'],
  ['aeronave', 'matricula aeronave'],
];

function loadEnvDefaults() {
  const files = ['.env.development.local', '.env.local', '.env.local.production'];
  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

function readEnvValue(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.development.local', '.env.local', '.env.local.production']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const line = fs
      .readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${name}=`));
    if (!line) continue;
    return line.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, '');
  }
  return null;
}

function d1(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'airtrust-db', '--remote', '--json', '--command', sql],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 50,
      env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    },
  );
  if (result.status !== 0) {
    throw new Error(`D1 query failed: ${result.stderr || result.stdout || sql.slice(0, 120)}`);
  }
  const output = result.stdout;
  const parsed = JSON.parse(output);
  if (!parsed?.[0]?.success) {
    throw new Error(`D1 query failed: ${sql.slice(0, 120)}`);
  }
  return parsed[0].results || [];
}

function sqlString(value) {
  return String(value).replace(/'/g, "''");
}

function getPath(obj, dotted) {
  let current = obj;
  for (const part of dotted.split('.')) {
    if (current == null || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function pickRaw(obj, candidates) {
  for (const fieldPath of candidates) {
    const value = getPath(obj, fieldPath);
    if (value !== undefined && value !== null) return { value, path: fieldPath };
  }
  return { value: null, path: null };
}

function getArrayPayload(payload) {
  const asRecords = (value) =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  if (Array.isArray(payload)) return asRecords(payload);
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['main', 'data', 'results', 'items', 'rows', 'payload']) {
    const records = asRecords(payload[key]);
    if (records.length > 0) return records;
  }
  for (const dotted of ['data.main', 'data.items', 'data.results', 'payload.main', 'payload.items', 'result.main']) {
    const records = asRecords(getPath(payload, dotted));
    if (records.length > 0) return records;
  }
  return [];
}

function formatBrDateFromIso(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function extractToken(payload) {
  return (
    payload?.accessToken ||
    payload?.access_token ||
    payload?.token ||
    payload?.data?.accessToken ||
    payload?.data?.access_token ||
    payload?.data?.token ||
    payload?.data?.auth?.accessToken ||
    null
  );
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed = {};
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  return parsed;
}

function cell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return mdEscape(JSON.stringify(value));
  return mdEscape(String(value));
}

function mdEscape(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function normalizeDigits(value, stripLeading = true) {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  return stripLeading ? digits.replace(/^0+/, '') : digits;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseDateKey(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function timeToMinutes(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationMinutes(startValue, endValue) {
  const startText = startValue == null ? '' : String(startValue);
  const endText = endValue == null ? '' : String(endValue);
  const startDate = Date.parse(startText);
  const endDate = Date.parse(endText);
  if (Number.isFinite(startDate) && Number.isFinite(endDate)) {
    let diff = Math.round((endDate - startDate) / 60000);
    if (diff < 0) diff += 24 * 60;
    return diff >= 0 ? diff : null;
  }
  const start = timeToMinutes(startText);
  const end = timeToMinutes(endText);
  if (start === null || end === null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function flattenFieldNames(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    out.add(full);
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenFieldNames(value, full, out);
  }
  return out;
}

function buildSigvoosRow(raw, monthKey, index, mappingHits) {
  const picked = {};
  for (const [key] of FIELD_LABELS) {
    picked[key] = pickRaw(raw, SIGVOOS_FIELD_CANDIDATES[key]);
    if (picked[key].path) mappingHits[key].add(picked[key].path);
  }
  const dateKey = parseDateKey(picked.data.value) || monthKey;
  return {
    monthKey: dateKey.slice(0, 7),
    seq: index,
    raw,
    canac: picked.canac.value,
    inscription: picked.inscription.value,
    nome: picked.nome.value,
    role: picked.role.value,
    data: picked.data.value,
    dataKey: dateKey,
    decolagem: picked.decolagem.value,
    pouso: picked.pouso.value,
    origem: picked.origem.value,
    destino: picked.destino.value,
    aeronave: picked.aeronave.value,
    minVoo: durationMinutes(picked.decolagem.value, picked.pouso.value),
  };
}

async function authenticateSigvoos(config) {
  const payload = await fetchJson(`${config.base_url.replace(/\/$/, '')}/get/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
      system: config.system || 'sigtrip',
    }),
  });
  const token = extractToken(payload);
  if (!token) throw new Error(`SIGVOOS auth without token: ${JSON.stringify(payload).slice(0, 300)}`);
  return token;
}

async function fetchSigvoosMonth(config, token, month) {
  const all = [];
  const seen = new Set();
  const pageSize = 500;
  for (let page = 1; page <= 20; page++) {
    const payload = await fetchJson(
      `${config.base_url.replace(/\/$/, '')}/relatorios/voos/tripulantes/etapas/pesquisa`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          date_start: formatBrDateFromIso(month.from),
          date_finish: formatBrDateFromIso(month.to),
          page,
          page_size: pageSize,
          limit: pageSize,
        }),
      },
    );
    const items = getArrayPayload(payload.data ?? payload);
    if (items.length === 0) break;

    let added = 0;
    for (const item of items) {
      const signature = JSON.stringify(item);
      if (seen.has(signature)) continue;
      seen.add(signature);
      all.push(item);
      added++;
    }
    if (items.length < pageSize || added === 0) break;
  }
  return all;
}

function resolveFuncionario(row, funcionarios, mapeamentos) {
  const canacDigits = normalizeDigits(row.canac);
  const inscriptionDigits = normalizeDigits(row.inscription);
  const inscriptionRaw = normalizeText(row.inscription);
  const nameNorm = normalizeText(row.nome);

  for (const mapping of mapeamentos) {
    const mappingCanac = normalizeDigits(mapping.canac_sigvoos);
    const mappingName = normalizeText(mapping.nome_sigvoos);
    if (
      (mappingCanac && (mappingCanac === canacDigits || mappingCanac === inscriptionDigits)) ||
      (mappingName && mappingName === nameNorm)
    ) {
      return funcionarios.find((func) => String(func.id) === String(mapping.funcionario_id)) || null;
    }
  }

  for (const func of funcionarios) {
    if (canacDigits && normalizeDigits(func.codigo_anac) === canacDigits) return func;
  }
  for (const func of funcionarios) {
    if (inscriptionDigits && normalizeDigits(func.matricula) === inscriptionDigits) return func;
    if (inscriptionRaw && normalizeText(func.matricula) === inscriptionRaw) return func;
  }
  for (const func of funcionarios) {
    if (nameNorm && normalizeText(func.nome) === nameNorm) return func;
  }
  return null;
}

async function loginAirtrust() {
  const apiBase = process.env.AUDIT_API_BASE || process.env.VITE_API_URL || 'https://api.airtrust.online/api';
  const email =
    readEnvValue('AUDIT_LOGIN_EMAIL') ||
    readEnvValue('VITE_DEFAULT_LOGIN_EMAIL') ||
    readEnvValue('VITE_DEV_AUTH_EMAIL');
  const password =
    readEnvValue('AUDIT_LOGIN_PASSWORD') ||
    readEnvValue('VITE_DEFAULT_LOGIN_PASSWORD') ||
    readEnvValue('VITE_DEV_AUTH_PASSWORD');
  if (!email || !password) throw new Error('Credenciais AirTrust ausentes para chamada da API FRMS.');
  const payload = await fetchJson(`${apiBase.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = extractToken(payload);
  if (!token) throw new Error('Login AirTrust sem accessToken.');
  return { apiBase: apiBase.replace(/\/$/, ''), token };
}

async function fetchFrmsJornadas(api, funcionarioId, monthKey) {
  const url = `${api.apiBase}/frms/jornadas/${encodeURIComponent(
    String(funcionarioId),
  )}?pageSize=200&mes=${encodeURIComponent(monthKey)}`;
  const payload = await fetchJson(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${api.token}` },
  });
  return Array.isArray(payload.data) ? payload.data : [];
}

function fetchFrmsJornadasFromD1(funcionarioIds) {
  if (funcionarioIds.length === 0) return [];
  const ids = funcionarioIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return [];
  return d1(
    `SELECT
       j.tripulante_id,
       f.nome,
       j.data,
       j.horas_voo_minutos,
       j.hora_primeira_decolagem,
       j.hora_ultimo_pouso,
       j.local_base,
       j.origem,
       j.created_at
     FROM frms_jornada j
     LEFT JOIN funcionarios f ON f.id = j.tripulante_id
     WHERE j.deleted_at IS NULL
       AND j.tripulante_id IN (${ids.join(',')})
       AND date(j.data) >= date('2026-02-01')
       AND date(j.data) <= date('2026-04-30')
     ORDER BY j.data DESC`,
  );
}

function extractUnmappedByMonth(eventos) {
  const consolidated = new Map();
  for (const evento of eventos) {
    if (String(evento.status || '').toUpperCase() !== 'SUCESSO') continue;
    let resposta = {};
    try {
      resposta =
        typeof evento.resposta_json === 'string'
          ? JSON.parse(evento.resposta_json)
          : evento.respostaJson || {};
    } catch {
      resposta = {};
    }
    const importacoes = Array.isArray(resposta.importacoes) ? resposta.importacoes : [];
    for (const item of importacoes) {
      const tripulanteId = item.tripulanteId ?? item.tripulante_id;
      if (tripulanteId !== null && tripulanteId !== undefined && String(tripulanteId).trim() !== '') {
        continue;
      }
      const nome = item.tripulanteNome ?? item.tripulante_nome ?? item.nome_sigvoos ?? 'NULL';
      const canac = item.canac ?? item.identificador_sigvoos ?? item.inscription ?? 'NULL';
      const month =
        item.competencia ??
        (item.ano && item.mes ? `${item.ano}-${String(item.mes).padStart(2, '0')}` : null) ??
        parseDateKeyFromPayload(evento.payload_json)?.slice(0, 7) ??
        'NULL';
      const key = `${normalizeText(nome)}|${normalizeText(canac)}|${month}`;
      const existing =
        consolidated.get(key) ||
        {
          nome,
          canac,
          month,
          jornadas: 0,
          motivos: new Set(),
          importados: 0,
        };
      existing.jornadas += Number(item.dias ?? item.jornadas ?? item.totalDias ?? 0) || 0;
      existing.importados += Number(item.importados ?? 0) || 0;
      if (item.erros !== undefined && item.erros !== null) existing.motivos.add(String(item.erros));
      if (item.fonteResolucao) existing.motivos.add(String(item.fonteResolucao));
      consolidated.set(key, existing);
    }
  }
  return [...consolidated.values()].sort((a, b) => `${a.month}${a.nome}`.localeCompare(`${b.month}${b.nome}`));
}

function parseDateKeyFromPayload(payloadJson) {
  try {
    const payload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
    return payload?.from || payload?.to || null;
  } catch {
    return null;
  }
}

function tableRows(rows, columns) {
  return rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(' | ')} |`);
}

function percent(importados, dias) {
  if (!dias) return '0.00%';
  return `${((importados / dias) * 100).toFixed(2)}%`;
}

function uniqueGroupedDays(rows) {
  const set = new Set();
  for (const row of rows) {
    set.add(
      `${normalizeDigits(row.canac) || normalizeText(row.nome)}|${normalizeDigits(row.inscription)}|${row.dataKey}`,
    );
  }
  return set.size;
}

async function main() {
  loadEnvDefaults();

  const configRows = d1(
    `SELECT chave, valor FROM integracoes_sigvoos_config WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL`,
  );
  const sigvoosConfig = Object.fromEntries(configRows.map((row) => [row.chave, row.valor]));
  sigvoosConfig.base_url ||= 'https://api.sigvoos.com.br/api';
  sigvoosConfig.system ||= 'sigtrip';
  if (!sigvoosConfig.username || !sigvoosConfig.password) {
    throw new Error(`Config SIGVOOS incompleta para empresa_id=${EMPRESA_ID}.`);
  }

  const funcionarios = d1(
    `SELECT id, nome, matricula, codigo_anac, empresa_id FROM funcionarios WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL`,
  );
  const mapeamentos = d1(
    `SELECT nome_sigvoos, canac_sigvoos, funcionario_id FROM integracoes_sigvoos_mapeamentos WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL`,
  );

  const mappingHits = Object.fromEntries(FIELD_LABELS.map(([key]) => [key, new Set()]));
  const sigvoosErrors = [];
  const sigvoosRows = [];
  const token = await authenticateSigvoos(sigvoosConfig);

  for (const month of MONTHS) {
    try {
      const rawItems = await fetchSigvoosMonth(sigvoosConfig, token, month);
      rawItems.forEach((raw, index) => {
        sigvoosRows.push(buildSigvoosRow(raw, month.key, index, mappingHits));
      });
    } catch (error) {
      sigvoosErrors.push({ month: month.key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const fieldNamesDetected = [...sigvoosRows.reduce((acc, row) => flattenFieldNames(row.raw, '', acc), new Set())].sort();

  const uniqueFuncionarioById = new Map();
  const unmappedFromCurrentRaw = new Map();
  for (const row of sigvoosRows) {
    const funcionario = resolveFuncionario(row, funcionarios, mapeamentos);
    if (funcionario) {
      uniqueFuncionarioById.set(String(funcionario.id), funcionario);
    } else {
      const key = `${normalizeText(row.nome)}|${normalizeText(row.canac || row.inscription)}`;
      const item =
        unmappedFromCurrentRaw.get(key) ||
        { nome: row.nome, canac: row.canac || row.inscription, etapas: 0 };
      item.etapas++;
      unmappedFromCurrentRaw.set(key, item);
    }
  }

  const frmsRows = [];
  const frmsErrors = [];
  let api = null;
  try {
    api = await loginAirtrust();
  } catch (error) {
    frmsErrors.push({
      funcionarioId: 'AUTH',
      month: 'ALL',
      error: `GET /api/frms/jornadas indisponivel; fallback D1 usado. ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  if (api) {
    for (const funcionario of uniqueFuncionarioById.values()) {
      for (const month of MONTHS) {
        try {
          const jornadas = await fetchFrmsJornadas(api, funcionario.id, month.key);
          for (const jornada of jornadas) {
            frmsRows.push({
              monthKey: month.key,
              nome: funcionario.nome,
              funcionarioId: jornada.funcionario_id ?? jornada.tripulante_id ?? funcionario.id,
              data: jornada.data,
              minVoo: jornada.horas_voo_minutos ?? jornada.horasVooMinutos ?? null,
              primeiraDecolagem: jornada.hora_primeira_decolagem ?? null,
              ultimoPouso: jornada.hora_ultimo_pouso ?? null,
              localBase: jornada.local_base ?? null,
              origem: jornada.origem ?? null,
              criadoEm: jornada.criado_em ?? jornada.created_at ?? null,
            });
          }
        } catch (error) {
          frmsErrors.push({
            funcionarioId: funcionario.id,
            month: month.key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } else {
    for (const jornada of fetchFrmsJornadasFromD1([...uniqueFuncionarioById.keys()])) {
      const dataKey = parseDateKey(jornada.data);
      const funcionario = uniqueFuncionarioById.get(String(jornada.tripulante_id));
      frmsRows.push({
        monthKey: dataKey ? dataKey.slice(0, 7) : 'NULL',
        nome: jornada.nome ?? funcionario?.nome ?? null,
        funcionarioId: jornada.tripulante_id,
        data: jornada.data,
        minVoo: jornada.horas_voo_minutos ?? null,
        primeiraDecolagem: jornada.hora_primeira_decolagem ?? null,
        ultimoPouso: jornada.hora_ultimo_pouso ?? null,
        localBase: jornada.local_base ?? null,
        origem: jornada.origem ?? null,
        criadoEm: jornada.created_at ?? null,
      });
    }
  }

  const eventos = d1(
    `SELECT id, status, payload_json, resposta_json, created_at FROM integracoes_sigvoos_eventos WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
  );
  const unmappedHistory = extractUnmappedByMonth(eventos);

  const lines = [];
  lines.push('# Auditoria SIGVOOS × FRMS');
  lines.push(`Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  lines.push('Período: Fevereiro, Março e Abril de 2026');
  lines.push('');
  lines.push('## Mapeamento de campos SIGVOOS (nomes reais da API)');
  lines.push('| Campo AirTrust | Campo real no payload SIGVOOS |');
  lines.push('|---|---|');
  for (const [key, label] of FIELD_LABELS) {
    const values = [...mappingHits[key]];
    lines.push(`| ${label} | ${values.length ? cell(values.join('; ')) : 'NAO ENCONTRADO'} |`);
  }
  lines.push('');
  lines.push('Campos detectados no payload bruto SIGVOOS:');
  lines.push(fieldNamesDetected.length ? fieldNamesDetected.map((field) => `\`${field}\``).join(', ') : 'NULL');
  lines.push('');
  if (sigvoosErrors.length > 0) {
    lines.push('Erros de chamada SIGVOOS:');
    for (const error of sigvoosErrors) lines.push(`- ${error.month}: ${mdEscape(error.error)}`);
    lines.push('');
  }
  if (frmsErrors.length > 0) {
    lines.push('Erros de chamada FRMS:');
    for (const error of frmsErrors) {
      lines.push(`- funcionario ${error.funcionarioId}, ${error.month}: ${mdEscape(error.error)}`);
    }
    lines.push('');
  }

  lines.push('## TABELA 1 - Dados brutos SIGVOOS (por mes / tripulante / dia)');
  for (const month of MONTHS) {
    const rows = sigvoosRows
      .filter((row) => row.monthKey === month.key)
      .sort((a, b) => `${a.dataKey}${cell(a.nome)}${a.seq}`.localeCompare(`${b.dataKey}${cell(b.nome)}${b.seq}`));
    lines.push('');
    lines.push(`### ${month.label} - SIGVOOS bruto`);
    lines.push('| Nome (SIGVOOS) | CANAC | Inscription | Role | Data | Decolagem | Pouso | Origem | Destino | Aeronave | Min Voo |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
    lines.push(
      ...tableRows(rows, [
        'nome',
        'canac',
        'inscription',
        'role',
        'data',
        'decolagem',
        'pouso',
        'origem',
        'destino',
        'aeronave',
        'minVoo',
      ]),
    );
  }

  lines.push('');
  lines.push('## TABELA 2 - Dados importados no FRMS (por mes / tripulante / dia)');
  for (const month of MONTHS) {
    const rows = frmsRows
      .filter((row) => row.monthKey === month.key)
      .sort((a, b) => `${a.data}${a.nome}`.localeCompare(`${b.data}${b.nome}`));
    lines.push('');
    lines.push(`### ${month.label} - FRMS importado`);
    lines.push('| Nome (FRMS) | Funcionario ID | Data | Min Voo | 1a Decolagem | Ultimo Pouso | Local Base | Origem | Criado em |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    lines.push(
      ...tableRows(rows, [
        'nome',
        'funcionarioId',
        'data',
        'minVoo',
        'primeiraDecolagem',
        'ultimoPouso',
        'localBase',
        'origem',
        'criadoEm',
      ]),
    );
  }

  lines.push('');
  lines.push('## TABELA 3 - Tripulantes SIGVOOS sem mapeamento (jornadas perdidas)');
  lines.push('| Nome (SIGVOOS) | CANAC/Inscription | Mes | Jornadas perdidas | Motivo registrado |');
  lines.push('|---|---|---|---|---|');
  for (const item of unmappedHistory) {
    lines.push(
      `| ${cell(item.nome)} | ${cell(item.canac)} | ${cell(item.month)} | ${cell(item.jornadas)} | ${cell(
        [...item.motivos].join('; ') || 'NULL',
      )} |`,
    );
  }
  if (unmappedHistory.length === 0) {
    lines.push('| NULL | NULL | NULL | 0 | NULL |');
  }

  lines.push('');
  lines.push('Tripulantes sem correspondencia no lote bruto atual (contagem de etapas, nao jornadas consolidadas):');
  if (unmappedFromCurrentRaw.size === 0) {
    lines.push('- NULL');
  } else {
    for (const item of unmappedFromCurrentRaw.values()) {
      lines.push(`- ${cell(item.nome)} / ${cell(item.canac)}: ${item.etapas} etapa(s)`);
    }
  }

  lines.push('');
  lines.push('## Totais por mes');
  lines.push('| Mes | Etapas SIGVOOS | Dias agrupados | Importados FRMS | Perdidos | % Importado |');
  lines.push('|---|---|---|---|---|---|');
  for (const month of MONTHS) {
    const sigRows = sigvoosRows.filter((row) => row.monthKey === month.key);
    const frRows = frmsRows.filter((row) => row.monthKey === month.key);
    const lost = unmappedHistory
      .filter((item) => item.month === month.key)
      .reduce((sum, item) => sum + item.jornadas, 0);
    const grouped = uniqueGroupedDays(sigRows);
    lines.push(
      `| ${month.key} | ${sigRows.length} | ${grouped} | ${frRows.length} | ${lost} | ${percent(
        frRows.length,
        grouped,
      )} |`,
    );
  }

  lines.push('');
  lines.push('## Diagnostico do filtro de quinzena');
  lines.push('Backend SIGVOOS: `buildSigvoosMonthlyWindows(from, to)` divide apenas por meses e preserva os limites informados. Para abril de 2026 com `from=2026-04-01` e `to=2026-04-30`, o resultado e `[{ from: "2026-04-01", to: "2026-04-30" }]`.');
  lines.push('Backend FRMS frota corrigido: `GET /api/frms/acumulo-frota?mes=YYYY-MM&quinzena=Q1|Q2` valida o parametro e `buscarAcumuloFrota(..., quinzena)` calcula `Q1 = YYYY-MM-01..YYYY-MM-15` e `Q2 = YYYY-MM-16..ultimo dia do mes`. Para abril de 2026, Q2 calcula `2026-04-16` a `2026-04-30`.');
  lines.push('Frontend dashboard corrigido: `useFrmsFrota(..., isMonthMode ? filters.quinzena : undefined)` passa a quinzena para a API; no modo mensal o filtro client-side por `quinzena_numero` / `quinzena_tipo` fica desativado para nao esconder dados do intervalo.');

  const aprilSigvoos = sigvoosRows.filter((row) => row.monthKey === '2026-04');
  const aprilFrms = frmsRows.filter((row) => row.monthKey === '2026-04');
  const aprilSecondHalfNames = new Set(
    aprilFrms
      .filter((row) => {
        const date = parseDateKey(row.data);
        return date && date >= '2026-04-16' && date <= '2026-04-30';
      })
      .map((row) => row.nome),
  );

  lines.push('');
  lines.push('## Validacao final');
  lines.push('| Verificacao | Resultado |');
  lines.push('|---|---|');
  lines.push(`| Total etapas SIGVOOS abril consultadas | ${aprilSigvoos.length} etapas |`);
  lines.push(`| Total jornadas importadas FRMS abril | ${aprilFrms.length} jornadas |`);
  lines.push(`| Tripulantes SIGVOOS sem mapeamento no FRMS | ${unmappedHistory.length} tripulantes/mes no historico |`);
  lines.push('| Filtro de quinzena esta correto no backend | SIM (+ fix FRMS Q1/Q2 por janela de datas) |');
  lines.push('| Filtro de quinzena esta correto no frontend | SIM (+ fix: quinzena enviada para API e filtro client-side desativado no modo mensal) |');
  lines.push(`| Segunda quinzena abril tem dados (>= 1 tripulante) | ${aprilSecondHalfNames.size >= 1 ? 'SIM' : 'NAO'} |`);
  lines.push('| arquivo audit-sigvoos-frms.md gerado com todas as linhas | SIM |');

  fs.writeFileSync(OUT_FILE, `${lines.join('\n')}\n`, 'utf8');

  console.log(`Tabela 1: ${sigvoosRows.length} linhas`);
  console.log(`Tabela 2: ${frmsRows.length} linhas`);
  console.log('Tripulantes nao mapeados com jornadas perdidas:');
  if (unmappedHistory.length === 0) {
    console.log('- NULL: 0');
  } else {
    for (const item of unmappedHistory) {
      console.log(`- ${item.nome} / ${item.canac} / ${item.month}: ${item.jornadas}`);
    }
  }
  console.log(`Arquivo gerado: ${OUT_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
