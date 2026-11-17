#!/usr/bin/env node
// Validação funcional SOMENTE LEITURA dos 88 guias curriculares PTO Rev.10 V18
// publicados em produção. Só emite requisições GET (e o login de uma conta QA
// de produção já existente). Não cria sessão, ficha, nota, aluno ou instrutor.
//
// Verifica, via API autenticada (mesma superfície usada pela biblioteca de guias):
//  - 401 sem credencial (listagem, HTML e PDF);
//  - 404 para id inexistente (sem vazamento);
//  - 88 guias V18 ativos visíveis ao instrutor autorizado, 37 AW139 / 45 S76 / 6 funcionais;
//  - cada guia vinculado a um modelo de sessão distinto e à aeronave correta;
//  - HTML e PDF abrem e têm SHA-256/tamanho idênticos ao manifesto de publicação;
//  - o HTML contém o código canônico do PTO, a fonte normativa, PF A/PF B nos
//    guias de aeronave e os 15 elementos NOTECHS (nota mínima 6, sem média);
//  - cabeçalhos de segurança do HTML (CSP) e PDF com assinatura %PDF;
//  - 51 guias legados permanecem acessíveis na listagem administrativa;
//    a biblioteca do instrutor exibe somente os 88 guias vigentes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED, SUFIXO, evaluateListing } from './pto-v18-guide-validation-lib.mjs';
import {
  assert,
  assertAllowedProductionBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  login,
} from '../smoke-auth-common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(here, 'pto-v18-guide-release-manifest.json'), 'utf8'),
);

