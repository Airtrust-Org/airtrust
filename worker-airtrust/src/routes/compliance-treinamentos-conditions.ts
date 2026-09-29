import { Hono } from 'hono';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import {
  assertFuncionarioInScope,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';

const app = new Hono<{ Bindings: Env }>();
const CONDITION_TYPES = [
  'EXPOSICAO_RISCO',
  'ATIVIDADE',
  'DESIGNACAO',
  'CERTIFICACAO',
  'OUTRO',
] as const;

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function ensureSchema(db: D1Database) {
  const rows = await db
    .prepare(
      "SELECT COUNT(*) total FROM sqlite_master WHERE type='table' AND name IN ('compliance_condicoes','funcionarios_compliance_condicoes')",
    )
    .first<{ total: number }>();
  if (Number(rows?.total) !== 2)
    throw new ApiError('Schema de condições de Compliance ainda não aplicado', 409);
}

app.get('/condicoes/catalogos', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  await ensureSchema(db);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const [conditions, employees] = await Promise.all([
    db
      .prepare(
        `SELECT id,codigo,nome,tipo,descricao,referencia_normativa
      FROM compliance_condicoes WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL ORDER BY tipo,nome`,
      )
      .bind(empresaId)
      .all(),
    db
      .prepare(
        `SELECT f.id,f.nome,f.setor_id,s.nome setor_nome,f.funcao_id,fn.nome funcao_nome
      FROM funcionarios f LEFT JOIN setores s ON s.id=f.setor_id AND s.empresa_id=f.empresa_id AND s.deleted_at IS NULL
      LEFT JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=f.empresa_id AND fn.deleted_at IS NULL
      WHERE f.empresa_id=? AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO' ORDER BY f.nome`,
      )
      .bind(empresaId)
      .all(),
  ]);
  const visibleEmployees = (employees.results || []).filter(
    (row: any) =>
      access.mode === 'all' ||
      (access.mode === 'self' && Number(row.id) === access.funcionarioId) ||
      (access.mode === 'restricted' &&
        row.setor_id !== null &&
        access.setorIds.includes(Number(row.setor_id))),
  );
  return c.json({
    success: true,
    data: { condicoes: conditions.results || [], funcionarios: visibleEmployees },
  });
});

app.get('/condicoes/atribuicoes', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  await ensureSchema(db);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const funcionarioId = positiveInt(c.req.query('funcionario_id'));
  const condicaoId = positiveInt(c.req.query('condicao_id'));
  const params: unknown[] = [empresaId];
  let extra = '';
  if (funcionarioId) {
    extra += ' AND a.funcionario_id=?';
    params.push(funcionarioId);
  }
  if (condicaoId) {
    extra += ' AND a.condicao_id=?';
    params.push(condicaoId);
  }
  const { results } = await db
    .prepare(
      `SELECT a.id,a.funcionario_id,f.nome funcionario_nome,f.setor_id,a.condicao_id,c.codigo condicao_codigo,c.nome condicao_nome,c.tipo,
      a.data_inicio,a.data_fim,a.origem,a.referencia_normativa,a.justificativa,a.created_at,a.updated_at
    FROM funcionarios_compliance_condicoes a JOIN funcionarios f ON f.id=a.funcionario_id AND f.empresa_id=a.empresa_id
    JOIN compliance_condicoes c ON c.id=a.condicao_id AND c.empresa_id=a.empresa_id
    WHERE a.empresa_id=? AND a.ativo=1 AND a.deleted_at IS NULL${extra} ORDER BY c.nome,f.nome`,
    )
    .bind(...params)
    .all();
  const visible = (results || []).filter(
    (row: any) =>
      access.mode === 'all' ||
      (access.mode === 'self' && Number(row.funcionario_id) === access.funcionarioId) ||
      (access.mode === 'restricted' &&
        row.setor_id !== null &&
        access.setorIds.includes(Number(row.setor_id))),
  );
  return c.json({ success: true, data: visible });
});

app.post('/condicoes', requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  await ensureSchema(db);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const codigo = String(body.codigo || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_');
  const nome = String(body.nome || '').trim();
  const tipo = String(body.tipo || 'OUTRO')
    .trim()
    .toUpperCase();
  if (!codigo || !nome || !CONDITION_TYPES.includes(tipo as (typeof CONDITION_TYPES)[number]))
    throw new ApiError('Código, nome e tipo de condição válidos são obrigatórios', 400);
  const result = await db
    .prepare(
      `INSERT INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa) VALUES(?,?,?,?,?,?)`,
    )
    .bind(
      empresaId,
      codigo,
      nome,
      tipo,
      String(body.descricao || '').trim() || null,
      String(body.referencia_normativa || '').trim() || null,
    )
    .run();
  const id = Number(result.meta.last_row_id);
  await registrarAuditoria({
    db,
    tabela: 'compliance_condicoes',
    acao: 'INSERT',
    registro_id: id,
    dados_novos: { empresa_id: empresaId, codigo, nome, tipo },
    ...extrairUsuarioAuditoria(c),
  });
  return c.json({ success: true, data: { id } }, 201);
});

