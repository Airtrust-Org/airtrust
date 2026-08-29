import { getActiveRdvByFlight } from '../../repositories/controle-voos/rdv-repository';
import { listEtapas } from '../controle-voos/rdv-etapas';
import { getControleVoosRegulatoryStage } from '../../repositories/edb/edb-source-repository';
import { buildExplicitRegulatoryStageData } from './operational-regulatory-source';
import type {
  EdbCrewMember,
  EdbFlightData,
  EdbTechnicalDiscrepancy,
} from './contracts';

interface CrewSourceRow {
  id: number;
  etapa_id: number | null;
  funcionario_id: number;
  funcao: string;
  funcionario_nome: string | null;
  funcionario_codigo_anac: string | null;
  codigo_funcao_anac: string | null;
}

export interface CanonicalEdbFlightSource {
  flight: EdbFlightData;
  rdvId: number;
  rdvVersion: number;
}

function mapRole(value: string): EdbCrewMember['operationalRole'] {
  const role = value.trim().toUpperCase();
  if (role === 'PIC') return 'PIC';
  if (role === 'SIC') return 'SIC';
  if (role === 'COM') return 'COM';
  if (role === 'MEC') return 'MEC';
  return 'OTHER';
}

export function parseEdbOperatorRegulation(value: unknown): 'RBAC121' | 'RBAC135' | 'OTHER' {
  if (value === 'RBAC121' || value === 'RBAC135' || value === 'OTHER') return value;
  throw new Error('EDB_OPERATOR_REGULATION_INVALID');
}

export async function loadCanonicalEdbFlightSource(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
  etapaId: number;
  nature: string;
  technicalDiscrepancies: EdbTechnicalDiscrepancy[];
}): Promise<CanonicalEdbFlightSource> {
  const rdv = await getActiveRdvByFlight(params.db, params.vooId, params.empresaId);
  if (!rdv) throw new Error('EDB_ACTIVE_RDV_NOT_FOUND');

  const stages = await listEtapas(params.db, params.empresaId, params.vooId);
  const stage = stages.find((item) => item.id === params.etapaId);
  if (!stage) throw new Error('EDB_STAGE_NOT_FOUND_OR_SCOPE_MISMATCH');

  const regulatory = await getControleVoosRegulatoryStage(
    params.db,
    params.empresaId,
    params.etapaId,
  );
  if (!regulatory || regulatory.voo_id !== params.vooId) {
    throw new Error('EDB_REGULATORY_STAGE_NOT_FOUND_OR_SCOPE_MISMATCH');
  }
  const explicit = buildExplicitRegulatoryStageData({
    row: regulatory,
    technicalDiscrepancies: params.technicalDiscrepancies,
  });
  if ((explicit.ifrUnclassifiedMinutes ?? 0) > 0) {
    throw new Error('EDB_IFR_UNCLASSIFIED_REMAINS');
  }

  const crewRows = await params.db
    .prepare(
      `
      SELECT t.id, t.etapa_id, t.funcionario_id, t.funcao,
             f.nome AS funcionario_nome, f.codigo_anac AS funcionario_codigo_anac,
             t.codigo_funcao_anac
      FROM cv_voo_tripulantes t
      LEFT JOIN funcionarios f
        ON f.id = t.funcionario_id
       AND f.empresa_id = t.empresa_id
       AND f.deleted_at IS NULL
      WHERE t.empresa_id = ?
        AND t.voo_id = ?
        AND t.deleted_at IS NULL
      ORDER BY t.etapa_id ASC, t.id ASC
    `,
    )
    .bind(params.empresaId, params.vooId)
    .all<CrewSourceRow>();

  const crew = (crewRows.results ?? [])
    .filter((member) => member.etapa_id === null || member.etapa_id === params.etapaId)
    .map<EdbCrewMember>((member) => {
      const fullName = member.funcionario_nome?.trim() || '';
      const functionCode = member.codigo_funcao_anac?.trim() || '';
      if (!fullName) throw new Error('EDB_CREW_IDENTITY_MISSING');
      if (!functionCode) throw new Error('EDB_CREW_FUNCTION_CODE_REQUIRED');
      return {
        employeeId: member.funcionario_id,
        fullName,
        anacCode: member.funcionario_codigo_anac?.trim() || null,
        operationalRole: mapRole(member.funcao),
        regulatoryFunctionCode: functionCode,
      };
    });
  if (crew.length === 0) throw new Error('EDB_CREW_REQUIRED');

  return {
    rdvId: rdv.id,
    rdvVersion: rdv.versao,
    flight: {
      date: rdv.data_voo,
      origin: stage.origem_icao,
      destination: stage.destino_icao,
      times: {
        engineStartAt: stage.horario_motor_ligado,
        takeoffAt: stage.horario_decolagem,
        landingAt: stage.horario_pouso,
        engineShutdownAt: stage.horario_motor_desligado,
      },
      landingsTotal: explicit.landingsTotal,
      cycles: explicit.cycles,
      duration: {
        dayMinutes: explicit.dayMinutes,
        nightMinutes: explicit.nightMinutes,
        totalMinutes: explicit.totalMinutes,
        ifrActualMinutes: explicit.ifrActualMinutes,
        ifrSimulatedMinutes: explicit.ifrSimulatedMinutes,
      },
      fuelBeforeEngineStart: explicit.fuelBeforeEngineStart,
      personsOnBoard: explicit.personsOnBoard,
      cargoKg: explicit.cargoKg,
      nature: params.nature.trim() || null,
      occurrences: explicit.occurrences,
      technicalDiscrepancies: params.technicalDiscrepancies.map((item) => ({
        description: item.description,
        detectedBy: { ...item.detectedBy },
      })),
      crew,
    },
  };
}
