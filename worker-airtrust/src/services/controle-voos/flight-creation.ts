import { ApiError } from '../../middleware/error-handler';

export type FlightRoutePoint = {
  id: number;
  codigo: string;
  codigo_icao: string | null;
};

function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

export function normalizeFlightRouteIds(value: unknown): number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) {
    throw new ApiError('A rota deve conter entre 2 e 20 pontos', 400, 'CONTROLE_VOOS_ROUTE_INVALID');
  }
  const route = value.map((entry, index) => parsePositiveInteger(entry, `rota_ids[${index}]`));
  for (let index = 1; index < route.length; index += 1) {
    if (route[index] === route[index - 1]) {
      throw new ApiError(
        'Pontos consecutivos da rota devem ser diferentes',
        400,
        'CONTROLE_VOOS_ROUTE_CONSECUTIVE_DUPLICATE',
      );
    }
  }
  return route;
}

export function parseFlightCrewIds(payload: Record<string, unknown>) {
  const hasPic = payload.pic_funcionario_id !== undefined && payload.pic_funcionario_id !== null && payload.pic_funcionario_id !== '';
  const hasSic = payload.sic_funcionario_id !== undefined && payload.sic_funcionario_id !== null && payload.sic_funcionario_id !== '';
  if (hasPic !== hasSic) {
    throw new ApiError('Informe PIC e SIC em conjunto', 400, 'CONTROLE_VOOS_CREW_PAIR_REQUIRED');
  }
  return {
    picFuncionarioId: hasPic ? parsePositiveInteger(payload.pic_funcionario_id, 'pic_funcionario_id') : null,
    sicFuncionarioId: hasSic ? parsePositiveInteger(payload.sic_funcionario_id, 'sic_funcionario_id') : null,
  };
}

export async function resolveFlightRoutePoints(
  db: D1Database,
  empresaId: number,
  routeIds: number[],
): Promise<FlightRoutePoint[]> {
  const uniqueIds = [...new Set(routeIds)];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const result = await db
    .prepare(
      `SELECT id, codigo, codigo_icao
       FROM cv_aeroportos
       WHERE empresa_id = ?
         AND id IN (${placeholders})
         AND ativo = 1
         AND deleted_at IS NULL`,
    )
    .bind(empresaId, ...uniqueIds)
    .all<FlightRoutePoint>();
  const byId = new Map((result.results || []).map((row) => [Number(row.id), row]));
  if (uniqueIds.some((id) => !byId.has(id))) {
    throw new ApiError(
      'A rota contém aeródromo ou plataforma que não pertence à empresa',
      400,
      'CONTROLE_VOOS_INVALID_CATALOG',
    );
  }
  return routeIds.map((id) => byId.get(id) as FlightRoutePoint);
}

function routePointCode(point: FlightRoutePoint): string {
  return String(point.codigo_icao || point.codigo || '').trim().toUpperCase();
}

export function buildFlightRelatedStatements(
  db: D1Database,
  input: {
    empresaId: number;
    vooId: number;
    userId: string | number | null;
    routePoints: FlightRoutePoint[];
    picFuncionarioId: number | null;
    sicFuncionarioId: number | null;
  },
): D1PreparedStatement[] {
  const { empresaId, vooId, userId, routePoints, picFuncionarioId, sicFuncionarioId } = input;
  const statements: D1PreparedStatement[] = [];
  if (picFuncionarioId && sicFuncionarioId) {
    statements.push(
      db.prepare(
        `INSERT INTO cv_voo_tripulantes (
           empresa_id, voo_id, funcionario_id, funcao, created_by, updated_by, created_at, updated_at
         ) VALUES (?, ?, ?, 'PIC', ?, ?, datetime('now'), datetime('now'))`,
      ).bind(empresaId, vooId, picFuncionarioId, userId, userId),
      db.prepare(
        `INSERT INTO cv_voo_tripulantes (
           empresa_id, voo_id, funcionario_id, funcao, created_by, updated_by, created_at, updated_at
         ) VALUES (?, ?, ?, 'SIC', ?, ?, datetime('now'), datetime('now'))`,
      ).bind(empresaId, vooId, sicFuncionarioId, userId, userId),
    );
  }
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    statements.push(
      db.prepare(
        `INSERT INTO cv_voo_etapas (
           empresa_id, voo_id, numero_etapa, origem_icao, destino_icao, origem_dados,
           created_by, updated_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'MANUAL', ?, ?, datetime('now'), datetime('now'))`,
      ).bind(
        empresaId,
        vooId,
        index + 1,
        routePointCode(routePoints[index]),
        routePointCode(routePoints[index + 1]),
        userId,
        userId,
      ),
    );
  }
  return statements;
}
