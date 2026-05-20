import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Download, Edit, FileText } from 'lucide-react';
import { Badge } from '../../components/SimuladoresLayout';
import { API_BASE_URL } from '@/react-app/config/api';

export default function DetalhesSessao() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarSessao();
  }, [id]);

  const carregarSessao = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${id}`);
      const data = await response.json();
      if (data.success) {
        setSessao(data.sessao);
      }
    } catch (error) {
      console.error('Erro ao carregar sessão:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      agendada: 'bg-primary/20 text-primary',
      em_progresso: 'bg-yellow-100 text-yellow-800',
      concluida: 'bg-green-100 text-green-800',
      cancelada: 'bg-red-100 text-red-800',
    };
    return badges[status as keyof typeof badges] || badges.agendada;
  };

  const getResultadoBadge = (resultado: string) => {
    if (resultado === 'aprovado') {
      return 'bg-green-100 text-green-800 border-green-300';
    }
    if (resultado === 'reprovado') {
      return 'bg-red-100 text-red-800 border-red-300';
    }
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!sessao) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Sessão não encontrada</p>
          <button
            onClick={() => navigate('/simuladores')}
            className=" py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const getStatusVariant = (
    status: string,
  ): 'success' | 'warning' | 'error' | 'info' | 'neutral' => {
    if (status === 'concluida') return 'success';
    if (status === 'em_progresso') return 'warning';
    if (status === 'cancelada') return 'error';
    return 'info';
  };

  return (
    <AppLayout>
      <PageHeader className="mb-6" title="Detalhes da Sessão" subtitle={`ID: ${sessao.id}`} />
      <div className="space-y-4">
        <div className="space-y-4">
          {/* Header com status */}
          <div className="flex items-center justify-between">
            <Badge variant={getStatusVariant(sessao.status)} size="md">
              {sessao.status}
            </Badge>
            {sessao.resultado_final && (
              <span
                className={`px-3 py-1 text-sm font-medium rounded-lg border-2 ${getResultadoBadge(
                  sessao.resultado_final,
                )}`}
              >
                {sessao.resultado_final.toUpperCase()}
              </span>
            )}
          </div>

          {/* Informações Principais */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
              Informações da Sessão
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Simulador</label>
                <p className="text-lg font-semibold text-gray-900">{sessao.simulador_nome}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Data e Horário
                </label>
                <p className="text-lg font-semibold text-gray-900">
                  {new Date(sessao.data).toLocaleDateString('pt-BR')} • {sessao.hora_inicio} -{' '}
                  {sessao.hora_fim}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Instrutor</label>
                <p className="text-lg font-semibold text-gray-900">
                  {sessao.instrutor.nome}
                  <span className="text-sm text-gray-500 ml-2">({sessao.instrutor.matricula})</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Equipamento Simulado
                </label>
                <p className="text-lg font-semibold text-gray-900">
                  {sessao.aeronave_simulada || '-'}
                </p>
              </div>
            </div>

            {sessao.objetivos && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-600 mb-1">Objetivos</label>
                <p className="text-gray-900">{sessao.objetivos}</p>
              </div>
            )}
          </div>

          {/* Alunos */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Alunos</h2>

            {sessao.alunos && sessao.alunos.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessao.alunos.map((aluno: any) => (
                  <div key={aluno.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                      <span className="text-primary font-semibold">{aluno.nome.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{aluno.nome}</p>
                      <p className="text-sm text-gray-600">Matrícula: {aluno.matricula}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Nenhum aluno cadastrado</p>
            )}
          </div>

          {/* Manobras */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Manobras</h2>

            {/* Planejadas */}
            {sessao.manobras_planejadas && sessao.manobras_planejadas.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Planejadas</h3>
                <div className="space-y-2">
                  {sessao.manobras_planejadas.map((man: any) => (
                    <div
                      key={man.manobra_id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{man.manobra_nome}</p>
                        <p className="text-sm text-gray-600">
                          {man.codigo} • {man.categoria}
                        </p>
                      </div>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-700">
                        Pendente
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Executadas */}
            {sessao.manobras_executadas && sessao.manobras_executadas.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Executadas</h3>
                <div className="space-y-2">
                  {sessao.manobras_executadas.map((man: any) => (
                    <div key={man.manobra_id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900">{man.manobra_nome}</p>
                          <p className="text-sm text-gray-600">
                            {man.codigo} • {man.categoria}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            man.avaliacao === 'satisfatorio'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {man.avaliacao}
                        </span>
                      </div>
                      {man.observacoes && (
                        <p className="text-sm text-gray-600 mt-2">{man.observacoes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!sessao.manobras_planejadas || sessao.manobras_planejadas.length === 0) &&
              (!sessao.manobras_executadas || sessao.manobras_executadas.length === 0) && (
                <p className="text-gray-500">Nenhuma manobra registrada</p>
              )}
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-3">
            {sessao.status === 'agendada' && (
              <>
                <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors">
                  <Edit className="w-4 h-4" />
                  Editar Sessão
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">
                  <XCircle className="w-4 h-4" />
                  Cancelar
                </button>
              </>
            )}

            {sessao.status === 'em_progresso' && (
              <>
                <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors">
                  <CheckCircle className="w-4 h-4" />
                  Aprovar Sessão
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">
                  <XCircle className="w-4 h-4" />
                  Reprovar
                </button>
              </>
            )}

            {sessao.status === 'concluida' && (
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors">
                <Download className="w-4 h-4" />
                Baixar Ficha PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
