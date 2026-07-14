/**
 * Gerador canônico e idempotente de fichas para sessões compartilhadas.
 *
 * Trabalha por ATRIBUIÇÃO CURRICULAR, não por modelo agregado do segmento.
 * Cada atribuição com gera_ficha=1 e modelo_sessao_id válido gera exatamente
 * uma ficha com suas manobras.
 *
 * Fail-closed: todas as atribuições são validadas (participante, modelo,
 * manobras) ANTES de qualquer INSERT ser enfileirado. Se qualquer atribuição
 * obrigatória falhar, a função lança e nenhum INSERT é executado — nunca
 * ficha parcial.
 *
 * Idempotência: usa UUID pré-gerado por ficha e INSERT ... SELECT ... WHERE
 * NOT EXISTS contra a combinação canônica (empresa_id, agendamento_slot_id,
 * colaborador_id_aluno, template_id, atribuicao_curricular_id, deleted_at IS
 * NULL) — não depende de um SELECT prévio seguido de INSERT separado, nem de
 * "últimos registros da sessão" para resolver os IDs criados.
 */

import { assertModeloSessaoTemManobras, loadFichaManobrasForModelo } from './simuladores-shared-session-fichas';
import { fichasSessaoManobrasHasEmpresaId } from './simuladores-shared';

export interface GenerateFichasResult {
  /** Quantas fichas novas foram criadas */
  created: number;
  /** Quantas fichas já existiam (idempotência) */
  skipped: number;
  /** IDs das fichas (novas + existentes) */
  fichaIds: number[];
  /** Detalhes por atribuição */
  details: Array<{
    atribuicao_curricular_id: number;
    funcionario_id: number;
    modelo_sessao_id: number;
    ficha_id: number;
    action: 'created' | 'skipped';
  }>;
}

interface AtribuicaoRow {
  id: number;
  participante_id: number;
  modelo_sessao_id: number;
  gera_ficha: number;
  funcionario_id: number;
  modelo_codigo: string;
  modelo_nome: string;
  tipo_sessao_codigo: string | null;
}

interface FichaPlan {
  atribuicao: AtribuicaoRow;
  fichaUuid: string;
  manobras: Awaited<ReturnType<typeof loadFichaManobrasForModelo>>;
}

/**
 * Gera fichas para TODAS as atribuições de uma sessão compartilhada que
 * ainda não possuem ficha. Idempotente — pode ser reexecutada.
 *
 * Fail-closed: se qualquer atribuição obrigatória falhar validação (modelo
 * sem manobras, por exemplo), a função lança antes de tocar o banco — nenhum
 * INSERT é executado para a sessão inteira nessa chamada.
 */
