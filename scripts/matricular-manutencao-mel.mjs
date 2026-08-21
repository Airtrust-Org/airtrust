#!/usr/bin/env node
/**
 * Inscrição em lote — MEL para TODOS da Manutenção (funcionários + gestores).
 *
 * - Funcionários ATIVOS do(s) setor(es) de Manutenção
 * - Gestores do(s) setor(es) (via setores_gestores), com funcionario_id resolvido
 *   e validado contra os ativos da empresa
 *
 * Uso (credenciais salvas uma vez via `npm run auth:setup`):
 *   npm run matricular-mel            # dry-run (leitura)
 *   npm run matricular-mel:apply      # aplica (com confirmação)
 */

import { createInterface } from 'node:readline';
import { normalizeBase, authenticate, request } from './lib/airtrust-auth.mjs';

const API_BASE = normalizeBase(process.env.AIRTRUST_API_URL);
const SETOR_ID_ENV = process.env.AIRTRUST_SETOR_ID || '';
const CURSO_ID_ENV = process.env.AIRTRUST_CURSO_ID || '';
const MODE = process.argv.includes('--mode=apply') ? 'apply' : 'dry-run';
const LOTE_MAX = 200;
const PAGE_LIMIT = 100;
const OBSERVACOES =
  process.env.AIRTRUST_OBSERVACOES ||
  'Inscrição em lote: curso MEL para todos os ativos do setor Manutenção (incluindo gestores)';

function log(msg) {
  console.log(`[MATRICULA-MEL] ${msg}`);
}
function warn(msg) {
  console.warn(`[MATRICULA-MEL][WARN] ${msg}`);
}
function die(msg) {
  console.error(`[MATRICULA-MEL][ERROR] ${msg}`);
  process.exit(1);
}

function askConfirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim().toUpperCase());
    });
  });
}

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function findManutencaoSetores(token) {
  const res = await request(API_BASE, '/api/setores', token);
  return (Array.isArray(res.data) ? res.data : []).filter((s) => normalize(s.nome).includes('MANUTEN'));
}

async function findMelQualificacao(token) {
  const res = await request(API_BASE, '/api/qualificacoes/tipos?search=MEL&ativo=1&limit=75', token);
  const tipos = Array.isArray(res.data) ? res.data : [];
  const mel = tipos.filter((t) => `${t.nome ?? ''} ${t.codigo ?? ''}`.toUpperCase().includes('MEL'));
  mel.sort((a, b) => {
    const rank = (t) =>
      String(t.codigo ?? '').trim().toUpperCase() === 'MEL'
        ? 0
        : String(t.codigo ?? '').trim().toUpperCase().includes('MNT_MEL')
          ? 1
          : String(t.codigo ?? '').trim().toUpperCase().includes('MEL')
            ? 2
            : 3;
    return rank(a) - rank(b) || (a.nome ?? '').localeCompare(b.nome ?? '');
  });
  return mel[0] ?? null;
}

async function findMelCursos(token) {
  const res = await request(API_BASE, '/api/lms/cursos?publicados=0&limit=200', token);
  return (Array.isArray(res.data) ? res.data : []).filter(
    (c) => (c.ativo === 1 || c.ativo === true) && normalize(c.titulo).includes('MEL'),
  );
}

async function listAtivosDoSetor(token, setorId) {
  const todos = [];
  let page = 1;
  for (;;) {
    const res = await request(
      API_BASE,
      `/api/funcionarios?setor_id=${setorId}&status=ativo&limit=${PAGE_LIMIT}&page=${page}`,
      token,
    );
    const rows = Array.isArray(res.data) ? res.data : [];
    todos.push(...rows.filter((r) => r.setor_id == null || Number(r.setor_id) === setorId));
    const total = res.pagination?.total ?? 0;
    const totalPages = res.pagination?.totalPages ?? Math.ceil(total / PAGE_LIMIT);
    if (rows.length === 0 || page >= totalPages || todos.length >= total) break;
    page++;
  }
  const seen = new Set();
  return todos.filter((f) => {
    if (seen.has(Number(f.id))) return false;
    seen.add(Number(f.id));
    return true;
  });
}

