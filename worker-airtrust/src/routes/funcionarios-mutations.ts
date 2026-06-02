/**
 * FUNCIONARIOS — Mutations
 * Sub-router mounted at /api/funcionarios via app.route('/', ...)
 *
 *   POST   /
 *   PUT    /:id
 *   DELETE /:id
 *   GET    /:id/escalas
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, ApiResponse } from '../types';
import { softDelete } from '../utils/db';
import { notFound, badRequest } from '../middleware/error-handler';
import { isValidEmail, isValidCPF, sanitizeString } from '../utils/security';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { syncFuncionarioCertificacoes } from '../services/sync-certificacoes-funcionarios';
import { publishDomainEvent } from '../shared/domainEvents';

const app = new Hono<{ Bindings: Env }>();

// Helper: normaliza valores vindos do body para flags inteiras (0|1)
function flagToInt(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return 1;
  return 0;
}

function getEmpresaIdSafe(c: Context<{ Bindings: Env }>): number | undefined {
  try {
    return getEmpresaId(c);
  } catch {
    return undefined;
  }
}

function normalizeFuncionarioStatus(value?: string | null): string {
  const normalized = (value || '').trim().toUpperCase();
  if (!normalized) return 'ATIVO';
  return normalized === 'DESLIGADO' ? 'INATIVO' : normalized;
}

function normalizeFuncionarioQuinzena(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;

  const validQuinzenas = ['primeira', 'segunda', 'personalizada'];
  if (!validQuinzenas.includes(normalized)) {
    badRequest('Quinzena inválida. Valores aceitos: primeira, segunda, personalizada');
  }

  return normalized;
}

/**
 * POST /api/funcionarios
 * Cria novo funcionário
 *
 * RBAC: admin, manager
 */