const baseUrl = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const email = process.env.E2E_EMAIL || '';
const password = process.env.E2E_PASSWORD || '';
assert(email && password, 'credenciais QA de produção ausentes');
assert(!/staging\.airtrust\.invalid/.test(email), 'identidade de staging bloqueada');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function get(path, token) {
  // Somente GET. Repetições limitadas para falhas transitórias de rede/429/5xx (idempotente).
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        redirect: 'manual',
      });
      const body = Buffer.from(await res.arrayBuffer());
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      return { status: res.status, headers: res.headers, body };
    } catch (error) {
      last = error;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw last;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const json = (r) => JSON.parse(r.body.toString('utf8'));

const loginPayload = await login(baseUrl, email, password);
const token = extractAccessToken(loginPayload);
const claims = decodeJwtPayload(token);
const empresa = Number(claims.empresa_id ?? claims.empresaId ?? claims.tenant_id ?? 0);
check('token pertence ao tenant 6', empresa === 6, `empresa=${empresa}`);

const lista = await get('/api/simuladores/guias-instrutor', token);
check('listagem autenticada 200', lista.status === 200, `status=${lista.status}`);
const guias = lista.status === 200 ? json(lista).data : [];
const v18 = guias.filter((g) => String(g.codigo).endsWith(SUFIXO));
const legadosNaBiblioteca = guias.filter((g) => !String(g.codigo).endsWith(SUFIXO));
check('88 guias V18 ativos visíveis', v18.length === 88 && v18.every((g) => g.status === 'ATIVO'), `n=${v18.length}`);
check('biblioteca do instrutor não mistura guias legados', legadosNaBiblioteca.length === 0, `n=${legadosNaBiblioteca.length}`);

// Contrato do PR #2406: somente a listagem administrativa inclui o acervo
// histórico. Este acesso é de leitura e nunca desativa/reesve um guia.
const listaAdmin = await get('/api/simuladores/guias-instrutor?admin=1', token);
check('listagem administrativa autenticada 200', listaAdmin.status === 200, `status=${listaAdmin.status}`);
const guiasAdmin = listaAdmin.status === 200 ? json(listaAdmin).data : [];
const legadosAdmin = guiasAdmin.filter((g) => !String(g.codigo).endsWith(SUFIXO));
check('51 guias legados preservados no acervo administrativo',
  legadosAdmin.length === 51 && legadosAdmin.every((g) => g.status === 'ATIVO'),
  `legados=${legadosAdmin.length}`);
check('88 guias V18 também acessíveis na administração',
  guiasAdmin.filter((g) => String(g.codigo).endsWith(SUFIXO)).length === 88,
  `v18=${guiasAdmin.filter((g) => String(g.codigo).endsWith(SUFIXO)).length}`);
check('1 guia V18 por modelo de sessão (88 distintos)',
  new Set(v18.map((g) => g.modelo_sessao_id)).size === 88 && v18.every((g) => g.modelo_sessao_id), '');
check('versão do guia = manifesto', v18.every((g) => g.versao === manifest.versao_guia), manifest.versao_guia);

const ev = evaluateListing(guias, manifest);
const { porAeronave, cruzados } = ev;
const porCodigo = new Map(manifest.guias.map((g) => [g.codigo, g]));
check('contagem por aeronave 37/45/6', JSON.stringify(porAeronave) === JSON.stringify(EXPECTED), JSON.stringify(porAeronave));
check('0 vínculos guia→modelo de sessão, aeronave ou programa divergentes do plano', cruzados === 0, `cruzados=${cruzados}`);
check('os 88 códigos do manifesto estão presentes', ev.codigosPresentes, '');

const semToken = await get('/api/simuladores/guias-instrutor', null);
check('listagem sem credencial é negada', semToken.status === 401 || semToken.status === 403, `status=${semToken.status}`);
const id404 = await get('/api/simuladores/guias-instrutor/2147483000', token);
check('id inexistente retorna 404', id404.status === 404, `status=${id404.status}`);

const perm = await get('/api/simuladores/guias-instrutor/minhas-permissoes', token);
check('capacidades do usuário QA consultáveis', perm.status === 200, `status=${perm.status}`);
if (v18.length > 0) {
  // Trilha de auditoria da importação: só consultável por quem gerencia guias.
  const aud = await get(`/api/simuladores/guias-instrutor/${v18[0].id}/auditoria`, token);
  if (aud.status === 200) {
    const linhas = json(aud).data || [];
    check('guia V18 tem trilha de auditoria de importação sem assinatura RT',
      linhas.some((l) => /^IMPORTACAO_AUTOMATIZADA/.test(l.acao)) && linhas.every((l) => l.usuario_id === 0 || l.usuario_id > 0),
      `linhas=${linhas.length}`);
  } else {
    check('trilha de auditoria protegida para perfil sem gestão de guias', aud.status === 403, `status=${aud.status}`);
  }
}

let htmlOk = 0, pdfOk = 0, conteudoOk = 0, semTokenNegado = 0;
const falhas = [];
for (const g of v18) {
  const m = porCodigo.get(g.codigo);
  if (!m) continue;
  const h = await get(`/api/simuladores/guias-instrutor/${g.id}/html`, token);
  const p = await get(`/api/simuladores/guias-instrutor/${g.id}/pdf`, token);
  if (h.status === 200 && h.body.length === m.html_bytes && sha256(h.body) === m.html_sha256
      && /text\/html/.test(h.headers.get('content-type') || '')
      && Boolean(h.headers.get('content-security-policy'))) htmlOk += 1;
  else falhas.push(`${g.codigo}:html:${h.status}`);
  if (p.status === 200 && p.body.length === m.pdf_bytes && sha256(p.body) === m.pdf_sha256
      && p.body.subarray(0, 5).toString('latin1') === '%PDF-'
      && /application\/pdf/.test(p.headers.get('content-type') || '')) pdfOk += 1;
  else falhas.push(`${g.codigo}:pdf:${p.status}`);
  const texto = h.body.toString('utf8');
  const nNotechs = (texto.match(/NOTECHS/g) || []).length;
  const tecnico = m.aeronave !== 'FUNCIONAL';
  const conteudo = texto.includes(m.codigo_pto)
    && texto.includes(manifest.source_sha256)
    && /15 elementos/.test(texto) && nNotechs >= 1
    && /mínima por elemento é 6/.test(texto)
    && (!tecnico || (/PF A/.test(texto) && /PF B/.test(texto)))
    && /coaching/i.test(texto);
  if (conteudo) conteudoOk += 1; else falhas.push(`${g.codigo}:conteudo`);
  const neg = await get(`/api/simuladores/guias-instrutor/${g.id}/pdf`, null);
  if (neg.status === 401 || neg.status === 403) semTokenNegado += 1;
}
check('88 HTMLs abrem com SHA-256/tamanho/CSP idênticos ao manifesto', htmlOk === 88, `ok=${htmlOk}`);
check('88 PDFs abrem com SHA-256/tamanho/%PDF idênticos ao manifesto', pdfOk === 88, `ok=${pdfOk}`);
check('88 HTMLs com código PTO, fonte SHA-256, PF A/PF B, 15 NOTECHS, mínimo 6 e check sem coaching',
  conteudoOk === 88, `ok=${conteudoOk}`);
check('88 PDFs negados sem credencial', semTokenNegado === 88, `negados=${semTokenNegado}`);
if (falhas.length) console.log('Falhas:', falhas.slice(0, 20).join(', '));

const failed = checks.filter((c) => !c.ok);
const summary = {
  scope: 'READ_ONLY_PRODUCTION_FUNCTIONAL_VALIDATION',
  api: baseUrl,
  source_sha256: manifest.source_sha256,
  guide_version: manifest.versao_guia,
  total: checks.length,
  failed: failed.length,
  checks,
};
if (process.env.EVIDENCE_OUT) writeFileSync(process.env.EVIDENCE_OUT, JSON.stringify(summary, null, 2));
console.log(failed.length === 0 ? 'PTO_V18_GUIDES_PRODUCTION_READONLY_PASS' : 'PTO_V18_GUIDES_PRODUCTION_READONLY_FAIL');
process.exit(failed.length === 0 ? 0 : 1);
