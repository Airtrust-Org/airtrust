import type { Context } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import { readPetrobrasStagesByFlight } from '../services/controle-voos/petrobras-rve-stage-reader';
import { getEmpresaIdSafe, maybeRecordSystemAudit } from '../middleware/controle-voos-rdv-context';
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

  // PERF-05: one scoped read for a normal operational day instead of
  // one D1 round trip per flight. Chunks stay below D1 bind limits.
  const stagesByFlight = await readPetrobrasStagesByFlight(
    c.env.DB,
    empresaId,
    (flights || []).map((flight) => flight.voo_id),
  );
  const rows: Array<{ flight: PetrobrasRveFlightRow; stages: PetrobrasRveStageRow[] }> =
    (flights || []).map((flight) => ({
      flight,
      stages: stagesByFlight.get(flight.voo_id) || [],
    }));

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
