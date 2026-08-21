/**
 * FUNCIONARIOS — Mutations
 * Sub-router mounted at /api/funcionarios via app.route('/', ...)
 *
 *   POST   /
 *   PUT    /:id
 *   DELETE /:id
 *   POST   /:id/reativar
 *   GET    /:id/escalas
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { notFound, badRequest, forbidden } from '../middleware/error-handler';
import { isValidEmail, isValidCPF, sanitizeString } from '../utils/security';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import {
  requireOperationalAccess,
  assertSetorWithinOperationalScope,
} from '../services/operational-domain-access';

// A funcionário's domain comes from their own setor (setores.dominio_codigo),
// which varies per employee. update/delete resolve it dynamically from the
// target funcionário (:id). POST / (create) and the DESTINATION setor of a
// setor transfer have no existing funcionário/resourceId to resolve a
// domain from — those are validated inline via
// assertSetorWithinOperationalScope against the setor in the request
// payload itself (Item 3).
const requireOperacoesFuncionario = (action: 'update' | 'delete') =>
  requireOperationalAccess({ action, resourceType: 'funcionario' });
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { syncFuncionarioCertificacoes } from '../services/sync-certificacoes-funcionarios';
import { publishDomainEvent } from '../shared/domainEvents';
import {
  assertFuncionarioInScope,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import { vincularUsuarioAoFuncionarioPorEmail } from '../services/vinculo-usuario-funcionario';

const app = new Hono<{ Bindings: Env }>();

interface CertificacaoSyncStatus {
  sincronizadas: boolean;
  aviso?: string;
}

// Helper: normaliza valores vindos do body para flags inteiras (0|1)
function flagToInt(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return 1;
  return 0;
}

async function getFuncionariosColumns(db: D1Database): Promise<Set<string>> {
  const cols = (await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>())
    .results as Array<{ name: string }>;
  return new Set(cols.map((col) => col.name));
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

async function resolveSetorPayload(
  db: D1Database,
  empresaId: number,
  body: Record<string, unknown>,
): Promise<{ setorId: number | null; setorNome: string | null }> {
  const explicitSetorId = Number(body.setor_id || 0);
  if (Number.isInteger(explicitSetorId) && explicitSetorId > 0) {
    const setor = await db
      .prepare(
        'SELECT id, nome FROM setores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(explicitSetorId, empresaId)
      .first<{ id: number; nome: string | null }>();

    if (!setor?.id) {
      badRequest('Setor informado não existe na empresa');
    }

    return { setorId: Number(setor.id), setorNome: setor.nome || null };
  }

  const setorTexto = String(body.setor || '').trim();
  if (!setorTexto) {
    return { setorId: null, setorNome: null };
  }

  const setor = await db
    .prepare(
      `SELECT id, nome
         FROM setores
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND (LOWER(TRIM(nome)) = LOWER(TRIM(?)) OR LOWER(TRIM(COALESCE(codigo, ''))) = LOWER(TRIM(?)))
        LIMIT 1`,
    )
    .bind(empresaId, setorTexto, setorTexto)
    .first<{ id: number; nome: string | null }>();

  return {
    setorId: setor?.id ? Number(setor.id) : null,
    setorNome: setor?.nome || setorTexto,
  };
}

async function sincronizarCertificacoesComStatus(
  db: D1Database,
  params: Parameters<typeof syncFuncionarioCertificacoes>[1],
): Promise<CertificacaoSyncStatus> {
  try {
    await syncFuncionarioCertificacoes(db, params);
    return { sincronizadas: true };
  } catch (syncError) {
    console.error('[Funcionarios] Erro ao sincronizar certificações:', syncError);
    return {
      sincronizadas: false,
      aviso:
        'Os dados do funcionário foram salvos, mas ICAO/CMA/ASO não puderam ser sincronizados com Qualificações. Tente salvar novamente ou acione o suporte.',
    };
  }
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
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const funcionarioColumns = await getFuncionariosColumns(db);
  const setorPayload = await resolveSetorPayload(db, empresaId, body as Record<string, unknown>);

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

  if (
    access.mode === 'restricted' &&
    !access.setorIds.includes(Number(setorPayload.setorId || 0))
  ) {
    forbidden('Gestor só pode criar funcionários nos setores vinculados', 'SETOR_FORA_DO_ESCOPO');
  }

  await assertSetorWithinOperationalScope({
    db,
    empresaId,
    userId: Number((c.get as (k: string) => unknown)('userId') || 0),
    userRole: (c.get as (k: string) => unknown)('userRole'),
    setorId: setorPayload.setorId,
  });

  // Verificar se matricula já existe no tenant (APENAS se fornecida)
  if (body.matricula) {
    const existing = await db
      .prepare(
        'SELECT id FROM funcionarios WHERE matricula = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(body.matricula, empresaId)
      .first();

    if (existing) {
      badRequest('Matrícula já cadastrada');
    }
  }

  // CPF pode existir em outro tenant; bloqueia apenas duplicidade dentro da empresa atual.
  const existingCPF = await db
    .prepare('SELECT id FROM funcionarios WHERE cpf = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(body.cpf.replace(/\D/g, ''), empresaId)
    .first();

  if (existingCPF) {
    badRequest('CPF já cadastrado nesta empresa');
  }

  const insertColumns: string[] = [];
  const insertValues: string[] = [];
  const insertBindings: unknown[] = [];
  const addInsertValue = (column: string, value: unknown) => {
    if (!funcionarioColumns.has(column)) return;
    insertColumns.push(column);
    insertValues.push('?');
    insertBindings.push(value);
  };
  const addInsertSql = (column: string, expression: string) => {
    if (!funcionarioColumns.has(column)) return;
    insertColumns.push(column);
    insertValues.push(expression);
  };

  addInsertValue('matricula', body.matricula ? sanitizeString(body.matricula) : null);
  addInsertValue('nome', body.nome ? sanitizeString(body.nome) : null);
  addInsertValue('guerra', body.guerra || null);
  addInsertValue('cpf', body.cpf ? body.cpf.replace(/\D/g, '') : null);
  addInsertValue('rg', body.rg || null);
  addInsertValue('nascimento', body.nascimento || null);
  addInsertValue('sexo', body.sexo || null);
  addInsertValue('nacionalidade', body.nacionalidade || 'Brasileira');
  addInsertValue('email', body.email ? body.email.toLowerCase() : null);
  addInsertValue('telefone', body.telefone || null);
  addInsertValue('telefone_emergencia', body.telefone_emergencia || null);
  addInsertValue('contato_emergencia_nome', body.contato_emergencia_nome || null);
  addInsertValue('funcao', body.funcao || null);
  addInsertValue('cargo', body.cargo || null);
  addInsertValue('setor', setorPayload.setorNome);
  addInsertValue('setor_id', setorPayload.setorId);
  addInsertValue('base', body.base || null);
  addInsertValue('modelo_aeronave_id', body.modelo_aeronave_id || null);
  addInsertValue('admissao', body.admissao || null);
  addInsertValue('codigo_anac', body.codigo_anac || null);
  addInsertValue('nivel_icao', body.nivel_icao || null);
  addInsertValue('data_realizacao_icao', body.data_realizacao_icao || null);
  addInsertValue('validade_icao', body.validade_icao || null);
  addInsertValue('cma', body.cma || null);
  addInsertValue('data_realizacao_cma', body.data_realizacao_cma || null);
  addInsertValue('validade_cma', body.validade_cma || null);
  addInsertValue('aso', body.aso || null);
  addInsertValue('data_realizacao_aso', body.data_realizacao_aso || null);
  addInsertValue('validade_aso', body.validade_aso || null);
  addInsertValue('sispat', body.sispat || null);
  addInsertValue('prestserv', body.prestserv || null);
  addInsertValue('cep', body.cep || null);
  addInsertValue('logradouro', body.logradouro || null);
  addInsertValue('numero', body.numero || null);
  addInsertValue('complemento', body.complemento || null);
  addInsertValue('bairro', body.bairro || null);
  addInsertValue('cidade', body.cidade || null);
  addInsertValue('estado', body.estado || null);
  addInsertValue('observacoes', body.observacoes || null);
  addInsertValue('foto_url', body.foto_url || null);
  addInsertValue('status', normalizeFuncionarioStatus(body.status));
  addInsertValue(
    'ativo',
    body.ativo !== undefined
      ? body.ativo
        ? 1
        : 0
      : normalizeFuncionarioStatus(body.status) === 'ATIVO'
        ? 1
        : 0,
  );
  addInsertValue('is_instrutor', flagToInt(body.is_instrutor));
  addInsertValue('is_checador', flagToInt(body.is_checador));
  addInsertValue('is_examinador', flagToInt(body.is_examinador));
  addInsertValue('empresa_id', empresaId);
  addInsertSql('created_at', "datetime('now')");
  addInsertSql('updated_at', "datetime('now')");

  const query = `
    INSERT INTO funcionarios (${insertColumns.join(', ')})
    VALUES (${insertValues.join(', ')})
  `;

  const result = await db
    .prepare(query)
    .bind(...insertBindings)
    .run();
  const novoId = Number(result.meta.last_row_id);

  const novoFuncionario = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ?')
    .bind(novoId, empresaId)
    .first();

  const auditoriaInfo = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'INSERT',
    registro_id: novoId,
    dados_novos: novoFuncionario,
    ...auditoriaInfo,
  });

  // Vínculo automático por e-mail: se já existe um usuário (ex.: gestor) com o
  // mesmo e-mail nesta empresa, ele passa a ser a mesma pessoa (funcionario_id).
  let vinculoUsuario: { usuario_id: number; funcionario_id: number } | null = null;
  try {
    vinculoUsuario = await vincularUsuarioAoFuncionarioPorEmail(
      db,
      empresaId,
      novoId,
      body.email,
    );
  } catch (vinculoError) {
    console.error('[Funcionarios] Erro ao vincular usuário por e-mail:', vinculoError);
  }

  const syncStatus = await sincronizarCertificacoesComStatus(db, {
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

  return c.json(
    {
      success: true,
      data: {
        id: novoId,
        certificacoes_sincronizadas: syncStatus.sincronizadas,
        usuario_vinculado: Boolean(vinculoUsuario),
        usuario_id: vinculoUsuario?.usuario_id ?? null,
      },
      message: syncStatus.aviso || 'Funcionário criado com sucesso',
      ...(syncStatus.aviso ? { warning: syncStatus.aviso } : {}),
    },
    syncStatus.sincronizadas ? 201 : 207,
  );
});

/**
 * PUT /api/funcionarios/:id
 * Atualiza funcionário existente
 *
 * RBAC: admin, manager
 */
