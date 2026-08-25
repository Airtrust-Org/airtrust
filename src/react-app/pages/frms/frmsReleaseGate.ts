import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';

export const NAO_LIBERAR_LABEL = 'NÃO LIBERAR — Fadiga diária não preenchida';

export function isNaoLiberarHoje(
  item: Pick<
    FrmsOperationalSnapshotItem,
    'escalado' | 'data_operacional' | 'checkin_status' | 'alertas'
  >,
  todayIso: string,
): boolean {
  if (!item.escalado) return false;
  if (item.data_operacional !== todayIso) return false;
  return (
    item.checkin_status === 'PENDENTE' ||
    item.checkin_status === 'AUSENTE' ||
    item.alertas.includes('CHECKIN_PENDENTE')
  );
}
