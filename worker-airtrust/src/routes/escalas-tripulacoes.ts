/**
 * ESCALAS — Tripulações (POST/GET/PUT/DELETE)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { verificarConflitosEscala, verificarCMAAutomatico } from '../utils/escala-engine';
import {
  getEmpresaIdSafe,
  getEscalaVerificada,
  getEscalaVerificadaParaMutacao,
  parseBody,
  TripulacaoSchema,
  gerarEventosBase,
  removerEventosAutoGerados,
} from './escalas-shared';
import { publishDomainEvent } from '../shared/domainEvents';

const tripulacoes = new Hono<{ Bindings: Env }>();

async function auditarTripulacao(
  db: D1Database,
  params: {
    escala_id: string;
    acao: string;
    tripulacao_id: string;
    realizado_por: string;
    valor_anterior?: string;
    valor_novo?: string;
  },
): Promise<void> {
  await Promise.all([
    db
      .prepare(
        `INSERT INTO escala_auditoria (id, escala_id, evento_id, acao, campo_alterado, valor_anterior, valor_novo, justificativa, realizado_por, realizado_em)
         VALUES (?, ?, ?, ?, 'tripulacao', ?, ?, NULL, ?, datetime('now'))`,
      )
      .bind(
        crypto.randomUUID(),
        params.escala_id,
        params.tripulacao_id,
        params.acao,
        params.valor_anterior || null,
        params.valor_novo || null,
        params.realizado_por,
      )
      .run(),
    db
      .prepare(
        `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos, usuario_id, origem, created_at)
         VALUES ('escala_tripulacoes', ?, ?, ?, ?, ?, 'api', datetime('now'))`,
      )
      .bind(
        params.acao,
        params.tripulacao_id,
        params.valor_anterior || null,
        params.valor_novo || null,
        params.realizado_por,
      )
      .run(),
  ]);
}

function normalizeAeronaveEscala(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

async function findTripulacaoDuplicadaPorAeronave(
  db: D1Database,
  escalaId: string,
  aeronave: string | null | undefined,
  ignoredTripulacaoId?: string,
): Promise<{ id: string } | null> {
  const aeronaveNormalizada = normalizeAeronaveEscala(aeronave);
  if (!aeronaveNormalizada) return null;

  const sql = ignoredTripulacaoId
    ? `SELECT id
         FROM escala_tripulacoes
        WHERE escala_id = ?
          AND deleted_at IS NULL
          AND id <> ?
          AND UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(aeronave, ''), '  ', ' '), '  ', ' '), '  ', ' '))) = ?
        LIMIT 1`
    : `SELECT id
         FROM escala_tripulacoes
        WHERE escala_id = ?
          AND deleted_at IS NULL
          AND UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(aeronave, ''), '  ', ' '), '  ', ' '), '  ', ' '))) = ?
        LIMIT 1`;

  const stmt = db.prepare(sql);
  return ignoredTripulacaoId
    ? stmt.bind(escalaId, ignoredTripulacaoId, aeronaveNormalizada).first<{ id: string }>()
    : stmt.bind(escalaId, aeronaveNormalizada).first<{ id: string }>();
}

async function resolveAeronaveDescricao(
  db: D1Database,
  input: { aeronave?: string | null; aeronave_id?: string | number | null | undefined },
): Promise<string | null> {
  const aeronaveTexto = String(input.aeronave || '').trim();
  if (aeronaveTexto) return aeronaveTexto;

  const aeronaveId = String(input.aeronave_id || '').trim();
  if (!aeronaveId) return null;

  const aeronave = await db
    .prepare(
      `SELECT prefixo, modelo
         FROM aeronaves
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(aeronaveId)
    .first<{ prefixo: string | null; modelo: string | null }>();

  if (!aeronave) return null;
  return `${aeronave.prefixo ?? ''} ${aeronave.modelo ?? ''}`.trim() || null;
}

// POST /:id/tripulacoes — adicionar tripulação
tripulacoes.post('/:id/tripulacoes', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id: escala_id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  const body = await c.req.json();
  const parsed = parseBody(TripulacaoSchema, body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  try {
    const escalaResult = await getEscalaVerificadaParaMutacao(db, escala_id, empresaId);
    if ('error' in escalaResult) {
      return c.json(
        { success: false, error: escalaResult.error },
        escalaResult.status as 400 | 404 | 409,
      );
    }
    const escala = escalaResult.escala;

    const d = parsed.data;
    const picId = String(d.pic_id);
    const sicId = d.sic_id ? String(d.sic_id) : undefined;
    const dataInicio = String(d.data_inicio);
    const dataFim = String(d.data_fim);
    const padraoEscalaId = d.padrao_escala_id ? String(d.padrao_escala_id) : undefined;
    const aeronaveDescricao = await resolveAeronaveDescricao(db, d);

    if (!aeronaveDescricao) {
      return c.json({ success: false, error: 'Aeronave é obrigatória' }, 400);
    }

    const duplicada = await findTripulacaoDuplicadaPorAeronave(db, escala_id, aeronaveDescricao);
    if (duplicada) {
      return c.json(
        {
          success: false,
          error: 'Já existe uma tripulação ativa para esta aeronave nesta escala',
          code: 'TRIPULACAO_DUPLICADA_AERONAVE',
        },
        409,
      );
    }

    if (sicId && picId === sicId) {
      return c.json({ success: false, error: 'SIC não pode ser o mesmo piloto que o PIC' }, 400);
    }

    // Verificar restrições de tripulação
    if (sicId) {
      const restricao = await db
        .prepare(
          `SELECT * FROM restricoes_tripulacao
           WHERE ((funcionario_a_id = ? AND funcionario_b_id = ?) OR (funcionario_a_id = ? AND funcionario_b_id = ?))
             AND tipo_restricao = 'nao_pode_voar_junto'
             AND ativo = 1 AND deleted_at IS NULL
             AND (data_fim IS NULL OR data_fim >= ?)`,
        )
        .bind(picId, sicId, sicId, picId, dataInicio)
        .first();

      if (restricao) {
        return c.json(
          {
            success: false,
            error: 'Restrição de tripulação: estes pilotos não podem voar juntos',
            restricao,
          },
          409,
        );
      }

      // ── GAP 4 (NOP-OPS-038 §1.ii): Soma de idades ≤ 129 anos ──
      // Exceção: se um dos pilotos for IN ou EC exercendo função a bordo
      try {
        const pilotos = await db
          .prepare(
            `SELECT id, nascimento AS data_nascimento, funcao FROM funcionarios
             WHERE id IN (?, ?) AND deleted_at IS NULL`,
          )
          .bind(picId, sicId)
          .all<{ id: number; data_nascimento: string | null; funcao: string | null }>();

        const picRow = pilotos.results?.find((p) => String(p.id) === picId);
        const sicRow = pilotos.results?.find((p) => String(p.id) === sicId);

        // Funções auxiliares e flags hoist para uso nas verificações de CMA abaixo
        const hoje = new Date();
        const calcIdade = (dn: string) => {
          const nascimento = new Date(dn);
          let anos = hoje.getFullYear() - nascimento.getFullYear();
          const m = hoje.getMonth() - nascimento.getMonth();
          if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) anos--;
          return anos;
        };
        const funcaoPIC = (picRow?.funcao || '').toUpperCase();
        const funcaoSIC = (sicRow?.funcao || '').toUpperCase();
        const isInstrutor =
          funcaoPIC.includes('INSTRUTOR') ||
          funcaoPIC.includes('IN') ||
          funcaoSIC.includes('INSTRUTOR') ||
          funcaoSIC.includes('IN');
        const isExaminador =
          funcaoPIC.includes('EXAMINADOR') ||
          funcaoPIC.includes('EC') ||
          funcaoSIC.includes('EXAMINADOR') ||
          funcaoSIC.includes('EC');

        if (picRow?.data_nascimento && sicRow?.data_nascimento) {
          const idadePIC = calcIdade(picRow.data_nascimento);
          const idadeSIC = calcIdade(sicRow.data_nascimento);
          const somaIdades = idadePIC + idadeSIC;

          if (somaIdades > 129 && !isInstrutor && !isExaminador) {
            return c.json(
              {
                success: false,
                error: `Soma de idades (${idadePIC} + ${idadeSIC} = ${somaIdades}) excede o limite de 129 anos (NOP-OPS-038 §1.ii)`,
                code: 'SOMA_IDADES_EXCEDIDA',
                detalhes: {
                  pic_idade: idadePIC,
                  sic_idade: idadeSIC,
                  soma: somaIdades,
                  limite: 129,
                },
              },
              409,
            );
          }
        }

        // ── GAP 5 (NOP-OPS-038 §1.i): Restrições CMA na composição ──
        // Buscar CMA status de ambos pilotos
        const cmaRows = await db
          .prepare(
            `SELECT qh.funcionario_id, qh.observacoes
             FROM qualificacoes_historico qh
             JOIN qualificacoes_tipos qt ON COALESCE(qh.qualificacao_codigo, qt.codigo) = qt.codigo
             WHERE qt.codigo = 'CMA'
               AND qh.funcionario_id IN (?, ?)
               AND qh.deleted_at IS NULL
               AND qh.id IN (
                 SELECT MAX(id) FROM qualificacoes_historico
                 WHERE deleted_at IS NULL AND qualificacao_codigo = 'CMA'
                 GROUP BY funcionario_id
               )`,
          )
          .bind(picId, sicId)
          .all<{ funcionario_id: number; observacoes: string | null }>();

        const cmaPIC = cmaRows.results?.find((r) => String(r.funcionario_id) === picId);
        const cmaSIC = cmaRows.results?.find((r) => String(r.funcionario_id) === sicId);
        const cmaObsPIC = (cmaPIC?.observacoes || '').toUpperCase();
        const cmaObsSIC = (cmaSIC?.observacoes || '').toUpperCase();
        const picTemRestricao =
          cmaObsPIC.includes('RESTRICAO') ||
          cmaObsPIC.includes('RESTRIÇÃO') ||
          cmaObsPIC.includes('SOLO');
        const sicTemRestricao =
          cmaObsSIC.includes('RESTRICAO') ||
          cmaObsSIC.includes('RESTRIÇÃO') ||
          cmaObsSIC.includes('SOLO');

        if (picTemRestricao && sicTemRestricao && !isInstrutor && !isExaminador) {
          return c.json(
            {
              success: false,
              error:
                'Dois pilotos com restrição de CMA não podem compor a mesma tripulação (NOP-OPS-038 §1.i)',
              code: 'CMA_RESTRICAO_DUPLA',
            },
            409,
          );
        }

        // Restrição voo solo + idade > 59
        if (picTemRestricao || sicTemRestricao) {
          const idadePICCheck = picRow?.data_nascimento ? calcIdade(picRow.data_nascimento) : 0;
          const idadeSICCheck = sicRow?.data_nascimento ? calcIdade(sicRow.data_nascimento) : 0;
          if (picTemRestricao && idadeSICCheck > 59 && !isInstrutor && !isExaminador) {
            return c.json(
              {
                success: false,
                error: `PIC com restrição CMA não pode voar com SIC acima de 59 anos (${idadeSICCheck} anos) — NOP-OPS-038 §1.i`,
                code: 'CMA_RESTRICAO_IDADE',
              },
              409,
            );
          }
          if (sicTemRestricao && idadePICCheck > 59 && !isInstrutor && !isExaminador) {
            return c.json(
              {
                success: false,
                error: `SIC com restrição CMA não pode voar com PIC acima de 59 anos (${idadePICCheck} anos) — NOP-OPS-038 §1.i`,
                code: 'CMA_RESTRICAO_IDADE',
              },
              409,
            );
          }
        }

        // ── GAP 6 (PRC-OPS-009 §6.1.9a): Experiência mínima PIC/SIC por tipo ──
        // Alerta (warning, não bloqueante) se PIC < 100h PIC no tipo + SIC < 500h no tipo
        if (d.aeronave) {
          const horasPIC = await db
            .prepare(
              `SELECT COALESCE(SUM(horas_voo_minutos), 0) AS minutos
               FROM frms_jornada
               WHERE tripulante_id = ? AND deleted_at IS NULL`,
            )
            .bind(picId)
            .first<{ minutos: number }>();

          const horasSIC = await db
            .prepare(
              `SELECT COALESCE(SUM(horas_voo_minutos), 0) AS minutos
               FROM frms_jornada
               WHERE tripulante_id = ? AND deleted_at IS NULL`,
            )
            .bind(sicId)
            .first<{ minutos: number }>();

          const horasVooPIC = (horasPIC?.minutos || 0) / 60;
          const horasVooSIC = (horasSIC?.minutos || 0) / 60;

          // Non-blocking: adds warning to response but allows creation
          if (horasVooPIC < 100 && horasVooSIC < 500) {
            // Store warning for response enrichment below
            (c as unknown as Record<string, unknown>).__compliance_warnings = [
              `⚠️ Experiência: PIC com ${horasVooPIC.toFixed(0)}h (mín 100h PIC) e SIC com ${horasVooSIC.toFixed(0)}h (mín 500h) — PRC-OPS-009 §6.1.9a`,
            ];
          }
        }
      } catch (validationErr) {
        console.warn('[COMPLIANCE] Erro nas validações NOP-OPS-038:', validationErr);
        // Validações de compliance são non-blocking em caso de dados incompletos
      }
    }

    // Validar modelo de aeronave do PIC
    if (d.aeronave && picId) {
      try {
        const prefixoAeronave = d.aeronave.split(' ')[0];
        const aeronaveRow = await db
          .prepare(
            `SELECT modelo FROM aeronaves
             WHERE prefixo = ?
               AND deleted_at IS NULL
               AND (empresa_id IS NULL OR empresa_id = ?)
             LIMIT 1`,
          )
          .bind(prefixoAeronave, empresaId)
          .first<{ modelo: string }>();
        if (aeronaveRow) {
          const piloto = await db
            .prepare(
              `SELECT modelo_aeronave_id FROM funcionarios
               WHERE id = ?
                 AND deleted_at IS NULL
                 AND (empresa_id IS NULL OR empresa_id = ?)
               LIMIT 1`,
            )
            .bind(picId, empresaId)
            .first<{ modelo_aeronave_id: string | null }>();
          if (piloto?.modelo_aeronave_id) {
            const modeloAeronave = aeronaveRow.modelo.toUpperCase();
            const tokens = String(piloto.modelo_aeronave_id)
              .split(',')
              .map((token) => token.trim())
              .filter(Boolean);
            const placeholders = tokens.map(() => '?').join(',');
            const rows = tokens.length
              ? await db
                  .prepare(
                    `SELECT modelo, codigo FROM modelos_aeronave WHERE CAST(id AS TEXT) IN (${placeholders})`,
                  )
                  .bind(...tokens)
                  .all<{ modelo: string; codigo: string }>()
              : { results: [] as Array<{ modelo: string; codigo: string }> };
            const habilitacoes = [
              ...tokens,
              ...(rows.results || []).flatMap((row) => [row.modelo, row.codigo]),
            ]
              .map((item) => String(item || '').toUpperCase())
              .filter(Boolean);
            const match = habilitacoes.some(
              (habilitacao) =>
                modeloAeronave === habilitacao ||
                modeloAeronave.includes(habilitacao) ||
                habilitacao.includes(modeloAeronave),
            );
            if (!match) {
              return c.json(
                {
                  success: false,
                  error: `PIC não habilitado para ${aeronaveRow.modelo} — habilitações: ${habilitacoes.join(', ')}`,
                },
                400,
              );
            }
          }
        }
      } catch {
        // validação não bloqueia em caso de erro de lookup
      }
    }

    // Verificar conflito de datas para o PIC
    const conflitos = await verificarConflitosEscala(db, {
      escala_id,
      funcionario_id: picId,
      data_inicio: dataInicio,
      data_fim: dataFim,
    });

    if (conflitos.length > 0) {
      return c.json(
        { success: false, error: 'Conflito de datas detectado para o PIC', conflitos },
        409,
      );
    }

    const tripulacaoId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO escala_tripulacoes
         (id, escala_id, pic_id, sic_id, data_inicio, data_fim, padrao_escala_id, aeronave, base, restricoes, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        tripulacaoId,
        escala_id,
        picId,
        sicId || null,
        dataInicio,
        dataFim,
        padraoEscalaId || null,
        aeronaveDescricao,
        d.base || null,
        d.restricoes ? JSON.stringify(d.restricoes) : null,
        d.observacoes || null,
        now,
        now,
      )
      .run();

    // CMA automático para PIC
    const cmaAlertaPIC = await verificarCMAAutomatico(db, {
      escala_id,
      tripulacao_id: tripulacaoId,
      funcionario_id: picId,
      data_inicio: dataInicio,
      data_fim: dataFim,
      created_by: userId,
    });

    // CMA automático para SIC
    let cmaAlertaSIC: {
      criado: boolean;
      alerta?: boolean;
      data_exame?: string;
      motivo?: string;
    } | null = null;
    if (sicId) {
      cmaAlertaSIC = await verificarCMAAutomatico(db, {
        escala_id,
        tripulacao_id: tripulacaoId,
        funcionario_id: sicId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        created_by: userId,
      });
    }

    const alertasCMA = [
      cmaAlertaPIC.alerta ? cmaAlertaPIC : null,
      cmaAlertaSIC?.alerta ? cmaAlertaSIC : null,
    ].filter(Boolean);

    // AUTO-FILL: gerar eventos base VOO/FOL para PIC
    let eventosGerados = 0;
    try {
      eventosGerados += await gerarEventosBase({
        db,
        empresa_id: empresaId,
        escala_id,
        tripulacao_id: tripulacaoId,
        funcionario_id: picId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        padrao_escala_id: padraoEscalaId,
        aeronave: d.aeronave,
        base: d.base,
        created_by: userId,
      });
      // AUTO-FILL: gerar eventos base VOO/FOL para SIC
      if (sicId) {
        eventosGerados += await gerarEventosBase({
          db,
          empresa_id: empresaId,
          escala_id,
          tripulacao_id: tripulacaoId,
          funcionario_id: sicId,
          data_inicio: dataInicio,
          data_fim: dataFim,
          padrao_escala_id: padraoEscalaId,
          aeronave: d.aeronave,
          base: d.base,
          created_by: userId,
        });
      }
    } catch (e) {
      // Auto-fill is non-blocking — tripulação was already created
      console.error('[gerarEventosBase] error:', e);
    }

    try {
      await publishDomainEvent(db, 'escalas', 'TRIPULANTE_ALOCADO', {
        empresa_id: empresaId,
        origem_modulo: 'escalas',
        origem_usuario_id: userId,
        funcionario_id: picId,
        escala_id,
        tripulacao_id: tripulacaoId,
        papel: 'PIC',
        data_inicio: dataInicio,
        data_fim: dataFim,
        base_destino: d.base || null,
      });

      if (sicId) {
        await publishDomainEvent(db, 'escalas', 'TRIPULANTE_ALOCADO', {
          empresa_id: empresaId,
          origem_modulo: 'escalas',
          origem_usuario_id: userId,
          funcionario_id: sicId,
          escala_id,
          tripulacao_id: tripulacaoId,
          papel: 'SIC',
          data_inicio: dataInicio,
          data_fim: dataFim,
          base_destino: d.base || null,
        });
      }
    } catch (error) {
      console.error('domain_event_error', error);
    }

    await auditarTripulacao(db, {
      escala_id,
      acao: 'CRIAR_TRIPULACAO',
      tripulacao_id: tripulacaoId,
      realizado_por: userId,
      valor_novo: JSON.stringify({
        pic_id: picId,
        sic_id: sicId || null,
        aeronave: aeronaveDescricao,
        data_inicio: dataInicio,
        data_fim: dataFim,
      }),
    });

    const complianceWarnings = ((c as unknown as Record<string, unknown>).__compliance_warnings ||
      []) as string[];
    return c.json(
      {
        success: true,
        data: {
          id: tripulacaoId,
          eventos_gerados: eventosGerados,
          alertas_cma: alertasCMA,
          ...(complianceWarnings.length > 0 ? { compliance_warnings: complianceWarnings } : {}),
        },
      },
      201,
    );
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// GET /:id/tripulacoes — listar tripulações
tripulacoes.get('/:id/tripulacoes', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const result = await db
      .prepare(
        `SELECT et.*,
                pic.nome as pic_nome, pic.matricula as pic_matricula, pic.guerra as pic_nome_guerra,
                sic.nome as sic_nome, sic.matricula as sic_matricula, sic.guerra as sic_nome_guerra,
                pe.nome as padrao_nome, pe.dias_trabalho, pe.dias_folga
        FROM escala_tripulacoes et
        JOIN escalas_mensais em ON em.id = et.escala_id
        LEFT JOIN funcionarios pic ON et.pic_id = pic.id AND (pic.empresa_id IS NULL OR pic.empresa_id = em.empresa_id)
        LEFT JOIN funcionarios sic ON et.sic_id = sic.id AND (sic.empresa_id IS NULL OR sic.empresa_id = em.empresa_id)
        LEFT JOIN padroes_escala pe ON et.padrao_escala_id = pe.id
         WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
         ORDER BY et.data_inicio`,
      )
      .bind(id, empresaId)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// DELETE /:id/tripulacoes/:tripId — soft delete tripulação
tripulacoes.delete(
  '/:id/tripulacoes/:tripId',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const { id, tripId } = c.req.param();
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const now = new Date().toISOString();
    try {
      const escala = await getEscalaVerificada(db, id, empresaId);
      if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

      const currentTrip = await db
        .prepare(
          `SELECT * FROM escala_tripulacoes WHERE id = ? AND escala_id = ? AND deleted_at IS NULL`,
        )
        .bind(tripId, id)
        .first<Record<string, unknown>>();

      if (!currentTrip) {
        return c.json({ success: false, error: 'Tripulação não encontrada' }, 404);
      }

      await db
        .prepare(
          `UPDATE escala_tripulacoes SET deleted_at = ?, updated_at = ? WHERE id = ? AND escala_id = ?`,
        )
        .bind(now, now, tripId, id)
        .run();

      // Cleanup: remove auto-generated events for this tripulação
      try {
        await removerEventosAutoGerados(db, id, tripId);
      } catch (e) {
        console.error('[DELETE tripulacao] removerEventosAutoGerados error:', e);
      }

      try {
        const userId = String(
          (c as unknown as { get: (key: string) => unknown }).get('userId') || '',
        );
        if (currentTrip?.pic_id) {
          await publishDomainEvent(db, 'escalas', 'TRIPULANTE_REMOVIDO', {
            empresa_id: empresaId,
            origem_modulo: 'escalas',
            origem_usuario_id: userId,
            funcionario_id: String(currentTrip.pic_id),
            escala_id: id,
            tripulacao_id: tripId,
            papel: 'PIC',
          });
        }
        if (currentTrip?.sic_id) {
          await publishDomainEvent(db, 'escalas', 'TRIPULANTE_REMOVIDO', {
            empresa_id: empresaId,
            origem_modulo: 'escalas',
            origem_usuario_id: userId,
            funcionario_id: String(currentTrip.sic_id),
            escala_id: id,
            tripulacao_id: tripId,
            papel: 'SIC',
          });
        }
      } catch (error) {
        console.error('domain_event_error', error);
      }

      const userId = String(
        (c as unknown as { get: (key: string) => unknown }).get('userId') || '',
      );
      await auditarTripulacao(db, {
        escala_id: id,
        acao: 'REMOVER_TRIPULACAO',
        tripulacao_id: tripId,
        realizado_por: userId,
        valor_anterior: JSON.stringify(currentTrip),
      });

      return c.json({ success: true });
    } catch (e) {
      return c.json({ success: false, error: String(e) }, 500);
    }
  },
);

// PUT /:id/tripulacoes/:tripId — editar tripulação
tripulacoes.put('/:id/tripulacoes/:tripId', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id, tripId } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const now = new Date().toISOString();
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const beforeUpdate = await db
      .prepare(
        `SELECT * FROM escala_tripulacoes WHERE id = ? AND escala_id = ? AND deleted_at IS NULL`,
      )
      .bind(tripId, id)
      .first<Record<string, unknown>>();

    if (!beforeUpdate) {
      return c.json({ success: false, error: 'Tripulação não encontrada' }, 404);
    }

    const body = await c.req.json();
    const fields: string[] = [];
    const values: unknown[] = [];

    const aeronaveDescricao = await resolveAeronaveDescricao(db, body);

    const allowed = [
      'pic_id',
      'sic_id',
      'data_inicio',
      'data_fim',
      'padrao_escala_id',
      'aeronave',
      'base',
      'observacoes',
    ];
    for (const key of allowed) {
      if (key in body) {
        fields.push(`${key} = ?`);
        values.push(key === 'aeronave' ? (aeronaveDescricao ?? null) : (body[key] ?? null));
      }
    }
    if (!('aeronave' in body) && body.aeronave_id && aeronaveDescricao) {
      fields.push('aeronave = ?');
      values.push(aeronaveDescricao);
    }
    if (fields.length === 0)
      return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);

    const nextPic = (body.pic_id as string | undefined) ?? null;
    const nextSic = (body.sic_id as string | null | undefined) ?? null;
    const nextAeronave =
      aeronaveDescricao ??
      (body.aeronave as string | null | undefined) ??
      (beforeUpdate?.aeronave ? String(beforeUpdate.aeronave) : null);
    if (nextPic && nextSic && nextPic === nextSic) {
      return c.json({ success: false, error: 'SIC não pode ser o mesmo piloto que o PIC' }, 400);
    }

    const duplicada = await findTripulacaoDuplicadaPorAeronave(db, id, nextAeronave, tripId);
    if (duplicada) {
      return c.json(
        {
          success: false,
          error: 'Já existe uma tripulação ativa para esta aeronave nesta escala',
          code: 'TRIPULACAO_DUPLICADA_AERONAVE',
        },
        409,
      );
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(tripId);
    values.push(id);

    await db
      .prepare(
        `UPDATE escala_tripulacoes SET ${fields.join(', ')} WHERE id = ? AND escala_id = ? AND deleted_at IS NULL`,
      )
      .bind(...values)
      .run();

    // Regenerate auto-fill events if dates/padrão/crew changed
    const shouldRegenerate =
      'data_inicio' in body ||
      'data_fim' in body ||
      'padrao_escala_id' in body ||
      'pic_id' in body ||
      'sic_id' in body;

    if (shouldRegenerate) {
      const userId = String(
        (c as unknown as { get: (key: string) => unknown }).get('userId') || '',
      );
      // Fetch updated tripulação to get current values
      const updated = await db
        .prepare(
          `SELECT et.*
             FROM escala_tripulacoes et
             JOIN escalas_mensais em ON em.id = et.escala_id
            WHERE et.id = ? AND et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL`,
        )
        .bind(tripId, id, empresaId)
        .first<Record<string, unknown>>();

      if (updated) {
        // Remove old auto-generated events
        await removerEventosAutoGerados(db, id, tripId);

        const params = {
          db,
          empresa_id: empresaId,
          escala_id: id,
          tripulacao_id: tripId,
          data_inicio: String(updated.data_inicio),
          data_fim: String(updated.data_fim),
          padrao_escala_id: updated.padrao_escala_id as string | null,
          aeronave: updated.aeronave as string | null,
          base: updated.base as string | null,
          created_by: userId,
        };

        try {
          // Regenerate for PIC
          if (updated.pic_id) {
            await gerarEventosBase({ ...params, funcionario_id: String(updated.pic_id) });
          }
          // Regenerate for SIC
          if (updated.sic_id) {
            await gerarEventosBase({ ...params, funcionario_id: String(updated.sic_id) });
          }
        } catch (e) {
          console.error('[PUT tripulacao] gerarEventosBase error:', e);
        }
      }
    }

    try {
      const userId = String(
        (c as unknown as { get: (key: string) => unknown }).get('userId') || '',
      );
      const afterUpdate = await db
        .prepare(
          `SELECT * FROM escala_tripulacoes WHERE id = ? AND escala_id = ? AND deleted_at IS NULL`,
        )
        .bind(tripId, id)
        .first<Record<string, unknown>>();
      const candidatos = [
        afterUpdate?.pic_id ? { funcionario_id: String(afterUpdate.pic_id), papel: 'PIC' } : null,
        afterUpdate?.sic_id ? { funcionario_id: String(afterUpdate.sic_id), papel: 'SIC' } : null,
      ].filter(Boolean) as Array<{ funcionario_id: string; papel: string }>;

      for (const candidato of candidatos) {
        await publishDomainEvent(db, 'escalas', 'TRIPULANTE_ALTERADO', {
          empresa_id: empresaId,
          origem_modulo: 'escalas',
          origem_usuario_id: userId,
          funcionario_id: candidato.funcionario_id,
          escala_id: id,
          tripulacao_id: tripId,
          papel: candidato.papel,
          data_inicio: String(afterUpdate?.data_inicio ?? beforeUpdate?.data_inicio ?? ''),
          data_fim: String(afterUpdate?.data_fim ?? beforeUpdate?.data_fim ?? ''),
          base_destino: String(afterUpdate?.base ?? beforeUpdate?.base ?? ''),
        });
      }
    } catch (error) {
      console.error('domain_event_error', error);
    }

    await auditarTripulacao(db, {
      escala_id: id,
      acao: 'EDITAR_TRIPULACAO',
      tripulacao_id: tripId,
      realizado_por: userId,
      valor_anterior: JSON.stringify(beforeUpdate),
      valor_novo: JSON.stringify(body),
    });

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// POST /:id/tripulacoes/:tripId/regenerar-eventos — recria VOO/FOL de uma tripulação
tripulacoes.post(
  '/:id/tripulacoes/:tripId/regenerar-eventos',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const { id, tripId } = c.req.param();
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');

    try {
      const escala = await getEscalaVerificada(db, id, empresaId);
      if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

      const trip = await db
        .prepare(
          `SELECT et.*
             FROM escala_tripulacoes et
             JOIN escalas_mensais em ON em.id = et.escala_id
            WHERE et.id = ? AND et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL`,
        )
        .bind(tripId, id, empresaId)
        .first<Record<string, unknown>>();

      if (!trip) return c.json({ success: false, error: 'Tripulação não encontrada' }, 404);

      await removerEventosAutoGerados(db, id, tripId);

      let eventosGerados = 0;
      const params = {
        db,
        empresa_id: empresaId,
        escala_id: id,
        tripulacao_id: tripId,
        data_inicio: String(trip.data_inicio),
        data_fim: String(trip.data_fim),
        padrao_escala_id: (trip.padrao_escala_id as string | null) ?? null,
        aeronave: (trip.aeronave as string | null) ?? null,
        base: (trip.base as string | null) ?? null,
        created_by: userId,
      };

      if (trip.pic_id) {
        eventosGerados += await gerarEventosBase({
          ...params,
          funcionario_id: String(trip.pic_id),
        });
      }
      if (trip.sic_id) {
        eventosGerados += await gerarEventosBase({
          ...params,
          funcionario_id: String(trip.sic_id),
        });
      }

      return c.json({ success: true, data: { eventos_gerados: eventosGerados } });
    } catch (e) {
      return c.json({ success: false, error: String(e) }, 500);
    }
  },
);

export default tripulacoes;
