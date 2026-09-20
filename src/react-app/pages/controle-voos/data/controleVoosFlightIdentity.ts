import type {
  CvAeroporto,
  CvRdvWorkflowStatus,
  CvVoo,
} from '@/react-app/hooks/useControleVoos';

const GENERIC_NAME_PREFIXES = [
  'PLATAFORMA /',
  'NAVIO /',
  'AERÓDROMO /',
  'AERODROMO /',
  'HELIPONTO /',
  'AEROPORTO /',
];

export type FlightRoutePointLike = {
  id?: number | null;
  codigo?: string | null;
  codigo_icao?: string | null;
  nome?: string | null;
  tipo?: string | null;
};

export const RDV_WORKFLOW_LABELS: Record<CvRdvWorkflowStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado à Coordenação',
  em_revisao: 'Em revisão',
  devolvido: 'Devolvido',
  aprovado_coordenacao: 'Aprovado pela Coordenação',
  finalizado: 'Finalizado',
  reaberto: 'Reaberto',
  cancelado: 'Cancelado',
};

export function cleanAeronauticalPointName(value?: string | null): string {
  let text = String(value || '').trim();
  for (const prefix of GENERIC_NAME_PREFIXES) {
    if (text.toLocaleUpperCase('pt-BR').startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  if (text.includes(' / ')) {
    const parts = text.split(' / ').map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) text = parts[parts.length - 1];
  }
  return text || 'Local não identificado';
}

function primaryCode(point?: FlightRoutePointLike | null): string {
  return String(point?.codigo || point?.codigo_icao || '').trim().toUpperCase();
}

function icaoCode(point?: FlightRoutePointLike | null): string {
  return String(point?.codigo_icao || '').trim().toUpperCase();
}

export function formatAeronauticalPoint(point?: FlightRoutePointLike | null): string {
  if (!point) return '—';
  const primary = primaryCode(point);
  const icao = icaoCode(point);
  const codes = [primary, icao].filter((code, index, items) => code && items.indexOf(code) === index);
  const rawName = String(point.nome || '').trim();
  if (!rawName) return codes.join(' · ') || '—';
  const name = cleanAeronauticalPointName(rawName);
  return codes.length > 0 ? `${name} (${codes.join(' · ')})` : name;
}

function pointKey(point?: FlightRoutePointLike | null): string {
  if (!point) return '';
  if (Number.isInteger(Number(point.id)) && Number(point.id) > 0) return `id:${Number(point.id)}`;
  return `code:${icaoCode(point) || primaryCode(point)}`;
}

function buildAeroByCode(aeroportos: CvAeroporto[]) {
  const map = new Map<string, CvAeroporto[]>();
  for (const item of aeroportos) {
    for (const raw of [item.codigo, item.codigo_icao]) {
      const code = String(raw || '').trim().toUpperCase();
      if (!code) continue;
      const rows = map.get(code) || [];
      if (!rows.some((row) => row.id === item.id)) rows.push(item);
      map.set(code, rows);
    }
  }
  return map;
}

export function resolveFlightRoutePoints(
  voo: Pick<CvVoo, 'origem_id' | 'destino_id' | 'rota_codigos' | 'rota_pontos'>,
  aeroportos: CvAeroporto[],
): FlightRoutePointLike[] {
  if (Array.isArray(voo.rota_pontos) && voo.rota_pontos.length >= 2) {
    return voo.rota_pontos;
  }

  const byId = new Map(aeroportos.map((item) => [item.id, item]));
  const byCode = buildAeroByCode(aeroportos);
  const codes = (voo.rota_codigos || []).map((code) => String(code || '').trim().toUpperCase()).filter(Boolean);
  if (codes.length >= 2) {
    return codes.map((code) => {
      const matches = byCode.get(code) || [];
      if (matches.length === 1) return matches[0];
      return { codigo: code, codigo_icao: code, nome: null, tipo: null };
    });
  }

  const origin = byId.get(voo.origem_id);
  const destination = byId.get(voo.destino_id);
  return [origin || { id: voo.origem_id }, destination || { id: voo.destino_id }];
}

export function operationalDestinationPoints(points: FlightRoutePointLike[]): FlightRoutePointLike[] {
  if (points.length <= 1) return [];
  const origin = points[0];
  const final = points[points.length - 1];
  const returnsToOrigin = pointKey(origin) && pointKey(origin) === pointKey(final);
  const destinations = returnsToOrigin ? points.slice(1, -1) : points.slice(1);

  const unique: FlightRoutePointLike[] = [];
  for (const point of destinations) {
    const key = pointKey(point);
    if (!key || unique.some((existing) => pointKey(existing) === key)) continue;
    unique.push(point);
  }
  return unique;
}

export function flightOperationalRouteLabel(
  voo: Pick<CvVoo, 'origem_id' | 'destino_id' | 'rota_codigos' | 'rota_pontos'>,
  aeroportos: CvAeroporto[],
): string {
  const points = resolveFlightRoutePoints(voo, aeroportos);
  if (points.length === 0) return '—';
  const origin = formatAeronauticalPoint(points[0]);
  const destinations = operationalDestinationPoints(points);
  if (destinations.length === 0) {
    const fallback = points[points.length - 1];
    return origin + ' → ' + formatAeronauticalPoint(fallback);
  }
  return origin + ' → ' + destinations.map(formatAeronauticalPoint).join(' → ');
}

export function flightOperationalDestinationLabel(
  voo: Pick<CvVoo, 'origem_id' | 'destino_id' | 'rota_codigos' | 'rota_pontos'>,
  aeroportos: CvAeroporto[],
): string {
  const points = resolveFlightRoutePoints(voo, aeroportos);
  const destinations = operationalDestinationPoints(points);
  if (destinations.length === 0) {
    return points.length > 1 ? formatAeronauticalPoint(points[points.length - 1]) : '—';
  }
  return destinations.map(formatAeronauticalPoint).join(' · ');
}

export function rdvWorkflowLabel(status?: CvRdvWorkflowStatus | null): string | null {
  if (!status) return null;
  return RDV_WORKFLOW_LABELS[status] || status;
}
