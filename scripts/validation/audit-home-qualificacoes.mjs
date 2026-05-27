#!/usr/bin/env node

/**
 * H35-E read-only audit for Home dashboard qualification counters.
 *
 * Usage:
 *   AIRTRUST_EMAIL=... AIRTRUST_PASSWORD=... node scripts/validation/audit-home-qualificacoes.mjs
 *   AIRTRUST_TOKEN=... node scripts/validation/audit-home-qualificacoes.mjs
 */

const API_ORIGIN = process.env.AIRTRUST_API_ORIGIN || 'https://api.airtrust.online';
const API_BASE = `${API_ORIGIN.replace(/\/$/, '')}/api`;

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

async function fetchJson(path, token, init = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Resposta não-JSON em ${path}: HTTP ${res.status}`);
  }
  if (!res.ok || !json?.success) {
    throw new Error(`Falha em ${path}: HTTP ${res.status} - ${json?.error || 'erro desconhecido'}`);
  }
  return json;
}

async function resolveToken() {
  if (process.env.AIRTRUST_TOKEN) return process.env.AIRTRUST_TOKEN;

  const email = process.env.AIRTRUST_EMAIL;
  const senha = process.env.AIRTRUST_PASSWORD;
  if (!email || !senha) {
    throw new Error(
      'Defina AIRTRUST_TOKEN ou AIRTRUST_EMAIL + AIRTRUST_PASSWORD para executar a auditoria.',
    );
  }

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const json = await res.json().catch(() => null);
  const token = json?.data?.accessToken;
  if (!res.ok || !token) {
    throw new Error(`Falha no login: HTTP ${res.status} - ${json?.error || 'sem token'}`);
  }
  return token;
}

function normalizeDiasRestantes(alerta) {
  const raw = alerta?.diasRestantes ?? alerta?.dias_restantes;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeTipo(alerta) {
  return String(alerta?.tipo || '').trim().toLowerCase();
}

function normalizeHistoricoRow(row) {
  return {
    id: row.id,
    funcionario: row.funcionario_nome || '-',
    funcionarioId: row.funcionario_id ?? null,
    qualificacao: row.tipo_nome || row.qualificacao_nome || '-',
    qualificacaoId: row.tipo_id || row.qualificacao_id || null,
    status: row.status || '-',
    qualificacaoStatus: row.qualificacao_status || '-',
    dataVencimento: row.data_vencimento || null,
    diasVencido: Number(row.dias_vencido ?? 0) || null,
    ativoFuncionario: 'ATIVO (já filtrado pela rota de histórico)',
    softDeleted: 'NAO (já filtrado pela rota de histórico)',
    cancelada: String(row.qualificacao_status || '').toUpperCase() === 'CANCELADA' ? 'SIM' : 'NAO',
    planejada: String(row.qualificacao_status || '').toUpperCase() === 'PLANEJADA' ? 'SIM' : 'NAO',
    entraNaHomeCorreta:
      String(row.status || '').toUpperCase() === 'VENCIDA' &&
      String(row.qualificacao_status || '').toUpperCase() === 'CONCLUIDA'
        ? 'SIM'
        : 'NAO',
  };
}

async function main() {
  const token = await resolveToken();

  const [metricsRes, alertasRes, vencidasRes, vencendoRes] = await Promise.all([
    fetchJson('/dashboard/metrics', token),
    fetchJson('/dashboard/alertas-criticos', token),
    fetchJson('/qualificacoes/historico?statuses=VENCIDA&limit=500', token),
    fetchJson('/qualificacoes/historico?statuses=VENCENDO_30&limit=500', token),
  ]);

  const metrics = metricsRes.data || {};
  const alertas = Array.isArray(alertasRes.data) ? alertasRes.data : [];
  const alertasQual = alertas.filter((a) => normalizeTipo(a) === 'qualificacao_vencendo');
  const alertasLms = alertas.filter((a) => normalizeTipo(a) === 'lms_curso_pendente');

  // Replica da regra antiga da Home (bug): diasRestantes ausente vira 0
  const legacyHomeVencidas = alertas.filter((a) => {
    const dias = normalizeDiasRestantes(a);
    const diasCompat = dias == null ? 0 : dias;
    return diasCompat <= 0;
  });

  const legacyWrongEntries = legacyHomeVencidas
    .filter((a) => normalizeTipo(a) !== 'qualificacao_vencendo')
    .map((a) => ({
      id: a.id,
      tipo: a.tipo,
      diasRestantes: normalizeDiasRestantes(a),
      mensagem: a.mensagem,
      motivo: 'Não é alerta de qualificação; entrou como vencida por fallback de diasRestantes=0',
    }));

  const canonicalVencidasRows = Array.isArray(vencidasRes.data) ? vencidasRes.data : [];
  const canonicalVencendoRows = Array.isArray(vencendoRes.data) ? vencendoRes.data : [];

  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      apiOrigin: API_ORIGIN,
      note: 'Auditoria read-only via API; sem writes, sem migration, sem importação.',
    },
    homeCurrentSourceMap: {
      metricsEndpoint: '/api/dashboard/metrics',
      alertasEndpoint: '/api/dashboard/alertas-criticos',
      legacyVencidasRule: 'count(alertas where diasRestantes<=0, com fallback diasRestantes ausente => 0)',
      correctedVencidasRule: 'metrics.qualificacoesVencidas',
      correctedVencendoRule: 'metrics.qualificacoesAVencer',
    },
    counters: {
      dashboard_metrics: {
        qualificacoesVencidas: metrics.qualificacoesVencidas ?? null,
        qualificacoesAVencer: metrics.qualificacoesAVencer ?? null,
      },
      dashboard_alertas: {
        total: alertas.length,
        qualificacoes: alertasQual.length,
        lms: alertasLms.length,
        legacyHomeVencidas: legacyHomeVencidas.length,
      },
      canonical_historico: {
        vencidasRows: canonicalVencidasRows.length,
        vencendoRows: canonicalVencendoRows.length,
        statsVencidas: vencidasRes.stats?.vencidas ?? null,
        statsVencendo: vencendoRes.stats?.vencendo ?? null,
      },
    },
    diagnosis: {
      legacyRuleIsWrong: legacyWrongEntries.length > 0,
      rootCause:
        legacyWrongEntries.length > 0
          ? 'A Home contava alertas LMS (tipo lms_curso_pendente) como vencidas quando diasRestantes vinha nulo.'
          : 'Sem evidência de mistura de tipos no cenário auditado.',
    },
    legacyWrongEntries,
    canonicalVencidasRecords: canonicalVencidasRows.map(normalizeHistoricoRow),
    canonicalVencendoRecordsSample: canonicalVencendoRows.slice(0, 20).map(normalizeHistoricoRow),
  };

  console.log(toJson(output));
}

main().catch((err) => {
  console.error('[audit-home-qualificacoes] erro:', err.message);
  process.exit(1);
});
