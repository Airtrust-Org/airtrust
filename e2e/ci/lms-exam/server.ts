/**
 * Servidor de API LOCAL e SINTETICO para o E2E de browser do modulo de provas LMS.
 *
 * REAL: rotas Hono de producao (lms-exam-learner, lms-exam-question-bank-admin, lms-matriculas),
 * guard auth()+tenantMiddleware() identico ao index.ts, servicos de prova/finalizacao/certificado,
 * SQLite real (node:sqlite) com DDL real (0346, 0557, schema-v2 0571/0572), JWT HS256 real.
 * SIMULADO: /api/auth/{login,me,empresas} (sem bcrypt/usuarios reais), R2 (Map em memoria),
 * Cloudflare Browser Rendering (PDF sintetico), assets do player SCORM. Nenhum D1/R2/Cloudflare remoto.
 * Controle de teste em /__test/* (somente host 127.0.0.1/localhost).
 */
import { createServer } from 'node:http';
import { Hono } from 'hono';
import { auth } from '../../../worker-airtrust/src/middleware/auth';
import { tenantMiddleware } from '../../../worker-airtrust/src/middleware/tenant';
import matriculasRoutes from '../../../worker-airtrust/src/routes/lms-matriculas';
import examLearnerRoutes from '../../../worker-airtrust/src/routes/lms-exam-learner';
import examAdminRoutes from '../../../worker-airtrust/src/routes/lms-exam-question-bank-admin';
import { generateJWT, verifyJWT } from '../../../worker-airtrust/src/utils/security';
import { LEARNER_USER, ADMIN_USER, publishExam } from '../../../worker-airtrust/src/__tests__/helpers/exam-lms-fixture';
import type { ExamSqliteD1 } from '../../../worker-airtrust/src/__tests__/helpers/exam-sqlite-d1';
import {
  EMPRESA, MATRICULA, addAuthTables, finalizeCertificateDb, memoryBucket, type AtomicSqliteD1,
} from '../../../worker-airtrust/src/__tests__/helpers/lms-finalize-certificate-fixture';

const SECRET = 'synthetic-e2e-jwt-secret-0123456789-abcdef';
const E2E_PASSWORD = 'sintetico-e2e-somente-local';
const USERS: Record<string, { id: number; role: string; nome: string }> = {
  'aluno@sintetico.test': { id: LEARNER_USER, role: 'ALUNO', nome: 'Aluno Sintetico' },
  'admin@sintetico.test': { id: ADMIN_USER, role: 'ADMIN', nome: 'Admin Sintetico' },
};
const CF_PDF = 'https://api.cloudflare.com/client/v4/accounts/synthetic-account/browser-rendering/pdf';

interface State { db: AtomicSqliteD1; r2: ReturnType<typeof memoryBucket>; renders: number }
let state: State;
globalThis.fetch = (async (url: unknown) => {
  if (String(url) === CF_PDF) {
    state.renders += 1;
    return new Response(new TextEncoder().encode(`%PDF-1.4\n% pdf sintetico ${state.renders}\n%%EOF`), { status: 200 });
  }
  throw new Error('UNEXPECTED_OUTBOUND_FETCH ' + String(url));
}) as typeof fetch;

async function reset(opts: { viewed?: number[] } = {}) {
  const db = finalizeCertificateDb({ viewed: opts.viewed });
  addAuthTables(db);
  // Tabelas auxiliares lidas por GET /matriculas/:id (conteudo H5P/handoff); vazias e sinteticas.
  // The learner's /matriculas/minhas-ead query selects these real LMS
  // catalogue columns. The synthetic finalization fixture intentionally omits
  // them; without this adapter the browser smoke logs SQLite 500s while a
  // narrower UI assertion can still pass (false green).
  db.exec(`ALTER TABLE lms_cursos ADD COLUMN scorm_versao TEXT;
    ALTER TABLE lms_cursos ADD COLUMN scorm_launch_file TEXT;
    ALTER TABLE lms_cursos ADD COLUMN categoria TEXT;
    ALTER TABLE lms_cursos ADD COLUMN carga_horaria_minutos INTEGER;
    ALTER TABLE lms_cursos ADD COLUMN thumbnail_r2_key TEXT;`);
  db.exec(`CREATE TABLE lms_h5p_conteudos(id INTEGER PRIMARY KEY, empresa_id INTEGER, r2_key TEXT, deleted_at TEXT);`);
  await publishExam(db as unknown as ExamSqliteD1);
  state = { db, r2: memoryBucket(), renders: 0 };
}

const app = new Hono();
app.onError((e, c) => c.json({ success: false, code: (e as { code?: string }).code ?? 'ERROR', message: e.message },
  ((e as { statusCode?: number }).statusCode ?? 500) as 500));
app.use('*', async (c, next) => {
  await next();
  const origin = c.req.header('Origin');
  // Only the synthetic localhost frontend may use credentialed cross-origin
  // requests. Echoing an arbitrary Origin together with ACA-C is unsafe.
  const isLocalFrontend = origin === 'http://127.0.0.1:3000' || origin === 'http://localhost:3000';
  c.header('Access-Control-Allow-Origin', isLocalFrontend ? origin : '*');
  c.header('Vary', 'Origin');
  if (isLocalFrontend) c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, Cache-Control');
  c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
});
app.options('*', (c) => c.body(null, 204));

