/**
 * COMPONENTE: Card de Sessão de Simulador
 * Exibe todos os dados da sessão + participantes + fichas
 * Data: 03/12/2025
 */

import { useState } from 'react';

import { Clock, User, Users, FileText, Edit2, Trash2, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getCorSimulador, isCheck, getRingCheck } from '@/react-app/utils/simulador-cores';
import { enviarNotificacaoSessao, montarResumoCanal } from '@/react-app/utils/sessaoNotificacoes';
import { BotaoGuiaSessao } from './BotaoGuiaSessao';

export interface Participante {
  id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_matricula: string;
  funcionario_codigo_anac?: string;
  funcao: 'PIC' | 'SIC';
  email?: string;
  telefone?: string;
}

export interface Ficha {
  id: number;
  status: string;
  funcionario_nome: string;
  funcionario_matricula?: string;
}

export interface Sessao {
  id: number;
  uuid: string;
  simulador_id: number;
  simulador_nome: string;
  simulador_modelo: string;
  simulador_tipo?: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  duracao_minutos: number;
  instrutor_id: number;
  instrutor_nome: string;
  instrutor_email?: string;
  instrutor_telefone?: string;
  examinador_id?: number | null;
  examinador_nome?: string | null;
  tipo_sessao: string;
  tema_sessao?: string;
  status: 'AGENDADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
  observacoes?: string;
  participantes: Participante[];
  fichas: Ficha[];
  modo_compartilhado?: number | boolean;
}

interface SessaoCardProps {
  sessao: Sessao;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onVerFichas?: (sessaoId: number) => void;
}

export default function SessaoCard({ sessao, onEdit, onDelete, onVerFichas }: SessaoCardProps) {
  const [sendingChannel, setSendingChannel] = useState<'email' | 'whatsapp' | null>(null);
  // ========== FORMATAÇÃO ==========
  function formatarData(data: string): string {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function formatarHorario(hora: string): string {
    if (!hora) return '--:--';
    return hora.substring(0, 5); // "08:00:00" -> "08:00"
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'AGENDADO':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'EM_ANDAMENTO':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'CONCLUIDO':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'CANCELADO':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'AGENDADO':
        return 'Agendada';
      case 'EM_ANDAMENTO':
        return 'Em Andamento';
      case 'CONCLUIDO':
        return 'Concluída';
      case 'CANCELADO':
        return 'Cancelada';
      default:
        return status;
    }
  }

  function getFuncaoBadgeColor(funcao: string): string {
    return funcao === 'PIC' ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white';
  }

  function getFuncaoLabel(funcao: string): string {
    if (funcao === 'PIC') return 'PIC';
    if (funcao === 'SIC') return 'SIC';
    if (funcao === 'OBS') return 'Observador';
    return funcao;
  }

  // ========== HANDLERS ENVIO ==========
  const handleEnviarEmail = async () => {
    try {
      setSendingChannel('email');
      const alertas = await enviarNotificacaoSessao(sessao.id, {
        enviarEmail: true,
        enviarWhatsApp: false,
      });
      const resumo = montarResumoCanal('email', alertas);
      if (resumo.tipo === 'success') toast.success(resumo.mensagem);
      if (resumo.tipo === 'warning') toast.warning(resumo.mensagem);
      if (resumo.tipo === 'error') toast.error(resumo.mensagem);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar notificação por e-mail');
    } finally {
      setSendingChannel(null);
    }
  };

  const handleEnviarWhatsApp = async () => {
    try {
      setSendingChannel('whatsapp');
      const alertas = await enviarNotificacaoSessao(sessao.id, {
        enviarEmail: false,
        enviarWhatsApp: true,
      });
      const resumo = montarResumoCanal('whatsapp', alertas);
      if (resumo.tipo === 'success') toast.success(resumo.mensagem);
      if (resumo.tipo === 'warning') toast.warning(resumo.mensagem);
      if (resumo.tipo === 'error') toast.error(resumo.mensagem);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao enviar notificação por WhatsApp',
      );
    } finally {
      setSendingChannel(null);
    }
  };

  // ========== CORES E CHECK ==========
  const cores = getCorSimulador(sessao);
  const isCheckSessao = isCheck(sessao);
  const ringCheck = getRingCheck(sessao);

  // ========== RENDER ==========
  return (
    <div
      className={`${cores.bg} ${
        cores.border
      } border-l-4 rounded-lg hover:shadow-md transition-all p-4 ${ringCheck}`}
    >
      {/* HEADER: Título e Status */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className={`text-base font-semibold ${cores.text}`}>
            {sessao.tema_sessao || sessao.tipo_sessao || 'Sessão de Treinamento'}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">{sessao.simulador_nome}</p>
          {Boolean(sessao.modo_compartilhado) && (
            <span className="mt-1 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              Compartilhada
            </span>
          )}
          <div className="flex items-center gap-2 text-sm text-slate-600 mt-1 flex-wrap">
            <span className="font-medium">{formatarData(sessao.data)}</span>
            <span>•</span>
            <Clock size={14} />
            <span>
              {formatarHorario(sessao.horario_inicio)} - {formatarHorario(sessao.horario_fim)}
            </span>
            <span>•</span>
            <User size={14} />
            <span>{sessao.instrutor_nome}</span>
          </div>
          {sessao.examinador_nome && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-semibold mt-1.5">
              <span>👨‍✈️</span>
              <span>Examinador: {sessao.examinador_nome}</span>
            </div>
          )}
        </div>

        {/* Status Badge */}
        <span
          className={`px-3 py-1 rounded-md text-xs font-medium uppercase tracking-wide ${getStatusColor(
            sessao.status,
          )}`}
        >
          {getStatusLabel(sessao.status)}
        </span>
      </div>

      {/* PARTICIPANTES */}
      <div className="border-t border-slate-100 pt-3 mb-3">
        <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
          <Users size={13} />
          Participantes:
        </p>

        {sessao.participantes && sessao.participantes.length > 0 ? (
          <div className="space-y-1.5">
            {sessao.participantes.map((part) => (
              <div key={part.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700">{part.funcionario_nome}</span>
                  <span className="text-xs text-slate-400">
                    ({part.funcionario_codigo_anac || part.funcionario_matricula})
                  </span>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getFuncaoBadgeColor(
                    part.funcao,
                  )}`}
                >
                  {getFuncaoLabel(part.funcao)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">Nenhum participante</p>
        )}
      </div>

      {/* AÇÕES */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
        <button
          onClick={() => onEdit?.(sessao.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition"
        >
          <Edit2 size={14} />
          Editar
        </button>
        <button
          onClick={() => onVerFichas?.(sessao.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded transition"
        >
          <FileText size={14} />
          Fichas ({sessao.fichas?.length || 0})
        </button>
        <BotaoGuiaSessao sessaoId={sessao.id} />
        <button
          onClick={handleEnviarEmail}
          disabled={sendingChannel !== null}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50 rounded transition"
          title="Enviar por Email"
        >
          <Mail size={14} />
        </button>
        <button
          onClick={handleEnviarWhatsApp}
          disabled={sendingChannel !== null}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded transition"
          title="Enviar por WhatsApp"
        >
          <MessageCircle size={14} />
        </button>
        <button
          onClick={() => onDelete?.(sessao.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
