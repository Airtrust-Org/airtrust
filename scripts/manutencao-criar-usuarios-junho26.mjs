#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const DEFAULT_PLAN_FILE = 'tmp/manutencao_funcionarios_update_plan_junho26.json';
const DEFAULT_EMPRESA_ID = 6;
const DEFAULT_FRONTEND_URL = 'https://airtrust.online';
const DEFAULT_PERFIL = 'ALUNO';
const APPLY_CONFIRMATION = 'YES_CREATE_MANUTENCAO_USERS';
const VALID_APPROVAL_STATUSES = new Set(['VALIDADO', 'APROVADO']);
const VALID_MATCH_TYPES = new Set(['MATCH_EXATO', 'MATCH_PROVAVEL']);
const bcryptjs = await loadBcryptjs();

async function loadBcryptjs() {
  const candidates = [
    path.resolve('node_modules/bcryptjs/index.js'),
    path.resolve('worker-airtrust/node_modules/bcryptjs/index.js'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const module = await import(pathToFileURL(candidate).href);
    return module.default ?? module;
  }

  throw new Error(
    'Nao foi possivel localizar bcryptjs em node_modules/ nem worker-airtrust/node_modules/.',
  );
}

function parseArgs(argv) {
  const options = {
    apply: false,
    target: 'local-sqlite',
    planFile: DEFAULT_PLAN_FILE,
    approvedFile: null,
    dbFile: null,
    empresaId: DEFAULT_EMPRESA_ID,
    perfil: DEFAULT_PERFIL,
    frontendUrl: DEFAULT_FRONTEND_URL,
    outputCredentials: null,
    rollbackReference: null,
    confirmApply: null,
    createdByUserId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--dry-run':
        options.apply = false;
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--target':
        options.target = next;
        index += 1;
        break;
      case '--plan-file':
        options.planFile = next;
        index += 1;
        break;
      case '--approved-file':
        options.approvedFile = next;
        index += 1;
        break;
      case '--db-file':
        options.dbFile = next;
        index += 1;
        break;
      case '--empresa-id':
        options.empresaId = Number(next);
        index += 1;
        break;
      case '--perfil':
        options.perfil = String(next || DEFAULT_PERFIL).trim().toUpperCase();
        index += 1;
        break;
      case '--frontend-url':
        options.frontendUrl = next;
        index += 1;
        break;
      case '--output-credentials':
        options.outputCredentials = next;
        index += 1;
        break;
      case '--rollback-reference':
        options.rollbackReference = next;
        index += 1;
        break;
      case '--confirm-apply':
        options.confirmApply = next;
        index += 1;
        break;
      case '--created-by-user-id':
        options.createdByUserId = next == null ? null : Number(next);
        index += 1;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Argumento nao suportado: ${arg}`);
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/manutencao-criar-usuarios-junho26.mjs --dry-run --db-file <arquivo.sqlite>
  node scripts/manutencao-criar-usuarios-junho26.mjs --apply --target local-sqlite --db-file <arquivo.sqlite> --approved-file <arquivo.json> --rollback-reference <nota> --confirm-apply ${APPLY_CONFIRMATION}

Opcoes principais:
  --dry-run                     Nao escreve nada (default).
  --apply                       Executa escrita protegida.
  --target <alvo>               Hoje so aceita local-sqlite para apply.
  --plan-file <arquivo>         Plano reconciliado JSON (default: ${DEFAULT_PLAN_FILE}).
  --approved-file <arquivo>     Lista final validada (JSON ou CSV) com source_row + funcionario_id.
  --db-file <arquivo.sqlite>    Banco local para validacao ou apply.
  --empresa-id <id>             Empresa alvo (default: ${DEFAULT_EMPRESA_ID}).
  --perfil <perfil>             Perfil do usuario (default: ${DEFAULT_PERFIL}).
  --output-credentials <csv>    Arquivo sensivel em tmp/ para invite_link ou senha temporaria.
  --rollback-reference <texto>  Referencia de snapshot/rollback exigida em apply.
  --confirm-apply <token>       Confirmacao explicita obrigatoria em apply.
  --created-by-user-id <id>     Opcional para convites_usuarios.created_by.
`.trim());
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function ensureFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} nao encontrado: ${filePath || '(vazio)'}`);
  }
}

function ensureTmpOutputPath(outputPath) {
  if (!outputPath) return;
  const resolvedOutputPath = path.resolve(outputPath);
  const resolvedTmpDir = path.resolve('tmp');
  if (
    resolvedOutputPath !== resolvedTmpDir &&
    !resolvedOutputPath.startsWith(`${resolvedTmpDir}${path.sep}`)
  ) {
    throw new Error('--output-credentials so pode apontar para tmp/ ou subpastas gitignored.');
  }
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((item) => item.trim());
    return headers.reduce((accumulator, header, index) => {
      accumulator[header] = values[index] ?? '';
      return accumulator;
    }, {});
  });
}

function loadApprovedRows(filePath) {
  if (!filePath) {
    return new Map();
  }

  ensureFileExists(filePath, 'Arquivo de aprovacao');

  const extension = path.extname(filePath).toLowerCase();
  const rows = extension === '.csv' ? parseCsv(filePath) : readJsonFile(filePath);
  if (!Array.isArray(rows)) {
    throw new Error('Arquivo de aprovacao deve conter um array JSON ou linhas CSV.');
  }

  const approvedBySourceRow = new Map();

  for (const rawRow of rows) {
    const sourceRow = Number(rawRow.source_row ?? rawRow.sourceRow);
    if (!Number.isInteger(sourceRow) || sourceRow <= 0) {
      throw new Error('Cada aprovacao precisa de source_row valido.');
    }

    approvedBySourceRow.set(sourceRow, {
      sourceRow,
      funcionarioId: Number(rawRow.funcionario_id ?? rawRow.funcionarioId ?? 0) || null,
      empresaId: Number(rawRow.empresa_id ?? rawRow.empresaId ?? 0) || null,
      email: String(rawRow.email || '').trim() || null,
      approvalStatus: String(
        rawRow.approval_status ??
          rawRow.approvalStatus ??
          rawRow.validation_status ??
          rawRow.validationStatus ??
          'PENDENTE',
      )
        .trim()
        .toUpperCase(),
      notes: String(rawRow.notes || rawRow.observacao || '').trim() || null,
    });
  }

  return approvedBySourceRow;
}

function groupPlanRows(rawPlanRows) {
  if (!Array.isArray(rawPlanRows)) {
    throw new Error('Plano reconciliado invalido: esperado array JSON.');
  }

  const uniqueRows = new Map();

  for (const row of rawPlanRows) {
    const sourceRow = Number(row.source_row);
    if (!Number.isInteger(sourceRow) || sourceRow <= 0) continue;

    if (!uniqueRows.has(sourceRow)) {
      uniqueRows.set(sourceRow, {
        sourceRow,
        nome: String(row.nome_planilha || '').trim(),
        email: String(row.email_planilha || '').trim(),
        matricula: String(row.matricula_planilha || '').trim(),
        funcionarioIdAirtrust:
          row.funcionario_id_airtrust == null ? null : Number(row.funcionario_id_airtrust),
        matchType: String(row.match_type || '').trim().toUpperCase(),
        confidence: Number(row.confidence || 0),
        requiresManualValidation: Boolean(row.requer_validacao_manual),
        action: String(row.acao_proposta || '').trim().toUpperCase(),
        risk: String(row.risco || '').trim().toUpperCase(),
        reason: String(row.motivo || '').trim(),
      });
    }
  }

  return Array.from(uniqueRows.values()).sort((left, right) => left.sourceRow - right.sourceRow);
}

function csvEscape(value) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

function inviteExpiresAt() {
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return expiresAt.toISOString().replace('T', ' ').slice(0, 19);
}

function generateTemporaryPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

function summarizeByReason(rows) {
  return rows.reduce((accumulator, row) => {
    accumulator[row.reasonCode] = (accumulator[row.reasonCode] || 0) + 1;
    return accumulator;
  }, {});
}

function printSummary(title, rows) {
  console.log(`\n${title}: ${rows.length}`);
  const grouped = summarizeByReason(rows);
  for (const [reasonCode, count] of Object.entries(grouped).sort((left, right) => {
    return right[1] - left[1] || left[0].localeCompare(right[0]);
  })) {
    console.log(`  - ${reasonCode}: ${count}`);
  }
}

class MaintenanceUserPlanner {
  constructor(dbFilePath) {
    this.db = dbFilePath ? new DatabaseSync(dbFilePath) : null;
    this.schema = this.db ? this.inspectSchema() : null;
  }

  close() {
    this.db?.close();
  }

  inspectSchema() {
    const tableNames = new Set(
      this.db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all()
        .map((row) => String(row.name)),
    );

    const usuariosColumns = tableNames.has('usuarios')
      ? this.db.prepare(`PRAGMA table_info('usuarios')`).all()
      : [];
    const funcionariosColumns = tableNames.has('funcionarios')
      ? this.db.prepare(`PRAGMA table_info('funcionarios')`).all()
      : [];
    const usuariosEmpresasColumns = tableNames.has('usuarios_empresas')
      ? this.db.prepare(`PRAGMA table_info('usuarios_empresas')`).all()
      : [];
    const convitesColumns = tableNames.has('convites_usuarios')
      ? this.db.prepare(`PRAGMA table_info('convites_usuarios')`).all()
      : [];

    const usuariosColumnNames = new Set(usuariosColumns.map((column) => String(column.name)));
    const funcionariosColumnNames = new Set(
      funcionariosColumns.map((column) => String(column.name)),
    );
    const usuariosEmpresasColumnNames = new Set(
      usuariosEmpresasColumns.map((column) => String(column.name)),
    );
    const convitesColumnNames = new Set(convitesColumns.map((column) => String(column.name)));

    return {
      hasUsuariosTable: tableNames.has('usuarios'),
      hasFuncionariosTable: tableNames.has('funcionarios'),
      hasUsuariosEmpresasTable: tableNames.has('usuarios_empresas'),
      hasConvitesTable: tableNames.has('convites_usuarios'),
      usuariosPasswordColumn: usuariosColumnNames.has('password_hash')
        ? 'password_hash'
        : usuariosColumnNames.has('senha_hash')
          ? 'senha_hash'
          : null,
      usuariosProfileColumn: usuariosColumnNames.has('perfil')
        ? 'perfil'
        : usuariosColumnNames.has('role')
          ? 'role'
          : null,
      usuariosActiveColumn: usuariosColumnNames.has('active')
        ? 'active'
        : usuariosColumnNames.has('ativo')
          ? 'ativo'
          : null,
      usuariosHasDeletedAt: usuariosColumnNames.has('deleted_at'),
      funcionariosHasDeletedAt: funcionariosColumnNames.has('deleted_at'),
      funcionariosActiveColumn: funcionariosColumnNames.has('ativo')
        ? 'ativo'
        : funcionariosColumnNames.has('active')
          ? 'active'
          : null,
      usuariosEmpresasHasCreatedAt: usuariosEmpresasColumnNames.has('created_at'),
      convitesHasCreatedBy: convitesColumnNames.has('created_by'),
    };
  }

  evaluateCandidates({ groupedPlanRows, approvedBySourceRow, empresaId, perfil }) {
    const actionable = [];
    const ignored = [];
    const conflicts = [];
    const existing = [];

    for (const planRow of groupedPlanRows) {
      const approvedRow = approvedBySourceRow.get(planRow.sourceRow) || null;
      const candidateEmail = normalizeEmail(approvedRow?.email || planRow.email);

      const evaluation = {
        sourceRow: planRow.sourceRow,
        nome: planRow.nome,
        email: candidateEmail,
        funcionarioId: approvedRow?.funcionarioId || planRow.funcionarioIdAirtrust || null,
        empresaId,
        perfil,
        matchType: planRow.matchType,
        status: 'ignored',
        reasonCode: 'SEM_APROVACAO_VALIDADA',
        reason: 'Linha nao consta em lista final validada.',
        mode: 'none',
        userId: null,
      };

      if (!approvedRow) {
        ignored.push(evaluation);
        continue;
      }

      if (!VALID_APPROVAL_STATUSES.has(approvedRow.approvalStatus)) {
        evaluation.reasonCode = 'APROVACAO_NAO_VALIDADA';
        evaluation.reason = 'Aprovacao manual nao esta com status VALIDADO/APROVADO.';
        ignored.push(evaluation);
        continue;
      }

      if (!VALID_MATCH_TYPES.has(planRow.matchType)) {
        evaluation.reasonCode = `MATCH_${planRow.matchType || 'INVALIDO'}`;
        evaluation.reason = 'Somente MATCH_EXATO ou MATCH_PROVAVEL podem prosseguir.';
        ignored.push(evaluation);
        continue;
      }

      if (!approvedRow.funcionarioId) {
        evaluation.reasonCode = 'FUNCIONARIO_ID_AUSENTE';
        evaluation.reason = 'Lista validada precisa informar funcionario_id final.';
        ignored.push(evaluation);
        continue;
      }

      if (approvedRow.empresaId && approvedRow.empresaId !== empresaId) {
        evaluation.reasonCode = 'EMPRESA_ID_DIVERGENTE';
        evaluation.reason = 'Aprovacao aponta para empresa_id diferente do alvo.';
        conflicts.push(evaluation);
        continue;
      }

      if (!isValidEmail(candidateEmail)) {
        evaluation.reasonCode = 'EMAIL_INVALIDO';
        evaluation.reason = 'Email inexistente ou invalido para login.';
        ignored.push(evaluation);
        continue;
      }

      if (!this.db) {
        evaluation.reasonCode = 'SEM_DB_PARA_VALIDACAO';
        evaluation.reason = 'Dry-run sem banco local declarado nao pode validar duplicidades.';
        ignored.push(evaluation);
        continue;
      }

      const checked = this.validateAgainstDatabase({
        evaluation,
        approvedRow,
        candidateEmail,
        empresaId,
      });

      if (checked.status === 'ready') {
        actionable.push(checked);
        continue;
      }

      if (checked.status === 'existing') {
        existing.push(checked);
        continue;
      }

      if (checked.status === 'conflict') {
        conflicts.push(checked);
        continue;
      }

      ignored.push(checked);
    }

    return { actionable, ignored, conflicts, existing };
  }

  validateAgainstDatabase({ evaluation, candidateEmail, empresaId }) {
    const schema = this.schema;

    if (!schema?.hasUsuariosTable || !schema.hasFuncionariosTable || !schema.hasUsuariosEmpresasTable) {
      return {
        ...evaluation,
        status: 'conflict',
        reasonCode: 'SCHEMA_INCOMPLETO',
        reason: 'Banco local nao possui usuarios, funcionarios e usuarios_empresas em conjunto.',
      };
    }

    const employeeWhere = [
      'id = ?',
      'empresa_id = ?',
      schema.funcionariosHasDeletedAt ? 'deleted_at IS NULL' : null,
      schema.funcionariosActiveColumn ? `${schema.funcionariosActiveColumn} = 1` : null,
    ]
      .filter(Boolean)
      .join(' AND ');

    const employee = this.db
      .prepare(
        `SELECT id, nome, email, empresa_id
         FROM funcionarios
         WHERE ${employeeWhere}
         LIMIT 1`,
      )
      .get(evaluation.funcionarioId, empresaId);

    if (!employee) {
      return {
        ...evaluation,
        status: 'conflict',
        reasonCode: 'FUNCIONARIO_NAO_ENCONTRADO',
        reason: 'funcionario_id aprovado nao existe como ativo no tenant alvo.',
      };
    }

    const employeeEmail = normalizeEmail(employee.email);
    if (employeeEmail && employeeEmail !== candidateEmail) {
      return {
        ...evaluation,
        status: 'conflict',
        reasonCode: 'EMAIL_FUNCIONARIO_DIVERGENTE',
        reason: 'Email aprovado diverge do email ja cadastrado no funcionario.',
      };
    }

    const userWhereBase = [schema.usuariosHasDeletedAt ? 'deleted_at IS NULL' : null]
      .filter(Boolean)
      .join(' AND ');
    const userWherePrefix = userWhereBase ? `${userWhereBase} AND ` : '';

    const existingByEmail = this.db
      .prepare(
        `SELECT id, email, funcionario_id
         FROM usuarios
         WHERE ${userWherePrefix}LOWER(email) = LOWER(?)
         LIMIT 1`,
      )
      .get(candidateEmail);

    const existingByFuncionario = this.db
      .prepare(
        `SELECT id, email, funcionario_id
         FROM usuarios
         WHERE ${userWherePrefix}funcionario_id = ?
         LIMIT 1`,
      )
      .get(evaluation.funcionarioId);

    if (existingByEmail && existingByEmail.funcionario_id && existingByEmail.funcionario_id !== evaluation.funcionarioId) {
      return {
        ...evaluation,
        status: 'conflict',
        reasonCode: 'EMAIL_JA_USADO_POR_OUTRO_FUNCIONARIO',
        reason: 'Ja existe usuario com este email vinculado a outro funcionario.',
      };
    }

    if (
      existingByFuncionario &&
      normalizeEmail(existingByFuncionario.email) !== candidateEmail
    ) {
      return {
        ...evaluation,
        status: 'conflict',
        reasonCode: 'FUNCIONARIO_JA_TEM_OUTRO_EMAIL',
        reason: 'Ja existe usuario para este funcionario com email diferente.',
      };
    }

    const existingUserId = existingByFuncionario?.id || existingByEmail?.id || null;
    if (!existingUserId) {
      return {
        ...evaluation,
        status: 'ready',
        reasonCode: 'CRIAR_USUARIO',
        reason: 'Criacao elegivel apos validacao local.',
        mode: 'create_user',
      };
    }

    const tenantLink = this.db
      .prepare(
        `SELECT usuario_id, empresa_id
         FROM usuarios_empresas
         WHERE usuario_id = ?
           AND empresa_id = ?
         LIMIT 1`,
      )
      .get(existingUserId, empresaId);

    if (tenantLink) {
      return {
        ...evaluation,
        status: 'existing',
        reasonCode: 'USUARIO_JA_EXISTE',
        reason: 'Usuario e vinculo de tenant ja existem.',
        mode: 'none',
        userId: existingUserId,
      };
    }

    return {
      ...evaluation,
      status: 'ready',
      reasonCode: 'CRIAR_VINCULO_EMPRESA',
      reason: 'Usuario existe, mas falta vinculo em usuarios_empresas.',
      mode: 'create_link_only',
      userId: existingUserId,
    };
  }

  applyChanges({ actionable, options }) {
    if (!this.db || !this.schema) {
      throw new Error('Apply requer banco local aberto.');
    }

    if (options.target !== 'local-sqlite') {
      throw new Error('Apply bloqueado fora de local-sqlite. Produção/staging exigem autorizacao operacional separada.');
    }

    if (options.confirmApply !== APPLY_CONFIRMATION) {
      throw new Error(`Apply exige --confirm-apply ${APPLY_CONFIRMATION}`);
    }

    if (!options.rollbackReference) {
      throw new Error('Apply exige --rollback-reference com snapshot ou plano de rollback.');
    }

    ensureTmpOutputPath(options.outputCredentials);

    const sensitiveOutputRows = [];
    const results = [];

    this.db.exec('BEGIN IMMEDIATE');

    try {
      for (const row of actionable) {
        if (row.mode === 'create_link_only') {
          this.createTenantLink({
            userId: row.userId,
            empresaId: row.empresaId,
            perfil: row.perfil,
          });

          results.push({
            ...row,
            status: 'applied',
            reasonCode: 'VINCULO_CRIADO',
            reason: 'Vinculo usuarios_empresas criado com sucesso.',
          });
          continue;
        }

        const created = this.createUserWithSecureBootstrap(row, options);
        results.push({
          ...row,
          status: 'applied',
          reasonCode: created.bootstrapMode === 'invite' ? 'USUARIO_CRIADO_COM_CONVITE' : 'USUARIO_CRIADO_COM_SENHA_TEMPORARIA',
          reason: created.bootstrapMode === 'invite'
            ? 'Usuario criado com convite pendente.'
            : 'Usuario criado com senha temporaria local.',
          userId: created.userId,
        });

        if (created.sensitiveOutputRow) {
          sensitiveOutputRows.push(created.sensitiveOutputRow);
        }
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    if (options.outputCredentials && sensitiveOutputRows.length > 0) {
      this.writeSensitiveOutput(options.outputCredentials, sensitiveOutputRows);
    }

    return results;
  }

  createTenantLink({ userId, empresaId, perfil }) {
    const sql = this.schema.usuariosEmpresasHasCreatedAt
      ? `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role, created_at)
         VALUES (?, ?, 1, ?, datetime('now'))`
      : `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role)
         VALUES (?, ?, 1, ?)`;
    this.db.prepare(sql).run(userId, empresaId, perfil);
  }

  createUserWithSecureBootstrap(row, options) {
    const passwordColumn = this.schema.usuariosPasswordColumn;
    const profileColumn = this.schema.usuariosProfileColumn;
    const activeColumn = this.schema.usuariosActiveColumn;

    if (!passwordColumn || !profileColumn) {
      throw new Error('Schema de usuarios nao possui colunas compativeis para password/profile.');
    }

    let bootstrapMode = 'invite';
    let passwordValue = `INVITE_PENDING_${crypto.randomUUID()}`;
    let activeValue = 0;
    let sensitiveOutputRow = null;

    if (!this.schema.hasConvitesTable) {
      if (!options.outputCredentials) {
        throw new Error(
          'Schema sem convites_usuarios exige --output-credentials em tmp/ para senha temporaria local.',
        );
      }

      bootstrapMode = 'password';
      const temporaryPassword = generateTemporaryPassword();
      passwordValue = bcryptjs.hashSync(temporaryPassword, bcryptjs.genSaltSync(10));
      activeValue = 1;
      sensitiveOutputRow = {
        source_row: row.sourceRow,
        nome: row.nome,
        email: row.email,
        funcionario_id: row.funcionarioId,
        bootstrap_mode: 'temporary_password',
        temporary_password: temporaryPassword,
      };
    }

    const columns = ['email', passwordColumn, 'nome', profileColumn, 'funcionario_id'];
    const placeholders = ['?', '?', '?', '?', '?'];
    const values = [row.email, passwordValue, row.nome, row.perfil, row.funcionarioId];

    if (activeColumn) {
      columns.push(activeColumn);
      placeholders.push('?');
      values.push(activeValue);
    }

    columns.push('created_at', 'updated_at');
    placeholders.push(`datetime('now')`, `datetime('now')`);

    const insertSql = `INSERT INTO usuarios (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const insertResult = this.db.prepare(insertSql).run(...values);
    const userId = Number(insertResult.lastInsertRowid);

    if (!userId) {
      throw new Error(`Falha ao criar usuario para ${row.email}`);
    }

    this.createTenantLink({ userId, empresaId: row.empresaId, perfil: row.perfil });

    if (bootstrapMode === 'invite') {
      const inviteToken = generateInviteToken();
      const expiresAt = inviteExpiresAt();
      const inviteLink = `${options.frontendUrl.replace(/\/+$/, '')}/aceitar-convite?token=${encodeURIComponent(inviteToken)}`;

      const convitesSql = this.schema.convitesHasCreatedBy
        ? `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, created_by, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`;

      const inviteParams = this.schema.convitesHasCreatedBy
        ? [inviteToken, userId, row.empresaId, row.email, row.perfil, options.createdByUserId, expiresAt]
        : [inviteToken, userId, row.empresaId, row.email, row.perfil, expiresAt];

      this.db.prepare(convitesSql).run(...inviteParams);

      if (options.outputCredentials) {
        sensitiveOutputRow = {
          source_row: row.sourceRow,
          nome: row.nome,
          email: row.email,
          funcionario_id: row.funcionarioId,
          bootstrap_mode: 'invite_link',
          invite_link: inviteLink,
          invite_expires_at: expiresAt,
        };
      }
    }

    return { userId, bootstrapMode, sensitiveOutputRow };
  }

  writeSensitiveOutput(outputPath, rows) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const headers = Object.keys(rows[0]);
    const content = [headers.join(',')]
      .concat(rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')))
      .join('\n');
    fs.writeFileSync(outputPath, content, { mode: 0o600 });
    fs.chmodSync(outputPath, 0o600);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureFileExists(options.planFile, 'Plano reconciliado');
  ensureTmpOutputPath(options.outputCredentials);

  const rawPlanRows = readJsonFile(options.planFile);
  const groupedPlanRows = groupPlanRows(rawPlanRows);
  const approvedBySourceRow = loadApprovedRows(options.approvedFile);

  if (options.apply && !options.dbFile) {
    throw new Error('Apply exige --db-file apontando para snapshot/banco local.');
  }

  if (options.dbFile) {
    ensureFileExists(options.dbFile, 'Banco local');
  }

  const planner = new MaintenanceUserPlanner(options.dbFile);

  try {
    const evaluation = planner.evaluateCandidates({
      groupedPlanRows,
      approvedBySourceRow,
      empresaId: options.empresaId,
      perfil: options.perfil,
    });

    console.log('AirTrust manutencao usuarios junho26');
    console.log(`Modo: ${options.apply ? 'apply' : 'dry-run'}`);
    console.log(`Target: ${options.target}`);
    console.log(`Empresa alvo: ${options.empresaId}`);
    console.log(`Plano: ${options.planFile}`);
    console.log(`Aprovacoes: ${options.approvedFile || '(nenhuma)'}`);
    console.log(`Banco local: ${options.dbFile || '(nao informado)'}`);
    console.log(`Total de linhas unicas avaliadas: ${groupedPlanRows.length}`);

    printSummary('Elegiveis para escrita', evaluation.actionable);
    printSummary('Ja existentes / idempotentes', evaluation.existing);
    printSummary('Ignorados', evaluation.ignored);
    printSummary('Conflitos', evaluation.conflicts);

    let appliedResults = [];
    if (options.apply) {
      appliedResults = planner.applyChanges({
        actionable: evaluation.actionable,
        options,
      });
      printSummary('Aplicados', appliedResults);
    }

    console.log('\nResumo final');
    console.log(`  - criados_ou_vinculados: ${appliedResults.length}`);
    console.log(`  - elegiveis_no_dry_run: ${evaluation.actionable.length}`);
    console.log(`  - ja_existentes: ${evaluation.existing.length}`);
    console.log(`  - ignorados: ${evaluation.ignored.length}`);
    console.log(`  - conflitos: ${evaluation.conflicts.length}`);

    if (options.outputCredentials) {
      console.log(`  - arquivo_sensivel: ${options.outputCredentials}`);
    }
  } finally {
    planner.close();
  }
}

try {
  main();
} catch (error) {
  console.error(`ERRO: ${error.message}`);
  process.exit(1);
}
