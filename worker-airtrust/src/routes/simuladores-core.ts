/**
 * SIMULADORES — Core orchestrator
 * Thin router that mounts all sub-modules.
 *
 * Mount order is critical:
 *   1. /relatorios       — prefixed, no wildcard conflict
 *   1b. /planejamento    — future simulator planning on canonical training records
 *   1c. /planejamento-v2 — simplified planning UX support endpoints
 *   2. sessoes           — registers /sessoes, /agendamentos, /instrutores, /participantes
 *   3. fichas            — registers /fichas, /fichas-simulador
 *   3b. fichasExtras     — registers /historico-notas, /dashboard, /sessoes/:id/checks/resultados
 *   4. curriculosVoo     — explicit training ↔ ordered session-model configuration
 *   5. modelos           — registers /tipos-sessao, /modelos-sessao, /fix
 *   6. catalogo          — registers /categorias, /manobras
 *   7. equipamentos      — LAST (registers /, /:id wildcards for simuladores CRUD)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import equipamentos from './simuladores-equipamentos';
import sessoes from './simuladores-sessoes';
import sharedSessions from './simuladores-shared-session';
import fichas from './simuladores-fichas';
import fichasEdicoes from './simuladores-fichas-edicoes';
import fichasExtras from './simuladores-fichas-extras';
import modelos from './simuladores-modelos';
import curriculosVoo from './simuladores-curriculos-voo';
import catalogo from './simuladores-catalogo-secured';
import relatorios from './simuladores-relatorios';
import planejamento from './simuladores-planejamento';
import planejamentoV2 from './simuladores-planejamento-v2';
import planejamentoV2Config from './simuladores-planejamento-v2-config';
import planejamentoV2Crew from './simuladores-planejamento-v2-crew';
import guiasInstrutor from './simuladores-guias-instrutor';

const app = new Hono<{ Bindings: Env }>();

app.route('/relatorios', relatorios);
app.route('/planejamento', planejamento);
app.route('/planejamento-v2', planejamentoV2);
app.route('/planejamento-v2', planejamentoV2Config);
app.route('/planejamento-v2', planejamentoV2Crew);
app.route('/', sharedSessions);
app.route('/', sessoes);
app.route('/', fichas);
app.route('/', fichasEdicoes);
app.route('/', fichasExtras);
app.route('/', curriculosVoo);
app.route('/', modelos);
app.route('/', catalogo);
app.route('/', guiasInstrutor);
app.route('/', equipamentos); // LAST — has /:id wildcard for simuladores CRUD

export default app;
