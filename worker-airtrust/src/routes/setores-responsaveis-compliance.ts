import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import {
  listResponsaveisComplianceElegiveis,
  listSetoresResponsaveisCompliance,
  replaceSetorResponsaveisCompliance,
  SetorResponsavelComplianceValidationError,
} from '../services/setores-responsaveis-compliance';

const app = new Hono<{ Bindings: Env }>();
app.use('/*', auth());
app.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

app.get('/', requireRole('admin', 'manager'), async (c) => {
  const data = await listSetoresResponsaveisCompliance(c.env.DB, getEmpresaId(c));
  return c.json({ success: true, data });
});

app.get('/funcionarios-elegiveis', requireRole('admin', 'manager'), async (c) => {
  const data = await listResponsaveisComplianceElegiveis(c.env.DB, getEmpresaId(c));
  return c.json({ success: true, data });
});

app.post('/bulk-assign/:setor_id', requireRole('admin', 'manager'), async (c) => {
  const setorId = Number(c.req.param('setor_id'));
  if (!Number.isInteger(setorId) || setorId <= 0) throw new ApiError('ID do setor inválido', 400);

  const body = (await c.req.json()) as { funcionario_ids?: number[] };
  if (!Array.isArray(body.funcionario_ids)) {
    throw new ApiError('funcionario_ids deve ser um array', 400);
  }

  const empresaId = getEmpresaId(c);
  try {
    const data = await replaceSetorResponsaveisCompliance(
      c.env.DB,
      empresaId,
      setorId,
      body.funcionario_ids,
    );
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'setores_responsaveis_compliance',
      acao: 'BULK_UPDATE',
      registro_id: setorId,
      dados_novos: { funcionario_ids: body.funcionario_ids },
      ...extrairUsuarioAuditoria(c),
    });
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof SetorResponsavelComplianceValidationError) {
      throw new ApiError(error.message, 400);
    }
    throw error;
  }
});

export default app;
