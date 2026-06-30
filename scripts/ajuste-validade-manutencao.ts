/**
 * Script: Ajuste de validade dos modelos de qualificação — Manutenção/Outros
 *
 * Objetivo:
 *   - Treinamentos controlados (matriz de manutenção) → validade = 24 meses
 *   - Demais modelos de Manutenção/Outros → validade = null (sem validade)
 *   - NÃO alterar Tripulação, Operações, Pilotos, Comissários, etc.
 *
 * Uso:
 *   npx tsx scripts/ajuste-validade-manutencao.ts --mode=dry-run
 *   npx tsx scripts/ajuste-validade-manutencao.ts --mode=apply --api-url=http://localhost:8787
 *
 * Requer:
 *   - Token de admin (variável de ambiente AIRTRUST_ADMIN_TOKEN)
 *   - API rodando (local ou remota)
 */

// ─── Configuração ────────────────────────────────────────────────────────────

const API_BASE = process.env.AIRTRUST_API_URL || 'http://localhost:8787';
const ADMIN_TOKEN = process.env.AIRTRUST_ADMIN_TOKEN || '';
const MODE = process.argv.includes('--mode=apply') ? 'apply' : 'dry-run';

// ─── Treinamentos controlados com validade de 24 meses ────────────────────────

const CONTROLADOS_24M: string[] = [
  'PROCEDIMENTO INTEGRACAO',
  'MOM',
  'MCQ',
  'MGM',
  'IRM',
  'INSPECAO & IIO & APRS',
  'AS350 B2',
  'S76 A/C',
  'AW139',
  'ARRIEL 2',
  'ARRIEL 2 MODULACAO/DESMODULACAO',
  'ARRIEL 1',
  'PW PT6C-67C',
  'HUMS',
  'FATORES HUMANOS',
  'SGSO',
  'CRM',
  'ARTIGOS PERIGOSOS',
  'MEL',
  'PROFICIENCIA LINGUA INGLESA',
];

// ─── Categorias permitidas ────────────────────────────────────────────────────

const CATEGORIAS_PERMITIDAS = new Set([
  'MANUTENCAO',
  'MANUTENÇÃO',
  'OUTROS',
]);

// ─── Categorias BLOQUEADAS (Tripulação e operacionais) ────────────────────────

