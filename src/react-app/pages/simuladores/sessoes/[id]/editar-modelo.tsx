import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { SimuladoresCard} from '../../components/SimuladoresLayout';
import ReordenarManobras from '../../components/modelos/ReordenarManobras';

interface Modelo {
  id: number;
  codigo: string;
  codigo_canonico?: string | null;
  nome: string;
  descricao: string;
  duracao_estimada: number;
  tipo_sessao_nome?: string;
  tipo_sessao_codigo?: string;
}

export default function EditarModeloSessao() {
  const { id } = useParams<{ id: string }>();
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      carregarModelo();
    }
  }, [id]);

  const carregarModelo = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${id}`);
      const data = await res.json();

      if (data.success) {
        setModelo(data.data);
      } else {
        setError(data.error || 'Erro ao carregar modelo');
      }
    } catch (err) {
      setError('Erro ao carregar modelo');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (error || (!modelo && !loading)) {
    return (
      <AppLayout>
      <PageHeader className="mb-6" title="Erro ao Carregar Modelo" subtitle="Não foi possível carregar o modelo de sessão" />
      <div className="space-y-4">
        <SimuladoresCard padding="lg">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Erro ao carregar modelo</h2>
            <p className="text-red-700">{error}</p>
          </div>
        </SimuladoresCard>
            </div>
    </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Informações do Modelo */}
        <SimuladoresCard padding="lg">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações do Modelo</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Código</label>
              <p className="mt-1 text-gray-900">{modelo?.codigo_canonico || modelo?.codigo}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Tipo</label>
              <p className="mt-1 text-gray-900">
                {modelo.tipo_sessao_nome || modelo.tipo_sessao_codigo || 'N/A'}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Duração</label>
              <p className="mt-1 text-gray-900">{modelo.duracao_estimada} minutos</p>
            </div>
          </div>

          {modelo.descricao && (
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">Descrição</label>
              <p className="mt-1 text-gray-600">{modelo.descricao}</p>
            </div>
          )}
        </SimuladoresCard>

        {/* Componente de Reordenamento */}
        <SimuladoresCard padding="none">
          <ReordenarManobras
            modeloId={Number(id)}
            modeloNome={modelo ? `${modelo.codigo_canonico || modelo.codigo} - ${modelo.nome}` : ''}
          />
        </SimuladoresCard>
      </div>
    </AppLayout>
  );
}
