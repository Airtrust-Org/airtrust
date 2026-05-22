/**
 * SIMULADORES — Sessões Update/Delete
 * Sub-router mounted at /api/simuladores via app.route('/', ...)
 *
 *   PUT    /sessoes/:id
 *   DELETE /sessoes/:id
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { publishDomainEvent } from '../shared/domainEvents';
import { removeManagedEscalaEvents } from '../shared/syncEscalaEventosExternos';
import { enviarEmailFichaSessao } from '../lib/fichaEmails';
import {
  requireAdminForDelete,
  timeToMinutes,
  syncSessaoEscalaEventos,
  findSessaoConflict,
  audit,
  getSimuladorModeloAeronave,
  normalizeModeloAeronave,
  resolveTemplateIdSessao,
  normalizeChecksSessao,
} from './simuladores-shared';

const app = new Hono<{ Bindings: Env }>();

app.put('/sessoes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const templateIdBody =
      b.template_id !== undefined
        ? b.template_id
        : b.modelo_sessao_id !== undefined
          ? b.modelo_sessao_id
          : undefined;
    const resetarFluxoFichas = b.resetar_fluxo_fichas !== false;
    const a = await c.env.DB.prepare(
      'SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();
    if (!a) return c.json({ success: false, error: 'Não encontrada' }, 404);
    const modeloAeronaveSessao =
      normalizeModeloAeronave(b.tipo_aeronave) ||
      (await getSimuladorModeloAeronave(c.env.DB, (a as any).simulador_id));
    let checksNormalizados: number[] = [];
    try {
      checksNormalizados = await normalizeChecksSessao(c.env.DB, b.checks, modeloAeronaveSessao);
    } catch (error: any) {
      return c.json({ success: false, error: error?.message || 'Checks inválidos' }, 400);
    }

    // ============================
    // CHECKS COM EXAMINADORES
    // - Se examinador_id informado: is_check=1
    // - Se examinador_id removido: is_check=0 e soft-delete vínculos
    // - Atualiza vínculos em sessoes_checks
    // ============================

    const examinadorIdBodyRaw =
      b.examinador_id === undefined
        ? undefined
        : b.examinador_id === null
          ? null
          : Number(b.examinador_id);
    const wantsCheck = examinadorIdBodyRaw ? 1 : 0;
    const shouldUpdateCheckFields = b.examinador_id !== undefined || b.checks !== undefined;

    if (shouldUpdateCheckFields) {
      // Validar examinador quando presente
      if (examinadorIdBodyRaw) {
        const fCols = await c.env.DB.prepare("PRAGMA table_info('funcionarios')").all();
        const fColSet = new Set((fCols.results || []).map((r: any) => r.name));
        const hasIsExaminador = fColSet.has('is_examinador');
        const hasIsChecador = fColSet.has('is_checador');
        const examinadorFlagExpr =
          hasIsExaminador && hasIsChecador
            ? '(COALESCE(is_examinador, 0) = 1 OR COALESCE(is_checador, 0) = 1)'
            : hasIsExaminador
              ? 'COALESCE(is_examinador, 0) = 1'
              : hasIsChecador
                ? 'COALESCE(is_checador, 0) = 1'
                : '0 = 1';
        const examinador = await c.env.DB.prepare(
          `SELECT id
           FROM funcionarios
           WHERE id = ?
             AND ${examinadorFlagExpr}
             AND deleted_at IS NULL`,
        )
          .bind(examinadorIdBodyRaw)
          .first();
        if (!examinador) {
          return c.json({ success: false, error: 'Examinador inválido' }, 400);
        }
      }

      // Se tiver examinador, exige checks (pelo menos 1)
      if (examinadorIdBodyRaw && checksNormalizados.length === 0) {
        return c.json(
          { success: false, error: 'Selecione pelo menos 1 check ao informar examinador' },
          400,
        );
      }

      // Atualizar campos na sessão
      await c.env.DB.prepare(
        "UPDATE simulador_agendamentos SET examinador_id=?, is_check=?, updated_at=datetime('now') WHERE id=?",
      )
        .bind(examinadorIdBodyRaw || null, wantsCheck, id)
        .run();

      // Soft delete vínculos existentes
      const scOld = await c.env.DB.prepare(
        `SELECT id
         FROM sessoes_checks
         WHERE sessao_id = ? AND deleted_at IS NULL`,
      )
        .bind(id)
        .all();

      if (scOld.results && scOld.results.length > 0) {
        const ids = scOld.results.map((r: any) => r.id).filter((v: any) => v !== undefined);

        await c.env.DB.prepare(
          "UPDATE sessoes_checks SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE sessao_id=? AND deleted_at IS NULL",
        )
          .bind(id)
          .run();

        // Soft delete resultados vinculados aos sessao_check antigos
        for (const scId of ids) {
          await c.env.DB.prepare(
            "UPDATE sessoes_checks_resultados SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE sessao_check_id=? AND deleted_at IS NULL",
          )
            .bind(scId)
            .run();
        }
      }

      // Inserir vínculos novos (se for check)
      if (wantsCheck && checksNormalizados.length > 0) {
        for (const qualificacao_tipo_id of checksNormalizados) {
          await c.env.DB.prepare(
            `INSERT INTO sessoes_checks (sessao_id, qualificacao_tipo_id, created_at, updated_at)
             VALUES (?, ?, datetime('now'), datetime('now'))`,
          )
            .bind(id, qualificacao_tipo_id)
            .run();
        }
      }

      await audit(c.env.DB, {
        tabela: 'simulador_agendamentos',
        acao: 'UPDATE_CHECK_FIELDS',
        registro_id: id,
        dados_anteriores: {
          examinador_id: (a as any).examinador_id,
          is_check: (a as any).is_check,
        },
        dados_novos: {
          examinador_id: examinadorIdBodyRaw || null,
          is_check: wantsCheck,
          checks: checksNormalizados,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FICHAS ESPECIAIS: TREINAMENTO DE INSTRUTOR / CREDENCIAMENTO DE EXAMINADOR
    // Executado independentemente do bloco shouldUpdateCheckFields.
    // Condições (OR):
    //   1. Flag explícita no body: gerar_ficha_instrutor / gerar_ficha_examinador
    //   2. Codes FAP07 / FAP13 presentes nos checks atuais da sessão
    // ─────────────────────────────────────────────────────────────────────────
    {
      const instrutorEspecial =
        b.instrutor_id !== undefined ? b.instrutor_id : (a as any).instrutor_id;
      if (instrutorEspecial) {
        // Buscar códigos dos checks atuais da sessão
        const codRes = await c.env.DB.prepare(
          `SELECT qt.codigo FROM sessoes_checks sc
           JOIN qualificacoes_tipos qt ON sc.qualificacao_tipo_id = qt.id
           WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL AND qt.deleted_at IS NULL`,
        )
          .bind(id)
          .all();
        const codsAtuais = (codRes.results || []).map((r: any) =>
          String(r.codigo || '').toUpperCase(),
        );

        // Buscar template_ids dos modelos especiais
        const tplRes = await c.env.DB.prepare(
          `SELECT id, codigo FROM modelos_sessao
           WHERE codigo IN ('TRE-INST','CRED-EXA') AND deleted_at IS NULL`,
        ).all();
        const tplMap = new Map(
          (tplRes.results || []).map((r: any) => [String(r.codigo), r.id as number]),
        );

        // Inferir tipo_aeronave das fichas existentes
        let tipoAeronaveEsp = b.tipo_aeronave || null;
        if (!tipoAeronaveEsp) {
          const fichaRef = await c.env.DB.prepare(
            `SELECT tipo_aeronave FROM fichas_sessao
             WHERE agendamento_slot_id = ? AND deleted_at IS NULL LIMIT 1`,
          )
            .bind(id)
            .first();
          tipoAeronaveEsp = (fichaRef as any)?.tipo_aeronave || null;
        }
        const dataEsp = b.data || (a as any).data;
        const examinadorEsp =
          examinadorIdBodyRaw !== undefined
            ? examinadorIdBodyRaw
            : ((a as any).examinador_id ?? null);

        const fichasEsp = [
          {
            modelo: 'TRE-INST',
            ativo:
              b.gerar_ficha_instrutor === true || codsAtuais.some((c) => c.startsWith('FAP07')),
          },
          {
            modelo: 'CRED-EXA',
            ativo:
              b.gerar_ficha_examinador === true || codsAtuais.some((c) => c.startsWith('FAP13')),
          },
        ];

        for (const esp of fichasEsp) {
          const existe = await c.env.DB.prepare(
            `SELECT id,
                    status,
                    assinatura_aluno_timestamp,
                    assinatura_instrutor_timestamp,
                    assinatura_aluno_imagem,
                    assinatura_instrutor_imagem,
                    data_conclusao
             FROM fichas_sessao
             WHERE agendamento_slot_id = ? AND colaborador_id_aluno = ?
               AND tipo_sessao = ? AND deleted_at IS NULL`,
          )
            .bind(id, instrutorEspecial, esp.modelo)
            .first();

          if (!esp.ativo) {
            if (existe) {
              const fichaExistente = existe as any;
              const fichaJaUtilizada = Boolean(
                fichaExistente.assinatura_aluno_timestamp ||
                fichaExistente.assinatura_instrutor_timestamp ||
                fichaExistente.assinatura_aluno_imagem ||
                fichaExistente.assinatura_instrutor_imagem ||
                fichaExistente.data_conclusao ||
                (fichaExistente.status && fichaExistente.status !== 'AVALIACAO_PENDENTE'),
              );

              if (!fichaJaUtilizada) {
                await c.env.DB.prepare(
                  `UPDATE fichas_sessao
                   SET deleted_at = datetime('now')
                   WHERE id = ? AND deleted_at IS NULL`,
                )
                  .bind(fichaExistente.id)
                  .run();

                await c.env.DB.prepare(
                  `UPDATE fichas_sessao_manobras
                   SET deleted_at = datetime('now')
                   WHERE ficha_id = ? AND deleted_at IS NULL`,
                )
                  .bind(fichaExistente.id)
                  .run();
              }
            }

            continue;
          }

          if (!existe) {
            await c.env.DB.prepare(
              `INSERT INTO fichas_sessao
                 (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id,
                  tipo_sessao, tipo_aeronave, data_sessao, status, template_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?)`,
            )
              .bind(
                crypto.randomUUID(),
                id,
                instrutorEspecial,
                examinadorEsp || instrutorEspecial,
                esp.modelo,
                tipoAeronaveEsp,
                dataEsp,
                tplMap.get(esp.modelo) ?? null,
              )
              .run();
          }
        }
      }
    }

    // Determinar tipo_dispositivo final
    const tipoDispositivoFinal: 'SIMULADOR' | 'AERONAVE' =
      b.tipo_dispositivo === 'AERONAVE'
        ? 'AERONAVE'
        : (a as any).tipo_dispositivo === 'AERONAVE'
          ? 'AERONAVE'
          : 'SIMULADOR';

    // Validação de horário + conflito (apenas para simuladores)
    const simuladorIdFinal = Number(b.simulador_id ?? a.simulador_id);
    const dataFinal = String(b.data ?? a.data);
    const inicioStr = b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio;
    const fimStr = b.horario_fim !== undefined ? b.horario_fim : a.hora_fim;

    if (!inicioStr || !fimStr) {
      return c.json({ success: false, error: 'Horário de início e fim são obrigatórios' }, 400);
    }

    const inicioMin = timeToMinutes(inicioStr);
    const fimMin = timeToMinutes(fimStr);
    if (inicioMin === null || fimMin === null) {
      return c.json({ success: false, error: 'Horários inválidos (use HH:MM)' }, 400);
    }
    if (fimMin === inicioMin) {
      return c.json(
        { success: false, error: 'Horário final deve ser diferente do horário inicial' },
        400,
      );
    }

    if (tipoDispositivoFinal === 'SIMULADOR' && simuladorIdFinal) {
      const conflito = await findSessaoConflict(c.env.DB, {
        simuladorId: simuladorIdFinal,
        data: dataFinal,
        inicioMin,
        fimMin,
        excludeId: id,
      });
      if (conflito) {
        const hi =
          typeof conflito.hora_inicio === 'string' ? conflito.hora_inicio.substring(0, 5) : '';
        const hf = typeof conflito.hora_fim === 'string' ? conflito.hora_fim.substring(0, 5) : '';
        return c.json(
          {
            success: false,
            code: 'SCHEDULE_CONFLICT',
            error: `Conflito de agendamento: já existe uma sessão neste simulador de ${hi} a ${hf}. Escolha outro horário.`,
          },
          409,
        );
      }
    }

    console.log('[PUT /sessoes] ANTES:', { id, tipo_sessao: a.tipo_sessao, nome: a.nome });
    console.log('[PUT /sessoes] PAYLOAD:', {
      tipo_sessao: b.tipo_sessao,
      tema_sessao: b.tema_sessao,
    });

    const templateIdFinal = await resolveTemplateIdSessao(c.env.DB, {
      templateId: templateIdBody !== undefined ? templateIdBody : (a as any).template_id,
      temaSessao: b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
      tipoSessaoCodigo: b.tipo_sessao !== undefined ? b.tipo_sessao : a.tipo_sessao,
      modeloAeronave: modeloAeronaveSessao,
    });

    // Verificar se as colunas tipo_dispositivo e aeronave_id existem (migration 0364)
    const colInfoUpd = await c.env.DB.prepare('PRAGMA table_info(simulador_agendamentos)').all();
    const colNomesUpd = new Set((colInfoUpd.results || []).map((r: any) => r.name));
    const hasTipoDispositivoUpd = colNomesUpd.has('tipo_dispositivo');
    const hasAeronaveIdUpd = colNomesUpd.has('aeronave_id');

    const updateFields = hasTipoDispositivoUpd && hasAeronaveIdUpd
      ? "UPDATE simulador_agendamentos SET simulador_id=?,aeronave_id=?,tipo_dispositivo=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,instrutor_id=?,tipo_sessao=?,template_id=?,status=?,observacoes=?,nome=?,updated_at=datetime('now') WHERE id=?"
      : "UPDATE simulador_agendamentos SET simulador_id=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,instrutor_id=?,tipo_sessao=?,template_id=?,status=?,observacoes=?,nome=?,updated_at=datetime('now') WHERE id=?";

    const updateBinds = hasTipoDispositivoUpd && hasAeronaveIdUpd
      ? [
          b.simulador_id !== undefined ? b.simulador_id : a.simulador_id,
          b.aeronave_id !== undefined ? b.aeronave_id : (a as any).aeronave_id,
          tipoDispositivoFinal,
          b.data || a.data,
          b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio,
          b.horario_fim !== undefined ? b.horario_fim : a.hora_fim,
          b.duracao_minutos !== undefined ? b.duracao_minutos : a.duracao_minutos,
          b.instrutor_id !== undefined ? b.instrutor_id : a.instrutor_id,
          b.tipo_sessao || a.tipo_sessao,
          templateIdFinal,
          b.status || a.status,
          b.observacoes !== undefined ? b.observacoes : a.observacoes,
          b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
          id,
        ]
      : [
          b.simulador_id || a.simulador_id,
          b.data || a.data,
          b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio,
          b.horario_fim !== undefined ? b.horario_fim : a.hora_fim,
          b.duracao_minutos !== undefined ? b.duracao_minutos : a.duracao_minutos,
          b.instrutor_id !== undefined ? b.instrutor_id : a.instrutor_id,
          b.tipo_sessao || a.tipo_sessao,
          templateIdFinal,
          b.status || a.status,
          b.observacoes !== undefined ? b.observacoes : a.observacoes,
          b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
          id,
        ];

    // UPDATE: incluindo hora_inicio, hora_fim, nome (tema_sessao), tipo_dispositivo, aeronave_id
    await c.env.DB.prepare(updateFields)
      .bind(...updateBinds)
      .run();

    // Sincronizar data_conclusao nas qualificações PLANEJADAS vinculadas (se a data mudou)
    if (b.data && b.data !== (a as any).data) {
      await c.env.DB.prepare(
        "UPDATE qualificacoes_historico SET data_conclusao=?, updated_at=datetime('now') WHERE sessao_id=? AND status='PLANEJADA' AND deleted_at IS NULL",
      )
        .bind(b.data, id)
        .run();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SINCRONIZAR instrutor_id nas fichas quando o instrutor da sessão muda.
    // Apenas fichas ainda não assinadas pelo instrutor (não concluídas).
    // Fichas de sessões de CHECK (is_check=1) NÃO são atualizadas aqui —
    // nesses casos o instrutor da ficha é o examinador, não o instrutor da sessão.
    // ──────────────────────────────────────────────────────────────────────────
    if (
      b.instrutor_id !== undefined &&
      String(b.instrutor_id) !== String((a as any).instrutor_id)
    ) {
      const isCheckSession = (a as any).is_check === 1;
      if (!isCheckSession) {
        await c.env.DB.prepare(
          `UPDATE fichas_sessao
           SET instrutor_id = ?,
               updated_at = datetime('now')
           WHERE agendamento_slot_id = ?
             AND deleted_at IS NULL
             AND assinatura_instrutor_timestamp IS NULL`,
        )
          .bind(b.instrutor_id, id)
          .run();
      }
    }

    if (resetarFluxoFichas) {
      await c.env.DB.prepare(
        `UPDATE fichas_sessao
         SET status = 'AVALIACAO_PENDENTE',
             resultado_final = 'PENDENTE',
             aprovado = NULL,
             observacoes = NULL,
             observacoes_gerais = NULL,
             assinatura_aluno_ip = NULL,
             assinatura_aluno_timestamp = NULL,
             assinatura_aluno_imagem = NULL,
             assinatura_instrutor_ip = NULL,
             assinatura_instrutor_timestamp = NULL,
             assinatura_instrutor_imagem = NULL,
             assinatura_tripulante = 0,
             assinatura_instrutor = 0,
             assinatura_aluno_completa = 0,
             assinatura_instrutor_completa = 0,
             data_conclusao = NULL,
             updated_at = datetime('now')
         WHERE agendamento_slot_id = ?
           AND deleted_at IS NULL`,
      )
        .bind(id)
        .run();

      await c.env.DB.prepare(
        `UPDATE fichas_sessao_manobras
         SET resultado = NULL,
             observacoes = '',
             updated_at = datetime('now')
         WHERE ficha_id IN (
           SELECT id
           FROM fichas_sessao
           WHERE agendamento_slot_id = ?
             AND deleted_at IS NULL
         )
           AND deleted_at IS NULL`,
      )
        .bind(id)
        .run();
    }

    // ATUALIZAR PARTICIPANTES + SINCRONIZAR FICHAS
    if (b.participantes && Array.isArray(b.participantes)) {
      const sessaoAtual = await c.env.DB.prepare(
        'SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL',
      )
        .bind(id)
        .first();

      // IDs dos participantes que estão na sessão atualmente
      const partAntigosRows = await c.env.DB.prepare(
        'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id=? AND deleted_at IS NULL',
      )
        .bind(id)
        .all();
      const idsAntigos = new Set(
        (partAntigosRows.results || []).map((r: any) => Number(r.funcionario_id)),
      );

      // IDs novos enviados pelo frontend
      const novosValidos = b.participantes.filter((p: any) => p.funcionario_id);
      const idsNovos = new Set(novosValidos.map((p: any) => Number(p.funcionario_id)));

      // Participantes removidos = estavam antes, não estão mais
      const removidos = [...idsAntigos].filter((fid) => !idsNovos.has(fid));

      // Soft-delete fichas de participantes removidos
      for (const fid of removidos) {
        await c.env.DB.prepare(
          "UPDATE fichas_sessao SET deleted_at=datetime('now') WHERE agendamento_slot_id=? AND colaborador_id_aluno=? AND deleted_at IS NULL",
        )
          .bind(id, fid)
          .run();
      }

      // Soft-delete todos os participantes antigos
      await c.env.DB.prepare(
        "UPDATE sessoes_participantes SET deleted_at=datetime('now') WHERE sessao_id=? AND deleted_at IS NULL",
      )
        .bind(id)
        .run();

      // Inserir participantes novos + criar fichas para os que entraram agora
      for (const [index, part] of novosValidos.entries()) {
        const funcao = part.funcao || (index === 0 ? 'PIC' : 'SIC');
        const partUuid = crypto.randomUUID();
        await c.env.DB.prepare(
          `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
           VALUES (?, ?, ?, ?, 'CONFIRMADO')`,
        )
          .bind(partUuid, id, part.funcionario_id, funcao)
          .run();

        // Criar ficha para qualquer participante que ainda não a tenha (cobre retroativos)
        const fichaExistente = await c.env.DB.prepare(
          'SELECT id FROM fichas_sessao WHERE agendamento_slot_id=? AND colaborador_id_aluno=? AND deleted_at IS NULL',
        )
          .bind(id, part.funcionario_id)
          .first();

        if (!fichaExistente) {
          const fichaUuid = crypto.randomUUID();
          const tipoSessao = (sessaoAtual as any)?.tipo_sessao || b.tipo_sessao || 'TREINAMENTO';
          const instrutorIdFinal =
            b.instrutor_id !== undefined
              ? b.instrutor_id
              : (sessaoAtual as any)?.instrutor_id || null;
          const dataFichaFinal =
            b.data || (sessaoAtual as any)?.data || new Date().toISOString().split('T')[0];

          // Inferir tipo_aeronave: preferir payload, senão simulador da sessão, senão ficha existente
          let tipoAeronave: string | null = b.tipo_aeronave || null;
          if (!tipoAeronave) {
            const fichaRef = await c.env.DB.prepare(
              'SELECT tipo_aeronave FROM fichas_sessao WHERE agendamento_slot_id=? AND deleted_at IS NULL LIMIT 1',
            )
              .bind(id)
              .first();
            tipoAeronave = (fichaRef as any)?.tipo_aeronave || null;
          }
          if (!tipoAeronave) {
            const simRef = await c.env.DB.prepare(
              'SELECT tipo FROM simuladores WHERE id=? AND deleted_at IS NULL',
            )
              .bind((sessaoAtual as any)?.simulador_id)
              .first();
            tipoAeronave = (simRef as any)?.tipo || null;
          }

          const resultFicha = await c.env.DB.prepare(
            `INSERT INTO fichas_sessao (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, data_sessao, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE')`,
          )
            .bind(
              fichaUuid,
              id,
              part.funcionario_id,
              instrutorIdFinal,
              tipoSessao,
              tipoAeronave,
              dataFichaFinal,
            )
            .run();

          const fichaId = resultFicha.meta.last_row_id;

          // Popular manobras automaticamente
          const modeloId =
            b.modelo_sessao_id || b.template_id || (sessaoAtual as any)?.template_id || null;
          let modeloIdFinal = modeloId;

          if (!modeloIdFinal) {
            const modeloEncontrado = await c.env.DB.prepare(
              `SELECT ms.id FROM modelos_sessao ms
                 INNER JOIN tipos_sessao ts ON ms.tipo_sessao_id = ts.id
                 WHERE ts.codigo = ? AND ms.modelo_aeronave = ? AND ms.deleted_at IS NULL
                 LIMIT 1`,
            )
              .bind(tipoSessao, tipoAeronave)
              .first();
            if (modeloEncontrado) modeloIdFinal = (modeloEncontrado as any).id;
          }

          if (modeloIdFinal) {
            const manobras = await c.env.DB.prepare(
              `SELECT m.codigo, m.nome, COALESCE(m.nome, m.descricao) AS descricao, m.categoria,
                      msm.ordem, COALESCE(msm.tripulante, 'AB') as tripulante
                 FROM modelos_sessao_manobras msm
                 INNER JOIN manobras m ON m.id = msm.manobra_id
                 WHERE msm.modelo_id = ? AND msm.deleted_at IS NULL AND m.deleted_at IS NULL
                 ORDER BY msm.ordem ASC`,
            )
              .bind(modeloIdFinal)
              .all();

            for (const man of manobras.results || []) {
              const m = man as {
                codigo: string;
                nome: string;
                descricao: string;
                categoria: string;
                ordem: number;
                tripulante: string;
              };
              await c.env.DB.prepare(
                `INSERT INTO fichas_sessao_manobras (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, resultado, observacoes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '')`,
              )
                .bind(
                  fichaId,
                  m.codigo,
                  m.nome || m.descricao || '',
                  m.descricao || '',
                  m.categoria || 'GERAL',
                  m.ordem,
                  m.tripulante || 'AB',
                )
                .run();
            }
          }
        }
      }

      if (resetarFluxoFichas) {
        await c.env.DB.prepare(
          `UPDATE fichas_sessao
           SET status = 'AVALIACAO_PENDENTE',
               resultado_final = 'PENDENTE',
               aprovado = NULL,
               observacoes = NULL,
               observacoes_gerais = NULL,
               assinatura_aluno_ip = NULL,
               assinatura_aluno_timestamp = NULL,
               assinatura_aluno_imagem = NULL,
               assinatura_instrutor_ip = NULL,
               assinatura_instrutor_timestamp = NULL,
               assinatura_instrutor_imagem = NULL,
               assinatura_tripulante = 0,
               assinatura_instrutor = 0,
               assinatura_aluno_completa = 0,
               assinatura_instrutor_completa = 0,
               data_conclusao = NULL,
               updated_at = datetime('now')
           WHERE agendamento_slot_id = ?
             AND deleted_at IS NULL`,
        )
          .bind(id)
          .run();

        await c.env.DB.prepare(
          `UPDATE fichas_sessao_manobras
           SET resultado = NULL,
               observacoes = '',
               updated_at = datetime('now')
           WHERE ficha_id IN (
             SELECT id
             FROM fichas_sessao
             WHERE agendamento_slot_id = ?
               AND deleted_at IS NULL
           )
             AND deleted_at IS NULL`,
        )
          .bind(id)
          .run();
      }

      for (const fid of removidos) {
        await removeManagedEscalaEvents({
          db: c.env.DB,
          funcionarioId: fid,
          origem: 'simuladores',
          linkId: `sim_sessao:${id}`,
        });
      }

      await syncSessaoEscalaEventos(c.env.DB, {
        empresaId: (sessaoAtual as any)?.empresa_id || (c as any).get('empresaId') || null,
        sessaoId: id,
        simuladorId: simuladorIdFinal,
        data: dataFinal,
        status: b.status ?? a.status,
        temaSessao: b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
        tipoSessao: b.tipo_sessao ?? a.tipo_sessao,
        observacoes: b.observacoes !== undefined ? b.observacoes : a.observacoes,
        participantes: novosValidos.map((part: any) => ({ funcionario_id: part.funcionario_id })),
        createdBy: String((c as any).get('userId') || 'system'),
      });
    }

    const u = await c.env.DB.prepare(
      'SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .first<any>();

    console.log('[PUT /sessoes] DEPOIS:', { tipo_sessao: u?.tipo_sessao, nome: u?.nome });

    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: a,
      dados_novos: u,
    });

    if (!b.participantes || !Array.isArray(b.participantes)) {
      const participantesAtivos = await c.env.DB.prepare(
        'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id = ? AND deleted_at IS NULL',
      )
        .bind(id)
        .all<{ funcionario_id: string | number }>();

      await syncSessaoEscalaEventos(c.env.DB, {
        empresaId: (u as any)?.empresa_id || (c as any).get('empresaId') || null,
        sessaoId: id,
        simuladorId: (u as any)?.simulador_id,
        data: String((u as any)?.data || dataFinal),
        status: (u as any)?.status,
        temaSessao: (u as any)?.nome || null,
        tipoSessao: (u as any)?.tipo_sessao || null,
        observacoes: (u as any)?.observacoes || null,
        participantes: (participantesAtivos.results || []).map((item) => ({
          funcionario_id: item.funcionario_id,
        })),
        createdBy: String((c as any).get('userId') || 'system'),
      });
    }

    try {
      const empresaId = Number((c as any).get('empresaId') || (u as any)?.empresa_id || 0);
      const partRows = await c.env.DB.prepare(
        'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id = ? AND deleted_at IS NULL',
      )
        .bind(id)
        .all<{ funcionario_id: string | number }>();
      if (empresaId > 0) {
        await Promise.allSettled(
          (partRows.results || []).map((participante) =>
            publishDomainEvent(
              c.env.DB,
              'simuladores',
              String((u as any)?.status || '').toUpperCase() === 'CONCLUIDA'
                ? 'SIMULADOR_REALIZADO'
                : 'SIMULADOR_AGENDADO',
              {
                funcionario_id: String(participante.funcionario_id),
                empresa_id: empresaId,
                origem_modulo: 'simuladores',
                sessao_id: String(id),
                data_sessao: (u as any)?.data || null,
                tipo_sessao: (u as any)?.tipo_sessao || null,
              },
            ),
          ),
        );
      }
    } catch (error) {
      console.error('domain_event_error', error);
    }

    // Email: when session transitions to CONCLUIDA and fichas are in AVALIACAO_PENDENTE,
    // notify instrutor to fill the evaluation.
    const statusAnterior = String(a?.status || '').toUpperCase();
    const statusNovo = String((u as any)?.status || '').toUpperCase();
    if (statusNovo === 'CONCLUIDA' && statusAnterior !== 'CONCLUIDA') {
      try {
        const fichasRows = await c.env.DB.prepare(
          `SELECT id FROM fichas_sessao
           WHERE agendamento_slot_id = ?
             AND status = 'AVALIACAO_PENDENTE'
             AND deleted_at IS NULL`,
        )
          .bind(id)
          .all<{ id: number }>();

        for (const ficha of fichasRows.results || []) {
          enviarEmailFichaSessao(
            c.env,
            c.env.DB,
            Number(ficha.id),
            'instrutor_avaliacao_pendente',
          ).catch((err) => console.error('[fichaEmails] fire-and-forget error:', err));
        }
      } catch (err) {
        console.error('[fichaEmails] Erro ao buscar fichas para notificação:', err);
      }
    }

    return c.json({ success: true, data: u });
  } catch (e: any) {
    console.error('[PUT /sessoes] ERRO:', e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.delete('/sessoes/:id', async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');

    // Buscar sessão
    const a = await c.env.DB.prepare(
      'SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();
    if (!a) return c.json({ success: false, error: 'Sessão não encontrada' }, 404);

    const participantes = await c.env.DB.prepare(
      'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .all<{ funcionario_id: string | number }>();

    // Soft delete da sessão
    await c.env.DB.prepare(
      "UPDATE simulador_agendamentos SET deleted_at=datetime('now') WHERE id=?",
    )
      .bind(id)
      .run();

    // Soft delete dos participantes
    await c.env.DB.prepare(
      "UPDATE sessoes_participantes SET deleted_at=datetime('now') WHERE sessao_id=?",
    )
      .bind(id)
      .run();

    // Soft delete das fichas vinculadas à sessão
    await c.env.DB.prepare(
      "UPDATE fichas_sessao SET deleted_at=datetime('now') WHERE agendamento_slot_id=?",
    )
      .bind(id)
      .run();

    // Cancelar qualificações PLANEJADAS vinculadas à sessão
    await c.env.DB.prepare(
      "UPDATE qualificacoes_historico SET deleted_at=datetime('now') WHERE sessao_id=? AND status='PLANEJADA' AND deleted_at IS NULL",
    )
      .bind(id)
      .run();

    // Auditoria
    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: a,
    });

    await Promise.all(
      (participantes.results || []).map((item) =>
        removeManagedEscalaEvents({
          db: c.env.DB,
          funcionarioId: item.funcionario_id,
          origem: 'simuladores',
          linkId: `sim_sessao:${id}`,
        }),
      ),
    );

    return c.json({
      success: true,
      message: 'Sessão, participantes e fichas excluídos com sucesso',
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export default app;
