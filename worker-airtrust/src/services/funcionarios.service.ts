import { z } from 'zod';
// D1Database is globally available via @cloudflare/workers-types

// Zod schema completo (campos opcionais permitem updates parciais)
export const FuncionarioSchema = z.object({
  id: z.number().optional(),
  nome: z.string().min(3),
  guerra: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  matricula: z.string().min(3).nullable().optional(),
  cpf: z
    .string()
    .regex(/^[0-9]{11}$/)
    .nullable()
    .optional(),
  cargo: z.string().nullable().optional(),
  funcao: z.string().nullable().optional(),
  setor: z.string().nullable().optional(),
  departamento: z.string().nullable().optional(),
  base: z.string().nullable().optional(),
  aeronave: z.string().nullable().optional(),
  escala: z.string().nullable().optional(),
  status: z
    .preprocess(
      (value) =>
        typeof value === 'string' && value.trim().toUpperCase() === 'DESLIGADO' ? 'INATIVO' : value,
      z.enum(['ATIVO', 'INATIVO', 'AFASTADO']).default('ATIVO'),
    )
    .optional(),
  ativo: z.number().min(0).max(1).default(1).optional(),
  is_instrutor: z.number().min(0).max(1).default(0).optional(),
  is_checador: z.number().min(0).max(1).default(0).optional(),
  rg: z.string().nullable().optional(),
  nascimento: z.string().nullable().optional(),
  sexo: z.string().nullable().optional(),
  nacionalidade: z.string().nullable().optional(),
  codigo_anac: z.string().nullable().optional(),
  nivel_icao: z.string().nullable().optional(),
  validade_icao: z.string().nullable().optional(),
  cma: z.string().nullable().optional(),
  validade_cma: z.string().nullable().optional(),
  aso: z.string().nullable().optional(),
  validade_aso: z.string().nullable().optional(),
  sispat: z.string().nullable().optional(),
  prestserv: z.string().nullable().optional(),
  endereco: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  complemento: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  telefone_emergencia: z.string().nullable().optional(),
  contato_emergencia_nome: z.string().nullable().optional(),
  admissao: z.string().nullable().optional(),
  foto_url: z.string().url().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  deleted_at: z.string().nullable().optional(),
});

export type Funcionario = z.infer<typeof FuncionarioSchema>;

export class FuncionariosService {
  private sessoesSchema:
    | { hasAluno: boolean; hasInstrutor: boolean; hasChecador: boolean }
    | null
    | undefined;

  constructor(private db: D1Database) {}

  private async getSessoesSchema() {
    if (this.sessoesSchema !== undefined) {
      return this.sessoesSchema;
    }

    try {
      const pragma = await this.db.prepare('PRAGMA table_info(sessoes)').all();
      const cols = new Set((pragma.results || []).map((column: any) => column.name));
      this.sessoesSchema = {
        hasAluno: cols.has('aluno_id'),
        hasInstrutor: cols.has('instrutor_id'),
        hasChecador: cols.has('checador_id'),
      };
    } catch {
      this.sessoesSchema = null;
    }

    return this.sessoesSchema;
  }

  private async buscarSessoesRelacionadas(id: number) {
    const schema = await this.getSessoesSchema();
    if (!schema || (!schema.hasAluno && !schema.hasInstrutor && !schema.hasChecador)) {
      return { results: [] };
    }

    const whereParts: string[] = [];
    const bindIds: number[] = [];
    if (schema.hasAluno) {
      whereParts.push('aluno_id = ?');
      bindIds.push(id);
    }
    if (schema.hasInstrutor) {
      whereParts.push('instrutor_id = ?');
      bindIds.push(id);
    }
    if (schema.hasChecador) {
      whereParts.push('checador_id = ?');
      bindIds.push(id);
    }

    const query = `SELECT id, simulador_id, aluno_id, instrutor_id, checador_id, data_sessao, status, tipo_sessao, duracao_minutos, created_at, updated_at
                   FROM sessoes
                   WHERE (${whereParts.join(' OR ')}) AND deleted_at IS NULL
                   ORDER BY data_sessao DESC LIMIT 10`;

    return this.db
      .prepare(query)
      .bind(...bindIds)
      .all();
  }

