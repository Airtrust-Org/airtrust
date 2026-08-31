import type { EdbTechnicalDiscrepancy } from './contracts';
import {
  adaptControleVoosToEdbShadowSource,
  type ControleVoosEdbShadowAdapterInput,
} from './controle-voos-source-adapter';
import {
  buildExplicitRegulatoryStageData,
  type ControleVoosEtapaRegulatoriaRow,
  type ControleVoosTripulanteRegulatorioRow,
} from './operational-regulatory-source';
import { projectRdvToEdbWithExplicitRegulatoryData } from './regulatory-projection';
import type { EdbShadowProjection } from './rdv-shadow-projection';

export interface ControleVoosEdbRegulatoryAdapterInput
  extends ControleVoosEdbShadowAdapterInput {
  regulatoryStages: ControleVoosEtapaRegulatoriaRow[];
  regulatoryCrew: ControleVoosTripulanteRegulatorioRow[];
  technicalDiscrepanciesByStage?: ReadonlyMap<number, EdbTechnicalDiscrepancy[] | null>;
}

function assertRegulatoryScope(input: ControleVoosEdbRegulatoryAdapterInput): void {
  const stageIds = new Set(input.stages.map((stage) => stage.id));

  for (const row of input.regulatoryStages) {
    if (
      row.empresa_id !== input.flight.empresa_id ||
      row.voo_id !== input.flight.id ||
      !stageIds.has(row.etapa_id)
    ) {
      throw new Error(`Regulatory stage ${row.etapa_id} does not belong to the flight/tenant`);
    }
  }

  for (const row of input.regulatoryCrew) {
    if (
      row.empresa_id !== input.flight.empresa_id ||
      row.voo_id !== input.flight.id ||
      (row.etapa_id !== null && !stageIds.has(row.etapa_id))
    ) {
      throw new Error(`Regulatory crew row ${row.id} does not belong to the flight/tenant`);
    }
  }
}

/**
 * Preferred eDB projection path once migration 0477 is present.
 * The existing RDV continues to provide operational structure; only the
 * explicit companion rows are allowed to resolve regulatory semantic gaps.
 */
export function adaptControleVoosToEdbRegulatoryProjection(
  input: ControleVoosEdbRegulatoryAdapterInput,
): EdbShadowProjection {
  assertRegulatoryScope(input);
  const source = adaptControleVoosToEdbShadowSource(input);

  const stageOverrides = input.regulatoryStages.map((row) => ({
    stageId: row.etapa_id,
    data: buildExplicitRegulatoryStageData({
      row,
      technicalDiscrepancies: input.technicalDiscrepanciesByStage?.get(row.etapa_id),
    }),
  }));

  const crewFunctionOverrides = input.regulatoryCrew.flatMap((row) => {
    const code = row.codigo_funcao_anac?.trim();
    if (!code) return [];

    const applicableStageIds =
      row.etapa_id === null
        ? source.stages
            .filter((stage) => stage.crew.some((member) => member.employeeId === row.funcionario_id))
            .map((stage) => stage.stageId)
        : [row.etapa_id];

    return applicableStageIds.map((stageId) => ({
      stageId,
      employeeId: row.funcionario_id,
      regulatoryFunctionCode: code,
    }));
  });

  return projectRdvToEdbWithExplicitRegulatoryData({
    source,
    stageOverrides,
    crewFunctionOverrides,
  });
}
