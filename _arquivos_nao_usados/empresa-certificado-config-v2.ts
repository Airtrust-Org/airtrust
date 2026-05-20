import { Hono } from 'hono';

interface Env {
  DB: any;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware para aceitar multipart/form-data com boundary
app.use('*', async (c, next) => {
  const contentType = c.req.header('content-type') || '';
  
  // Se for multipart/form-data com boundary, deixa passar
  if (contentType.includes('multipart/form-data')) {
    // Hono vai tentar usar formData() que funciona com boundary
  }
  
  await next();
});

// GET: Buscar configuração
app.get('/:empresa_id', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = Number(c.req.param('empresa_id'));

    const config = await db
      .prepare('SELECT * FROM empresa_certificado_config WHERE empresa_id = ?')
      .bind(empresaId)
      .first();

    return c.json({
      success: true,
      data: config || {
        empresa_id: empresaId,
        template_html: '',
        logo_r2_url: null,
        cor_primaria: '#0066cc',
        cor_secundaria: '#333333'
      }
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// PUT: Salvar template e cores
app.put('/:empresa_id', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = Number(c.req.param('empresa_id'));
    const body = await c.req.json();

    const existe = await db
      .prepare('SELECT id FROM empresa_certificado_config WHERE empresa_id = ?')
      .bind(empresaId)
      .first();

    if (existe) {
      await db
        .prepare('UPDATE empresa_certificado_config SET template_html = ?, cor_primaria = ?, cor_secundaria = ?, atualizado_em = datetime("now") WHERE empresa_id = ?')
        .bind(body.template_html || '', body.cor_primaria || '#0066cc', body.cor_secundaria || '#333333', empresaId)
        .run();
    } else {
      await db
        .prepare('INSERT INTO empresa_certificado_config (empresa_id, template_html, cor_primaria, cor_secundaria, criado_em, atualizado_em) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))')
        .bind(empresaId, body.template_html || '', body.cor_primaria || '#0066cc', body.cor_secundaria || '#333333')
        .run();
    }

    return c.json({ success: true, message: 'Configuração salva' });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

export default app;