app.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();

  // Validações obrigatórias (matrícula OPCIONAL agora)
  if (!body.nome || !body.cpf || !body.email) {
    badRequest('Campos obrigatórios: nome, cpf, email');
  }

  // Validar email
  if (!isValidEmail(body.email)) {
    badRequest('Email inválido');
  }

  // Validar CPF
  if (!isValidCPF(body.cpf)) {
    badRequest('CPF inválido');
  }

  // Verificar se matricula já existe (APENAS se fornecida)
  if (body.matricula) {
    const existing = await db
      .prepare('SELECT id FROM funcionarios WHERE matricula = ? AND deleted_at IS NULL')
      .bind(body.matricula)
      .first();

    if (existing) {
      badRequest('Matrícula já cadastrada');
    }
  }

  // Verificar se CPF já existe
  const existingCPF = await db
    .prepare('SELECT id FROM funcionarios WHERE cpf = ? AND deleted_at IS NULL')
    .bind(body.cpf)
    .first();

  if (existingCPF) {
    badRequest('CPF já cadastrado');
  }

  // Inserir com TODOS os campos (novos são opcionais)
  const query = `
    INSERT INTO funcionarios (
      matricula, nome, guerra, cpf, rg, nascimento, sexo, nacionalidade,
      email, telefone, telefone_emergencia, contato_emergencia_nome,
      funcao, cargo, setor, base, modelo_aeronave_id, admissao, codigo_anac,
      nivel_icao, data_realizacao_icao, validade_icao,
      cma, data_realizacao_cma, validade_cma,
      aso, data_realizacao_aso, validade_aso,
      sispat, prestserv,
      cep, logradouro, numero, complemento, bairro, cidade, estado,
      observacoes, foto_url, status, ativo, is_instrutor, is_checador, empresa_id,
      created_at, updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      datetime('now'), datetime('now')
    )
  `;

  const insertEmpresaId = getEmpresaIdSafe(c) ?? null;

  const result = await db
    .prepare(query)
    .bind(
      // Dados Pessoais
      body.matricula ? sanitizeString(body.matricula) : null,
      body.nome ? sanitizeString(body.nome) : null,
      body.guerra || null,
      body.cpf ? body.cpf.replace(/\D/g, '') : null,
      body.rg || null,
      body.nascimento || null,
      body.sexo || null,
      body.nacionalidade || 'Brasileira',
      body.email ? body.email.toLowerCase() : null,
      body.telefone || null,
      body.telefone_emergencia || null,
      body.contato_emergencia_nome || null,
      // Dados Profissionais
      body.funcao || null,
      body.cargo || null,
      body.setor || null,
      body.base || null,
      body.modelo_aeronave_id || null,
      body.admissao || null,
      body.codigo_anac || null,
      // Qualificações/Documentação
      body.nivel_icao || null,
      body.data_realizacao_icao || null,
      body.validade_icao || null,
      body.cma || null,
      body.data_realizacao_cma || null,
      body.validade_cma || null,
      body.aso || null,
      body.data_realizacao_aso || null,
      body.validade_aso || null,
      body.sispat || null,
      body.prestserv || null,
      // Endereço
      body.cep || null,
      body.logradouro || null,
      body.numero || null,
      body.complemento || null,
      body.bairro || null,
      body.cidade || null,
      body.estado || null,
      // Outros
      body.observacoes || null,
      body.foto_url || null,
      normalizeFuncionarioStatus(body.status),
      body.ativo !== undefined
        ? body.ativo
          ? 1
          : 0
        : normalizeFuncionarioStatus(body.status) === 'ATIVO'
          ? 1
          : 0,
      flagToInt(body.is_instrutor),
      flagToInt(body.is_checador),
      insertEmpresaId,
    )
    .run();

  const novoId = result.meta.last_row_id;

  // Buscar dados completos para auditoria
  const novoFuncionario = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ?')
    .bind(novoId)
    .first();

  // Registrar auditoria
  const auditoriaInfo = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'INSERT',
    registro_id: novoId,
    dados_novos: novoFuncionario,
    ...auditoriaInfo,
  });

  // Sincronizar certificações para qualificacoes_historico
  try {
    await syncFuncionarioCertificacoes(db, {
      funcionario_id: novoId,
      nivel_icao: body.nivel_icao,
      data_realizacao_icao: body.data_realizacao_icao,
      validade_icao: body.validade_icao,
      cma: body.cma,
      data_realizacao_cma: body.data_realizacao_cma,
      validade_cma: body.validade_cma,
      aso: body.aso,
      data_realizacao_aso: body.data_realizacao_aso,
      validade_aso: body.validade_aso,
    });
  } catch (syncError) {
    console.error('[Funcionarios] Erro ao sincronizar certificações:', syncError);
    // Não falhar a requisição, apenas logar o erro
  }

  const response: ApiResponse<{ id: number }> = {
    success: true,
    data: { id: novoId },
    message: 'Funcionário criado com sucesso',
  };

  return c.json(response, 201);
});

/**
 * PUT /api/funcionarios/:id
 * Atualiza funcionário existente
 *
 * RBAC: admin, manager
 */
