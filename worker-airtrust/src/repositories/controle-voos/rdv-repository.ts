/**
 * Acesso a dados de voos/RDV (cv_voos, cv_rdv_operacional). Módulo
 * compartilhado entre `routes/controle-voos.ts` (CRUD original de
 * voos/RDV) e `routes/controle-voos-rdv-workflow.ts` (fluxo de revisão
 * da Coordenação) — nenhum dos dois define este acesso a dados
 * independentemente.
 */
import type { Context } from 'hono';
import { ApiError } from '../../middleware/error-handler';
import { getEmpresaId } from '../../middleware/tenant';
import type { Env } from '../../types';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../../utils/auditoria';

export type FlightStatus =
  | 'planejado'
  | 'liberado_operacionalmente'
  | 'em_andamento'
  | 'pousado'
  | 'concluido_operacionalmente'
  | 'cancelado'
  | 'alternado_divergido';

export type FlightRow = {
  id: number;
  empresa_id: number;
  prefixo: string;
  data_programacao: string;
  origem_id: number;
  destino_id: number;
  tipo_voo_id: number;
  natureza_voo_id: number;
  aeronave_id: number | null;
  horario_previsto_partida: string;
  horario_previsto_chegada: string;
  horario_real_partida: string | null;
  horario_real_chegada: string | null;
  status: FlightStatus;
  observacoes: string | null;
  cancelado_motivo_id: number | null;
  alternado_destino_id: number | null;
  versao: number;
  created_at: string;
  updated_at: string;
};

export type RdvStatus = 'rascunho' | 'preenchimento_finalizado' | 'cancelado';

// Fluxo de revisão/aprovação da Coordenação (eixo ortogonal ao `status`
// operacional acima, que continua controlando apenas o lock de campos).
// Nenhum estado é colapsado em outro: DEVOLVIDO e REABERTO são estados
// reais, persistidos e independentemente consultáveis (ver migration 0438).
export type RdvWorkflowStatus =
  | 'rascunho'
  | 'enviado'
  | 'em_revisao'
  | 'devolvido'
  | 'aprovado_coordenacao'
  | 'finalizado'
  | 'reaberto'
  | 'cancelado';

export type RdvRow = {
  id: number;
  empresa_id: number;
  voo_id: number;
  numero: string;
  data_voo: string;
  horario_decolagem_real: string | null;
  horario_pouso_real: string | null;
  horas_voadas: number | null;
  numero_pousos: number | null;
  ciclos: number | null;
  combustivel_decolagem: number | null;
  combustivel_pouso: number | null;
  combustivel_consumo: number | null;
  pob: number | null;
  carga_kg: number | null;
  ocorrencias: string | null;
  divergencias: string | null;
  status: RdvStatus;
  responsavel_preenchimento_id: number | null;
  preenchido_em: string | null;
  finalizado_operacionalmente_por: number | null;
  finalizado_operacionalmente_em: string | null;
  workflow_status: RdvWorkflowStatus;
  versao: number;
  enviado_por: number | null;
  enviado_em: string | null;
  revisao_iniciada_por: number | null;
  revisao_iniciada_em: string | null;
  devolvido_por: number | null;
  devolvido_em: string | null;
  aprovado_coordenacao_por: number | null;
  aprovado_coordenacao_em: string | null;
  finalizado_workflow_em: string | null;
  reaberto_por: number | null;
  reaberto_em: string | null;
  motivo_devolucao: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  updated_at: string;
};

export type FlightInput = Partial<{
  prefixo: string;
  data_programacao: string;
  origem_id: number;
  destino_id: number;
  tipo_voo_id: number;
  natureza_voo_id: number;
  aeronave_id: number | null;
  horario_previsto_partida: string;
  horario_previsto_chegada: string;
  horario_real_partida: string | null;
  horario_real_chegada: string | null;
  status: FlightStatus;
  observacoes: string | null;
  cancelado_motivo_id: number | null;
  alternado_destino_id: number | null;
}>;

