import type { FiraLinhPreview } from './fira-service';

export interface JornadaDuplicataCandidate {
  id: string | number;
  origem: string | null;
  empresa_id: number | null;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number | null;
  duracao_jornada_minutos: number | null;
  registrado_por?: string | null;
  observacao?: string | null;
}

function hasOperationalDataInPreviewLine(line: FiraLinhPreview): boolean {
  return Boolean(
    line.hora_apresentacao ||
      line.hora_termino ||
      (line.horas_voo_min || 0) > 0 ||
      (line.duracao_jornada_min || 0) > 0,
  );
}

export function isJornadaOperacionalmenteVazia(
  jornada: Pick<
    JornadaDuplicataCandidate,
    'hora_apresentacao' | 'hora_termino' | 'horas_voo_minutos' | 'duracao_jornada_minutos'
  >,
): boolean {
  return !Boolean(
    jornada.hora_apresentacao ||
      jornada.hora_termino ||
      (jornada.horas_voo_minutos || 0) > 0 ||
      (jornada.duracao_jornada_minutos || 0) > 0,
  );
}

export function shouldMergeDuplicataIntoManualEmpty(params: {
  existing: JornadaDuplicataCandidate;
  incomingLine: FiraLinhPreview;
  empresaId?: number | null;
}): boolean {
  const { existing, incomingLine, empresaId } = params;
  if (!hasOperationalDataInPreviewLine(incomingLine)) return false;

  const origem = String(existing.origem || '').trim().toUpperCase();
  if (origem && origem !== 'MANUAL') return false;

  const isAutoCheckinPlaceholder = String(existing.registrado_por || '') === 'FRMS_CHECKIN_AUTO';
  if (!isAutoCheckinPlaceholder && !isJornadaOperacionalmenteVazia(existing)) return false;

  if (
    empresaId !== undefined &&
    empresaId !== null &&
    existing.empresa_id !== null &&
    existing.empresa_id !== empresaId
  ) {
    return false;
  }
  return true;
}
