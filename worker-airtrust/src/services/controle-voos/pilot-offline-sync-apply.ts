import { ApiError } from '../../middleware/error-handler';
import {
  allowedRdvFields,
  getActiveRdvByFlight,
  getRdvOrThrow,
  type FlightRow,
  type RdvInput,
  type RdvRow,
} from '../../repositories/controle-voos/rdv-repository';
import {
  ETAPA_MUTABLE_FIELDS,
  computeEtapaPesoTotal,
  computeEtapaTempos,
  listEtapas,
  normalizeEtapaInput,
  validateEtapaInput,
  type EtapaInput,
  type EtapaRow,
} from './rdv-etapas';
import { assertRdvRules, normalizeRdvInput } from './rdv-validation';
import {
  buildAcceptedReceiptForCreatedRdv,
  buildOfflineSyncReceiptInsert,
  commandResultFromAccepted,
  getOfflineSyncReceipt,
  recordOfflineSyncConflict,
  replayReceipt,
  type PilotOfflineSyncCommand,
  type PilotOfflineSyncCommandResult,
} from './pilot-offline-sync';

type SnapshotStagePayload = {
  source_stage_id: number | null;
  source_stage_updated_at: string | null;
  fields: Record<string, unknown>;
};

type SnapshotFuelingPayload = {
  client_local_id: string;
  data_hora: string;
  etapa_numero: number;
  empresa_abastecimento_codigo: string;
  nota: string | null;
  numero_nota: string | null;
  litros_abastecidos: number;
};

type SnapshotJustificationPayload = {
  justificativa_codigo: string;
  minutos: number;
  observacao: string | null;
};

type SnapshotPayload = {
  source_package_id: string;
  source_rdv_id: number | null;
  rdv: Record<string, unknown>;
  flight_update: { natureza_voo_codigo: string | null; numero_voo: string | null; numero_db: string | null };
  fuelings: SnapshotFuelingPayload[];
  justifications: SnapshotJustificationPayload[];
  stages: SnapshotStagePayload[];
};

type PreparedStage = {
  sourceStageId: number | null;
  sourceStageUpdatedAt: string | null;
  input: EtapaInput & {
    tempo_decolagem_pouso: string | null;
    tempo_total: string | null;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function conflictDetail(input: {
  type: string;
  expected?: unknown;
  current?: unknown;
  entity?: string;
}): Record<string, unknown> {
  return {
    type: input.type,
    entity: input.entity ?? null,
    expected: input.expected ?? null,
    current: input.current ?? null,
  };
}

function parseNullablePositiveInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(
      `${field} invalido`,
      400,
      'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_INVALID',
    );
  }
  return parsed;
}

