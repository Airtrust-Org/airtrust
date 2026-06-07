/**
 * CONFIGURAÇÕES / CADASTROS
 *
 * Exibe cards para acessar os cadastros:
 * - Simuladores
 * - Manobras
 * - Categorias
 * - Tipos de Sessão
 * - Templates
 *
 * NOTA: Modelos de Aeronave estão no cadastro principal de aeronaves
 * NOTA: Instrutores são funcionários com flag is_instrutor=true
 */

import { useState, useEffect } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { StatCard} from '../../components/SimuladoresLayout';
import { Settings, Plane, FileText, List, Briefcase, Award } from 'lucide-react';

interface Props {
  onNavigate?: (view: string) => void;
}

export default function ConfiguracoesCadastros({ onNavigate }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [stats, setStats] = useState({
    simuladores: 0,
    manobras: 0,
    categorias: 0,
    tipos: 0,
    templates: 0,
  });

  useEffect(() => {
    carregarEstatisticas();
  }, []);

  const carregarEstatisticas = async () => {
    try {
      setErro(null);
      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      // Carregar contadores de todos os cadastros em paralelo
      const [resSimuladores, resManobras, resCategorias, resTipos, resTemplates] =
        await Promise.all([
          fetch(`${API_BASE_URL}/simuladores`, { headers }),
          fetch(`${API_BASE_URL}/simuladores/manobras`, { headers }),
          fetch(`${API_BASE_URL}/simuladores/categorias`, { headers }),
          fetch(`${API_BASE_URL}/simuladores/tipos-sessao`, { headers }),
          fetch(`${API_BASE_URL}/simuladores/modelos-sessao`, { headers }),
        ]);

      if (resSimuladores.ok) {
        const data = await resSimuladores.json();
        if (data.success) {
          setStats((prev) => ({ ...prev, simuladores: data.data?.length || 0 }));
        }
      }

      if (resManobras.ok) {
        const data = await resManobras.json();
        if (data.success) {
          setStats((prev) => ({ ...prev, manobras: data.data?.length || 0 }));
        }
      }

      if (resCategorias.ok) {
        const data = await resCategorias.json();
        if (data.success) {
          setStats((prev) => ({ ...prev, categorias: data.data?.length || 0 }));
        }
      }

      if (resTipos.ok) {
        const data = await resTipos.json();
        if (data.success) {
          setStats((prev) => ({ ...prev, tipos: data.data?.length || 0 }));
        }
      }

      if (resTemplates.ok) {
        const data = await resTemplates.json();
        if (data.success) {
          setStats((prev) => ({ ...prev, templates: data.data?.length || 0 }));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
      setErro('Nao foi possivel carregar os contadores de cadastros.');
    }
  };

  const cadastros = [
    {
      titulo: 'Simuladores',
      descricao: 'Cadastre e gerencie os simuladores de voo disponíveis',
      icon: <Plane className="w-6 h-6" />,
      count: stats.simuladores,
      view: 'simuladores',
      variant: 'primary' as const,
    },
    {
      titulo: 'Manobras',
      descricao: 'Configure as manobras e exercícios a serem avaliados',
      icon: <List className="w-6 h-6" />,
      count: stats.manobras,
      view: 'manobras',
      variant: 'info' as const,
    },
    {
      titulo: 'Categorias',
      descricao: 'Organize as categorias de manobras e avaliação',
      icon: <Briefcase className="w-6 h-6" />,
      count: stats.categorias,
      view: 'categorias',
      variant: 'success' as const,
    },
    {
      titulo: 'Tipos de Sessão',
      descricao: 'Gerencie os tipos de sessão (LPC, OPC, LOFT, etc.)',
      icon: <FileText className="w-6 h-6" />,
      count: stats.tipos,
      view: 'tipos',
      variant: 'warning' as const,
    },
    {
      titulo: 'Templates',
      descricao: 'Configure templates de documentos e relatórios',
      icon: <Award className="w-6 h-6" />,
      count: stats.templates,
      view: 'templates',
      variant: 'primary' as const,
    },
  ];

  return (
    <div className="space-y-4">
      {erro && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{erro}</p>
              <p className="mt-1">Falha de API nao representa zero real nesta tela.</p>
            </div>
            <button
              onClick={() => {
                void carregarEstatisticas();
              }}
              className="shrink-0 rounded-md bg-amber-100 px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-200"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cadastros.map((cadastro) => (
          <StatCard
            key={cadastro.titulo}
            title={cadastro.titulo}
            value={cadastro.count}
            icon={cadastro.icon}
            variant={cadastro.variant}
            onClick={() => onNavigate?.(cadastro.view)}
          />
        ))}
      </div>
    </div>
  );
}