app.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Verificar se existe
  const existing = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first();

  if (!existing) {
    notFound('Funcionário não encontrado');
  }

  // Guardar dados anteriores para auditoria
  const dadosAnteriores = { ...existing };

  // Validações opcionais
  if (body.email && !isValidEmail(body.email)) {
    badRequest('Email inválido');
  }

  // Verificar duplicatas de matrícula (excluindo próprio registro)
  if (body.matricula) {
    const duplicateMatricula = await db
      .prepare('SELECT id FROM funcionarios WHERE matricula = ? AND id != ? AND deleted_at IS NULL')
      .bind(body.matricula, id)
      .first();

    if (duplicateMatricula) {
      badRequest('Matrícula já cadastrada para outro funcionário');
    }
  }

  // Verificar duplicatas de CPF (excluindo próprio registro)
  if (body.cpf) {
    const duplicateCPF = await db
      .prepare('SELECT id FROM funcionarios WHERE cpf = ? AND id != ? AND deleted_at IS NULL')
      .bind(body.cpf, id)
      .first();

    if (duplicateCPF) {
      badRequest('CPF já cadastrado para outro funcionário');
    }
  }

  // Construir UPDATE dinâmico (apenas campos fornecidos)
  const updates: string[] = [];
  const bindings: unknown[] = [];

  if (body.matricula !== undefined) {
    updates.push('matricula = ?');
    bindings.push(body.matricula ? sanitizeString(body.matricula) : null);
  }

  if (body.nome !== undefined) {
    updates.push('nome = ?');
    bindings.push(body.nome ? sanitizeString(body.nome) : null);
  }

  if (body.cpf !== undefined) {
    updates.push('cpf = ?');
    bindings.push(body.cpf ? body.cpf.replace(/\D/g, '') : null);
  }

  if (body.email !== undefined) {
    updates.push('email = ?');
    bindings.push(body.email ? body.email.toLowerCase() : null);
  }

  if (body.telefone !== undefined) {
    updates.push('telefone = ?');
    bindings.push(body.telefone || null);
  }

  if (body.cargo !== undefined) {
    updates.push('cargo = ?');
    bindings.push(body.cargo);
  }

  if (body.setor !== undefined) {
    updates.push('setor = ?');
    bindings.push(body.setor);
  }

  if (body.funcao !== undefined) {
    updates.push('funcao = ?');
    bindings.push(body.funcao);
  }

  if (body.quinzena !== undefined) {
    updates.push('quinzena = ?');
    bindings.push(normalizeFuncionarioQuinzena(body.quinzena));
  }

  if (body.codigo_anac !== undefined) {
    updates.push('codigo_anac = ?');
    bindings.push(body.codigo_anac);
  }

  if (body.ativo !== undefined) {
    updates.push('ativo = ?');
    bindings.push(body.ativo ? 1 : 0);
  }

  if (body.is_instrutor !== undefined) {
    updates.push('is_instrutor = ?');
    bindings.push(flagToInt(body.is_instrutor));
  }

  if (body.is_checador !== undefined) {
    updates.push('is_checador = ?');
    bindings.push(flagToInt(body.is_checador));
  }

  if (body.admissao !== undefined) {
    updates.push('admissao = ?');
    bindings.push(body.admissao);
  }

  if (body.status !== undefined) {
    const normalizedStatus = normalizeFuncionarioStatus(body.status);
    updates.push('status = ?');
    bindings.push(normalizedStatus);
    // Sync ativo column: ATIVO → 1, any other status → 0
    const isAtivo = normalizedStatus === 'ATIVO';
    updates.push('ativo = ?');
    bindings.push(isAtivo ? 1 : 0);
  }

  // ===== NOVOS CAMPOS ADICIONADOS =====

  // Dados Pessoais
  if (body.rg !== undefined) {
    updates.push('rg = ?');
    bindings.push(body.rg);
  }

  if (body.guerra !== undefined) {
    updates.push('guerra = ?');
    bindings.push(body.guerra);
  }

  if (body.nascimento !== undefined) {
    updates.push('nascimento = ?');
    bindings.push(body.nascimento);
  }

  // NOVOS CAMPOS FASE 1
  if (body.sexo !== undefined) {
    updates.push('sexo = ?');
    bindings.push(body.sexo);
  }

  if (body.nacionalidade !== undefined) {
    updates.push('nacionalidade = ?');
    bindings.push(body.nacionalidade);
  }

  if (body.telefone_emergencia !== undefined) {
    updates.push('telefone_emergencia = ?');
    bindings.push(body.telefone_emergencia);
  }

  if (body.contato_emergencia_nome !== undefined) {
    updates.push('contato_emergencia_nome = ?');
    bindings.push(body.contato_emergencia_nome);
  }

  if (body.foto_url !== undefined) {
    updates.push('foto_url = ?');
    bindings.push(body.foto_url);
  }

  // Dados Profissionais
  if (body.base !== undefined) {
    updates.push('base = ?');
    bindings.push(body.base);
  }

  if (body.modelo_aeronave_id !== undefined) {
    updates.push('modelo_aeronave_id = ?');
    bindings.push(body.modelo_aeronave_id);

    // Atualizar coluna legada 'aeronave' quando modelo_aeronave_id mudar
    const modeloAeronave = await db
      .prepare(
        `SELECT COALESCE(modelo, codigo, nome) AS aeronave FROM modelos_aeronave WHERE id = ?`,
      )
      .bind(body.modelo_aeronave_id)
      .first<{ aeronave: string }>();

    if (modeloAeronave?.aeronave) {
      updates.push('aeronave = ?');
      bindings.push(modeloAeronave.aeronave);
    }
  }

  // Qualificações/Documentação
  if (body.nivel_icao !== undefined) {
    updates.push('nivel_icao = ?');
    bindings.push(body.nivel_icao);
  }

  if (body.data_realizacao_icao !== undefined) {
    updates.push('data_realizacao_icao = ?');
    bindings.push(body.data_realizacao_icao);
  }

  if (body.validade_icao !== undefined) {
    updates.push('validade_icao = ?');
    bindings.push(body.validade_icao);
  }

  if (body.cma !== undefined) {
    updates.push('cma = ?');
    bindings.push(body.cma);
  }

  if (body.data_realizacao_cma !== undefined) {
    updates.push('data_realizacao_cma = ?');
    bindings.push(body.data_realizacao_cma);
  }

  if (body.validade_cma !== undefined) {
    updates.push('validade_cma = ?');
    bindings.push(body.validade_cma);
  }

  if (body.aso !== undefined) {
    updates.push('aso = ?');
    bindings.push(body.aso);
  }

  if (body.data_realizacao_aso !== undefined) {
    updates.push('data_realizacao_aso = ?');
    bindings.push(body.data_realizacao_aso);
  }

  if (body.validade_aso !== undefined) {
    updates.push('validade_aso = ?');
    bindings.push(body.validade_aso);
  }

  if (body.sispat !== undefined) {
    updates.push('sispat = ?');
    bindings.push(body.sispat);
  }

  if (body.prestserv !== undefined) {
    updates.push('prestserv = ?');
    bindings.push(body.prestserv);
  }

  // Endereço Completo
  if (body.cep !== undefined) {
    updates.push('cep = ?');
    bindings.push(body.cep);
  }

  if (body.logradouro !== undefined) {
    updates.push('logradouro = ?');
    bindings.push(body.logradouro);
  }

  if (body.numero !== undefined) {
    updates.push('numero = ?');
    bindings.push(body.numero);
  }

  if (body.complemento !== undefined) {
    updates.push('complemento = ?');
    bindings.push(body.complemento);
  }

  if (body.bairro !== undefined) {
    updates.push('bairro = ?');
    bindings.push(body.bairro);
  }

  if (body.cidade !== undefined) {
    updates.push('cidade = ?');
    bindings.push(body.cidade);
  }

  if (body.estado !== undefined) {
    updates.push('estado = ?');
    bindings.push(body.estado);
  }

  // Observações
  if (body.observacoes !== undefined) {
    updates.push('observacoes = ?');
    bindings.push(body.observacoes);
  }

  // ===== FIM DOS NOVOS CAMPOS =====

  if (updates.length === 0) {
    badRequest('Nenhum campo para atualizar');
  }

  updates.push("updated_at = datetime('now')");

  const query = `UPDATE funcionarios SET ${updates.join(', ')} WHERE id = ?`;

  await db
    .prepare(query)
    .bind(...bindings, id)
    .run();

  // Buscar dados atualizados para auditoria
  const dadosNovos = await db.prepare('SELECT * FROM funcionarios WHERE id = ?').bind(id).first();

  // Registrar auditoria
  const auditoriaInfo = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'UPDATE',
    registro_id: id,
    dados_anteriores: dadosAnteriores,
    dados_novos: dadosNovos,
    ...auditoriaInfo,
  });
  // Sincronizar certificações para qualificacoes_historico
  try {
    await syncFuncionarioCertificacoes(db, {
      funcionario_id: id,
      nivel_icao: body.nivel_icao,
      data_realizacao_icao: body.data_realizacao_icao,
      validade_icao: body.validade_icao,
      cma: body.cma,
      data_realizacao_cma: body.data_realizacao_cma,
      validade_cma: body.validade_cma,
      aso: body.aso,
      data_realizacao_aso: body.data_realizacao_aso,
      validade_aso: body.validade_aso,
    });
  } catch (syncError) {
    console.error('[Funcionarios] Erro ao sincronizar certificações (UPDATE):', syncError);
    // Não falhar a requisição, apenas logar o erro
  }
  const response: ApiResponse = {
    success: true,
    message: 'Funcionário atualizado com sucesso',
  };

  return c.json(response);
});