export async function generateFichasForSharedSession(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
): Promise<GenerateFichasResult> {
  // 1. Buscar a sessão — escopo obrigatório de tenant.
  const sessao = await db
    .prepare(
      `SELECT id, data, instrutor_id, simulador_id
       FROM simulador_agendamentos
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND modo_compartilhado = 1`,
    )
    .bind(sessaoId, empresaId)
    .first<{ id: number; data: string; instrutor_id: number; simulador_id: number }>();

  if (!sessao) {
    throw new Error(`Sessão compartilhada ${sessaoId} não encontrada na empresa ${empresaId}`);
  }

  // 2. Buscar modelo da aeronave do simulador — escopo obrigatório de tenant.
  const simulatorModel = await getSimuladorModelo(db, empresaId, sessao.simulador_id);

  // 3. Buscar atribuições que devem gerar ficha — todas as tabelas do join
  //    (sac, sp, ms) já são filtradas por empresa_id.
  const atribuicoes = await db
    .prepare(
      `SELECT sac.id,
              sac.participante_id,
              sac.modelo_sessao_id,
              sac.gera_ficha,
              sp.funcionario_id,
              ms.codigo AS modelo_codigo,
              ms.nome AS modelo_nome,
              ms.tipo_sessao_codigo
       FROM simulador_atribuicoes_curriculares sac
       INNER JOIN sessoes_participantes sp
         ON sp.id = sac.participante_id
        AND sp.empresa_id = ?
        AND sp.deleted_at IS NULL
       INNER JOIN modelos_sessao ms
         ON ms.id = sac.modelo_sessao_id
        AND ms.empresa_id = ?
        AND ms.deleted_at IS NULL
       WHERE sac.agendamento_id = ?
         AND sac.empresa_id = ?
         AND sac.deleted_at IS NULL
         AND sac.gera_ficha = 1
         AND sac.modelo_sessao_id IS NOT NULL
       ORDER BY sac.id`,
    )
    .bind(empresaId, empresaId, sessaoId, empresaId)
    .all<AtribuicaoRow>();

  const result: GenerateFichasResult = {
    created: 0,
    skipped: 0,
    fichaIds: [],
    details: [],
  };

  const hasFichaEmpresaId = await fichasSessaoManobrasHasEmpresaId(db);

  // 4. Fase de validação — carrega tudo e valida ANTES de qualquer INSERT.
  //    Qualquer falha aqui joga fora da função sem ter enfileirado nada.
  const toCreate: FichaPlan[] = [];

  for (const atribuicao of atribuicoes.results) {
    const existingFicha = await db
      .prepare(
        `SELECT id FROM fichas_sessao
         WHERE empresa_id = ?
           AND agendamento_slot_id = ?
           AND colaborador_id_aluno = ?
           AND template_id = ?
           AND atribuicao_curricular_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(empresaId, sessaoId, atribuicao.funcionario_id, atribuicao.modelo_sessao_id, atribuicao.id)
      .first<{ id: number }>();

    if (existingFicha) {
      result.skipped++;
      result.fichaIds.push(existingFicha.id);
      result.details.push({
        atribuicao_curricular_id: atribuicao.id,
        funcionario_id: atribuicao.funcionario_id,
        modelo_sessao_id: atribuicao.modelo_sessao_id,
        ficha_id: existingFicha.id,
        action: 'skipped',
      });
      continue;
    }

    // Fail-closed: manobras carregadas e validadas antes de qualquer INSERT
    // ser enfileirado. Se faltar manobra obrigatória, lança e aborta a
    // geração inteira desta sessão — nenhuma ficha parcial.
    const manobras = await loadFichaManobrasForModelo(db, Number(atribuicao.modelo_sessao_id));
    assertModeloSessaoTemManobras(Number(atribuicao.modelo_sessao_id), manobras);

    toCreate.push({
      atribuicao,
      fichaUuid: crypto.randomUUID(),
      manobras,
    });
  }

  if (toCreate.length === 0) {
    return result;
  }

  // 5. Fase de escrita — plano completo já validado; um único batch atômico
  //    para todas as fichas + manobras ausentes desta sessão.
  const statements: D1PreparedStatement[] = [];

  for (const plan of toCreate) {
    const { atribuicao, fichaUuid, manobras } = plan;

    statements.push(
      db
        .prepare(
          `INSERT INTO fichas_sessao
             (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id,
              tipo_sessao, tipo_aeronave, data_sessao, status,
              template_id, empresa_id, atribuicao_curricular_id, segmento_atribuicao_id)
           SELECT ?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?, ?, NULL
           WHERE NOT EXISTS (
             SELECT 1 FROM fichas_sessao
             WHERE empresa_id = ?
               AND agendamento_slot_id = ?
               AND colaborador_id_aluno = ?
               AND template_id = ?
               AND atribuicao_curricular_id = ?
               AND deleted_at IS NULL
           )`,
        )
        .bind(
          fichaUuid,
          sessaoId,
          atribuicao.funcionario_id,
          sessao.instrutor_id,
          atribuicao.modelo_codigo || 'SHARED',
          simulatorModel,
          sessao.data,
          atribuicao.modelo_sessao_id,
          empresaId,
          atribuicao.id,
          empresaId,
          sessaoId,
          atribuicao.funcionario_id,
          atribuicao.modelo_sessao_id,
          atribuicao.id,
        ),
    );

    for (const manobra of manobras) {
      statements.push(
        db
          .prepare(
            hasFichaEmpresaId
              ? `INSERT INTO fichas_sessao_manobras
                   (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, empresa_id)
                 SELECT fs.id, ?, ?, ?, ?, ?, ?, ?
                 FROM fichas_sessao fs
                 WHERE fs.uuid = ? AND fs.empresa_id = ?`
              : `INSERT INTO fichas_sessao_manobras
                   (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante)
                 SELECT fs.id, ?, ?, ?, ?, ?, ?
                 FROM fichas_sessao fs
                 WHERE fs.uuid = ? AND fs.empresa_id = ?`,
          )
          .bind(
            manobra.codigo,
            manobra.nome,
            manobra.descricao || manobra.nome,
            manobra.categoria || 'GERAL',
            manobra.ordem,
            manobra.tripulante || 'AB',
            ...(hasFichaEmpresaId ? [empresaId] : []),
            fichaUuid,
            empresaId,
          ),
      );
    }
  }

  // Batch único e atômico — se rejeitar, nenhuma statement é aplicada
  // (garantia de plataforma do D1); a exceção propaga sem catch local.
  await db.batch(statements);

  // 6. Resolver IDs das fichas por UUID específico da atribuição — nunca por
  //    "últimos registros da sessão" (ORDER BY id DESC LIMIT n), o que
  //    poderia atribuir fichas de outra escrita concorrente à atribuição
  //    errada.
  for (const plan of toCreate) {
    const created = await db
      .prepare(
        `SELECT id FROM fichas_sessao WHERE uuid = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(plan.fichaUuid, empresaId)
      .first<{ id: number }>();

    if (created) {
      result.created++;
      result.fichaIds.push(created.id);
      result.details.push({
        atribuicao_curricular_id: plan.atribuicao.id,
        funcionario_id: plan.atribuicao.funcionario_id,
        modelo_sessao_id: plan.atribuicao.modelo_sessao_id,
        ficha_id: created.id,
        action: 'created',
      });
      continue;
    }

    // A INSERT ... WHERE NOT EXISTS não criou linha com este UUID: outra
    // escrita concorrente já satisfez a mesma chave canônica primeiro.
    // Resolve pela chave canônica (não por UUID, não por "últimos
    // registros") e trata como idempotência bem-sucedida.
    const existing = await db
      .prepare(
        `SELECT id FROM fichas_sessao
         WHERE empresa_id = ?
           AND agendamento_slot_id = ?
           AND colaborador_id_aluno = ?
           AND template_id = ?
           AND atribuicao_curricular_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(
        empresaId,
        sessaoId,
        plan.atribuicao.funcionario_id,
        plan.atribuicao.modelo_sessao_id,
        plan.atribuicao.id,
      )
      .first<{ id: number }>();

    if (!existing) {
      throw new Error(
        `Falha ao resolver ficha após batch para atribuição ${plan.atribuicao.id} na sessão ${sessaoId}`,
      );
    }

    result.skipped++;
    result.fichaIds.push(existing.id);
    result.details.push({
      atribuicao_curricular_id: plan.atribuicao.id,
      funcionario_id: plan.atribuicao.funcionario_id,
      modelo_sessao_id: plan.atribuicao.modelo_sessao_id,
      ficha_id: existing.id,
      action: 'skipped',
    });
  }

  return result;
}

/**
 * Resolve o modelo da aeronave associado ao simulador — escopo obrigatório
 * de tenant.
 */
async function getSimuladorModelo(
  db: D1Database,
  empresaId: number,
  simuladorId: number,
): Promise<string> {
  const row = await db
    .prepare(
      `SELECT COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, '') AS modelo_aeronave,
              s.nome
       FROM simuladores s
       WHERE s.id = ? AND s.empresa_id = ? AND s.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(simuladorId, empresaId)
    .first<{ modelo_aeronave: string | null; nome: string | null }>();

  return row?.modelo_aeronave || row?.nome || 'SIMULADOR';
}

export { getSimuladorModelo };