const CATEGORIAS_BLOQUEADAS = new Set([
  'TRIPULACAO',
  'TRIPULAÇÃO',
  'OPERACOES',
  'OPERAÇÕES',
  'OPERACIONAL',
  'PILOTOS',
  'PILOTO',
  'COMISSARIOS',
  'COMISSÁRIOS',
  'COMISSARIO',
  'COMISSÁRIO',
  'AEROMEDICO',
  'AEROMÉDICO',
  'OFFSHORE',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isCategoriaPermitida(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return CATEGORIAS_PERMITIDAS.has(normalize(categoria));
}

function isCategoriaBloqueada(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return CATEGORIAS_BLOQUEADAS.has(normalize(categoria));
}

// ─── Matching ─────────────────────────────────────────────────────────────────

interface MatchResult {
  status: 'exact' | 'alias' | 'fuzzy' | 'unmatched' | 'duplicate' | 'blocked_tripulacao' | 'fora_escopo';
  controladoNome: string | null;
  motivo: string;
  validadeProposta: number | null;
}

function matchTipo(nome: string, categoria: string): MatchResult {
  const nomeNorm = normalize(nome);

  // Bloqueio absoluto de Tripulação/Operacionais
  if (isCategoriaBloqueada(categoria)) {
    return {
      status: 'blocked_tripulacao',
      controladoNome: null,
      motivo: `categoria ${categoria} fora do escopo — não alterar`,
      validadeProposta: undefined, // sentinel: mantém valor atual
    };
  }

  // Fora do escopo (não é Manutenção nem Outros)
  if (!isCategoriaPermitida(categoria)) {
    return {
      status: 'fora_escopo',
      controladoNome: null,
      motivo: `categoria ${categoria} fora do escopo — não alterar`,
      validadeProposta: undefined, // sentinel: mantém valor atual
    };
  }

  // Exact match
  for (const controlado of CONTROLADOS_24M) {
    if (nomeNorm === normalize(controlado)) {
      return {
        status: 'exact',
        controladoNome: controlado,
        motivo: 'controlado pela matriz de manutenção — 24 meses',
        validadeProposta: 24,
      };
    }
  }

  // Alias/fuzzy matching — variações conhecidas
  const match = matchAlias(nomeNorm);
  if (match) {
    return {
      status: 'alias',
      controladoNome: match,
      motivo: `alias de "${match}" — 24 meses`,
      validadeProposta: 24,
    };
  }

  // Fuzzy: contém nome do controlado ou vice-versa
  for (const controlado of CONTROLADOS_24M) {
    const cNorm = normalize(controlado);
    if (nomeNorm.includes(cNorm) || cNorm.includes(nomeNorm)) {
      // Só faz fuzzy se não for ambíguo (ex: "SGSO" não deve match "SGSO para Pilotos")
      if (nomeNorm.length >= cNorm.length * 0.7) {
        return {
          status: 'fuzzy',
          controladoNome: controlado,
          motivo: `fuzzy match com "${controlado}" — 24 meses`,
          validadeProposta: 24,
        };
      }
    }
  }

  // Não controlado → sem validade
  return {
    status: 'unmatched',
    controladoNome: null,
    motivo: 'categoria Manutenção/Outros, não listado como controlado — sem validade',
    validadeProposta: null,
  };
}

function matchAlias(nomeNorm: string): string | null {
  const aliases: Record<string, string> = {
    'INTEGRACAO': 'PROCEDIMENTO INTEGRACAO',
    'INTEGRACAO / DOUTRINACAO DE MANUTENCAO': 'PROCEDIMENTO INTEGRACAO',
    'INTEGRACAO DOUTRINACAO DE MANUTENCAO': 'PROCEDIMENTO INTEGRACAO',
    'MANUAL DA ORGANIZACAO DE MANUTENCAO': 'MOM',
    'MANUAL DE CONTROLE DE QUALIDADE': 'MCQ',
    'MANUAL GERAL DE MANUTENCAO': 'MGM',
    'PT6C-67C': 'PW PT6C-67C',
    'PT6C-67C - MANUTENCAO': 'PW PT6C-67C',
    'PT6C 67C': 'PW PT6C-67C',
    'SGSO PARA MANUTENCAO': 'SGSO',
    'HUMS-VXP': 'HUMS',
    'IIO & APRS': 'INSPECAO & IIO & APRS',
    'INSPECAO IIO APRS': 'INSPECAO & IIO & APRS',
    'PROFICIENCIA EM LINGUA INGLESA': 'PROFICIENCIA LINGUA INGLESA',
    'PROFICIENCIA LINGUISTICA': 'PROFICIENCIA LINGUA INGLESA',
    'INGLES': 'PROFICIENCIA LINGUA INGLESA',
    'ARRIEL 2 MOD': 'ARRIEL 2 MODULACAO/DESMODULACAO',
    'S76': 'S76 A/C',
    'AS350': 'AS350 B2',
  };

  return aliases[nomeNorm] || null;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TipoQualificacao {
  id: number | string;
  nome: string;
  codigo: string;
  categoria: string;
  validade: number | null;
  empresa_id?: number;
  ativo?: number | boolean | null;
}

interface TipoResultado extends TipoQualificacao {
  match: MatchResult;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const url = `${API_BASE}/api/qualificacoes${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (ADMIN_TOKEN) {
    headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`;
  }

  const res = await fetch(url, { ...options, headers });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

async function fetchAllTipos(): Promise<TipoQualificacao[]> {
  const allTipos: TipoQualificacao[] = [];
  // Fetch all categories we care about + potentially blocked ones
  const categorias = ['Manutenção', 'MANUTENCAO', 'Outros', 'OUTROS', 'Tripulação', 'TRIPULACAO',
    'Operações', 'OPERACOES', 'Pilotos', 'PILOTOS', 'Comissários', 'COMISSARIOS',
    'Aeromédico', 'AEROMEDICO', 'Offshore', 'OFFSHORE'];

  for (const cat of categorias) {
    try {
      const json = await apiFetch(`/tipos?categoria=${encodeURIComponent(cat)}&limit=500`);
      const data = json.data || [];
      for (const t of data) {
        allTipos.push({
          id: t.id,
          nome: t.nome || '',
          codigo: t.codigo || '',
          categoria: t.categoria || cat,
          validade: t.validade ?? null,
          empresa_id: t.empresa_id,
          ativo: t.ativo,
        });
      }
    } catch {
      // categoria might not exist, skip
    }
  }

  // Also fetch all tipos to catch any with unexpected category values
  try {
    const json = await apiFetch('/tipos?limit=500');
    const data = json.data || [];
    for (const t of data) {
      if (!allTipos.some((existing) => String(existing.id) === String(t.id))) {
        allTipos.push({
          id: t.id,
          nome: t.nome || '',
          codigo: t.codigo || '',
          categoria: t.categoria || '',
          validade: t.validade ?? null,
          empresa_id: t.empresa_id,
          ativo: t.ativo,
        });
      }
    }
  } catch {
    // ignore
  }

  return allTipos;
}

async function updateTipoValidade(id: number | string, validade: number | null): Promise<void> {
  await apiFetch(`/tipos/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ validade }),
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Ajuste de Validade — Modelos Manutenção/Outros             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nModo: ${MODE.toUpperCase()}`);
  console.log(`API:  ${API_BASE}`);
  console.log('');

  // 1. Fetch all tipos
  console.log('🔍 Buscando tipos de qualificação...');
  const allTipos = await fetchAllTipos();
  console.log(`   ${allTipos.length} tipos encontrados.\n`);

  // 2. Match and classify
  const resultados: TipoResultado[] = allTipos.map((tipo) => ({
    ...tipo,
    match: matchTipo(tipo.nome, tipo.categoria),
  }));

  // 3. Group by status
  const blocked = resultados.filter((r) => r.match.status === 'blocked_tripulacao');
  const foraEscopo = resultados.filter((r) => r.match.status === 'fora_escopo');
  const controlados = resultados.filter((r) =>
    ['exact', 'alias', 'fuzzy'].includes(r.match.status),
  );
  const naoControlados = resultados.filter((r) => r.match.status === 'unmatched');
  const comAlteracao = resultados.filter(
    (r) =>
      (['exact', 'alias', 'fuzzy', 'unmatched'].includes(r.match.status)) &&
      r.match.validadeProposta !== undefined &&
      r.match.validadeProposta !== r.validade,
  );

  // 4. Report
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                     DRY-RUN REPORT                           ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📊 RESUMO:`);
  console.log(`   Total de tipos analisados:      ${allTipos.length}`);
  console.log(`   Controlados (24 meses):          ${controlados.length}`);
  console.log(`   Não controlados (sem validade):  ${naoControlados.length}`);
  console.log(`   Bloqueados (Tripulação/Oper.):   ${blocked.length}`);
  console.log(`   Fora do escopo:                  ${foraEscopo.length}`);
  console.log(`   Com alteração pendente:          ${comAlteracao.length}`);
  console.log('');

  // 5. Detailed tables

  function printTabela(titulo: string, items: TipoResultado[]) {
    if (items.length === 0) return;
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`📋 ${titulo} (${items.length})`);
    console.log(`${'─'.repeat(100)}`);
    console.log(
      `${'ID'.padEnd(6)} ${'Nome'.padEnd(42)} ${'Categoria'.padEnd(16)} ${'Validade Atual'.padEnd(15)} ${'Validade Proposta'.padEnd(17)} ${'Status'}`,
    );
    console.log(`${'─'.repeat(100)}`);
    for (const r of items) {
      const valAtual = r.validade != null ? `${r.validade}m` : 'sem validade';
      const valProp = r.match.validadeProposta === undefined ? 'mantém'
        : r.match.validadeProposta != null ? `${r.match.validadeProposta}m` : 'sem validade';
      const changed = r.match.validadeProposta !== undefined && r.validade !== r.match.validadeProposta ? ' *' : '  ';
      console.log(
        `${String(r.id).padEnd(6)} ${(r.nome || '').substring(0, 40).padEnd(42)} ${(r.categoria || '').substring(0, 14).padEnd(16)} ${valAtual.padEnd(15)} ${valProp.padEnd(17)} ${r.match.status}${changed}`,
      );
    }
  }

  printTabela('🔒 BLOQUEADOS — Tripulação/Operacionais (NÃO ALTERAR)', blocked);
  printTabela('🟢 CONTROLADOS — 24 meses', controlados);
  printTabela('⚪ NÃO CONTROLADOS — sem validade (Manutenção/Outros)', naoControlados);
  printTabela('⚫ FORA DO ESCOPO', foraEscopo);

  // 6. Pending changes summary
  if (comAlteracao.length > 0) {
    console.log(`\n${'═'.repeat(100)}`);
    console.log(`📝 ALTERAÇÕES PENDENTES (${comAlteracao.length})`);
    console.log(`${'═'.repeat(100)}`);
    for (const r of comAlteracao) {
      const valAtual = r.validade != null ? `${r.validade} meses` : 'sem validade';
      const valProp = r.match.validadeProposta != null ? `${r.match.validadeProposta} meses` : 'sem validade';
      console.log(`   ID ${r.id}: "${r.nome}" (${r.categoria})`);
      console.log(`      ${valAtual} → ${valProp}  [${r.match.motivo}]`);
    }
  } else {
    console.log('\n✅ Nenhuma alteração pendente. Todos os modelos já estão corretos.');
  }

  // 7. Apply
  if (MODE === 'apply') {
    if (comAlteracao.length === 0) {
      console.log('\n✅ Nada a aplicar.');
      return;
    }

    console.log(`\n🚀 APLICANDO ${comAlteracao.length} alterações...`);
    let sucessos = 0;
    let falhas = 0;

    for (const r of comAlteracao) {
      try {
        await updateTipoValidade(r.id, r.match.validadeProposta);
        console.log(`   ✅ ID ${r.id}: "${r.nome}" → validade=${r.match.validadeProposta}`);
        sucessos++;
      } catch (err) {
        console.log(`   ❌ ID ${r.id}: "${r.nome}" → ERRO: ${(err as Error).message}`);
        falhas++;
      }
    }

    console.log(`\n📊 Resultado: ${sucessos} sucessos, ${falhas} falhas`);
  } else {
    console.log('\n💡 Para aplicar as alterações, execute:');
    console.log('   npx tsx scripts/ajuste-validade-manutencao.ts --mode=apply');
  }
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