function normalizeSnapshotPayload(command: PilotOfflineSyncCommand): SnapshotPayload {
  const raw = command.payload;
  const sourcePackageId = String(raw.source_package_id || '').trim();
  if (!sourcePackageId || sourcePackageId.length > 240) {
    throw new ApiError(
      'source_package_id invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_SOURCE_PACKAGE_INVALID',
    );
  }

  if (!isPlainObject(raw.rdv)) {
    throw new ApiError(
      'Snapshot RDV invalido',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_RDV_INVALID',
    );
  }
  for (const key of Object.keys(raw.rdv)) {
    if (!allowedRdvFields.has(key)) {
      throw new ApiError(
        `Campo RDV offline nao permitido: ${key}`,
        400,
        'CONTROLE_VOOS_PILOT_SYNC_RDV_FIELD_FORBIDDEN',
      );
    }
  }

  if (!Array.isArray(raw.stages) || raw.stages.length < 1 || raw.stages.length > 32) {
    throw new ApiError(
      'Snapshot de etapas deve conter entre 1 e 32 etapas',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_STAGES_INVALID',
    );
  }

  const rawFlightUpdate = isPlainObject(raw.flight_update) ? raw.flight_update : {};
  const naturezaCode = rawFlightUpdate.natureza_voo_codigo == null
    ? null
    : String(rawFlightUpdate.natureza_voo_codigo).trim().toUpperCase();
  if (naturezaCode && (!/^[A-Z0-9._-]{1,80}$/.test(naturezaCode))) {
    throw new ApiError(
      'Natureza de voo offline invalida',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_NATUREZA_INVALID',
    );
  }

  const numeroVoo = rawFlightUpdate.numero_voo == null ? null : String(rawFlightUpdate.numero_voo).trim() || null;
  const numeroDb = rawFlightUpdate.numero_db == null ? null : String(rawFlightUpdate.numero_db).trim() || null;
  if (numeroVoo && numeroVoo.length > 80) {
    throw new ApiError('numero_voo invalido', 400, 'CONTROLE_VOOS_PILOT_SYNC_FLIGHT_NUMBER_INVALID');
  }
  if (numeroDb && numeroDb.length > 120) {
    throw new ApiError('numero_db invalido', 400, 'CONTROLE_VOOS_PILOT_SYNC_REPORT_NUMBER_INVALID');
  }

  const fuelingsRaw = raw.fuelings == null ? [] : raw.fuelings;
  if (!Array.isArray(fuelingsRaw) || fuelingsRaw.length > 16) {
    throw new ApiError('Abastecimentos offline invalidos', 400, 'CONTROLE_VOOS_PILOT_SYNC_FUELINGS_INVALID');
  }
  const fuelings = fuelingsRaw.map((entry, index): SnapshotFuelingPayload => {
    if (!isPlainObject(entry)) {
      throw new ApiError(`Abastecimento offline invalido no indice ${index}`, 400, 'CONTROLE_VOOS_PILOT_SYNC_FUELING_INVALID');
    }
    const localId = String(entry.client_local_id || '').trim();
    const dataHora = String(entry.data_hora || '').trim();
    const supplierCode = String(entry.empresa_abastecimento_codigo || '').trim().toUpperCase();
    const etapaNumero = Number(entry.etapa_numero);
    const rawLitros = entry.litros_abastecidos;
    const litros = Number(rawLitros);
    if (
      !localId ||
      !dataHora ||
      !Number.isInteger(etapaNumero) || etapaNumero <= 0 || etapaNumero > 32 ||
      !supplierCode ||
      !/^[A-Z0-9._-]{1,80}$/.test(supplierCode) ||
      rawLitros === null ||
      rawLitros === undefined ||
      rawLitros === '' ||
      !Number.isFinite(litros) ||
      litros < 0
    ) {
      throw new ApiError(`Abastecimento offline incompleto no indice ${index}`, 400, 'CONTROLE_VOOS_PILOT_SYNC_FUELING_INVALID');
    }
    return {
      client_local_id: localId,
      data_hora: dataHora,
      etapa_numero: etapaNumero,
      empresa_abastecimento_codigo: supplierCode,
      nota: entry.nota == null ? null : String(entry.nota).trim() || null,
      numero_nota: entry.numero_nota == null ? null : String(entry.numero_nota).trim() || null,
      litros_abastecidos: litros,
    };
  });

  const justificationsRaw = raw.justifications == null ? [] : raw.justifications;
  if (!Array.isArray(justificationsRaw) || justificationsRaw.length > 16) {
    throw new ApiError('Justificativas offline invalidas', 400, 'CONTROLE_VOOS_PILOT_SYNC_JUSTIFICATIONS_INVALID');
  }
  const justificationCodes = new Set<string>();
  const justifications = justificationsRaw.map((entry, index): SnapshotJustificationPayload => {
    if (!isPlainObject(entry)) {
      throw new ApiError(`Justificativa offline invalida no indice ${index}`, 400, 'CONTROLE_VOOS_PILOT_SYNC_JUSTIFICATION_INVALID');
    }
    const code = String(entry.justificativa_codigo || '').trim().toUpperCase();
    const minutes = Number(entry.minutos);
    const observation = entry.observacao == null ? null : String(entry.observacao).trim() || null;
    if (
      !/^[A-Z0-9._-]{1,80}$/.test(code) ||
      !Number.isInteger(minutes) ||
      minutes <= 0 ||
      minutes > 1440 ||
      (observation && observation.length > 500)
    ) {
      throw new ApiError(`Justificativa offline incompleta no indice ${index}`, 400, 'CONTROLE_VOOS_PILOT_SYNC_JUSTIFICATION_INVALID');
    }
    if (justificationCodes.has(code)) {
      throw new ApiError('Justificativa repetida no snapshot offline', 400, 'CONTROLE_VOOS_PILOT_SYNC_JUSTIFICATION_DUPLICATE');
    }
    justificationCodes.add(code);
    return {
      justificativa_codigo: code,
      minutos: minutes,
      observacao: observation,
    };
  });

  const allowedStageFields = new Set<string>(ETAPA_MUTABLE_FIELDS);
  const stages = raw.stages.map((entry, index): SnapshotStagePayload => {
    if (!isPlainObject(entry) || !isPlainObject(entry.fields)) {
      throw new ApiError(
        `Etapa offline invalida no indice ${index}`,
        400,
        'CONTROLE_VOOS_PILOT_SYNC_STAGE_INVALID',
      );
    }
    for (const key of Object.keys(entry.fields)) {
      if (!allowedStageFields.has(key)) {
        throw new ApiError(
          `Campo de etapa offline nao permitido: ${key}`,
          400,
          'CONTROLE_VOOS_PILOT_SYNC_STAGE_FIELD_FORBIDDEN',
        );
      }
    }
    const sourceStageId = parseNullablePositiveInteger(entry.source_stage_id, 'source_stage_id');
    const updatedAt =
      entry.source_stage_updated_at === null || entry.source_stage_updated_at === undefined
        ? null
        : String(entry.source_stage_updated_at).trim();
    if (sourceStageId !== null && !updatedAt) {
      throw new ApiError(
        'source_stage_updated_at obrigatorio para etapa existente',
        400,
        'CONTROLE_VOOS_PILOT_SYNC_STAGE_REVISION_REQUIRED',
      );
    }

    return {
      source_stage_id: sourceStageId,
      source_stage_updated_at: updatedAt || null,
      fields: entry.fields,
    };
  });

  const stageNumbers = new Set(
    stages.map((stage) => Number((stage.fields || {}).numero_etapa)).filter((value) => Number.isInteger(value) && value > 0),
  );
  for (const fueling of fuelings) {
    if (!stageNumbers.has(fueling.etapa_numero)) {
      throw new ApiError('Abastecimento referencia etapa inexistente no snapshot', 400, 'CONTROLE_VOOS_PILOT_SYNC_FUELING_STAGE_INVALID');
    }
  }

  return {
    source_package_id: sourcePackageId,
    source_rdv_id: parseNullablePositiveInteger(raw.source_rdv_id, 'source_rdv_id'),
    rdv: raw.rdv,
    flight_update: { natureza_voo_codigo: naturezaCode, numero_voo: numeroVoo, numero_db: numeroDb },
    fuelings,
    justifications,
    stages,
  };
}