app.post('/condicoes/atribuicoes', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  await ensureSchema(db);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const funcionarioId = positiveInt(body.funcionario_id);
  const condicaoId = positiveInt(body.condicao_id);
  if (!funcionarioId || !condicaoId)
    throw new ApiError('Funcionário e condição são obrigatórios', 400);
  const access = await getEmployeeSectorAccess(c, empresaId);
  await assertFuncionarioInScope(db, empresaId, funcionarioId, access);
  const valid = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM funcionarios WHERE id=? AND empresa_id=? AND deleted_at IS NULL) funcionario,
    (SELECT COUNT(*) FROM compliance_condicoes WHERE id=? AND empresa_id=? AND ativo=1 AND deleted_at IS NULL) condicao`,
    )
    .bind(funcionarioId, empresaId, condicaoId, empresaId)
    .first<{ funcionario: number; condicao: number }>();
  if (Number(valid?.funcionario) !== 1 || Number(valid?.condicao) !== 1)
    throw new ApiError('Funcionário ou condição fora do tenant', 404);
  const dataInicio = String(body.data_inicio || '').trim() || new Date().toISOString().slice(0, 10);
  const dataFim = String(body.data_fim || '').trim() || null;
  const origem = String(body.origem || 'EMPRESA')
    .trim()
    .toUpperCase();
  const referencia = String(body.referencia_normativa || '').trim() || null;
  const justificativa = String(body.justificativa || '').trim() || null;
  const current = await db
    .prepare(
      `SELECT id FROM funcionarios_compliance_condicoes WHERE empresa_id=? AND funcionario_id=? AND condicao_id=? AND ativo=1 AND deleted_at IS NULL`,
    )
    .bind(empresaId, funcionarioId, condicaoId)
    .first<{ id: number }>();
  let id = Number(current?.id || 0);
  if (id) {
    await db
      .prepare(
        `UPDATE funcionarios_compliance_condicoes SET data_inicio=?,data_fim=?,origem=?,referencia_normativa=?,justificativa=?,updated_at=datetime('now') WHERE id=? AND empresa_id=?`,
      )
      .bind(dataInicio, dataFim, origem, referencia, justificativa, id, empresaId)
      .run();
  } else {
    const result = await db
      .prepare(
        `INSERT INTO funcionarios_compliance_condicoes(empresa_id,funcionario_id,condicao_id,data_inicio,data_fim,origem,referencia_normativa,justificativa) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .bind(
        empresaId,
        funcionarioId,
        condicaoId,
        dataInicio,
        dataFim,
        origem,
        referencia,
        justificativa,
      )
      .run();
    id = Number(result.meta.last_row_id);
  }
  await registrarAuditoria({
    db,
    tabela: 'funcionarios_compliance_condicoes',
    acao: 'INSERT',
    registro_id: id,
    dados_novos: {
      empresa_id: empresaId,
      funcionario_id: funcionarioId,
      condicao_id: condicaoId,
      data_inicio: dataInicio,
      data_fim: dataFim,
      origem,
      referencia_normativa: referencia,
      justificativa,
    },
    ...extrairUsuarioAuditoria(c),
  });
  return c.json({ success: true, data: { id } }, 201);
});

app.delete('/condicoes/atribuicoes/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  await ensureSchema(db);
  const id = positiveInt(c.req.param('id'));
  if (!id) throw new ApiError('ID inválido', 400);
  const before = await db
    .prepare(
      `SELECT * FROM funcionarios_compliance_condicoes WHERE id=? AND empresa_id=? AND ativo=1 AND deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first<Record<string, unknown>>();
  if (!before) throw new ApiError('Atribuição não encontrada', 404);
  const access = await getEmployeeSectorAccess(c, empresaId);
  await assertFuncionarioInScope(db, empresaId, Number(before.funcionario_id), access);
  await db
    .prepare(
      `UPDATE funcionarios_compliance_condicoes SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND empresa_id=?`,
    )
    .bind(id, empresaId)
    .run();
  await registrarAuditoria({
    db,
    tabela: 'funcionarios_compliance_condicoes',
    acao: 'DELETE',
    registro_id: id,
    dados_anteriores: before,
    ...extrairUsuarioAuditoria(c),
  });
  return c.json({ success: true });
});

export default app;
