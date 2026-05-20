import { Calendar, User, MapPin, Award, FileText, Edit, Trash2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatarData } from '../../utils/formatters';

interface QualificacaoCardProps {
  qualificacao: {
    id: number;
    funcionario_nome: string;
    funcionario_matricula: string;
    qualificacao_nome: string;
    categoria: string;
    data_conclusao: string;
    data_vencimento?: string | null;
    dias_ate_vencimento?: number | null;
    status: 'vigente' | 'expirando' | 'vencida' | 'vitalicio';
    urgencia?: 'critical' | 'high' | 'medium' | 'low';
    nota?: number | null;
    instrutor?: string | null;
    local?: string | null;
  };
  onEdit?: () => void;
  onDelete?: () => void;
  onRenovar?: () => void;
}

export function QualificacaoCard({
  qualificacao,
  onEdit,
  onDelete,
  onRenovar,
}: QualificacaoCardProps) {
  const urgenciaColors = {
    critical: 'border-red-500 bg-red-50',
    high: 'border-orange-500 bg-orange-50',
    medium: 'border-yellow-500 bg-yellow-50',
    low: 'border-green-500 bg-green-50',
  };

  const borderClass = qualificacao.urgencia
    ? urgenciaColors[qualificacao.urgencia]
    : 'border-gray-200 bg-white';

  return (
    <div
      className={`
      rounded-lg border-2 p-4 transition-all hover:shadow-md
      ${borderClass}
    `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900">{qualificacao.qualificacao_nome}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {qualificacao.categoria}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={14} />
            <span>{qualificacao.funcionario_nome}</span>
            <span className="text-gray-400">-</span>
            <span className="font-mono text-xs">Mat: {qualificacao.funcionario_matricula}</span>
          </div>
        </div>

        <StatusBadge
          status={qualificacao.status}
          diasAteVencimento={qualificacao.dias_ate_vencimento}
        />
      </div>

      {/* Detalhes */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar size={14} />
          <span>Conclusão: {formatarData(qualificacao.data_conclusao)}</span>
          {qualificacao.data_vencimento && (
            <>
              <span className="text-gray-400">→</span>
              <span>Vencimento: {formatarData(qualificacao.data_vencimento)}</span>
            </>
          )}
        </div>

        {qualificacao.nota && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Award size={14} />
            <span>Nota: {qualificacao.nota.toFixed(1)}/5.0</span>
          </div>
        )}

        {qualificacao.instrutor && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={14} />
            <span>Instrutor: {qualificacao.instrutor}</span>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
        {qualificacao.status === 'expirando' || qualificacao.status === 'vencida' ? (
          <button
            onClick={onRenovar}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FileText size={14} className="inline mr-1" />
            Renovar Agora
          </button>
        ) : (
          <button
            onClick={onRenovar}
            className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <FileText size={14} className="inline mr-1" />
            Renovar
          </button>
        )}

        {onEdit && (
          <button
            onClick={onEdit}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Edit size={14} />
          </button>
        )}

        {onDelete && (
          <button
            onClick={onDelete}
            className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Alerta de urgência */}
      {qualificacao.urgencia === 'critical' && (
        <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700 font-medium">
          ⚠️ AÇÃO URGENTE: Esta qualificação requer renovação imediata
        </div>
      )}
    </div>
  );
}
