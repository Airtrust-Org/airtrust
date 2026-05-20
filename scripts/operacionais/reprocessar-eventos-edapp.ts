/**
 * Script para reprocessar eventos pendentes do EdApp
 * Executa diretamente no Worker usando wrangler
 */

interface Bindings {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    try {
      // Buscar eventos pendentes
      const eventos = await env.DB.prepare(
        `
        SELECT 
          e.id,
          e.tipo_evento,
          e.edapp_user_id,
          e.edapp_course_id,
          e.payload_json,
          u.funcionario_id,
          c.qualificacao_codigo
        FROM integracoes_edapp_eventos e
        INNER JOIN integracoes_edapp_usuarios u 
          ON u.edapp_user_id = e.edapp_user_id 
          AND u.deleted_at IS NULL
        INNER JOIN integracoes_edapp_cursos c 
          ON c.edapp_course_id = e.edapp_course_id 
          AND c.deleted_at IS NULL
        WHERE e.processado = 0 
          AND e.tentativas = 0 
          AND e.deleted_at IS NULL
        ORDER BY e.id
      `,
      ).all();

      if (!eventos.results || eventos.results.length === 0) {
        return Response.json({
          success: true,
          message: 'Nenhum evento pendente para processar',
          total: 0,
        });
      }

      const resultados = {
        total: eventos.results.length,
        processados: 0,
        erros: [] as any[],
      };

      // Processar cada evento
      for (const evt of eventos.results) {
        try {
          const payload = JSON.parse(evt.payload_json as string);
          const completedAt = payload.completedAt || payload.updated;

          // Buscar dados do tipo de qualificação
          const tipoQualificacao = await env.DB.prepare(
            `SELECT codigo, nome, categoria, validade 
             FROM qualificacoes_tipos 
             WHERE codigo = ? AND deleted_at IS NULL`,
          )
            .bind(evt.qualificacao_codigo)
            .first();

          if (!tipoQualificacao) {
            throw new Error(`Tipo de qualificação ${evt.qualificacao_codigo} não encontrado`);
          }

          const dataVencimento = tipoQualificacao.validade
            ? new Date(
                new Date(completedAt).setMonth(
                  new Date(completedAt).getMonth() + tipoQualificacao.validade,
                ),
              )
                .toISOString()
                .split('T')[0]
            : null;

          // Inserir qualificação no histórico
          const insertResult = await env.DB.prepare(
            `
            INSERT INTO qualificacoes_historico (
              funcionario_id,
              qualificacao_codigo,
              data_conclusao,
              data_vencimento,
              validade_meses,
              observacoes,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `,
          )
            .bind(
              evt.funcionario_id,
              evt.qualificacao_codigo,
              completedAt.split('T')[0],
              dataVencimento,
              tipoQualificacao.validade,
              `EdApp: Curso "${payload.course?.name || evt.edapp_course_id}" concluído automaticamente`,
            )
            .run();

          const qualificacaoId = insertResult.meta.last_row_id;

          // Marcar evento como processado
          await env.DB.prepare(
            `
            UPDATE integracoes_edapp_eventos
            SET processado = 1,
                tentativas = tentativas + 1,
                funcionario_id = ?,
                qualificacao_historico_id = ?,
                erro_ultima = NULL,
                updated_at = datetime('now')
            WHERE id = ?
          `,
          )
            .bind(evt.funcionario_id, qualificacaoId, evt.id)
            .run();

          resultados.processados++;
        } catch (error: any) {
          // Marcar evento com erro
          await env.DB.prepare(
            `
            UPDATE integracoes_edapp_eventos
            SET tentativas = tentativas + 1,
                erro_ultima = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `,
          )
            .bind(error.message, evt.id)
            .run();

          resultados.erros.push({
            evento_id: evt.id,
            erro: error.message,
          });
        }
      }

      return Response.json({
        success: true,
        ...resultados,
      });
    } catch (error: any) {
      return Response.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 },
      );
    }
  },
};
