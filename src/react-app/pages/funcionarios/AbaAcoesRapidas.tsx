import { useState } from 'react';
import { Mail, Phone, FileText, Trash2, Award } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { API_ENDPOINTS, fetchWithAuth } from '@/react-app/config/api';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface FuncionarioQuickAction {
  id: string;
  titulo: string;
  descricao: string;
  icone: typeof Mail;
  variant: string;
  acao: () => void | Promise<void>;
  disabled?: boolean;
}

interface AbaAcoesRapidasProps {
  funcionario: {
    id: number | string;
    email?: string | null;
    telefone?: string | null;
    nome?: string | null;
  };
}

export default function AbaAcoesRapidas({ funcionario }: AbaAcoesRapidasProps) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [desativando, setDesativando] = useState(false);

  const abrirAba = (tab: 'documentos' | 'treinamentos') => {
    setSearchParams({ tab });
  };

  const desativarFuncionario = async () => {
    const confirmou = await confirmDialog(
      `Desativar ${funcionario.nome || 'este funcionário'}? O histórico será preservado.`,
    );
    if (!confirmou || desativando) return;

    setDesativando(true);
    try {
      const response = await fetchWithAuth(
        API_ENDPOINTS.FUNCIONARIO_BY_ID(Number(funcionario.id)),
        { method: 'DELETE' },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || 'Não foi possível desativar o funcionário');
      }

      toast.success(payload.message || 'Funcionário desativado com sucesso');
      navigate('/funcionarios', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao desativar funcionário');
    } finally {
      setDesativando(false);
    }
  };

  const acoes: FuncionarioQuickAction[] = [
    ...(funcionario.email
      ? [
          {
            id: 'email',
            titulo: 'Enviar E-mail',
            descricao: 'Enviar um e-mail para o funcionário',
            icone: Mail,
            variant: 'primary',
            acao: () => {
              window.location.href = `mailto:${funcionario.email}`;
            },
          },
        ]
      : []),
    ...(funcionario.telefone
      ? [
          {
            id: 'telefone',
            titulo: 'Ligar',
            descricao: 'Fazer uma chamada telefônica',
            icone: Phone,
            variant: 'success',
            acao: () => {
              window.location.href = `tel:${funcionario.telefone}`;
            },
          },
        ]
      : []),
    {
      id: 'documentos',
      titulo: 'Adicionar Documento',
      descricao: 'Abrir a área de documentos deste funcionário',
      icone: FileText,
      variant: 'info',
      acao: () => abrirAba('documentos'),
    },
    {
      id: 'treinamentos',
      titulo: 'Atribuir Treinamento',
      descricao: 'Abrir treinamentos e qualificações do funcionário',
      icone: Award,
      variant: 'warning',
      acao: () => abrirAba('treinamentos'),
    },
    {
      id: 'desativar',
      titulo: desativando ? 'Desativando...' : 'Desativar Funcionário',
      descricao: 'Revogar acesso preservando o histórico',
      icone: Trash2,
      variant: 'error',
      acao: desativarFuncionario,
      disabled: desativando,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {acoes.map((acao) => {
        const Icone = acao.icone;
        return (
          <button
            key={acao.id}
            type="button"
            onClick={() => void acao.acao()}
            disabled={acao.disabled}
            className={`card card-${acao.variant} rounded-lg p-6 hover:shadow-lg transition text-left group disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition">
              <Icone className="w-6 h-6 text-gray-600" aria-hidden="true" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-1">{acao.titulo}</h4>
            <p className="text-sm text-gray-600">{acao.descricao}</p>
          </button>
        );
      })}
    </div>
  );
}
