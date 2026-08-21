#!/usr/bin/env node
/**
 * Auditoria e correção de vencimento_fim_mes em qualificações.
 *
 * Problema: certificados/vencimentos de tipos OPERACIONAIS saíram com validade
 * no "fim do mês" (ex.: 31/08) quando o correto é "dia exato" (ex.: 17/08).
 * Causa: `qualificacoes_tipos.vencimento_fim_mes = 1` em tipos que deveriam ser 0
 * (regra da migration 0122: 1 só para tipos médicos CMA/ASO/Médico/Saúde).
 *
 * Uso (credenciais salvas uma vez via `npm run auth:setup`):
 *   npm run auditar-vencimento            # auditoria (leitura)
 *   npm run auditar-vencimento:fix        # corrige os tipos (com confirmação)
 */

import { createInterface } from 'node:readline';
import { normalizeBase, authenticate, request } from './lib/airtrust-auth.mjs';

const API_BASE = normalizeBase(process.env.AIRTRUST_API_URL);
const MODE = process.argv.includes('--mode=fix') ? 'fix' : 'audit';

function log(msg) {
  console.log(`[VENCIMENTO] ${msg}`);
}
function warn(msg) {
  console.warn(`[VENCIMENTO][WARN] ${msg}`);
}
function die(msg) {
  console.error(`[VENCIMENTO][ERROR] ${msg}`);
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

function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Regra da migration 0122: tipos médicos vencem no fim do mês (flag=1). */
function isMedicalTipo(t) {
  const codigo = normalizeText(t.codigo);
  const nome = normalizeText(t.nome);
  const categoria = normalizeText(t.categoria);
  return (
    codigo.includes('CMA') ||
    codigo.includes('ASO') ||
    codigo.includes('MEDIC') ||
    nome.includes('CMA') ||
    nome.includes('ASO') ||
    nome.includes('MEDIC') ||
    nome.includes('SAUDE') ||
    categoria === 'MEDICO'
  );
}

async function listTipos(token) {
  const res = await request(API_BASE, '/api/qualificacoes/tipos?limit=75', token);
  return { tipos: Array.isArray(res.data) ? res.data : [], meta: res.meta ?? null };
}

async function main() {
  log(`Modo: ${MODE === 'fix' ? 'FIX (escrita)' : 'AUDIT (somente leitura)'}`);
  log(`API base: ${API_BASE}`);

  const token = await authenticate(API_BASE);
  log('Autenticado com sucesso.');

  const { tipos, meta } = await listTipos(token);
  log(`Tipos de qualificação retornados: ${tipos.length}${meta?.count ? ` (meta.count=${meta.count})` : ''}`);
  if ((meta?.count ?? tipos.length) >= 75) {
    warn('O endpoint retorna no máximo 75 tipos sem paginação — pode haver tipos não listados.');
  }

  const flag1 = tipos.filter((t) => Number(t.vencimento_fim_mes || 0) === 1);
  const suspeitos = flag1.filter((t) => !isMedicalTipo(t));
  const medicosOk = flag1.filter((t) => isMedicalTipo(t));
  const medicosSemFimMes = tipos.filter(
    (t) => isMedicalTipo(t) && Number(t.vencimento_fim_mes || 0) === 0,
  );

  log('──────────────────────────────────────────────');
  log(`Tipos com vencimento_fim_mes = 1 (fim do mês): ${flag1.length}`);
  log(`  Médicos (correto manter fim do mês): ${medicosOk.length}`);
  log(`  SUSPEITOS (operacionais marcados como fim do mês): ${suspeitos.length}`);
  log(`  REVISAR (médicos marcados como dia exato): ${medicosSemFimMes.length}`);
  log('');

  if (medicosOk.length > 0) {
    log('Médicos com fim do mês (OK):');
    for (const t of medicosOk) {
      log(`  - id=${t.id} codigo="${t.codigo ?? ''}" nome="${t.nome}" categoria="${t.categoria ?? ''}"`);
    }
    log('');
  }

  if (medicosSemFimMes.length > 0) {
    warn('Médicos marcados como DIA EXATO (revisar — deveriam ser fim do mês):');
    for (const t of medicosSemFimMes) {
      warn(`  - id=${t.id} codigo="${t.codigo ?? ''}" nome="${t.nome}" categoria="${t.categoria ?? ''}"`);
    }
    warn('');
  }

  if (suspeitos.length === 0 && medicosSemFimMes.length === 0) {
    log('Nenhuma inconsistência encontrada — nada a corrigir.');
    return;
  }

  if (suspeitos.length === 0) {
    log('Nenhum tipo operacional suspeito (o --mode=fix só corrige estes).');
    log('Tipos médicos marcados como dia exato devem ser revisados manualmente.');
    return;
  }

  log('SUSPEITOS (operacionais marcados como fim do mês):');
  for (const t of suspeitos) {
    log(`  - id=${t.id} codigo="${t.codigo ?? ''}" nome="${t.nome}" categoria="${t.categoria ?? ''}"`);
  }
  log('');

  if (MODE !== 'fix') {
    log('AUDIT concluído — nenhuma alteração foi feita.');
    log('Para corrigir os TIPOS, execute: npm run auditar-vencimento:fix');
    return;
  }

  const confirm = await askConfirm(
    `Vai corrigir ${suspeitos.length} tipo(s) para "dia exato". Digite SIM para confirmar: `,
  );
  if (confirm !== 'SIM') {
    log('Abortado — nada foi alterado.');
    return;
  }

  let corrigidos = 0;
  let falhas = 0;
  for (const t of suspeitos) {
    try {
      await request(API_BASE, `/api/qualificacoes/tipos/${t.id}`, token, {
        method: 'PUT',
        body: { vencimento_fim_mes: 0 },
      });
      log(`  ✔ tipo id=${t.id} "${t.nome}" → vencimento_fim_mes=0`);
      corrigidos++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      warn(`  ✖ tipo id=${t.id} "${t.nome}" falhou: ${err instanceof Error ? err.message : err}`);
      falhas++;
    }
  }

  log('──────────────────────────────────────────────');
  log(`Tipos corrigidos: ${corrigidos} · falhas: ${falhas}`);
  log('');
  log('Falta corrigir os data_vencimento JÁ GRAVADOS no histórico. Aplique (com autorização):');
  log('  wrangler d1 execute airtrust-db --remote --file=sql/maintenance/2026-08-21-fix-vencimento-fim-mes-historico.sql');
}

main().catch((err) => {
  console.error('[VENCIMENTO][ERROR]', err instanceof Error ? err.message : err);
  process.exit(1);
});
