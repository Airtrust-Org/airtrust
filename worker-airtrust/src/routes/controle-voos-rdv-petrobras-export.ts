import type { Context } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import { getEmpresaIdSafe, maybeRecordSystemAudit } from '../repositories/controle-voos/rdv-repository';
import {
  buildDailyPetrobrasRveXml,
  type PetrobrasRveFlightRow,
  type PetrobrasRveStageRow,
} from '../services/controle-voos/petrobras-rve-daily-export';

export async function exportDailyPetrobrasRveXmlHandler(c: Context<{ Bindings: Env }>) {
  const empresaId = getEmpresaIdSafe(c);
  const data = String(c.req.query('data') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new ApiError(
      'Informe a data operacional no formato AAAA-MM-DD',
      400,
      'CONTROLE_VOOS_RVE_XML_DATE_REQUIRED',
    );
  }

  const { results: flights } = await c.env.DB.prepare(
    `
      SELECT v.id AS voo_id, r.data_voo, v.prefixo,
             v.petrobras_equipamento, v.petrobras_atendimento,
             v.sigvoos_flight_report_id, v.sigvoos_flight_report_id_confident
      FROM cv_rdv_operacional r
      JOIN cv_voos v ON v.id = r.voo_id AND v.empresa_id = r.empresa_id
      WHERE r.empresa_id = ?
        AND r.deleted_at IS NULL
        AND v.deleted_at IS NULL
        AND r.workflow_status = 'finalizado'
        AND r.data_voo = ?
      ORDER BY v.id ASC
    `,
  ).bind(empresaId, data).all<PetrobrasRveFlightRow>();

  const rows: Array<{ flight: PetrobrasRveFlightRow; stages: PetrobrasRveStageRow[] }> = [];
  for (const flight of flights || []) {
    const { results: stages } = await c.env.DB.prepare(
      `
        SELECT numero_etapa, origem_icao, destino_icao,
               horario_motor_ligado, horario_decolagem,
               horario_pouso, horario_motor_desligado
        FROM cv_voo_etapas
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        ORDER BY numero_etapa ASC
      `,
    ).bind(empresaId, flight.voo_id).all<PetrobrasRveStageRow>();
    rows.push({ flight, stages: stages || [] });
  }

  const built = buildDailyPetrobrasRveXml(rows);
  const filename = `AE_${data}_AIRTRUST.xml`;
  await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'UPDATE', `daily:${data}`, null, {
    action: 'exportar_petrobras_xml_diario',
    data,
    voos: rows.map((row) => row.flight.voo_id),
    registros: built.records.length,
  });

  return new Response(built.bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=ISO-8859-1',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
