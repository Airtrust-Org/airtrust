import { Hono } from 'hono';

import { installLmsSchemaSnapshot } from '../lib/lms/lms-schema-state';
import { auth } from '../middleware/auth';
import { guardLegacyCourseMutation } from '../middleware/lms-native-course-write-guard';
import type { Env } from '../types';
import canonicalLmsCursosRoutes from './lms-cursos-canonical-boundary';
import hardenedUploadRoutes from './lms-cursos-upload-routes';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), installLmsSchemaSnapshot);
// Before upload/CRUD dispatch: a staging-marked Native course is not an old LMS course.
app.use('/:id{[0-9]+}', guardLegacyCourseMutation);
app.use('/:id{[0-9]+}/*', guardLegacyCourseMutation);
app.route('/', hardenedUploadRoutes);
app.route('/', canonicalLmsCursosRoutes);

export default app;
