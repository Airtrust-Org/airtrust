/**
 * Gerador canônico e idempotente de fichas para sessões compartilhadas.
 *
 * Trabalha por ATRIBUIÇÃO CURRICULAR, não por modelo agregado do segmento.
 * Cada atribuição com gera_ficha=1 e modelo_sessao_id válido gera exatamente
 * uma ficha com suas manobras.
 *
 * Idempotência: verifica ficha existente pela combinação canônica
 * (agendamento_slot_id, colaborador_id_aluno, template_id, atribuicao_curricular_id).
 */

import { createSharedAssignmentKey } from './simuladores-shared-session-logic';
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
    ficha_id: number | null;
    action: 'created' | 'skipped' | 'error';
    error?: string;
  }>;
}

/**
 * Gera fichas para TODAS as atribuições de uma sessão compartilhada que
 * ainda não possuem ficha. Idempotente — pode ser reexecutada.
 */
export async function generateFichasForSharedSession(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
): Promise<GenerateFichasResult> {
  // 1. Buscar a sessão
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

  // 2. Buscar modelo da aeronave do simulador
  const simulatorModel = await getSimuladorModelo(db, empresaId, sessao.simulador_id);

  // 3. Buscar atribuições que devem gerar ficha
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
        AND sp.deleted_at IS NULL
       INNER JOIN modelos_sessao ms
         ON ms.id = sac.modelo_sessao_id
        AND ms.deleted_at IS NULL
        AND ms.empresa_id = ?
       WHERE sac.agendamento_id = ?
         AND sac.empresa_id = ?
         AND sac.deleted_at IS NULL
         AND sac.gera_ficha = 1
         AND sac.modelo_sessao_id IS NOT NULL
       ORDER BY sac.id`,
    )
    .bind(empresaId, sessaoId, empresaId)
    .all<{
      id: number;
      participante_id: number;
      modelo_sessao_id: number;
      gera_ficha: number;
      funcionario_id: number;
      modelo_codigo: string;
      modelo_nome: string;
      tipo_sessao_codigo: string | null;
    }>();

  // 4. Verificar se já existe ficha para cada atribuição
  const result: GenerateFichasResult = {
    created: 0,
    skipped: 0,
    fichaIds: [],
    details: [],
  };

  const hasFichaEmpresaId = await fichasSessaoManobrasHasEmpresaId(db);
  const statements: D1PreparedStatement[] = [];

  for (const atribuicao of atribuicoes.results) {
    // Verificar se já existe ficha vinculada a esta atribuição
    const existingFicha = await db
      .prepare(
        `SELECT id FROM fichas_sessao
         WHERE agendamento_slot_id = ?
           AND colaborador_id_aluno = ?
           AND template_id = ?
           AND atribuicao_curricular_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(sessaoId, atribuicao.funcionario_id, atribuicao.modelo_sessao_id, atribuicao.id)
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

    // Criar ficha
    try {
      const fichaUuid = crypto.randomUUID();

      statements.push(
        db
          .prepare(
            `INSERT INTO fichas_sessao
               (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id,
                tipo_sessao, tipo_aeronave, data_sessao, status,
                template_id, empresa_id, atribuicao_curricular_id, segmento_atribuicao_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?, ?, NULL)`,
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
          ),
      );

      // Carregar e inserir manobras
      const manobras = await loadFichaManobrasForModelo(db, Number(atribuicao.modelo_sessao_id));
      assertModeloSessaoTemManobras(Number(atribuicao.modelo_sessao_id), manobras);

      for (const manobra of manobras) {
        statements.push(
          db
            .prepare(
              hasFichaEmpresaId
                ? `INSERT INTO fichas_sessao_manobras
                     (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, empresa_id)
                   VALUES ((SELECT id FROM fichas_sessao WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?)`
                : `INSERT INTO fichas_sessao_manobras
                     (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante)
                   VALUES ((SELECT id FROM fichas_sessao WHERE uuid = ?), ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              fichaUuid,
              manobra.codigo,
              manobra.nome,
              manobra.descricao || manobra.nome,
              manobra.categoria || 'GERAL',
              manobra.ordem,
              manobra.tripulante || 'AB',
              ...(hasFichaEmpresaId ? [empresaId] : []),
            ),
        );
      }

      result.created++;
      // fichaIds will be resolved after batch
      result.fichaIds.push(-1); // placeholder, resolved after batch
      result.details.push({
        atribuicao_curricular_id: atribuicao.id,
        funcionario_id: atribuicao.funcionario_id,
        modelo_sessao_id: atribuicao.modelo_sessao_id,
        ficha_id: null, // resolved after batch
        action: 'created',
      });
    } catch (error: any) {
      result.details.push({
        atribuicao_curricular_id: atribuicao.id,
        funcionario_id: atribuicao.funcionario_id,
        modelo_sessao_id: atribuicao.modelo_sessao_id,
        ficha_id: null,
        action: 'error',
        error: String(error?.message || 'Erro desconhecido'),
      });
    }
  }

  // 5. Executar batch
  if (statements.length > 0) {
    await db.batch(statements);

    // Resolver IDs das fichas criadas
    const newFichas = await db
      .prepare(
        `SELECT fs.id, fs.atribuicao_curricular_id
         FROM fichas_sessao fs
         WHERE fs.agendamento_slot_id = ?
           AND fs.empresa_id = ?
           AND fs.deleted_at IS NULL
         ORDER BY fs.id DESC
         LIMIT ?`,
      )
      .bind(sessaoId, empresaId, result.created)
      .all<{ id: number; atribuicao_curricular_id: number }>();

    // Atualizar fichaIds e details com IDs reais
    const newFichaIds: number[] = [];
    for (const ficha of newFichas.results) {
      newFichaIds.push(ficha.id);
    }
    // Substituir placeholders
    result.fichaIds = [
      ...result.fichaIds.filter(id => id !== -1),
      ...newFichaIds,
    ];

    for (const detail of result.details) {
      if (detail.action === 'created' && detail.atribuicao_curricular_id) {
        const match = newFichas.results.find(
          f => f.atribuicao_curricular_id === detail.atribuicao_curricular_id,
        );
        if (match) detail.ficha_id = match.id;
      }
    }
  }

  return result;
}

/**
 * Resolve o modelo da aeronave associado ao simulador.
 */
async function getSimuladorModelo(
  db: D1Database,
  empresaId: number,
  simuladorId: number,
): Promise<string> {
  const row = await db
    .prepare(
      `SELECT s.modelo_aeronave, s.nome
       FROM simuladores s
       WHERE s.id = ? AND s.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(simuladorId)
    .first<{ modelo_aeronave: string | null; nome: string | null }>();

  return row?.modelo_aeronave || row?.nome || 'SIMULADOR';
}

export { getSimuladorModelo };
