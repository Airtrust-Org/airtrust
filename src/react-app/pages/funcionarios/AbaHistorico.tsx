import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { User, FileText, Award, CheckCircle } from 'lucide-react';

export default function AbaHistorico({ funcionarioId }: any) {
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarHistorico();
  }, [funcionarioId]);

  const carregarHistorico = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/funcionarios/${funcionarioId}/historico`, {
        cache: 'no-cache',
      });
      if (response.ok) {
        const data = await response.json();
        setEventos(data.data || data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  const obterIcone = (tipo: string) => {
    switch (tipo) {
      case 'cadastro':
        return User;
      case 'documento':
        return FileText;
      case 'certificacao':
        return Award;
      default:
        return CheckCircle;
    }
  };

  const obterCor = (tipo: string) => {
    switch (tipo) {
      case 'cadastro':
        return 'bg-primary/100';
      case 'documento':
        return 'bg-purple-500';
      case 'certificacao':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Carregando histórico...</div>;
  }

  if (eventos.length === 0) {
    return <div className="text-center py-8 text-gray-600">Nenhum evento registrado</div>;
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-6">📜 Timeline de Eventos</h3>

      <div className="relative">
        {/* Linha vertical */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        {/* Eventos */}
        <div className="space-y-6">
          {eventos.map((evento, index) => {
            const Icone = obterIcone(evento.tipo);
            const cor = obterCor(evento.tipo);

            return (
              <div key={index} className="relative flex gap-4">
                {/* Ícone */}
                <div
                  className={`relative z-10 flex-shrink-0 w-12 h-12 ${cor} rounded-full flex items-center justify-center`}
                >
                  <Icone className="w-6 h-6 text-white" />
                </div>

                {/* Conteúdo */}
                <div className="flex-1 bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{evento.titulo}</p>
                      <p className="text-sm text-gray-600 mt-1">{evento.descricao}</p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(evento.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
