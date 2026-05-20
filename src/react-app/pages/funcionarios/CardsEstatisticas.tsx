import { Users, UserPlus, Calendar, TrendingUp } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';
import { useEffect, useState } from 'react';

export default function CardsEstatisticas() {
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregarStats = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/funcionarios/stats`);
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
      } finally {
        setLoading(false);
      }
    };

    carregarStats();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 bg-gray-200 h-32 rounded-lg"></div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      titulo: 'Total de Funcionários',
      valor: stats.totalAtivos || 0,
      icone: Users,
      variant: 'primary',
    },
    {
      titulo: 'Novos (30 dias)',
      valor: stats.novosFuncionarios || 0,
      icone: UserPlus,
      variant: 'success',
    },
    {
      titulo: 'Média de Idade',
      valor: `${stats.mediaIdade || 0} anos`,
      icone: Calendar,
      variant: 'info',
    },
    {
      titulo: 'Taxa de Crescimento',
      valor: '+5.2%',
      icone: TrendingUp,
      variant: 'warning',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <div key={index} className={`card card-${card.variant} rounded-lg p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{card.titulo}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{card.valor}</p>
            </div>
            <div className="p-3 rounded-full bg-gray-100">
              <card.icone className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
