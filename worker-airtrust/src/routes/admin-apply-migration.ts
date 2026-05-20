import { Hono } from 'hono';
import { auth } from '../middleware/auth';

const app = new Hono();

app.post('/apply-migration', auth(), async (c) => {
  const db = c.env.DB;
  const { migration_sql } = await c.req.json() as { migration_sql: string };
  
  if (!migration_sql) {
    return c.json({ success: false, error: 'migration_sql é obrigatório' }, 400);
  }
  
  try {
    const result = await db.exec(migration_sql);
    return c.json({ success: true, result }, 200);
  } catch (error) {
    console.error('Migration error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export default app;
