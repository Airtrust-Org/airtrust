import { Hono } from 'hono';

import { installLmsSchemaSnapshot } from '../lib/lms/lms-schema-state';
import { auth } from '../middleware/auth';
import type { Env } from '../types';
import canonicalLmsCursosRoutes from './lms-cursos-canonical-boundary';
import hardenedUploadRoutes from './lms-cursos-upload-routes';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), installLmsSchemaSnapshot);
app.route('/', hardenedUploadRoutes);
app.route('/', canonicalLmsCursosRoutes);

export default app;
