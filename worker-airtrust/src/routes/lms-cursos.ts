import { Hono } from 'hono';

import { installLmsSchemaSnapshot } from '../lib/lms/lms-schema-state';
import { auth } from '../middleware/auth';
import type { Env } from '../types';
import legacyLmsCursosRoutes from './lms-cursos-legacy';
import hardenedUploadRoutes from './lms-cursos-upload-routes';

const app = new Hono<{ Bindings: Env }>();

// The legacy router still owns the broad CRUD surface. The wrapper resolves
// schema state once, fails closed on an unknown result and injects a cached DB
// view so legacy compatibility probes cannot reinterpret query failures as
// "table exists". Exact hardened upload routes are registered before legacy.
app.use('*', auth(), installLmsSchemaSnapshot);
app.route('/', hardenedUploadRoutes);
app.route('/', legacyLmsCursosRoutes);

export default app;