async function listAtivosDaEmpresa(token) {
  const ids = new Set();
  let page = 1;
  for (;;) {
    const res = await request(
      API_BASE,
      `/api/funcionarios?status=ativo&limit=${PAGE_LIMIT}&page=${page}`,
      token,
    );
    const rows = Array.isArray(res.data) ? res.data : [];
    for (const r of rows) {
      const id = Number(r.id);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
    const total = res.pagination?.total ?? 0;
    const totalPages = res.pagination?.totalPages ?? Math.ceil(total / PAGE_LIMIT);
    if (rows.length === 0 || page >= totalPages || ids.size >= total) break;
    page++;
  }
  return ids;
}

async function listGestoresDoSetor(token, setorId) {
  const porSetor = await request(API_BASE, `/api/setores-gestores/por-setor/${setorId}`, token);
  const gestores = Array.isArray(porSetor.data) ? porSetor.data : [];

  const elegiveis = await request(API_BASE, '/api/setores-gestores/usuarios-elegiveis/lista', token);
  const funcionarioPorUsuario = new Map();
  for (const u of Array.isArray(elegiveis.data) ? elegiveis.data : []) {
    const uid = Number(u.id);
    const fid = Number(u.funcionario_id);
    if (Number.isFinite(uid) && uid > 0 && Number.isFinite(fid) && fid > 0) {
      funcionarioPorUsuario.set(uid, fid);
    }
  }

  const comVinculo = [];
  const semVinculo = [];
  for (const g of gestores) {
    const usuarioId = Number(g.usuario_id);
    const nome = g.gestor_nome || g.gestor_email || `Gestor ${usuarioId}`;
    const funcionarioId =
      Number.isFinite(usuarioId) && usuarioId > 0 ? (funcionarioPorUsuario.get(usuarioId) ?? null) : null;
    if (funcionarioId) comVinculo.push({ usuario_id: usuarioId, nome, funcionario_id: funcionarioId });
    else semVinculo.push({ usuario_id: usuarioId, nome });
  }
  return { comVinculo, semVinculo };
}

async function aplicarLotes(token, cursoId, inscritos) {
  const ids = inscritos.map((f) => Number(f.id));
  let criadas = 0;
  let ignoradas = 0;
  let erros = 0;

  for (let i = 0; i < ids.length; i += LOTE_MAX) {
    const chunk = ids.slice(i, i + LOTE_MAX);
    log(`Enviando lote ${i / LOTE_MAX + 1}/${Math.ceil(ids.length / LOTE_MAX)} (${chunk.length} pessoas)...`);
    const res = await request(API_BASE, '/api/lms/matriculas/lote', token, {
      method: 'POST',
      body: { funcionario_ids: chunk, curso_id: cursoId, observacoes: OBSERVACOES },
    });
    const r = res.data ?? {};
    criadas += Number(r.criadas ?? 0);
    ignoradas += Number(r.ignoradas ?? 0);
    erros += Number(r.erros ?? 0);
    log(`  → criadas=${r.criadas ?? 0} ignoradas=${r.ignoradas ?? 0} erros=${r.erros ?? 0}`);
    if (i + LOTE_MAX < ids.length) await new Promise((r) => setTimeout(r, 1500));
  }

  log('──────────────────────────────────────────────');
  log(`TOTAL processados: ${ids.length}`);
  log(`  Matrículas criadas : ${criadas}`);
  log(`  Já matriculados    : ${ignoradas}`);
  log(`  Erros              : ${erros}`);
  if (erros > 0) warn('Existem erros — revisar o resultado acima.');
}

async function main() {
  log(`Modo: ${MODE === 'apply' ? 'APPLY (escrita)' : 'DRY-RUN (somente leitura)'}`);
  log(`API base: ${API_BASE}`);

  const token = await authenticate(API_BASE);
  log('Autenticado com sucesso.');

  const setores = await findManutencaoSetores(token);
  if (setores.length === 0) die('Nenhum setor Manutenção encontrado na empresa logada.');
  log(`Setor(es) Manutenção (${setores.length}):`);
  for (const s of setores) log(`  - id=${s.id} nome="${s.nome}"`);
  let setor = setores[0];
  if (SETOR_ID_ENV) {
    const byEnv = setores.find((s) => String(s.id) === String(SETOR_ID_ENV));
    if (!byEnv) die(`AIRTRUST_SETOR_ID=${SETOR_ID_ENV} não está entre os setores Manutenção.`);
    setor = byEnv;
  } else if (setores.length > 1) {
    warn('Múltiplos setores Manutenção: usando o primeiro. Defina AIRTRUST_SETOR_ID para escolher.');
  }

  const qualMel = await findMelQualificacao(token);
  if (qualMel) log(`Qualificação MEL: id=${qualMel.id} nome="${qualMel.nome}" codigo="${qualMel.codigo ?? ''}"`);
  else warn('Nenhuma qualificação MEL encontrada via /api/qualificacoes/tipos?search=MEL.');

  const cursosMel = await findMelCursos(token);
  if (cursosMel.length === 0) die('Nenhum curso LMS ativo com "MEL" no título encontrado.');
  log(`Curso(s) MEL candidatos (${cursosMel.length}):`);
  for (const c of cursosMel) {
    const vinculo =
      qualMel && Number(c.qualificacao_tipo_id) === Number(qualMel.id) ? ' ⭐ vinculado' : '';
    log(`  - id=${c.id} "${c.titulo}" (qualificacao_tipo_id=${c.qualificacao_tipo_id ?? '-'})${vinculo}`);
  }
  let curso = cursosMel[0];
  if (CURSO_ID_ENV) {
    const byEnv = cursosMel.find((c) => String(c.id) === String(CURSO_ID_ENV));
    if (!byEnv) die(`AIRTRUST_CURSO_ID=${CURSO_ID_ENV} não está entre os cursos MEL candidatos.`);
    curso = byEnv;
  } else {
    const vinculado = cursosMel.find(
      (c) => qualMel && Number(c.qualificacao_tipo_id) === Number(qualMel.id),
    );
    if (vinculado) curso = vinculado;
    else if (cursosMel.length > 1) warn('Múltiplos cursos MEL: usando o primeiro. Defina AIRTRUST_CURSO_ID.');
  }

  log(`Listando funcionários ATIVOS do setor "${setor.nome}" (id=${setor.id})...`);
  const funcionarios = await listAtivosDoSetor(token, setor.id);
  log(`Total de funcionários ativos do setor: ${funcionarios.length}`);

  log(`Listando gestores do setor "${setor.nome}"...`);
  const gestores = await listGestoresDoSetor(token, setor.id);
  log(`Gestores encontrados: ${gestores.comVinculo.length + gestores.semVinculo.length}`);

  const activeIds = gestores.comVinculo.length > 0 ? await listAtivosDaEmpresa(token) : new Set();
  const gestoresValidos = gestores.comVinculo.filter((g) => activeIds.has(g.funcionario_id));
  const gestoresInvalidos = [
    ...gestores.semVinculo.map((g) => ({ ...g, motivo: 'sem vínculo de funcionário' })),
    ...gestores.comVinculo
      .filter((g) => !activeIds.has(g.funcionario_id))
      .map((g) => ({ ...g, motivo: 'funcionário inativo/inexistente' })),
  ];

  const merged = funcionarios.map((f) => ({ ...f, origem: 'funcionario' }));
  const idsJaIncluidos = new Set(merged.map((m) => Number(m.id)));
  for (const g of gestoresValidos) {
    if (idsJaIncluidos.has(g.funcionario_id)) continue;
    merged.push({ id: g.funcionario_id, nome: g.nome, matricula: null, setor_id: setor.id, origem: 'gestor' });
    idsJaIncluidos.add(g.funcionario_id);
  }

  log('──────────────────────────────────────────────');
  log(`ESCOLHA: curso id=${curso.id} "${curso.titulo}"`);
  log(`ESCOLHA: setor id=${setor.id} "${setor.nome}"`);
  log(`ESCOLHA: ${merged.length} pessoa(s) (${funcionarios.length} funcionário(s) + ${merged.length - funcionarios.length} gestor(es))`);

  if (MODE === 'dry-run') {
    log('Funcionários ativos do setor:');
    for (const f of funcionarios.slice(0, 60)) {
      log(`  - id=${f.id} nome="${f.nome}" matricula=${f.matricula ?? '-'}`);
    }
    if (funcionarios.length > 60) log(`  ... e mais ${funcionarios.length - 60}`);
    if (gestoresValidos.length > 0) {
      log('Gestores do setor (serão incluídos):');
      for (const g of gestoresValidos) {
        log(`  - funcionario_id=${g.funcionario_id} nome="${g.nome}" (usuario_id=${g.usuario_id})`);
      }
    }
    if (gestoresInvalidos.length > 0) {
      warn('Gestores NÃO incluídos:');
      for (const g of gestoresInvalidos) {
        warn(`  - nome="${g.nome}" (usuario_id=${g.usuario_id}) — ${g.motivo}`);
      }
    }
    log('');
    log('DRY-RUN concluído — nenhuma matrícula foi criada.');
    log('Para aplicar: npm run matricular-mel:apply');
    return;
  }

  if (merged.length === 0) {
    log('Nenhuma pessoa ativa para inscrever — nada a fazer.');
    return;
  }

  const confirm = await askConfirm(
    `Vai inscrever ${merged.length} pessoa(s) no curso MEL em PRODUÇÃO. Digite SIM para confirmar: `,
  );
  if (confirm !== 'SIM') {
    log('Abortado — nenhuma matrícula foi criada.');
    return;
  }

  log('Aplicando inscrições...');
  await aplicarLotes(token, curso.id, merged);
  log('Concluído.');
}

main().catch((err) => {
  console.error('[MATRICULA-MEL][ERROR]', err instanceof Error ? err.message : err);
  process.exit(1);
});