  async listar(params?: {
    status?: string;
    setor?: string;
    cargo?: string;
    base?: string;
    is_instrutor?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { status, setor, cargo, base, is_instrutor, page = 1, limit = 50 } = params || {};
    const offset = (page - 1) * limit;
    let where = 'deleted_at IS NULL';
    const bindings: unknown[] = [];

    if (status) {
      where += ' AND status = ?';
      bindings.push(status);
    }
    if (setor) {
      where += ' AND setor = ?';
      bindings.push(setor);
    }
    if (cargo) {
      where += ' AND cargo = ?';
      bindings.push(cargo);
    }
    if (base) {
      where += ' AND base = ?';
      bindings.push(base);
    }
    if (is_instrutor !== undefined) {
      where += ' AND is_instrutor = ?';
      bindings.push(is_instrutor ? 1 : 0);
    }

    const query = `SELECT * FROM funcionarios WHERE ${where} ORDER BY nome LIMIT ? OFFSET ?`;
    const result = await this.db
      .prepare(query)
      .bind(...bindings, limit, offset)
      .all();

    const countQuery = `SELECT COUNT(*) as total FROM funcionarios WHERE ${where}`;
    const count = await this.db
      .prepare(countQuery)
      .bind(...bindings)
      .first<{ total: number }>();

    return {
      data: result.results,
      meta: {
        page,
        limit,
        total: count?.total || 0,
        totalPages: Math.ceil((count?.total || 0) / limit),
      },
    };
  }

  async buscarPorId(id: number) {
    return await this.db
      .prepare('SELECT * FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();
  }

  async buscarComDependencias(id: number) {
    const funcionario = await this.buscarPorId(id);
    if (!funcionario) return null;
    const [qualificacoes, sessoes, hospedagens, frms] = await Promise.all([
      this.db
        .prepare(
          'SELECT * FROM qualificacoes_historico WHERE funcionario_id = ? AND deleted_at IS NULL ORDER BY data_vencimento DESC',
        )
        .bind(id)
        .all(),
      this.buscarSessoesRelacionadas(id),
      this.db
        .prepare(
          'SELECT id, hotel, quarto, data_checkin, data_checkout, status, valor, created_at FROM hospedagens WHERE funcionario_id = ? AND deleted_at IS NULL ORDER BY data_checkin DESC LIMIT 10',
        )
        .bind(id)
        .all(),
      this.db
        .prepare(
          'SELECT id, data_registro, horas_sono, nivel_fadiga, apto_voo, observacoes, created_at FROM registros_frms WHERE funcionario_id = ? AND deleted_at IS NULL ORDER BY data_registro DESC LIMIT 10',
        )
        .bind(id)
        .all(),
    ]);

    return {
      ...funcionario,
      qualificacoes: qualificacoes.results,
      sessoes_simulador: sessoes.results,
      hospedagens: hospedagens.results,
      registros_frms: frms.results,
    };
  }

  async criar(data: Omit<Funcionario, 'id'>) {
    const validated = FuncionarioSchema.omit({ id: true }).parse(data);
    const fields = Object.keys(validated);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map((f) => (validated as any)[f]);
    const sql = `INSERT INTO funcionarios (${fields.join(
      ', ',
    )}) VALUES (${placeholders}) RETURNING *`;
    return await this.db
      .prepare(sql)
      .bind(...values)
      .first();
  }

  async atualizar(id: number, data: Partial<Funcionario>) {
    const existing = await this.buscarPorId(id);
    if (!existing) throw new Error('Funcionário não encontrado');
    const validated = FuncionarioSchema.partial().parse(data);
    const fields = Object.keys(validated).filter((f) => f !== 'id');
    if (!fields.length) return existing;
    const setClause = fields.map((f) => `${f} = ?`).join(', ') + ', updated_at = datetime("now")';
    const values = fields.map((f) => (validated as any)[f]);
    const sql = `UPDATE funcionarios SET ${setClause} WHERE id = ? AND deleted_at IS NULL RETURNING *`;
    return await this.db
      .prepare(sql)
      .bind(...values, id)
      .first();
  }

  async softDelete(id: number) {
    const existing = await this.buscarPorId(id);
    if (!existing) throw new Error('Funcionário não encontrado');
    const deps = await this.verificarDependencias(id);
    if (deps.bloquear) throw new Error(`Não é possível excluir: ${deps.motivo}`);
    // Soft delete do funcionário
    const deleted = await this.db
      .prepare(
        'UPDATE funcionarios SET deleted_at = datetime("now"), updated_at = datetime("now") WHERE id = ? AND deleted_at IS NULL RETURNING *',
      )
      .bind(id)
      .first();
    if (!deleted) return null;
    // Cascata manual (tolerante a schema divergente)
    await this.db
      .prepare(
        'UPDATE qualificacoes_historico SET deleted_at = datetime("now") WHERE funcionario_id = ? AND deleted_at IS NULL',
      )
      .bind(id)
      .run();
    await this.db
      .prepare(
        'UPDATE hospedagens SET deleted_at = datetime("now") WHERE funcionario_id = ? AND deleted_at IS NULL',
      )
      .bind(id)
      .run();
    await this.db
      .prepare(
        'UPDATE registros_frms SET deleted_at = datetime("now") WHERE funcionario_id = ? AND deleted_at IS NULL',
      )
      .bind(id)
      .run();
    // Sessoes simulador (se estrutura tiver colunas de relação)
    try {
      const pragma = await this.db.prepare('PRAGMA table_info(sessoes)').all();
      const cols = new Set((pragma.results || []).map((c: any) => c.name));
      const whereParts: string[] = [];
      const bindIds: number[] = [];
      if (cols.has('aluno_id')) {
        whereParts.push('aluno_id = ?');
        bindIds.push(id);
      }
      if (cols.has('instrutor_id')) {
        whereParts.push('instrutor_id = ?');
        bindIds.push(id);
      }
      if (cols.has('checador_id')) {
        whereParts.push('checador_id = ?');
        bindIds.push(id);
      }
      if (whereParts.length) {
        const sessSql = `UPDATE sessoes SET deleted_at = datetime('now') WHERE (${whereParts.join(
          ' OR ',
        )}) AND deleted_at IS NULL`;
        await this.db
          .prepare(sessSql)
          .bind(...bindIds)
          .run();
      }
    } catch {
      // ignorar
    }
    // Auditoria
    try {
      await this.db
        .prepare(
          "INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem, created_at) VALUES ('funcionarios', ?, 'SOFT_DELETE', 'service', datetime('now'))",
        )
        .bind(id)
        .run();
    } catch {
      // ignorar falha de auditoria
    }
    return deleted;
  }

  async verificarDependencias(id: number) {
    const qualificacoes = await this.db
      .prepare(
        'SELECT COUNT(*) as total FROM qualificacoes_historico WHERE funcionario_id = ? AND deleted_at IS NULL',
      )
      .bind(id)
      .first<{ total: number }>();
    const hospedagens = await this.db
      .prepare(
        "SELECT COUNT(*) as total FROM hospedagens WHERE funcionario_id = ? AND status IN ('reservado','confirmado') AND deleted_at IS NULL",
      )
      .bind(id)
      .first<{ total: number }>();
    // Sessoes simulador (aluno/instrutor/checador)
    let sessoesTotal = 0;
    try {
      const pragma = await this.db.prepare('PRAGMA table_info(sessoes)').all();
      const cols = new Set((pragma.results || []).map((c: any) => c.name));
      const whereParts: string[] = [];
      const bindIds: number[] = [];
      if (cols.has('aluno_id')) {
        whereParts.push('aluno_id = ?');
        bindIds.push(id);
      }
      if (cols.has('instrutor_id')) {
        whereParts.push('instrutor_id = ?');
        bindIds.push(id);
      }
      if (cols.has('checador_id')) {
        whereParts.push('checador_id = ?');
        bindIds.push(id);
      }
      if (whereParts.length) {
        const sql = `SELECT COUNT(*) as total FROM sessoes WHERE (${whereParts.join(
          ' OR ',
        )}) AND deleted_at IS NULL`;
        const row = await this.db
          .prepare(sql)
          .bind(...bindIds)
          .first<{ total: number }>();
        sessoesTotal = row?.total || 0;
      }
    } catch {
      sessoesTotal = 0;
    }
    const bloquear = (hospedagens?.total || 0) > 0;
    return {
      bloquear,
      motivo: bloquear ? 'Funcionário possui hospedagens ativas' : undefined,
      detalhes: {
        qualificacoes: qualificacoes?.total || 0,
        sessoes: sessoesTotal,
        hospedagens: hospedagens?.total || 0,
      },
    };
  }
}

export default FuncionariosService;