function prepareStages(stages: SnapshotStagePayload[]): PreparedStage[] {
  const prepared = stages.map((stage) => {
    const input = normalizeEtapaInput(stage.fields);
    if (input.numero_etapa == null) {
      throw new ApiError(
        'numero_etapa obrigatorio no snapshot offline',
        400,
        'CONTROLE_VOOS_PILOT_SYNC_STAGE_NUMBER_REQUIRED',
      );
    }
    validateEtapaInput(input);
    const computed = computeEtapaTempos(
      input.horario_decolagem,
      input.horario_pouso,
      input.horario_motor_ligado,
      input.horario_motor_desligado,
    );
    return {
      sourceStageId: stage.source_stage_id,
      sourceStageUpdatedAt: stage.source_stage_updated_at,
      input: {
        ...input,
        ...computed,
        peso_total: computeEtapaPesoTotal(input),
      },
    };
  });

  const numbers = prepared.map((stage) => stage.input.numero_etapa as number);
  if (new Set(numbers).size !== numbers.length) {
    throw new ApiError(
      'numero_etapa duplicado no snapshot offline',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_STAGE_NUMBER_DUPLICATE',
    );
  }
  const sourceIds = prepared
    .map((stage) => stage.sourceStageId)
    .filter((id): id is number => id !== null);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new ApiError(
      'source_stage_id duplicado no snapshot offline',
      400,
      'CONTROLE_VOOS_PILOT_SYNC_STAGE_SOURCE_DUPLICATE',
    );
  }
  const ordered = prepared.sort(
    (left, right) =>
      Number(left.input.numero_etapa ?? 0) - Number(right.input.numero_etapa ?? 0),
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1].input;
    const current = ordered[index].input;
    const previousEnd = previous.combustivel_fim ?? null;
    const currentStart = current.combustivel_inicio ?? null;
    const previousUnit = String(previous.unidade_combustivel || '').trim().toUpperCase();
    const currentUnit = String(current.unidade_combustivel || '').trim().toUpperCase();

    if (previousEnd !== currentStart || previousUnit !== currentUnit) {
      throw new ApiError(
        'Combustivel inicial da etapa deve corresponder ao combustivel final da etapa anterior',
        400,
        'CONTROLE_VOOS_PILOT_SYNC_FUEL_CONTINUITY_INVALID',
      );
    }
  }

  return ordered;
}

function assertSourcePackageMatches(
  command: PilotOfflineSyncCommand,
  snapshot: SnapshotPayload,
): void {
  const expected =
    `pilot-offline:v1:voo:${command.flight_id}:v${command.base_flight_version}:rdv:${command.base_server_version}`;
  if (snapshot.source_package_id !== expected) {
    throw new ApiError(
      'source_package_id nao corresponde as versoes-base do comando',
      409,
      'CONTROLE_VOOS_PILOT_SYNC_SOURCE_PACKAGE_MISMATCH',
    );
  }
}

function buildStageStatements(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  newVersion: number;
  stages: PreparedStage[];
}): D1PreparedStatement[] {
  return input.stages.map((stage) => {
    if (stage.sourceStageId !== null) {
      return input.db
        .prepare(
          `
            UPDATE cv_voo_etapas
            SET numero_etapa = ?,
                origem_icao = ?,
                destino_icao = ?,
                horario_motor_ligado = ?,
                horario_decolagem = ?,
                horario_pouso = ?,
                horario_motor_desligado = ?,
                tempo_decolagem_pouso = ?,
                tempo_total = ?,
                tempo_navegacao = ?,
                tempo_ifr = ?,
                tempo_noturno = ?,
                pousos_diurnos = ?,
                pousos_noturnos = ?,
                starts = ?,
                pax = ?,
                payload = ?,
                combustivel_inicio = ?,
                combustivel_fim = ?,
                unidade_combustivel = ?,
                peso_passageiros = ?,
                peso_bagagem = ?,
                peso_tripulacao = ?,
                peso_vazio = ?,
                peso_total = ?,
                unidade_peso = ?,
                observacoes = ?,
                updated_by = ?,
                updated_at = datetime('now')
            WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
              AND EXISTS (
                SELECT 1 FROM cv_rdv_operacional
                WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
                  AND status <> 'cancelado' AND versao = ?
              )
          `,
        )
        .bind(
          stage.input.numero_etapa,
          stage.input.origem_icao ?? null,
          stage.input.destino_icao ?? null,
          stage.input.horario_motor_ligado ?? null,
          stage.input.horario_decolagem ?? null,
          stage.input.horario_pouso ?? null,
          stage.input.horario_motor_desligado ?? null,
          stage.input.tempo_decolagem_pouso,
          stage.input.tempo_total,
          stage.input.tempo_navegacao ?? null,
          stage.input.tempo_ifr ?? null,
          stage.input.tempo_noturno ?? null,
          stage.input.pousos_diurnos ?? null,
          stage.input.pousos_noturnos ?? null,
          stage.input.starts ?? null,
          stage.input.pax ?? null,
          stage.input.payload ?? null,
          stage.input.combustivel_inicio ?? null,
          stage.input.combustivel_fim ?? null,
          stage.input.unidade_combustivel ?? null,
          stage.input.peso_passageiros ?? null,
          stage.input.peso_bagagem ?? null,
          stage.input.peso_tripulacao ?? null,
          stage.input.peso_vazio ?? null,
          stage.input.peso_total ?? null,
          stage.input.unidade_peso ?? null,
          stage.input.observacoes ?? null,
          input.userId,
          stage.sourceStageId,
          input.flight.id,
          input.empresaId,
          input.flight.id,
          input.empresaId,
          input.newVersion,
        );
    }

    return input.db
      .prepare(
        `
          INSERT INTO cv_voo_etapas (
            empresa_id, voo_id, numero_etapa, origem_icao, destino_icao,
            horario_motor_ligado, horario_decolagem, horario_pouso, horario_motor_desligado,
            tempo_decolagem_pouso, tempo_total, tempo_navegacao, tempo_ifr, tempo_noturno,
            pousos_diurnos, pousos_noturnos, starts, pax, payload,
            combustivel_inicio, combustivel_fim, unidade_combustivel,
            peso_passageiros, peso_bagagem, peso_tripulacao, peso_vazio, peso_total, unidade_peso, observacoes,
            origem_dados, created_by, updated_by, created_at, updated_at
          )
          SELECT
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            'MANUAL', ?, ?, datetime('now'), datetime('now')
          WHERE EXISTS (
            SELECT 1 FROM cv_rdv_operacional
            WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
              AND status <> 'cancelado' AND versao = ?
          )
        `,
      )
      .bind(
        input.empresaId,
        input.flight.id,
        stage.input.numero_etapa,
        stage.input.origem_icao ?? null,
        stage.input.destino_icao ?? null,
        stage.input.horario_motor_ligado ?? null,
        stage.input.horario_decolagem ?? null,
        stage.input.horario_pouso ?? null,
        stage.input.horario_motor_desligado ?? null,
        stage.input.tempo_decolagem_pouso,
        stage.input.tempo_total,
        stage.input.tempo_navegacao ?? null,
        stage.input.tempo_ifr ?? null,
        stage.input.tempo_noturno ?? null,
        stage.input.pousos_diurnos ?? null,
        stage.input.pousos_noturnos ?? null,
        stage.input.starts ?? null,
        stage.input.pax ?? null,
        stage.input.payload ?? null,
        stage.input.combustivel_inicio ?? null,
        stage.input.combustivel_fim ?? null,
        stage.input.unidade_combustivel ?? null,
        stage.input.peso_passageiros ?? null,
        stage.input.peso_bagagem ?? null,
        stage.input.peso_tripulacao ?? null,
        stage.input.peso_vazio ?? null,
        stage.input.peso_total ?? null,
        stage.input.unidade_peso ?? null,
        stage.input.observacoes ?? null,
        input.userId,
        input.userId,
        input.flight.id,
        input.empresaId,
        input.newVersion,
      );
  });
}

