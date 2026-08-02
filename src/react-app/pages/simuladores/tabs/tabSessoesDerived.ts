import type { Sessao } from '@/react-app/components/simuladores/SessaoCard';
import { isSameStatus } from '@/react-app/types/simuladores';

export interface SessaoStats {
  total: number;
  agendadas: number;
  emAndamento: number;
  concluidas: number;
  canceladas: number;
}

export function computeSessaoStats(sessoes: readonly Sessao[]): SessaoStats {
  return sessoes.reduce<SessaoStats>(
    (stats, sessao) => {
      stats.total += 1;
      if (isSameStatus(sessao.status, 'AGENDADO')) stats.agendadas += 1;
      else if (isSameStatus(sessao.status, 'EM_ANDAMENTO')) stats.emAndamento += 1;
      else if (isSameStatus(sessao.status, 'CONCLUIDO')) stats.concluidas += 1;
      else if (isSameStatus(sessao.status, 'CANCELADO')) stats.canceladas += 1;
      return stats;
    },
    { total: 0, agendadas: 0, emAndamento: 0, concluidas: 0, canceladas: 0 },
  );
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function filterAndSortSessoes(
  sessoes: readonly Sessao[],
  filtroStatus: string,
  busca: string,
): Sessao[] {
  const normalizedSearch = busca.trim().toLocaleLowerCase('pt-BR');

  return sessoes
    .filter((sessao) => {
      if (filtroStatus && !isSameStatus(sessao.status, filtroStatus)) return false;
      if (!normalizedSearch) return true;

      return (
        sessao.simulador_nome?.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
        sessao.instrutor_nome?.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
        sessao.tipo_sessao?.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
        sessao.participantes?.some((participante) =>
          participante.funcionario_nome?.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
        )
      );
    })
    .sort((left, right) => right.data.localeCompare(left.data));
}

export function getProximasSessoes(
  sessoesFiltradas: readonly Sessao[],
  todayKey: string,
  limit = 5,
): Sessao[] {
  return sessoesFiltradas
    .filter(
      (sessao) => isSameStatus(sessao.status, 'AGENDADO') && sessao.data >= todayKey,
    )
    .reverse()
    .slice(0, limit);
}

export function getSessoesRecentes(
  sessoesFiltradas: readonly Sessao[],
  todayKey: string,
  limit = 10,
): Sessao[] {
  return sessoesFiltradas
    .filter(
      (sessao) => !isSameStatus(sessao.status, 'AGENDADO') || sessao.data < todayKey,
    )
    .slice(0, limit);
}