app.put(
  '/:id',
  auth(),
  requireRole('admin', 'manager'),
  requireOperacoesFuncionario('update'),
  async (c) => {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();

    if (isNaN(id)) {
      badRequest('ID inválido');
    }

    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const funcionarioColumns = await getFuncionariosColumns(db);

    const existing = await db
      .prepare('SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaId)
      .first();

    if (!existing) {
      notFound('Funcionário não encontrado');
    }

    await assertFuncionarioInScope(db, empresaId, id, access);
    const dadosAnteriores = { ...existing };

    if (body.email && !isValidEmail(body.email)) {
      badRequest('Email inválido');
    }

    if (body.matricula) {
      const duplicateMatricula = await db
        .prepare(
          'SELECT id FROM funcionarios WHERE matricula = ? AND empresa_id = ? AND id != ? AND deleted_at IS NULL',
        )
        .bind(body.matricula, empresaId, id)
        .first();

      if (duplicateMatricula) {
        badRequest('Matrícula já cadastrada para outro funcionário');
      }
    }

    if (body.cpf) {
      const duplicateCPF = await db
        .prepare(
          'SELECT id FROM funcionarios WHERE cpf = ? AND empresa_id = ? AND id != ? AND deleted_at IS NULL',
        )
        .bind(body.cpf.replace(/\D/g, ''), empresaId, id)
        .first();

      if (duplicateCPF) {
        badRequest('CPF já cadastrado para outro funcionário nesta empresa');
      }
    }

    const updates: string[] = [];
    const bindings: unknown[] = [];
    const addUpdate = (column: string, value: unknown) => {
      if (!funcionarioColumns.has(column)) return;
      updates.push(`${column} = ?`);
      bindings.push(value);
    };

    if (body.matricula !== undefined) {
      addUpdate('matricula', body.matricula ? sanitizeString(body.matricula) : null);
    }
    if (body.nome !== undefined) {
      addUpdate('nome', body.nome ? sanitizeString(body.nome) : null);
    }
    if (body.cpf !== undefined) {
      addUpdate('cpf', body.cpf ? body.cpf.replace(/\D/g, '') : null);
    }
    if (body.email !== undefined) {
      addUpdate('email', body.email ? body.email.toLowerCase() : null);
    }
    if (body.telefone !== undefined) addUpdate('telefone', body.telefone || null);
    if (body.cargo !== undefined) addUpdate('cargo', body.cargo);

    if (body.setor !== undefined || body.setor_id !== undefined) {
      const setorPayload = await resolveSetorPayload(
        db,
        empresaId,
        body as Record<string, unknown>,
      );
      if (
        access.mode === 'restricted' &&
        !access.setorIds.includes(Number(setorPayload.setorId || 0))
      ) {
        forbidden(
          'Gestor só pode mover funcionários para setores vinculados',
          'SETOR_FORA_DO_ESCOPO',
        );
      }
      await assertSetorWithinOperationalScope({
        db,
        empresaId,
        userId: Number((c.get as (k: string) => unknown)('userId') || 0),
        userRole: (c.get as (k: string) => unknown)('userRole'),
        setorId: setorPayload.setorId,
      });
      addUpdate('setor', setorPayload.setorNome);
      addUpdate('setor_id', setorPayload.setorId);
    }

    if (body.funcao !== undefined) addUpdate('funcao', body.funcao);
    if (body.quinzena !== undefined)
      addUpdate('quinzena', normalizeFuncionarioQuinzena(body.quinzena));
    if (body.codigo_anac !== undefined) addUpdate('codigo_anac', body.codigo_anac);
    if (body.ativo !== undefined) addUpdate('ativo', body.ativo ? 1 : 0);
    if (body.is_instrutor !== undefined) addUpdate('is_instrutor', flagToInt(body.is_instrutor));
    if (body.is_checador !== undefined) addUpdate('is_checador', flagToInt(body.is_checador));
    if (body.is_examinador !== undefined) addUpdate('is_examinador', flagToInt(body.is_examinador));
    if (body.admissao !== undefined) addUpdate('admissao', body.admissao);

    if (body.status !== undefined) {
      const normalizedStatus = normalizeFuncionarioStatus(body.status);
      addUpdate('status', normalizedStatus);
      addUpdate('ativo', normalizedStatus === 'ATIVO' ? 1 : 0);
    }

    if (body.rg !== undefined) addUpdate('rg', body.rg);
    if (body.guerra !== undefined) addUpdate('guerra', body.guerra);
    if (body.nascimento !== undefined) addUpdate('nascimento', body.nascimento);
    if (body.sexo !== undefined) addUpdate('sexo', body.sexo);
    if (body.nacionalidade !== undefined) addUpdate('nacionalidade', body.nacionalidade);
    if (body.telefone_emergencia !== undefined)
      addUpdate('telefone_emergencia', body.telefone_emergencia);
    if (body.contato_emergencia_nome !== undefined) {
      addUpdate('contato_emergencia_nome', body.contato_emergencia_nome);
    }
    if (body.foto_url !== undefined) addUpdate('foto_url', body.foto_url);
    if (body.base !== undefined) addUpdate('base', body.base);

    if (body.modelo_aeronave_id !== undefined) {
      addUpdate('modelo_aeronave_id', body.modelo_aeronave_id);
      const modeloAeronave = await db
        .prepare(
          `SELECT COALESCE(modelo, codigo, nome) AS aeronave FROM modelos_aeronave WHERE id = ?`,
        )
        .bind(body.modelo_aeronave_id)
        .first<{ aeronave: string }>();
      if (modeloAeronave?.aeronave) addUpdate('aeronave', modeloAeronave.aeronave);
    }

    if (body.nivel_icao !== undefined) addUpdate('nivel_icao', body.nivel_icao);
    if (body.data_realizacao_icao !== undefined)
      addUpdate('data_realizacao_icao', body.data_realizacao_icao);
    if (body.validade_icao !== undefined) addUpdate('validade_icao', body.validade_icao);
    if (body.cma !== undefined) addUpdate('cma', body.cma);
    if (body.data_realizacao_cma !== undefined)
      addUpdate('data_realizacao_cma', body.data_realizacao_cma);
    if (body.validade_cma !== undefined) addUpdate('validade_cma', body.validade_cma);
    if (body.aso !== undefined) addUpdate('aso', body.aso);
    if (body.data_realizacao_aso !== undefined)
      addUpdate('data_realizacao_aso', body.data_realizacao_aso);
    if (body.validade_aso !== undefined) addUpdate('validade_aso', body.validade_aso);
    if (body.sispat !== undefined) addUpdate('sispat', body.sispat);
    if (body.prestserv !== undefined) addUpdate('prestserv', body.prestserv);
    if (body.cep !== undefined) addUpdate('cep', body.cep);
    if (body.logradouro !== undefined) addUpdate('logradouro', body.logradouro);
    if (body.numero !== undefined) addUpdate('numero', body.numero);
    if (body.complemento !== undefined) addUpdate('complemento', body.complemento);
    if (body.bairro !== undefined) addUpdate('bairro', body.bairro);
    if (body.cidade !== undefined) addUpdate('cidade', body.cidade);
    if (body.estado !== undefined) addUpdate('estado', body.estado);
    if (body.observacoes !== undefined) addUpdate('observacoes', body.observacoes);

    if (updates.length === 0) {
      badRequest('Nenhum campo para atualizar');
    }

    if (funcionarioColumns.has('updated_at')) {
      updates.push("updated_at = datetime('now')");
    }

    const updateResult = await db
      .prepare(
        `UPDATE funcionarios SET ${updates.join(', ')} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(...bindings, id, empresaId)
      .run();

    if ((updateResult.meta?.changes ?? 0) !== 1) {
      notFound('Funcionário não foi atualizado');
    }

    const dadosNovos = await db
      .prepare('SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ?')
      .bind(id, empresaId)
      .first();

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

    const syncStatus = await sincronizarCertificacoesComStatus(db, {
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

    return c.json(
      {
        success: true,
        data: { certificacoes_sincronizadas: syncStatus.sincronizadas },
        message: syncStatus.aviso || 'Funcionário atualizado com sucesso',
        ...(syncStatus.aviso ? { warning: syncStatus.aviso } : {}),
      },
      syncStatus.sincronizadas ? 200 : 207,
    );
  },
);

/**
 * POST /api/funcionarios/:id/reativar
 * Reativa um funcionário do tenant preservando todo o histórico.
 */
app.post('/:id/reativar', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) badRequest('ID inválido');

  const empresaId = getEmpresaId(c);
  const funcionario = await db
    .prepare(
      'SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NOT NULL',
    )
    .bind(id, empresaId)
    .first<Record<string, unknown>>();

  if (!funcionario) notFound('Funcionário inativo não encontrado');

  if (funcionario.cpf) {
    const duplicateCpf = await db
      .prepare(
        'SELECT id FROM funcionarios WHERE cpf = ? AND empresa_id = ? AND id != ? AND deleted_at IS NULL',
      )
      .bind(funcionario.cpf, empresaId, id)
      .first();
    if (duplicateCpf) badRequest('Existe outro funcionário ativo com o mesmo CPF nesta empresa');
  }

  if (funcionario.matricula) {
    const duplicateMatricula = await db
      .prepare(
        'SELECT id FROM funcionarios WHERE matricula = ? AND empresa_id = ? AND id != ? AND deleted_at IS NULL',
      )
      .bind(funcionario.matricula, empresaId, id)
      .first();
    if (duplicateMatricula) {
      badRequest('Existe outro funcionário ativo com a mesma matrícula nesta empresa');
    }
  }

  const columns = await getFuncionariosColumns(db);
  const assignments = ['deleted_at = NULL'];
  if (columns.has('status')) assignments.push("status = 'ATIVO'");
  if (columns.has('ativo')) assignments.push('ativo = 1');
  if (columns.has('updated_at')) assignments.push("updated_at = datetime('now')");

  const result = await db
    .prepare(
      `UPDATE funcionarios SET ${assignments.join(', ')} WHERE id = ? AND empresa_id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(id, empresaId)
    .run();

  if ((result.meta?.changes ?? 0) !== 1) notFound('Funcionário não foi reativado');

  const auditoriaInfo = extrairUsuarioAuditoria(c);
  const dadosNovos = await db
    .prepare('SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ?')
    .bind(id, empresaId)
    .first();
  await registrarAuditoria({
    db,
    tabela: 'funcionarios',
    acao: 'UPDATE',
    registro_id: id,
    dados_anteriores: funcionario,
    dados_novos: dadosNovos,
    ...auditoriaInfo,
  });

  try {
    await publishDomainEvent(db, 'funcionarios', 'FUNCIONARIO_REATIVADO', {
      origem_modulo: 'funcionarios',
      funcionario_id: String(id),
      empresa_id: empresaId,
    });
  } catch (error) {
    console.error('domain_event_error', error);
  }

  return c.json({ success: true, message: 'Funcionário reativado com sucesso' });
});

/**
 * DELETE /api/funcionarios/:id
 * Remove funcionário (soft delete)
 */
app.delete(
  '/:id',
  auth(),
  requireRole('admin', 'manager'),
  requireOperacoesFuncionario('delete'),
  async (c) => {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) badRequest('ID inválido');

    const empresaId = getEmpresaId(c);
    const funcionario = await db
      .prepare('SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaId)
      .first();

    if (!funcionario) notFound('Funcionário não encontrado');

    const columns = await getFuncionariosColumns(db);
    const assignments = ["deleted_at = datetime('now')"];
    if (columns.has('updated_at')) assignments.push("updated_at = datetime('now')");
    if (columns.has('status')) assignments.push("status = 'INATIVO'");
    if (columns.has('ativo')) assignments.push('ativo = 0');

    const result = await db
      .prepare(
        `UPDATE funcionarios SET ${assignments.join(', ')}
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .run();

    if ((result.meta?.changes ?? 0) === 0) notFound('Funcionário não encontrado');

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
      await publishDomainEvent(db, 'funcionarios', 'FUNCIONARIO_INATIVADO', {
        origem_modulo: 'funcionarios',
        funcionario_id: String(id),
        empresa_id: empresaId,
      });
    } catch (error) {
      console.error('domain_event_error', error);
    }

    return c.json({ success: true, message: 'Funcionário removido com sucesso' });
  },
);

// ================================================================
// INT-02: GET /api/funcionarios/:id/escalas
// Returns escalas history & active allocations for this employee
// ================================================================
app.get('/:id/escalas', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const limit = Number(c.req.query('limit') || '20');
  const offset = Number(c.req.query('offset') || '0');
  const status = c.req.query('status');

  try {
    await assertFuncionarioInScope(db, empresaId, Number(id), access);

    const func = await db
      .prepare(
        'SELECT id, nome FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first();
    if (!func) return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);

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
    const params: unknown[] = [id, id, id, id, id, empresaId];

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

    let countSql = `
      SELECT COUNT(DISTINCT em.id) AS total
      FROM escalas_mensais em
      JOIN escala_tripulacoes et ON et.escala_id = em.id AND (et.pic_id = ? OR et.sic_id = ?)
      WHERE em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
    `;
    const countParams: unknown[] = [id, id, empresaId];
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
      pagination: { total: countRow?.total ?? 0, limit, offset },
    });
  } catch {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