export type RdvInput = Partial<{
  numero: string;
  data_voo: string;
  horario_decolagem_real: string | null;
  horario_pouso_real: string | null;
  horas_voadas: number | null;
  numero_pousos: number | null;
  ciclos: number | null;
  combustivel_decolagem: number | null;
  combustivel_pouso: number | null;
  combustivel_consumo: number | null;
  pob: number | null;
  carga_kg: number | null;
  ocorrencias: string | null;
  divergencias: string | null;
}>;

export const FLIGHT_SELECT = `
  id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
  tipo_voo_id, natureza_voo_id, aeronave_id,
  horario_previsto_partida, horario_previsto_chegada,
  horario_real_partida, horario_real_chegada,
  status, observacoes, cancelado_motivo_id, alternado_destino_id, versao,
  created_at, updated_at
`;

export const RDV_SELECT = `
  id, empresa_id, voo_id, numero, data_voo,
  horario_decolagem_real, horario_pouso_real,
  horas_voadas, numero_pousos, ciclos,
  combustivel_decolagem, combustivel_pouso, combustivel_consumo,
  pob, carga_kg, ocorrencias, divergencias,
  status, responsavel_preenchimento_id, preenchido_em,
  finalizado_operacionalmente_por, finalizado_operacionalmente_em,
  workflow_status, versao, enviado_por, enviado_em,
  revisao_iniciada_por, revisao_iniciada_em,
  devolvido_por, devolvido_em,
  aprovado_coordenacao_por, aprovado_coordenacao_em,
  finalizado_workflow_em, reaberto_por, reaberto_em,
  motivo_devolucao, motivo_cancelamento,
  created_at, updated_at
`;

export const allowedRdvFields = new Set([
  'numero',
  'data_voo',
  'horario_decolagem_real',
  'horario_pouso_real',
  'horas_voadas',
  'numero_pousos',
  'ciclos',
  'combustivel_decolagem',
  'combustivel_pouso',
  'combustivel_consumo',
  'pob',
  'carga_kg',
  'ocorrencias',
  'divergencias',
]);

