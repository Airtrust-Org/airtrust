import { Mail, Phone, FileText, Edit, Trash2, Award } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';


export default function AbaAcoesRapidas({ funcionario }: any) {
  const acoes = [
    {
      titulo: 'Enviar E-mail',
      descricao: 'Enviar um e-mail para o funcionário',
      icone: Mail,
      variant: 'primary',
      acao: () => (window.location.href = `mailto:${funcionario.email}`),
    },
    {
      titulo: 'Ligar',
      descricao: 'Fazer uma chamada telefônica',
      icone: Phone,
      variant: 'success',
      acao: () => (window.location.href = `tel:${funcionario.telefone}`),
    },
    {
      titulo: 'Adicionar Documento',
      descricao: 'Anexar um novo documento',
      icone: FileText,
      variant: 'info',
      acao: () => toast.warning('Ir para aba Documentos'),
    },
    {
      titulo: 'Atribuir Treinamento',
      descricao: 'Registrar um novo treinamento',
      icone: Award,
      variant: 'warning',
      acao: () => toast.warning('Abrir modal de treinamento'),
    },
    {
      titulo: 'Editar Dados',
      descricao: 'Alterar informações pessoais',
      icone: Edit,
      variant: 'neutral',
      acao: () => toast.warning('Abrir modal de edição'),
    },
    {
      titulo: 'Desativar Funcionário',
      descricao: 'Remover acesso do sistema',
      icone: Trash2,
      variant: 'error',
      acao: async () => await confirmDialog('Tem certeza?') && toast.warning('Desativado'),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {acoes.map((acao, index) => {
        const Icone = acao.icone;
        return (
          <button
            key={index}
            onClick={acao.acao}
            className={`card card-${acao.variant} rounded-lg p-6 hover:shadow-lg transition text-left group`}
          >
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition">
              <Icone className="w-6 h-6 text-gray-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-1">{acao.titulo}</h4>
            <p className="text-sm text-gray-600">{acao.descricao}</p>
          </button>
        );
      })}
    </div>
  );
}