// --- SIMULADO: sessao ---
const mint = (u: { id: number; role: string }, type: 'access' | 'refresh', ttl: number) => generateJWT({
  sub: String(u.id), empresa_id: EMPRESA, role: u.role, email: `u${u.id}@sintetico.test`, token_type: type,
} as never, SECRET, ttl);
app.post('/api/auth/login', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { email?: string; senha?: string };
  const u = USERS[String(b.email)];
  if (!u || b.senha !== E2E_PASSWORD) return c.json({ success: false, error: 'Credenciais inválidas' }, 401);
  const access = (await mint(u, 'access', 3600)).token;
  const refresh = (await mint(u, 'refresh', 86400)).token;
  return c.json({ success: true, data: { accessToken: access, refreshToken: refresh,
    user: { id: u.id, email: b.email, nome: u.nome, role: u.role, permissions: [], funcionario_id: null } } });
});
app.get('/api/auth/me', async (c) => {
  const p = await verifyJWT((c.req.header('Authorization') ?? '').replace(/^Bearer /, ''), SECRET);
  if (!p) return c.json({ success: false }, 401);
  const u = Object.values(USERS).find((v) => String(v.id) === p.sub)!;
  return c.json({ success: true, data: { id: u.id, email: `u${u.id}@sintetico.test`, nome: u.nome, role: u.role } });
});
app.get('/api/auth/empresas', (c) => c.json({ success: true, data: {
  empresas: [{ id: EMPRESA, nome: 'Empresa Sintetica A', codigo: 'sint-a', role: 'ALUNO', is_primary: 1 }], empresaAtualId: EMPRESA } }));

// SIMULADO: perfis de sessao / acesso operacional consultados pelo login e pelas rotas protegidas.
const sessionUser = async (header: string | undefined) => {
  const p = await verifyJWT((header ?? '').replace(/^Bearer /, ''), SECRET);
  return p ? Object.values(USERS).find((v) => String(v.id) === p.sub) : undefined;
};
app.get('/api/me/operational-access/session-profiles', async (c) => {
  const u = await sessionUser(c.req.header('Authorization'));
  if (!u) return c.json({ success: false }, 401);
  const role = u.role === 'ADMIN' ? 'ADMINISTRADOR' : u.role;
  return c.json({ success: true, data: { roles: [role], activeRole: role } });
});
app.get('/api/me/operational-access', async (c) => {
  if (!(await sessionUser(c.req.header('Authorization')))) return c.json({ success: false }, 401);
  return c.json({ success: true, data: { administrative_role: null, enabled: false, domains: [], setor_ids: [], actions: {} } });
});

// --- REAL: guard identico ao index.ts + rotas de producao ---
type Next = () => Promise<void>;
app.use('/api/lms/*', async (c, next) => {
  (c as unknown as { env: unknown }).env = {
    DB: state.db.asD1(), BUCKET: state.r2.bucket, ENVIRONMENT: 'staging', JWT_SECRET: SECRET,
    LMS_EXAM_LEARNER_STAGING: 'REVIEWED_SCHEMA_ONLY', LMS_EXAM_QUESTION_ADMIN_STAGING: 'REVIEWED_SCHEMA_ONLY',
    CF_ACCOUNT_ID: 'synthetic-account', CF_BROWSER_API_TOKEN: 'synthetic-test-value',
    API_URL: 'http://127.0.0.1:8787', FRONTEND_URL: 'http://127.0.0.1:3000',
  };
  const a = auth() as unknown as (c: unknown, n: Next) => Promise<unknown>;
  const t = tenantMiddleware() as unknown as (c: unknown, n: Next) => Promise<void>;
  return a(c, async () => { await t(c, next as Next); });
});
app.route('/api/lms/matriculas', matriculasRoutes);
app.route('/api/lms/exams/admin', examAdminRoutes);
app.route('/api/lms/exams', examLearnerRoutes);

// --- controle de teste ---
const local = (host: string | undefined) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host ?? '');
app.post('/__test/reset', async (c) => {
  if (!local(c.req.header('host'))) return c.text('forbidden', 403);
  const b = await c.req.json().catch(() => ({})) as { viewed?: number[] };
  await reset(b);
  return c.json({ ok: true, matriculaId: MATRICULA, password: E2E_PASSWORD });
});
const one = (sql: string) => state.db.database.prepare(sql).get() as Record<string, unknown>;
const all = (sql: string) => state.db.database.prepare(sql).all();
app.get('/__test/evidence', (c) => c.json({
  matricula: one(`SELECT status,progresso_pct,qualificacao_historico_id,data_conclusao FROM lms_matriculas WHERE id=${MATRICULA}`),
  attempts: all('SELECT attempt_no, state, passed FROM lms_exam_attempts ORDER BY attempt_no'),
  historico: all('SELECT id,status,qualificacao_codigo,numero_certificado,validacao_hash,certificado_arquivo_id,lms_matricula_id FROM qualificacoes_historico'),
  documentos: (one('SELECT COUNT(*) n FROM documentos') as { n: number }).n,
  r2Objects: state.r2.objects.size,
  renders: state.renders,
}));
app.all('*', (c) => c.json({ success: false, code: 'SIMULATED_NOT_FOUND', path: new URL(c.req.url).pathname }, 404));

await reset();
const port = Number(process.env.E2E_API_PORT ?? 8787);
// Adaptador minimo node:http -> fetch API (sem dependencia nova).
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const ch of req) chunks.push(ch as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const hasBody = body && req.method !== 'GET' && req.method !== 'HEAD';
  const response = await app.fetch(new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method, headers, body: hasBody ? body : undefined,
  }));
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1');
console.log('lms-exam synthetic API listening on 127.0.0.1:' + port);
