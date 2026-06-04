import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { FolderOpen, Award, GraduationCap, Search } from 'lucide-react';
import Button from '@/react-app/components/Button';
import { buildPasta360Url } from '@/react-app/utils/pasta360';

export interface FuncionarioBasico {
  id: number;
  nome: string;
  matricula?: string | null;
  funcao?: string | null;
  status?: string | null;
  aeronave_principal?: string | null;
}

interface TabelaFuncionariosProps {
  funcionarios: FuncionarioBasico[];
  loading?: boolean;
  onSearchChange?: (value: string) => void;
}

export default function TabelaFuncionarios({
  funcionarios,
  loading,
  onSearchChange,
}: TabelaFuncionariosProps) {
  const navigate = useNavigate();

  const rows = useMemo(() => (Array.isArray(funcionarios) ? funcionarios : []), [funcionarios]);

  const openPasta360 = (funcionarioId: number | string | null | undefined) => {
    const pasta360Url = buildPasta360Url(funcionarioId, {
      tab: 'pasta',
      origem: 'tabela-funcionarios',
    });
    if (!pasta360Url) return;
    navigate(pasta360Url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar funcionário..."
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="pl-9 pr-3 py-2 w-full rounded-md border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary text-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-sm text-gray-600">
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Matrícula</th>
              <th className="px-4 py-3 font-medium">Função</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum funcionário encontrado.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((f) => (
                <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <button
                      type="button"
                      onClick={() => navigate(`/funcionarios/${f.id}/ficha`)}
                      className="flex items-center gap-2 text-left transition hover:text-primary"
                    >
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-semibold">
                        {f.nome
                          .split(' ')
                          .map((p) => p[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <span>{f.nome}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{f.matricula || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{f.funcao || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {f.status === 'ATIVO' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        ATIVO
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        INATIVO
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openPasta360(f.id)}
                        className="flex items-center gap-1"
                      >
                        <FolderOpen className="h-4 w-4" /> Pasta 360
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/qualificacoes?funcionario=${f.id}`)}
                        className="flex items-center gap-1"
                      >
                        <Award className="h-4 w-4" /> Licenças
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/treinamentos?funcionario=${f.id}`)}
                        className="flex items-center gap-1"
                      >
                        <GraduationCap className="h-4 w-4" /> Treinamentos
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
