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

type SnapshotPayload = {
  source_package_id: string;
  source_rdv_id: number | null;
  rdv: Record<string, unknown>;
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

  return {
    source_package_id: sourcePackageId,
    source_rdv_id: parseNullablePositiveInteger(raw.source_rdv_id, 'source_rdv_id'),
    rdv: raw.rdv,
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
  return prepared.sort(
    (left, right) =>
      Number(left.input.numero_etapa ?? 0) - Number(right.input.numero_etapa ?? 0),
  );
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

function buildStageGuard(
  existingRdv: RdvRow | null,
): { sql: string; bind: (params: { empresaId: number; flight: FlightRow; command: PilotOfflineSyncCommand }) => unknown[] } {
  if (existingRdv) {
    return {
      sql: `
        EXISTS (
          SELECT 1 FROM cv_voos
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND versao = ?
        )
        AND EXISTS (
          SELECT 1 FROM cv_rdv_operacional
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
            AND versao = ? AND status = 'rascunho'
            AND workflow_status IN ('rascunho', 'devolvido')
        )
      `,
      bind: ({ empresaId, flight, command }) => [
        flight.id,
        empresaId,
        command.base_flight_version,
        existingRdv.id,
        empresaId,
        command.base_server_version,
      ],
    };
  }

  return {
    sql: `
      EXISTS (
        SELECT 1 FROM cv_voos
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND versao = ?
      )
      AND NOT EXISTS (
        SELECT 1 FROM cv_rdv_operacional
        WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL AND status <> 'cancelado'
      )
    `,
    bind: ({ empresaId, flight, command }) => [
      flight.id,
      empresaId,
      command.base_flight_version,
      flight.id,
      empresaId,
    ],
  };
}

function buildStageStatements(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  command: PilotOfflineSyncCommand;
  existingRdv: RdvRow | null;
  stages: PreparedStage[];
}): D1PreparedStatement[] {
  const guard = buildStageGuard(input.existingRdv);
  return input.stages.map((stage) => {
    const values = [
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
      input.userId,
    ];

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
                updated_by = ?,
                updated_at = datetime('now')
            WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
              AND ${guard.sql}
          `,
        )
        .bind(
          ...values,
          stage.sourceStageId,
          input.flight.id,
          input.empresaId,
          ...guard.bind(input),
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
            combustivel_inicio, combustivel_fim, unidade_combustivel, origem_dados,
            created_by, updated_by, created_at, updated_at
          )
          SELECT
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, 'MANUAL',
            ?, ?, datetime('now'), datetime('now')
          WHERE ${guard.sql}
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
        input.userId,
        input.userId,
        ...guard.bind(input),
      );
  });
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
}): D1PreparedStatement {
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
    );
}

function buildNewRdvInsert(input: {
  db: D1Database;
  empresaId: number;
  userId: number;
  flight: FlightRow;
  command: PilotOfflineSyncCommand;
  rdv: RdvInput;
}): D1PreparedStatement {
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

  const stageStatements = buildStageStatements({
    ...input,
    existingRdv,
    stages,
  });
  const newVersion = existingRdv ? input.command.base_server_version + 1 : 1;
  const rdvStatement = existingRdv
    ? buildExistingRdvUpdate({
        ...input,
        existingRdv,
        rdv: { ...existingRdv, ...rdvInput },
      })
    : buildNewRdvInsert({
        ...input,
        rdv: rdvInput,
      });
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
      ...stageStatements,
      rdvStatement,
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

  const rdvMutationResult = results[stageStatements.length];
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
