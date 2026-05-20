/**
 * UX-08: Barra de Status Unificada
 * Real-time counters showing: tripulações, eventos, conflitos, CMA alerts.
 * Sits at the top of the escala view.
 */

import { useMemo } from 'react';
import { Users, User, Calendar, Plane, Clock, AlertTriangle, Stethoscope } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  EscalaTripulacao,
  EscalaEvento,
  AlertaCMA,
} from '../../hooks/queries/useEscalasQuery';

const ICON_MAP: Record<string, LucideIcon> = {
  groups: Users,
  person: User,
  event: Calendar,
  flight: Plane,
  pending: Clock,
  warning: AlertTriangle,
  medical_services: Stethoscope,
};

interface BarraStatusEscalaProps {
  tripulacoes: EscalaTripulacao[];
  eventos: EscalaEvento[];
  alertasCMA?: AlertaCMA[];
  conflitos?: number;
  status: string;
}

export default function BarraStatusEscala({
  tripulacoes,
  eventos,
  alertasCMA = [],
  conflitos = 0,
  status,
}: BarraStatusEscalaProps) {
  const stats = useMemo(() => {
    const totalTrip = tripulacoes.length;
    const totalEventos = eventos.length;
    const pendentes = eventos.filter((e) => e.status === 'pendente').length;
    const autoGerados = eventos.filter((e) => e.gerado_automaticamente === 1).length;
    const pilotosUnicos = new Set(
      tripulacoes.flatMap((t) => [t.pic_id, ...(t.sic_id ? [t.sic_id] : [])]),
    ).size;
    const diasVoo = new Set(
      eventos.filter((e) => e.tipo_evento === 'voo').map((e) => e.data_inicio.slice(0, 10)),
    ).size;
    const alertas = alertasCMA.length;

    return { totalTrip, totalEventos, pendentes, autoGerados, pilotosUnicos, diasVoo, alertas };
  }, [tripulacoes, eventos, alertasCMA]);

  const items = [
    {
      icon: 'groups',
      label: 'Duplas',
      value: stats.totalTrip,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      icon: 'person',
      label: 'Pilotos',
      value: stats.pilotosUnicos,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      icon: 'event',
      label: 'Eventos',
      value: stats.totalEventos,
      color: 'text-slate-600',
      bg: 'bg-slate-50',
    },
    {
      icon: 'flight',
      label: 'Dias Voo',
      value: stats.diasVoo,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
    },
    ...(stats.pendentes > 0
      ? [
          {
            icon: 'pending',
            label: 'Pendentes',
            value: stats.pendentes,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
        ]
      : []),
    ...(conflitos > 0
      ? [
          {
            icon: 'warning',
            label: 'Conflitos',
            value: conflitos,
            color: 'text-red-600',
            bg: 'bg-red-50',
          },
        ]
      : []),
    ...(stats.alertas > 0
      ? [
          {
            icon: 'medical_services',
            label: 'CMA',
            value: stats.alertas,
            color: 'text-orange-600',
            bg: 'bg-orange-50',
          },
        ]
      : []),
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {items.map((item) => {
        const IconComp = ICON_MAP[item.icon] ?? Calendar;
        return (
          <div
            key={item.label}
            className={`${item.bg} ${item.color} flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium`}
          >
            <IconComp className="w-4 h-4" />
            <span className="font-bold">{item.value}</span>
            <span className="opacity-70">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
