/**
 * SIMULADORES — Core orchestrator
 * Thin router that mounts all sub-modules.
 *
 * Mount order is critical:
 *   1. /relatorios  — prefixed, no wildcard conflict
 *   2. sessoes      — registers /sessoes, /agendamentos, /instrutores, /participantes
 *   3. fichas       — registers /fichas, /fichas-simulador
 *   3b. fichasExtras — registers /historico-notas, /dashboard, /sessoes/:id/checks/resultados
 *   4. modelos      — registers /tipos-sessao, /modelos-sessao, /fix
 *   5. catalogo     — registers /categorias, /manobras
 *   6. equipamentos — LAST (registers /, /:id wildcards for simuladores CRUD)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import equipamentos from './simuladores-equipamentos';
import sessoes from './simuladores-sessoes';
import fichas from './simuladores-fichas';
import fichasEdicoes from './simuladores-fichas-edicoes';
import fichasExtras from './simuladores-fichas-extras';
import modelos from './simuladores-modelos';
import catalogo from './simuladores-catalogo';
import relatorios from './simuladores-relatorios';

const app = new Hono<{ Bindings: Env }>();

app.route('/relatorios', relatorios);
app.route('/', sessoes);
app.route('/', fichas);
app.route('/', fichasEdicoes);
app.route('/', fichasExtras);
app.route('/', modelos);
app.route('/', catalogo);
app.route('/', equipamentos); // LAST — has /:id wildcard for simuladores CRUD

export default app;