/**
 * DELETE /api/funcionarios/:id
 * Remove funcionário (soft delete)
 *
 * RBAC: apenas admin
 */
app.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Buscar dados antes de deletar para auditoria
  const funcionario = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first();

  if (!funcionario) {
    notFound('Funcionário não encontrado');
  }

  const result = await softDelete(db, 'funcionarios', id);

  if (result.meta.changes === 0) {
    notFound('Funcionário não encontrado');
  }

  // Registrar auditoria
  const auditoriaInfo = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'DELETE',
    registro_id: id,
    dados_anteriores: funcionario,
    ...auditoriaInfo,
  });

  try {
    const empresaId = Number((funcionario as { empresa_id?: number }).empresa_id || 0);
    if (empresaId > 0) {
      await publishDomainEvent(db, 'funcionarios', 'FUNCIONARIO_INATIVADO', {
        origem_modulo: 'funcionarios',
        funcionario_id: String(id),
        empresa_id: empresaId,
      });
    }
  } catch (error) {
    console.error('domain_event_error', error);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Funcionário removido com sucesso',
  };

  return c.json(response);
});

// ================================================================
// INT-02: GET /api/funcionarios/:id/escalas
// Returns escalas history & active allocations for this employee
// ================================================================
app.get('/:id/escalas', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const limit = Number(c.req.query('limit') || '20');
  const offset = Number(c.req.query('offset') || '0');
  const status = c.req.query('status'); // rascunho|publicada|encerrada

  try {
    // Verify employee exists
    const func = await db
      .prepare(
        'SELECT id, nome FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first();
    if (!func) return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);

    // Get escalas where this employee has tripulações (pic_id or sic_id)
    let sql = `
      SELECT DISTINCT
        em.id, em.titulo, em.mes, em.ano, em.status,
        em.created_at, em.updated_at,
        (SELECT COUNT(*) FROM escala_tripulacoes et2
         WHERE et2.escala_id = em.id AND (et2.pic_id = ? OR et2.sic_id = ?) AND et2.deleted_at IS NULL) AS total_tripulacoes,
        (SELECT COUNT(*) FROM escala_eventos ee2
         WHERE ee2.escala_id = em.id AND ee2.funcionario_id = ? AND ee2.deleted_at IS NULL) AS total_eventos
      FROM escalas_mensais em
      JOIN escala_tripulacoes et ON et.escala_id = em.id AND (et.pic_id = ? OR et.sic_id = ?)
      WHERE em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
    `;
    const params: any[] = [id, id, id, id, id, empresaId];

    if (status) {
      sql += ` AND em.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY em.ano DESC, em.mes DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db
      .prepare(sql)
      .bind(...params)
      .all();

    // Count total
    let countSql = `
      SELECT COUNT(DISTINCT em.id) AS total
      FROM escalas_mensais em
      JOIN escala_tripulacoes et ON et.escala_id = em.id AND (et.pic_id = ? OR et.sic_id = ?)
      WHERE em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
    `;
    const countParams: any[] = [id, id, empresaId];
    if (status) {
      countSql += ` AND em.status = ?`;
      countParams.push(status);
    }
    const countRow = await db
      .prepare(countSql)
      .bind(...countParams)
      .first<{ total: number }>();

    return c.json({
      success: true,
      data: rows.results || [],
      pagination: {
        total: countRow?.total ?? 0,
        limit,
        offset,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
