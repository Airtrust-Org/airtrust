import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getEmpresaId } from '../middleware/tenant';

export type FadigaConfigRow = {
  threshold_amarelo: number;
  threshold_vermelho: number;
  peso_kss: number;
  peso_sono_duracao: number;
  peso_sono_qualidade: number;
  peso_sintomas: number;
  ativo: number;
  janela_inicio: string;
  janela_fim: string;
  jornada_pos_corte_minutos: number;
  jornada_sem_voo_fim: string;
};

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function parseTimeToMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export async function getFadigaConfig(
  db: D1Database,
  empresaId: number,
): Promise<FadigaConfigRow> {
  const row = await db
    .prepare(
      `SELECT
        ativo,
        janela_inicio,
        janela_fim,
        threshold_amarelo,
        threshold_vermelho,
        peso_kss,
        peso_sono_duracao,
        peso_sono_qualidade,
        peso_sintomas,
        jornada_pos_corte_minutos,
        jornada_sem_voo_fim
       FROM frms_fadiga_config_empresa
       WHERE empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(empresaId)
    .first<FadigaConfigRow>();

  if (row) return row;

  await db
    .prepare(
      `INSERT INTO frms_fadiga_config_empresa
       (empresa_id, ativo, janela_inicio, janela_fim, threshold_amarelo, threshold_vermelho, peso_kss, peso_sono_duracao, peso_sono_qualidade, peso_sintomas, created_at, updated_at)
       VALUES (?, 1, '04:00', '11:00', 40, 60, 0.35, 0.25, 0.20, 0.20, ?, ?)`,
    )
    .bind(empresaId, nowSql(), nowSql())
    .run();

  return {
    ativo: 1,
    janela_inicio: '04:00',
    janela_fim: '11:00',
    threshold_amarelo: 40,
    threshold_vermelho: 60,
    peso_kss: 0.35,
    peso_sono_duracao: 0.25,
    peso_sono_qualidade: 0.2,
    peso_sintomas: 0.2,
    jornada_pos_corte_minutos: 30,
    jornada_sem_voo_fim: '17:00',
  };
}

async function auditDutyConfigUpdate(
  db: D1Database,
  params: {
    userId: number;
    empresaId: number;
    before: Record<string, unknown> | null;
    postCut: number;
    noFlightEnd: string;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO admin_actions
         (user_id, action, module, deleted_count, success, metadata_json, ip_address, user_agent)
         VALUES (?, 'FRMS_DUTY_BOUNDARY_CONFIG_UPDATE', 'FRMS', 0, 1, ?, NULL, NULL)`,
      )
      .bind(
        params.userId || null,
        JSON.stringify({
          empresa_id: params.empresaId,
          antes: params.before,
          depois: {
            jornada_pos_corte_minutos: params.postCut,
            jornada_sem_voo_fim: params.noFlightEnd,
          },
        }),
      )
      .run();
  } catch {
    // Compatibilidade com ambientes antigos sem admin_actions.
  }
}

export async function updateFadigaDutyConfig(c: Context<AppEnv>) {
  try {
    const empresaId = getEmpresaId(c);
    const body = (await c.req.json().catch(() => null)) as {
      jornada_pos_corte_minutos?: unknown;
      jornada_sem_voo_fim?: unknown;
    } | null;
    const postCut = Number(body?.jornada_pos_corte_minutos);
    const noFlightEnd = String(body?.jornada_sem_voo_fim ?? '').trim();

    if (!Number.isInteger(postCut) || postCut < 0 || postCut > 240) {
      return c.json(
        { success: false, error: 'jornada_pos_corte_minutos deve estar entre 0 e 240.' },
        400,
      );
    }
    if (parseTimeToMinutes(noFlightEnd) == null) {
      return c.json(
        { success: false, error: 'jornada_sem_voo_fim deve usar HH:mm.' },
        400,
      );
    }

    await getFadigaConfig(c.env.DB, empresaId);
    const before = await c.env.DB
      .prepare(
        `SELECT jornada_pos_corte_minutos, jornada_sem_voo_fim
           FROM frms_fadiga_config_empresa
          WHERE empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(empresaId)
      .first<Record<string, unknown>>();

    await c.env.DB
      .prepare(
        `UPDATE frms_fadiga_config_empresa
            SET jornada_pos_corte_minutos = ?,
                jornada_sem_voo_fim = ?,
                updated_at = ?
          WHERE empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(postCut, noFlightEnd, nowSql(), empresaId)
      .run();

    await auditDutyConfigUpdate(c.env.DB, {
      userId: Number(c.get('userId') || 0),
      empresaId,
      before: before ?? null,
      postCut,
      noFlightEnd,
    });

    return c.json({
      success: true,
      data: {
        jornada_pos_corte_minutos: postCut,
        jornada_sem_voo_fim: noFlightEnd,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('no such column')) {
      return c.json({ success: false, error: 'FRMS_DUTY_BOUNDARY_SCHEMA_REQUIRED' }, 503);
    }
    return c.json({ success: false, error: 'Erro ao salvar configuração de jornada' }, 500);
  }
}