function buildStageRevisionCasSql(
  stages: PreparedStage[],
): { sql: string; binds: unknown[] } {
  const sourceStages = stages.filter((stage) => stage.sourceStageId !== null);
  const clauses = [
    `(SELECT COUNT(*) FROM cv_voo_etapas WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL) = ?`,
  ];
  const binds: unknown[] = [];
  // voo_id / empresa_id are prepended by the caller because they are aggregate-specific.
  for (const stage of sourceStages) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM cv_voo_etapas
        WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
          AND updated_at = ? AND numero_etapa = ?
      )`,
    );
    binds.push(
      stage.sourceStageId,
      stage.sourceStageUpdatedAt,
      stage.input.numero_etapa,
    );
  }
  return { sql: clauses.join(' AND '), binds };
}

function bindRdvValues(
  rdv: RdvInput,
): unknown[] {
  return [
    rdv.numero,
    rdv.data_voo,
    rdv.horario_decolagem_real ?? null,
    rdv.horario_pouso_real ?? null,
    rdv.horas_voadas ?? null,
    rdv.numero_pousos ?? null,
    rdv.ciclos ?? null,
    rdv.combustivel_decolagem ?? null,
    rdv.combustivel_pouso ?? null,
    rdv.combustivel_consumo ?? null,
    rdv.pob ?? null,
    rdv.carga_kg ?? null,
    rdv.ocorrencias ?? null,
    rdv.divergencias ?? null,
  ];
}

function buildExistingRdvUpdate(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  command: PilotOfflineSyncCommand;
  existingRdv: RdvRow;
  rdv: RdvInput;
  stages: PreparedStage[];
}): D1PreparedStatement {
  const stageCas = buildStageRevisionCasSql(input.stages);
  const sourceStageCount = input.stages.filter((stage) => stage.sourceStageId !== null).length;

  return input.db
    .prepare(
      `
        UPDATE cv_rdv_operacional
        SET numero = ?,
            data_voo = ?,
            horario_decolagem_real = ?,
            horario_pouso_real = ?,
            horas_voadas = ?,
            numero_pousos = ?,
            ciclos = ?,
            combustivel_decolagem = ?,
            combustivel_pouso = ?,
            combustivel_consumo = ?,
            pob = ?,
            carga_kg = ?,
            ocorrencias = ?,
            divergencias = ?,
            status = 'rascunho',
            responsavel_preenchimento_id = ?,
            preenchido_em = datetime('now'),
            versao = versao + 1,
            updated_by = ?,
            updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
          AND versao = ?
          AND status = 'rascunho'
          AND workflow_status IN ('rascunho', 'devolvido')
          AND EXISTS (
            SELECT 1 FROM cv_voos
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND versao = ?
          )
          AND ${stageCas.sql}
      `,
    )
    .bind(
      ...bindRdvValues(input.rdv),
      input.userId,
      input.userId,
      input.existingRdv.id,
      input.empresaId,
      input.flight.id,
      input.command.base_server_version,
      input.flight.id,
      input.empresaId,
      input.command.base_flight_version,
      input.flight.id,
      input.empresaId,
      sourceStageCount,
      ...input.stages
        .filter((stage) => stage.sourceStageId !== null)
        .flatMap((stage) => [
          stage.sourceStageId,
          input.flight.id,
          input.empresaId,
          stage.sourceStageUpdatedAt,
          stage.input.numero_etapa,
        ]),
    );
}

function buildNewRdvInsert(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  command: PilotOfflineSyncCommand;
  rdv: RdvInput;
  stages: PreparedStage[];
}): D1PreparedStatement {
  const stageCas = buildStageRevisionCasSql(input.stages);
  const sourceStageCount = input.stages.filter((stage) => stage.sourceStageId !== null).length;

  return input.db
    .prepare(
      `
        INSERT INTO cv_rdv_operacional (
          empresa_id, voo_id, numero, data_voo,
          horario_decolagem_real, horario_pouso_real,
          horas_voadas, numero_pousos, ciclos,
          combustivel_decolagem, combustivel_pouso, combustivel_consumo,
          pob, carga_kg, ocorrencias, divergencias,
          status, responsavel_preenchimento_id, preenchido_em,
          versao, created_by, updated_by, created_at, updated_at
        )
        SELECT
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'rascunho', ?, datetime('now'),
          1, ?, ?, datetime('now'), datetime('now')
        WHERE EXISTS (
          SELECT 1 FROM cv_voos
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND versao = ?
        )
          AND NOT EXISTS (
            SELECT 1 FROM cv_rdv_operacional
            WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL AND status <> 'cancelado'
          )
          AND ${stageCas.sql}
      `,
    )
    .bind(
      input.empresaId,
      input.flight.id,
      ...bindRdvValues(input.rdv),
      input.userId,
      input.userId,
      input.userId,
      input.flight.id,
      input.empresaId,
      input.command.base_flight_version,
      input.flight.id,
      input.empresaId,
      input.flight.id,
      input.empresaId,
      sourceStageCount,
      ...input.stages
        .filter((stage) => stage.sourceStageId !== null)
        .flatMap((stage) => [
          stage.sourceStageId,
          input.flight.id,
          input.empresaId,
          stage.sourceStageUpdatedAt,
          stage.input.numero_etapa,
        ]),
    );
}

function buildFuelingStatements(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  newVersion: number;
  fuelings: SnapshotFuelingPayload[];
  supplierNamesByCode: Map<string, string>;
}): D1PreparedStatement[] {
  return input.fuelings.map((fueling) =>
    input.db.prepare(`
      INSERT INTO cv_voo_abastecimentos (
        empresa_id, voo_id, etapa_id, fornecedor, localidade, combustivel_solicitado, unidade,
        combustivel_abastecido, numero_ce, anexo_r2_key, responsavel_id, data_hora, observacoes,
        created_by, updated_by, created_at, updated_at
      )
      SELECT ?, ?, (
        SELECT id FROM cv_voo_etapas
        WHERE empresa_id = ? AND voo_id = ? AND numero_etapa = ? AND deleted_at IS NULL
        LIMIT 1
      ), ?, NULL, NULL, 'L', ?, ?, NULL, NULL, ?, ?, ?, ?, datetime('now'), datetime('now')
      WHERE EXISTS (
        SELECT 1 FROM cv_rdv_operacional
        WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
          AND status <> 'cancelado' AND versao = ?
      )
    `).bind(
      input.empresaId,
      input.flight.id,
      input.empresaId,
      input.flight.id,
      fueling.etapa_numero,
      input.supplierNamesByCode.get(fueling.empresa_abastecimento_codigo) || null,
      fueling.litros_abastecidos,
      fueling.numero_nota,
      fueling.data_hora,
      fueling.nota,
      input.userId,
      input.userId,
      input.flight.id, input.empresaId, input.newVersion,
    ),
  );
}

function buildJustificationStatements(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  newVersion: number;
  justifications: SnapshotJustificationPayload[];
  justificationIdsByCode: Map<string, number>;
}): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    input.db.prepare(`
      UPDATE cv_voo_justificativas
      SET deleted_at = datetime('now'), updated_by = ?, updated_at = datetime('now')
      WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM cv_rdv_operacional
          WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
            AND status <> 'cancelado' AND versao = ?
        )
    `).bind(
      input.userId,
      input.empresaId,
      input.flight.id,
      input.flight.id,
      input.empresaId,
      input.newVersion,
    ),
  ];

  for (const item of input.justifications) {
    const justificationId = input.justificationIdsByCode.get(item.justificativa_codigo);
    if (!justificationId) continue;
    statements.push(
      input.db.prepare(`
        INSERT INTO cv_voo_justificativas (
          empresa_id, voo_id, justificativa_id, minutos, observacao,
          created_by, updated_by, created_at, updated_at, deleted_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL
        WHERE EXISTS (
          SELECT 1 FROM cv_rdv_operacional
          WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
            AND status <> 'cancelado' AND versao = ?
        )
        ON CONFLICT(empresa_id, voo_id, justificativa_id) DO UPDATE SET
          minutos = excluded.minutos,
          observacao = excluded.observacao,
          updated_by = excluded.updated_by,
          updated_at = datetime('now'),
          deleted_at = NULL
      `).bind(
        input.empresaId,
        input.flight.id,
        justificationId,
        item.minutos,
        item.observacao,
        input.userId,
        input.userId,
        input.flight.id,
        input.empresaId,
        input.newVersion,
      ),
    );
  }
  return statements;
}

function buildFlightMetadataStatement(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  naturezaId: number | null;
  numeroVoo: string | null;
  numeroDb: string | null;
  baseFlightVersion: number;
}): D1PreparedStatement {
  return input.db.prepare(`
    UPDATE cv_voos
    SET natureza_voo_id = COALESCE(?, natureza_voo_id),
        numero_voo = CASE
          WHEN ? IS NOT NULL AND COALESCE(TRIM(numero_voo), '') = '' THEN ?
          ELSE numero_voo
        END,
        numero_db = CASE WHEN ? IS NOT NULL THEN ? ELSE numero_db END,
        versao = versao + 1,
        updated_by = ?,
        updated_at = datetime('now')
    WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND versao = ?
  `).bind(
    input.naturezaId,
    input.numeroVoo, input.numeroVoo,
    input.numeroDb, input.numeroDb,
    input.userId, input.flight.id, input.empresaId, input.baseFlightVersion,
  );
}

function buildOfflineSyncEvent(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  command: PilotOfflineSyncCommand;
  newVersion: number;
}): D1PreparedStatement {
  return input.db
    .prepare(
      `
        INSERT INTO cv_voo_eventos (
          empresa_id, voo_id, tipo_evento, status_anterior, status_novo,
          descricao, motivo_id, metadata_json, usuario_id, created_by, updated_by,
          created_at, updated_at
        )
        SELECT ?, ?, 'rdv', ?, ?,
          'Snapshot RDV sincronizado pelo Pilot App offline', NULL, ?, ?, ?, ?,
          datetime('now'), datetime('now')
        WHERE (SELECT changes()) > 0
          AND EXISTS (
            SELECT 1 FROM cv_rdv_operacional
            WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
              AND status <> 'cancelado' AND versao = ?
          )
      `,
    )
    .bind(
      input.empresaId,
      input.flight.id,
      input.flight.status,
      input.flight.status,
      JSON.stringify({
        action: 'pilot_offline_sync',
        client_operation_id: input.command.client_operation_id,
        local_sequence: input.command.local_sequence,
        base_server_version: input.command.base_server_version,
        server_entity_version: input.newVersion,
      }),
      input.userId,
      input.userId,
      input.userId,
      input.empresaId,
      input.flight.id,
      input.newVersion,
    );
}

async function currentStateConflict(input: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  flight: FlightRow;
  command: PilotOfflineSyncCommand;
  snapshot: SnapshotPayload;
  stages: PreparedStage[];
  existingRdv: RdvRow | null;
}): Promise<PilotOfflineSyncCommandResult | null> {
  if (input.flight.versao !== input.command.base_flight_version) {
    return recordOfflineSyncConflict(input.db, {
      empresaId: input.empresaId,
      command: input.command,
      funcionarioId: input.funcionarioId,
      code: 'CONTROLE_VOOS_PILOT_SYNC_FLIGHT_VERSION_CONFLICT',
      detail: conflictDetail({
        type: 'flight_version',
        entity: 'cv_voos',
        expected: input.command.base_flight_version,
        current: input.flight.versao,
      }),
    });
  }

  if (input.flight.status === 'cancelado') {
    return recordOfflineSyncConflict(input.db, {
      empresaId: input.empresaId,
      command: input.command,
      funcionarioId: input.funcionarioId,
      code: 'CONTROLE_VOOS_PILOT_SYNC_FLIGHT_CANCELLED',
      detail: conflictDetail({
        type: 'flight_cancelled',
        entity: 'cv_voos',
        current: input.flight.status,
      }),
    });
  }

  if (input.existingRdv) {
    if (
      input.command.base_server_version !== input.existingRdv.versao ||
      input.snapshot.source_rdv_id !== input.existingRdv.id
    ) {
      return recordOfflineSyncConflict(input.db, {
        empresaId: input.empresaId,
        command: input.command,
        funcionarioId: input.funcionarioId,
        code: 'CONTROLE_VOOS_PILOT_SYNC_RDV_VERSION_CONFLICT',
        detail: conflictDetail({
          type: 'rdv_version',
          entity: 'cv_rdv_operacional',
          expected: {
            id: input.snapshot.source_rdv_id,
            version: input.command.base_server_version,
          },
          current: {
            id: input.existingRdv.id,
            version: input.existingRdv.versao,
          },
        }),
      });
    }
    if (
      input.existingRdv.status !== 'rascunho' ||
      !['rascunho', 'devolvido'].includes(input.existingRdv.workflow_status)
    ) {
      return recordOfflineSyncConflict(input.db, {
        empresaId: input.empresaId,
        command: input.command,
        funcionarioId: input.funcionarioId,
        code: 'CONTROLE_VOOS_PILOT_SYNC_RDV_LOCKED',
        detail: conflictDetail({
          type: 'rdv_workflow',
          entity: 'cv_rdv_operacional',
          current: {
            status: input.existingRdv.status,
            workflow_status: input.existingRdv.workflow_status,
          },
        }),
      });
    }
  } else if (input.command.base_server_version !== 0 || input.snapshot.source_rdv_id !== null) {
    return recordOfflineSyncConflict(input.db, {
      empresaId: input.empresaId,
      command: input.command,
      funcionarioId: input.funcionarioId,
      code: 'CONTROLE_VOOS_PILOT_SYNC_RDV_CREATED_ELSEWHERE',
      detail: conflictDetail({
        type: 'rdv_absence',
        entity: 'cv_rdv_operacional',
        expected: { id: input.snapshot.source_rdv_id, version: input.command.base_server_version },
        current: null,
      }),
    });
  }

  const serverStages = await listEtapas(input.db, input.empresaId, input.flight.id);
  const sourceStages = input.stages.filter((stage) => stage.sourceStageId !== null);
  const serverIds = serverStages.map((stage) => stage.id).sort((a, b) => a - b);
  const sourceIds = sourceStages
    .map((stage) => stage.sourceStageId as number)
    .sort((a, b) => a - b);

  if (
    serverIds.length !== sourceIds.length ||
    serverIds.some((id, index) => id !== sourceIds[index])
  ) {
    return recordOfflineSyncConflict(input.db, {
      empresaId: input.empresaId,
      command: input.command,
      funcionarioId: input.funcionarioId,
      code: 'CONTROLE_VOOS_PILOT_SYNC_STAGE_TOPOLOGY_CONFLICT',
      detail: conflictDetail({
        type: 'stage_topology',
        entity: 'cv_voo_etapas',
        expected: sourceIds,
        current: serverIds,
      }),
    });
  }

  const serverById = new Map<number, EtapaRow>(serverStages.map((stage) => [stage.id, stage]));
  for (const stage of sourceStages) {
    const current = serverById.get(stage.sourceStageId as number);
    if (current && Number(current.numero_etapa) !== Number(stage.input.numero_etapa)) {
      throw new ApiError(
        'Reordenacao de etapas offline ainda nao e suportada nesta versao',
        400,
        'CONTROLE_VOOS_PILOT_SYNC_STAGE_REORDER_UNSUPPORTED',
      );
    }
    if (!current || current.updated_at !== stage.sourceStageUpdatedAt) {
      return recordOfflineSyncConflict(input.db, {
        empresaId: input.empresaId,
        command: input.command,
        funcionarioId: input.funcionarioId,
        code: 'CONTROLE_VOOS_PILOT_SYNC_STAGE_REVISION_CONFLICT',
        detail: conflictDetail({
          type: 'stage_revision',
          entity: 'cv_voo_etapas',
          expected: {
            id: stage.sourceStageId,
            updated_at: stage.sourceStageUpdatedAt,
          },
          current: current
            ? { id: current.id, updated_at: current.updated_at }
            : null,
        }),
      });
    }
  }

  return null;
}

export async function applyPilotOfflineSnapshotCommand(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  funcionarioId: number;
  flight: FlightRow;
  command: PilotOfflineSyncCommand;
}): Promise<PilotOfflineSyncCommandResult> {
  const priorReceipt = await getOfflineSyncReceipt(
    input.db,
    input.empresaId,
    input.command.client_operation_id,
  );
  if (priorReceipt) return replayReceipt(priorReceipt, input.command);

  const snapshot = normalizeSnapshotPayload(input.command);
  assertSourcePackageMatches(input.command, snapshot);
  const currentNumeroVoo = String(input.flight.numero_voo || '').trim();
  if (snapshot.flight_update.numero_voo && currentNumeroVoo && snapshot.flight_update.numero_voo !== currentNumeroVoo) {
    throw new ApiError(
      'Numero do voo ja foi definido pela Coordenacao e nao pode ser sobrescrito pelo piloto',
      409,
      'CONTROLE_VOOS_PILOT_SYNC_FLIGHT_NUMBER_LOCKED',
    );
  }
  let selectedNaturezaId: number | null = null;
  if (snapshot.flight_update.natureza_voo_codigo) {
    const natureza = await input.db
      .prepare('SELECT id FROM cv_naturezas_voo WHERE empresa_id = ? AND codigo = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1')
      .bind(input.empresaId, snapshot.flight_update.natureza_voo_codigo)
      .first<{ id: number }>();
    if (!natureza) {
      throw new ApiError(
        `Natureza ${snapshot.flight_update.natureza_voo_codigo} ainda nao cadastrada neste tenant`,
        409,
        'CONTROLE_VOOS_PILOT_SYNC_NATUREZA_NOT_CONFIGURED',
      );
    }
    selectedNaturezaId = Number(natureza.id);
  }
  const supplierNamesByCode = new Map<string, string>();
  for (const fueling of snapshot.fuelings) {
    if (supplierNamesByCode.has(fueling.empresa_abastecimento_codigo)) continue;
    const supplier = await input.db
      .prepare(
        'SELECT nome FROM cv_empresas_abastecimento WHERE empresa_id = ? AND codigo = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1',
      )
      .bind(input.empresaId, fueling.empresa_abastecimento_codigo)
      .first<{ nome: string }>();
    if (!supplier) {
      throw new ApiError(
        `Empresa de abastecimento ${fueling.empresa_abastecimento_codigo} nao cadastrada ou inativa neste tenant`,
        409,
        'CONTROLE_VOOS_PILOT_SYNC_FUEL_SUPPLIER_NOT_CONFIGURED',
      );
    }
    supplierNamesByCode.set(fueling.empresa_abastecimento_codigo, supplier.nome);
  }

  const justificationIdsByCode = new Map<string, number>();
  for (const item of snapshot.justifications) {
    const row = await input.db
      .prepare(
        'SELECT id FROM cv_justificativas_voo WHERE empresa_id = ? AND codigo = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1',
      )
      .bind(input.empresaId, item.justificativa_codigo)
      .first<{ id: number }>();
    if (!row) {
      throw new ApiError(
        `Justificativa ${item.justificativa_codigo} nao cadastrada ou inativa neste tenant`,
        409,
        'CONTROLE_VOOS_PILOT_SYNC_JUSTIFICATION_NOT_CONFIGURED',
      );
    }
    justificationIdsByCode.set(item.justificativa_codigo, Number(row.id));
  }

  const existingRdv = await getActiveRdvByFlight(input.db, input.flight.id, input.empresaId);
  const rdvInput = normalizeRdvInput(snapshot.rdv, !existingRdv);
  assertRdvRules(existingRdv ? { ...existingRdv, ...rdvInput } : rdvInput);
  const stages = prepareStages(snapshot.stages);

  const conflict = await currentStateConflict({
    ...input,
    snapshot,
    stages,
    existingRdv,
  });
  if (conflict) return conflict;

  const newVersion = existingRdv ? input.command.base_server_version + 1 : 1;
  const rdvStatement = existingRdv
    ? buildExistingRdvUpdate({
        ...input,
        existingRdv,
        rdv: { ...existingRdv, ...rdvInput },
        stages,
      })
    : buildNewRdvInsert({
        ...input,
        rdv: rdvInput,
        stages,
      });
  const stageStatements = buildStageStatements({
    ...input,
    newVersion,
    stages,
  });
  const fuelingStatements = buildFuelingStatements({
    ...input,
    newVersion,
    fuelings: snapshot.fuelings,
    supplierNamesByCode,
  });
  const justificationStatements = buildJustificationStatements({
    ...input,
    newVersion,
    justifications: snapshot.justifications,
    justificationIdsByCode,
  });
  const numeroVooUpdate =
    snapshot.flight_update.numero_voo && !currentNumeroVoo ? snapshot.flight_update.numero_voo : null;
  const currentNumeroDb = String(input.flight.numero_db || '').trim();
  const numeroDbUpdate =
    snapshot.flight_update.numero_db && snapshot.flight_update.numero_db !== currentNumeroDb
      ? snapshot.flight_update.numero_db
      : null;
  const naturezaUpdate =
    selectedNaturezaId !== null && selectedNaturezaId !== Number(input.flight.natureza_voo_id)
      ? selectedNaturezaId
      : null;
  const flightMetadataStatement =
    naturezaUpdate !== null || numeroVooUpdate !== null || numeroDbUpdate !== null
      ? buildFlightMetadataStatement({
          ...input,
          naturezaId: naturezaUpdate,
          numeroVoo: numeroVooUpdate,
          numeroDb: numeroDbUpdate,
          baseFlightVersion: input.command.base_flight_version,
        })
      : null;
  const eventStatement = buildOfflineSyncEvent({
    ...input,
    newVersion,
  });

  const receiptStatement = existingRdv
    ? buildOfflineSyncReceiptInsert(input.db, {
        empresaId: input.empresaId,
        command: input.command,
        funcionarioId: input.funcionarioId,
        canonicalEntityId: String(existingRdv.id),
        serverEntityVersion: newVersion,
        resultStatus: 'accepted',
        requirePriorChange: true,
      })
    : buildAcceptedReceiptForCreatedRdv(input.db, {
        empresaId: input.empresaId,
        command: input.command,
        funcionarioId: input.funcionarioId,
      });

  let results;
  try {
    results = await input.db.batch([
      rdvStatement,
      ...stageStatements,
      ...fuelingStatements,
      ...justificationStatements,
      ...(flightMetadataStatement ? [flightMetadataStatement] : []),
      eventStatement,
      receiptStatement,
    ]);
  } catch (error) {
    const racedReceipt = await getOfflineSyncReceipt(
      input.db,
      input.empresaId,
      input.command.client_operation_id,
    );
    if (racedReceipt) return replayReceipt(racedReceipt, input.command);

    const refreshedRdv = await getActiveRdvByFlight(input.db, input.flight.id, input.empresaId);
    if (
      refreshedRdv &&
      refreshedRdv.versao !== input.command.base_server_version
    ) {
      return recordOfflineSyncConflict(input.db, {
        empresaId: input.empresaId,
        command: input.command,
        funcionarioId: input.funcionarioId,
        code: 'CONTROLE_VOOS_PILOT_SYNC_CONCURRENT_VERSION_CONFLICT',
        detail: conflictDetail({
          type: 'concurrent_rdv_update',
          entity: 'cv_rdv_operacional',
          expected: input.command.base_server_version,
          current: refreshedRdv.versao,
        }),
      });
    }
    throw error;
  }

  const rdvMutationResult = results[0];
  if (!rdvMutationResult?.meta?.changes) {
    const racedReceipt = await getOfflineSyncReceipt(
      input.db,
      input.empresaId,
      input.command.client_operation_id,
    );
    if (racedReceipt) return replayReceipt(racedReceipt, input.command);

    return recordOfflineSyncConflict(input.db, {
      empresaId: input.empresaId,
      command: input.command,
      funcionarioId: input.funcionarioId,
      code: 'CONTROLE_VOOS_PILOT_SYNC_CAS_CONFLICT',
      detail: conflictDetail({
        type: 'cas',
        entity: 'cv_rdv_operacional',
        expected: input.command.base_server_version,
      }),
    });
  }

  const acceptedReceipt = await getOfflineSyncReceipt(
    input.db,
    input.empresaId,
    input.command.client_operation_id,
  );
  if (!acceptedReceipt || acceptedReceipt.result_status !== 'accepted') {
    throw new ApiError(
      'Mutacao offline sem receipt atomico confirmado',
      503,
      'CONTROLE_VOOS_PILOT_SYNC_ACCEPTED_RECEIPT_MISSING',
    );
  }

  const updated = await getRdvOrThrow(
    input.db,
    Number(acceptedReceipt.canonical_entity_id),
    input.empresaId,
  );

  return commandResultFromAccepted({
    command: input.command,
    serverEntityVersion: updated.versao,
    canonicalEntityId: String(updated.id),
    serverReceivedAt: acceptedReceipt.received_at,
  });
}