export function getEmpresaIdSafe(c: Context<{ Bindings: Env }>): number {
  try {
    return getEmpresaId(c);
  } catch {
    const raw = (c.get as (key: string) => unknown)('empresaId');
    const parsed = typeof raw === 'string' ? Number(raw) : Number(raw || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

export function getActorId(c: Context<{ Bindings: Env }>): string | number | null {
  const raw = (c.get as (key: string) => unknown)('userId');
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  return null;
}

export async function getFlightOrThrow(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<FlightRow> {
  const row = await db
    .prepare(
      `
      SELECT ${FLIGHT_SELECT}
      FROM cv_voos
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(id, empresaId)
    .first<FlightRow>();

  if (!row) {
    throw new ApiError('Voo nao encontrado', 404, 'CONTROLE_VOOS_NOT_FOUND');
  }
  return row;
}

export async function getActiveRdvByFlight(
  db: D1Database,
  vooId: number | string,
  empresaId: number,
): Promise<RdvRow | null> {
  return db
    .prepare(
      `
      SELECT ${RDV_SELECT}
      FROM cv_rdv_operacional
      WHERE voo_id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND status <> 'cancelado'
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(vooId, empresaId)
    .first<RdvRow>();
}

export async function getRdvOrThrow(
  db: D1Database,
  id: number | string,
  empresaId: number,
): Promise<RdvRow> {
  const row = await db
    .prepare(
      `
      SELECT ${RDV_SELECT}
      FROM cv_rdv_operacional
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(id, empresaId)
    .first<RdvRow>();

  if (!row) {
    throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  }
  return row;
}

export function buildMergedRdv(existing: RdvRow, input: RdvInput): RdvInput {
  return {
    numero: input.numero ?? existing.numero,
    data_voo: input.data_voo ?? existing.data_voo,
    horario_decolagem_real:
      input.horario_decolagem_real !== undefined
        ? input.horario_decolagem_real
        : existing.horario_decolagem_real,
    horario_pouso_real:
      input.horario_pouso_real !== undefined
        ? input.horario_pouso_real
        : existing.horario_pouso_real,
    horas_voadas: input.horas_voadas !== undefined ? input.horas_voadas : existing.horas_voadas,
    numero_pousos: input.numero_pousos !== undefined ? input.numero_pousos : existing.numero_pousos,
    ciclos: input.ciclos !== undefined ? input.ciclos : existing.ciclos,
    combustivel_decolagem:
      input.combustivel_decolagem !== undefined
        ? input.combustivel_decolagem
        : existing.combustivel_decolagem,
    combustivel_pouso:
      input.combustivel_pouso !== undefined ? input.combustivel_pouso : existing.combustivel_pouso,
    combustivel_consumo:
      input.combustivel_consumo !== undefined
        ? input.combustivel_consumo
        : existing.combustivel_consumo,
    pob: input.pob !== undefined ? input.pob : existing.pob,
    carga_kg: input.carga_kg !== undefined ? input.carga_kg : existing.carga_kg,
    ocorrencias: input.ocorrencias !== undefined ? input.ocorrencias : existing.ocorrencias,
    divergencias: input.divergencias !== undefined ? input.divergencias : existing.divergencias,
  };
}

export async function getFuncionarioIdForUser(
  db: D1Database,
  userId: number | string | null,
): Promise<number | null> {
  if (userId === null || userId === undefined || userId === '') return null;
  const row = await db
    .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId)
    .first<{ funcionario_id: number | null }>();
  return row?.funcionario_id ?? null;
}

export async function isCrewOnFlight(
  db: D1Database,
  empresaId: number,
  vooId: number,
  funcionarioId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `
      SELECT id FROM cv_voo_tripulantes
      WHERE voo_id = ? AND empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(vooId, empresaId, funcionarioId)
    .first();
  return !!row;
}

export type FlightEventParams = {
  empresaId: number;
  vooId: number;
  tipoEvento: 'status' | 'horario' | 'tripulacao' | 'rdv' | 'ocorrencia' | 'observacao' | 'sistema';
  statusAnterior?: FlightStatus | null;
  statusNovo?: FlightStatus | null;
  descricao?: string | null;
  motivoId?: number | null;
  metadata?: Record<string, unknown>;
  usuarioId?: number | string | null;
};

/**
 * Vínculo com o RDV que uma escrita dependente precisa confirmar antes de
 * se efetivar, dentro do MESMO `db.batch([...])` do UPDATE otimista que a
 * precede — ver `buildRdvVersionGuardedInsert`.
 */
export type RdvVersionGuard = {
  rdvId: number;
  empresaId: number;
  expectedVersion: number;
};

/**
 * Monta (sem executar) o INSERT de evento do voo, para permitir agrupar em
 * `db.batch([...])` junto de outras escritas obrigatórias (ex.: aprovação)
 * que devem ser atômicas entre si. `recordFlightEvent` abaixo continua
 * disponível para os chamadores que só precisam de uma escrita isolada.
 *
 * Quando `guard` é informado, o INSERT vira um `INSERT ... SELECT ... WHERE
 * (SELECT changes()) > 0 AND EXISTS` — ver `buildRdvVersionGuardedInsert`
 * para o motivo detalhado (mesmo padrão, mesmo `db.batch()` do UPDATE CAS
 * que precede esta escrita).
 */
export function buildFlightEventStatement(
  db: D1Database,
  params: FlightEventParams,
  guard?: RdvVersionGuard,
): D1PreparedStatement {
  const values = [
    params.empresaId,
    params.vooId,
    params.tipoEvento,
    params.statusAnterior || null,
    params.statusNovo || null,
    params.descricao || null,
    params.motivoId || null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    params.usuarioId || null,
    params.usuarioId || null,
    params.usuarioId || null,
  ];

  if (!guard) {
    return db
      .prepare(
        `
      INSERT INTO cv_voo_eventos (
        empresa_id, voo_id, tipo_evento, status_anterior, status_novo,
        descricao, motivo_id, metadata_json, usuario_id, created_by, updated_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
      )
      .bind(...values);
  }

  return db
    .prepare(
      `
      INSERT INTO cv_voo_eventos (
        empresa_id, voo_id, tipo_evento, status_anterior, status_novo,
        descricao, motivo_id, metadata_json, usuario_id, created_by, updated_by,
        created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      WHERE (SELECT changes()) > 0
        AND EXISTS (
          SELECT 1 FROM cv_rdv_operacional WHERE id = ? AND empresa_id = ? AND versao = ?
        )
    `,
    )
    .bind(...values, guard.rdvId, guard.empresaId, guard.expectedVersion);
}

export async function recordFlightEvent(
  params: FlightEventParams & { db: D1Database },
): Promise<void> {
  await buildFlightEventStatement(params.db, params).run();
}

/**
 * Monta (sem executar) um INSERT condicionado ao sucesso do UPDATE CAS que
 * o precede no MESMO `db.batch([...])`, para agrupar aprovação/revisão/
 * evento com o UPDATE otimista de `cv_rdv_operacional`.
 *
 * ACHADO DE CONCORRÊNCIA (staging, 2026-07-21): a guarda original era só
 * `WHERE EXISTS (SELECT 1 FROM cv_rdv_operacional WHERE ... versao = ?)`
 * com `expectedVersion = novaVersao` (a versão ALVO, não a versão antiga
 * lida por esta requisição). Isso prova apenas que a linha ESTÁ na versão
 * alvo no momento em que este INSERT roda — não prova que foi ESTA
 * transação que a levou até lá. Sob corrida real, duas requisições
 * concorrentes leem o mesmo `rdv.versao` (ex.: 6) e calculam o mesmo
 * `novaVersao` (7). A vencedora executa o UPDATE (6→7) e o INSERT desta
 * mesma guarda vê `EXISTS(... versao = 7)` = true (efeito do seu próprio
 * UPDATE, na mesma conexão). A perdedora tem seu UPDATE rejeitado pelo CAS
 * (`WHERE versao = 6` não bate mais — 0 linhas), mas quando SEU INSERT
 * guardado roda, o `EXISTS(... versao = 7)` TAMBÉM é true — porque a
 * vencedora já comprometeu essa mesma versão-alvo antes. A perdedora
 * recebe 409 (via `assertCasApplied` no UPDATE), mas o INSERT já foi
 * commitado como efeito colateral: linha duplicada em `cv_rdv_aprovacoes`
 * (reproduzido e confirmado em staging: duas linhas com a mesma `versao`,
 * uma para cada requisição da corrida).
 *
 * CORREÇÃO: adicionar `AND (SELECT changes()) > 0` — `changes()` do SQLite
 * reflete o número de linhas afetadas pela ÚLTIMA instrução de escrita
 * completada NA MESMA CONEXÃO/TRANSAÇÃO (`db.batch()` roda como uma única
 * transação implícita, com as instruções do array executando em ordem
 * nessa mesma conexão). Como o UPDATE CAS é sempre a instrução IMEDIATAMENTE
 * ANTERIOR a este INSERT no batch (ver todos os handlers de transição em
 * `routes/controle-voos-rdv-workflow.ts`), `(SELECT changes()) > 0` prova
 * que O PRÓPRIO UPDATE DESTA TRANSAÇÃO afetou uma linha — não apenas que a
 * versão-alvo existe. A perdedora da corrida tem `changes() = 0` no seu
 * próprio UPDATE (rejeitado pelo CAS), então seu INSERT guardado também
 * insere 0 linhas, independente do que a vencedora já tenha commitado.
 * O `EXISTS(...)` original é mantido como camada adicional (nunca abre o
 * guard sozinho; some precisa de `changes() > 0` também).
 *
 * Quando múltiplos INSERTs guardados são encadeados no mesmo batch (ex.:
 * várias linhas de `cv_rdv_revisoes` em `corrigir`), o encadeamento
 * continua correto: `changes()` de cada INSERT reflete o INSERT
 * imediatamente anterior, que por sua vez só teve `changes() = 1` se ELE
 * tiver herdado um `changes() > 0` verdadeiro — zero se propaga
 * corretamente por toda a cadeia quando o UPDATE original falhou.
 *
 * `table`/`columns`/`valuesSql` vêm sempre de literais fixos no código
 * (nunca de entrada do usuário) — não há risco de injeção via
 * concatenação dos nomes de tabela/coluna.
 */
export function buildRdvVersionGuardedInsert(
  db: D1Database,
  params: {
    table: string;
    columns: string;
    valuesSql: string;
    bindValues: unknown[];
    guard: RdvVersionGuard;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `
      INSERT INTO ${params.table} (${params.columns})
      SELECT ${params.valuesSql}
      WHERE (SELECT changes()) > 0
        AND EXISTS (
          SELECT 1 FROM cv_rdv_operacional WHERE id = ? AND empresa_id = ? AND versao = ?
        )
    `,
    )
    .bind(
      ...params.bindValues,
      params.guard.rdvId,
      params.guard.empresaId,
      params.guard.expectedVersion,
    );
}

/**
 * Monta (sem executar) um UPDATE em uma tabela dependente do RDV (ex.:
 * `cv_voo_tripulantes`, `cv_voo_abastecimentos`), condicionado a
 * `cv_rdv_operacional` estar na versão informada em `guard.expectedVersion`
 * — tipicamente a versão ATUAL/antiga, já que este UPDATE roda ANTES do
 * incremento de versão no mesmo `db.batch([...])` (ver
 * `buildRdvVersionBumpGatedOnPriorChanges`, que só efetiva o incremento se
 * este UPDATE tiver afetado alguma linha). Essa ordem evita os dois
 * problemas opostos: incrementar a versão do RDV sem nenhuma mutação real
 * associada (`id` inexistente) e mutar a linha dependente com uma versão
 * de RDV já desatualizada (corrida concorrente).
 */
export function buildRdvVersionGuardedUpdate(
  db: D1Database,
  params: {
    table: string;
    setSql: string;
    setBindValues: unknown[];
    whereSql: string;
    whereBindValues: unknown[];
    guard: RdvVersionGuard;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `
      UPDATE ${params.table}
      SET ${params.setSql}
      WHERE ${params.whereSql}
        AND EXISTS (
          SELECT 1 FROM cv_rdv_operacional WHERE id = ? AND empresa_id = ? AND versao = ?
        )
    `,
    )
    .bind(
      ...params.setBindValues,
      ...params.whereBindValues,
      params.guard.rdvId,
      params.guard.empresaId,
      params.guard.expectedVersion,
    );
}

// `cv_rdv_operacional` tem duas UNIQUE constraints (migration 0410) que
// podem falhar num INSERT/UPDATE: uma por voo ativo (corrida de criação) e
// outra por número de RDV (colisão de negócio, sem relação com CAS). Os
// fragmentos abaixo são o texto EXATO que o SQLite/D1 emite para cada
// índice (`UNIQUE constraint failed: <tabela>.<col1>, <tabela>.<col2>`,
// na ordem de declaração do índice) — usados para diferenciar as duas
// sem adivinhar a partir de heurísticas de payload.
const RDV_OPERACIONAL_VOO_UNIQUE_FRAGMENT =
  'cv_rdv_operacional.empresa_id, cv_rdv_operacional.voo_id';
const RDV_OPERACIONAL_NUMERO_UNIQUE_FRAGMENT =
  'cv_rdv_operacional.empresa_id, cv_rdv_operacional.numero';

/**
 * Classifica um erro do D1 vindo de um INSERT/UPDATE em `cv_rdv_operacional`
 * nas duas UNIQUE constraints da tabela, devolvendo o `ApiError` correto
 * para cada uma — ou `null` se o erro não corresponde a nenhuma das duas
 * (o chamador deve relançar o erro original nesse caso).
 *
 * ACHADO (staging, 2026-07-26, run 30212619886): o handler de UPDATE de
 * `PUT /voos/:id/rdv` não tinha NENHUM tratamento de erro em torno do
 * `db.batch([stmtUpdate, stmtEvent])` — uma violação de
 * `idx_cv_rdv_operacional_empresa_numero` (dois RDVs da mesma empresa
 * disputando o mesmo `numero`) vazava como 500 cru com o texto do
 * `D1_ERROR`. O caminho de criação (`!existing`) já tratava
 * `UNIQUE constraint failed` de forma genérica, mas mapeava QUALQUER
 * violação para `CONTROLE_VOOS_RDV_VERSION_CONFLICT` — inclusive uma
 * colisão de `numero` com um RDV de OUTRO voo, que não é uma corrida de
 * versão e não deve pedir "recarregue os dados". Esta função separa os
 * dois casos pelo texto exato da constraint, para nunca converter um
 * SQLITE_CONSTRAINT genérico em 409 sem prova de que representa
 * realmente a perda de uma corrida de criação/versão.
 */
export function mapRdvOperacionalUniqueConstraintError(err: unknown): ApiError | null {
  const message = err instanceof Error ? err.message : String(err);
  if (!message.includes('UNIQUE constraint failed')) return null;

  if (message.includes(RDV_OPERACIONAL_NUMERO_UNIQUE_FRAGMENT)) {
    return new ApiError(
      'Já existe um RDV com este número nesta empresa. Escolha outro número e tente novamente.',
      409,
      'CONTROLE_VOOS_RDV_NUMERO_DUPLICADO',
    );
  }

  if (message.includes(RDV_OPERACIONAL_VOO_UNIQUE_FRAGMENT)) {
    return new ApiError(
      'Versao do RDV desatualizada. Recarregue os dados antes de continuar.',
      409,
      'CONTROLE_VOOS_RDV_VERSION_CONFLICT',
    );
  }

  return null;
}

/**
 * Monta (sem executar) o UPDATE que incrementa `cv_rdv_operacional.versao`,
 * condicionado SIMULTANEAMENTE a (1) a versão atual bater (CAS) e (2) a
 * instrução IMEDIATAMENTE ANTERIOR no mesmo `db.batch([...])` ter afetado ao
 * menos uma linha (`(SELECT changes()) > 0` — `changes()` do SQLite reflete
 * a última instrução de escrita completada na mesma conexão/transação).
 *
 * Uso: quando o efeito colateral dependente (ex.: soft-delete de
 * tripulante/abastecimento) precisa ser a CONDIÇÃO do incremento de versão,
 * não a sua consequência — sem isso, um `id` inexistente ainda
 * incrementaria a versão do RDV mesmo sem nenhuma mudança real associada
 * ("versão incrementada sem alteração").
 */
export function buildRdvVersionBumpGatedOnPriorChanges(
  db: D1Database,
  params: {
    rdvId: number;
    empresaId: number;
    currentVersion: number;
    nextVersion: number;
    userId: number | string | null;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `
      UPDATE cv_rdv_operacional
      SET versao = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ? AND (SELECT changes()) > 0
    `,
    )
    .bind(
      params.nextVersion,
      params.userId,
      params.rdvId,
      params.empresaId,
      params.currentVersion,
    );
}

export async function maybeRecordSystemAudit(
  c: Context<{ Bindings: Env }>,
  table: string,
  action: 'INSERT' | 'UPDATE',
  recordId: string | number,
  beforeData: unknown,
  afterData: unknown,
): Promise<void> {
  await registrarAuditoria({
    db: c.env.DB,
    tabela: table,
    acao: action,
    registro_id: recordId,
    dados_anteriores: beforeData,
    dados_novos: afterData,
    ...extrairUsuarioAuditoria(c),
  });
}
