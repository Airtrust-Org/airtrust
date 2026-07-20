import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  CheckCircle,
  XCircle,
  Clock,
  History,
  Save,
  AlertTriangle,
  FileText,
  Shield,
} from 'lucide-react';
import Button from '../Button';
import Card from '../Card';
import { BaseModal as Modal } from '../modals/BaseModal';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface ManobraAvaliacao {
  manobra_id: number;
  codigo: string;
  descricao: string;
  categoria: string;
  criterios_aprovacao?: string;
  pontuacao_minima: number;
  nota_anterior: string | null;
  data_nota_anterior: string | null;
  ficha_anterior_uuid: string | null;
  nota_ficha_atual: string | null;
  observacoes_atual: string | null;
}

interface DadosFicha {
  ficha_id: number;
  ficha_uuid: string;
  colaborador: {
    id: number;
    nome: string;
    matricula: string;
  };
  sessao: {
    nome: string;
    treinamento_codigo: string;
  };
  manobras: ManobraAvaliacao[];
  conceito_atual: 'APROVADO' | 'REPROVADO' | null;
  resultado_final: string | null;
  nota: number | null;
  pode_editar: boolean;
  status_workflow: string;
}

interface HistoricoFuncionario {
  nota: string;
  data_avaliacao: string;
  ficha_uuid: string;
  manobra_id_codigo: string;
  nome_manobra: string;
  nome_sessao: string;
  resultado_final: string;
}

interface AvaliacaoManobrasProps {
  fichaUuid: string;
  onClose?: () => void;
}

const AvaliacaoManobras: React.FC<AvaliacaoManobrasProps> = ({ fichaUuid, onClose }) => {
  const { user: currentUser } = useAuth();
  const [dados, setDados] = useState<DadosFicha | null>(null);
  const [notas, setNotas] = useState<Record<number, string>>({});
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});
  const [conceito, setConceito] = useState<'APROVADO' | 'REPROVADO' | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historicoFuncionario, setHistoricoFuncionario] = useState<HistoricoFuncionario[]>([]);

  useEffect(() => {
    carregarDadosFicha();
  }, [fichaUuid]);

  useEffect(() => {
    if (dados) {
      const notasIniciais: Record<number, string> = {};
      const observacoesIniciais: Record<number, string> = {};

      dados.manobras.forEach((manobra) => {
        notasIniciais[manobra.manobra_id] = manobra.nota_ficha_atual || '';
        observacoesIniciais[manobra.manobra_id] = manobra.observacoes_atual || '';
      });

      setNotas(notasIniciais);
      setObservacoes(observacoesIniciais);
      setConceito(dados.conceito_atual);
    }
  }, [dados]);

  const carregarDadosFicha = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/simulador/ficha/${fichaUuid}`);
      const data = await response.json();

      if (data.success) {
        setDados(data.data);
      } else {
        console.error('Erro ao carregar ficha:', data.error);
        showAlertDialog('Erro ao carregar dados da ficha: ' + data.error);
      }
    } catch (error) {
      console.error('Erro ao carregar ficha:', error);
      toast.warning('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const carregarHistoricoFuncionario = async (funcionarioId: number) => {
    try {
      const response = await fetch(
        `/api/simulador/funcionario/${funcionarioId}/historico-manobras`,
      );
      const data = await response.json();

      if (data.success) {
        setHistoricoFuncionario(data.data);
        setShowHistorico(true);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const handleNotaChange = (manobraId: number, valor: string) => {
    const novasNotas = { ...notas, [manobraId]: valor };
    setNotas(novasNotas);

    const notasPreenchidas = Object.entries(novasNotas)
      .filter(
        ([id, nota]) =>
          dados?.manobras.find((m) => String(m.manobra_id) === String(id)) && nota !== '',
      )
      .map(([_, nota]) => nota);

    const todasPreenchidas = notasPreenchidas.length === dados?.manobras.length;

    if (todasPreenchidas) {
      const notasNumericas = notasPreenchidas.filter((n) => n !== 'NR').map(Number);
      const temNotaBaixa = notasNumericas.some((nota) => nota < 5);
      setConceito(temNotaBaixa ? 'REPROVADO' : 'APROVADO');
    } else {
      setConceito(null);
    }
  };

  const handleObservacaoChange = (manobraId: number, valor: string) => {
    setObservacoes({ ...observacoes, [manobraId]: valor });
  };

  const salvarAvaliacao = async () => {
    if (!todasNotasPreenchidas()) {
      toast.warning('Todas as manobras devem ter nota definida');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        manobras: dados!.manobras.map((manobra) => ({
          manobra_id: manobra.manobra_id,
          nota: notas[manobra.manobra_id],
          observacoes: observacoes[manobra.manobra_id] || null,
        })),
      };

      const response = await apiFetch(`/api/simulador/ficha/${fichaUuid}/notas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        await carregarDadosFicha(); // Recarregar dados atualizados

        if (data.data.conceito === 'APROVADO') {
          enviarNotificacaoWorkflow();
        }
      } else {
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.warning('Erro ao conectar com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const assinarFicha = async () => {
    if (!await confirmDialog('Confirma a assinatura digital desta ficha? Esta ação não pode ser desfeita.')) {
      return;
    }

    setSaving(true);
    try {
      let tipoAssinatura = 'INSTRUTOR'; // Default

      if (dados?.status_workflow === 'PENDENTE_ALUNO') {
        tipoAssinatura = 'ALUNO';
      } else if (dados?.status_workflow === 'PENDENTE_CHECK') {
        tipoAssinatura = 'CHECADOR';
      }

      const payload = {
        tipo_assinatura: tipoAssinatura,
        certificado_digital: 'A1_CERTIFICADO_DIGITAL',
        dados_assinatura: {
          timestamp: new Date().toISOString(),
          ip_origem: 'unknown',
          user_agent: navigator.userAgent,
          hash_documento: `hash_${Date.now()}`,
        },
      };

      const response = await apiFetch(`/api/simulador/ficha/${fichaUuid}/assinar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        await carregarDadosFicha(); // Recarregar dados atualizados
        enviarNotificacaoWorkflow(); // Notificar próxima etapa
      } else {
        showAlertDialog('Erro ao realizar assinatura: ' + data.error);
      }
    } catch (error) {
      console.error('Erro ao assinar ficha:', error);
      toast.warning('Erro ao conectar com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const enviarNotificacaoWorkflow = async () => {
    try {
      await apiFetch(`/api/simulador/ficha/${fichaUuid}/notificar-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
    }
  };

  const todasNotasPreenchidas = () => {
    return dados?.manobras.every((manobra) => notas[manobra.manobra_id] !== '');
  };

  const getNotaColor = (nota: string) => {
    if (nota === 'NR') return 'text-gray-600';
    const notaNum = parseInt(nota);
    if (notaNum < 5) return 'text-red-600';
    if (notaNum < 7) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getConceitoColor = (conceito: string) => {
    return conceito === 'APROVADO' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600">Carregando dados da avaliação...</p>
        </div>
      </div>
    );
  }

  if (!dados || !dados.colaborador || !dados.sessao || !dados.manobras) {
    return (
      <div className="text-center py-8">
        <XCircle className="w-16 h-16 mx-auto text-red-400 mb-4" />
        <p className="text-gray-600 mb-2">Erro ao carregar dados da ficha</p>
        <p className="text-sm text-gray-500">
          {!dados
            ? 'Dados não encontrados'
            : !dados.colaborador
            ? 'Dados do colaborador ausentes'
            : !dados.sessao
            ? 'Dados da sessão ausentes'
            : 'Manobras não encontradas'}
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Fechar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Avaliação de Manobras</h1>
            <div className="mt-2 space-y-1">
              <p className="text-lg text-gray-800">
                <strong>{dados.colaborador.nome}</strong> ({dados.colaborador.matricula})
              </p>
              <p className="text-gray-600">
                {dados.sessao.nome} - {dados.sessao.treinamento_codigo}
              </p>
              <p className="text-sm text-gray-500">UUID: {dados.ficha_uuid}</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <Button
              variant="secondary"
              onClick={() => carregarHistoricoFuncionario(dados.colaborador.id)}
            >
              <History className="w-4 h-4 mr-2" />
              Ver Histórico Completo
            </Button>
            {onClose && (
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Status atual */}
      {dados.resultado_final && (
        <Card className="mb-6 p-4">
          <div className="flex items-center space-x-3">
            {dados.resultado_final === 'APROVADO' ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : (
              <XCircle className="w-6 h-6 text-red-600" />
            )}
            <div>
              <p className="font-semibold">Status Atual: {dados.resultado_final}</p>
              <p className="text-sm text-gray-600">
                Nota Final: {dados.nota} | Workflow: {dados.status_workflow}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de Manobras */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Manobras da Sessão</h2>

        {dados.manobras.map((manobra) => (
          <Card key={manobra.manobra_id} className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Informações da Manobra */}
              <div className="lg:col-span-1">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold">{manobra.codigo}</h3>
                    <p className="text-gray-800">{manobra.descricao}</p>
                    <span className="inline-block px-2 py-1 bg-primary/20 text-primary text-xs rounded mt-1">
                      {manobra.categoria}
                    </span>
                  </div>

                  {manobra.criterios_aprovacao && (
                    <div className="text-sm text-gray-600">
                      <strong>Critérios:</strong> {manobra.criterios_aprovacao}
                    </div>
                  )}

                  <div className="text-sm text-gray-600">
                    <strong>Pontuação Mínima:</strong> {manobra.pontuacao_minima}
                  </div>
                </div>
              </div>

              {/* Histórico */}
              <div className="lg:col-span-1">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-3 flex items-center">
                    <History className="w-4 h-4 mr-2" />
                    Histórico
                  </h4>

                  {manobra.nota_anterior ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">Nota Anterior:</span>
                        <span
                          className={`font-bold text-lg ${getNotaColor(manobra.nota_anterior)}`}
                        >
                          {manobra.nota_anterior}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(manobra.data_nota_anterior!).toLocaleDateString('pt-BR')}
                      </div>
                      {manobra.ficha_anterior_uuid && (
                        <div className="text-xs text-primary truncate">
                          {manobra.ficha_anterior_uuid}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      📝 Primeira avaliação desta manobra
                    </div>
                  )}
                </div>
              </div>

              {/* Avaliação Atual */}
              <div className="lg:col-span-1">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nova Nota:
                    </label>
                    <select
                      value={notas[manobra.manobra_id] || ''}
                      onChange={(e) => handleNotaChange(manobra.manobra_id, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold"
                      disabled={!dados.pode_editar}
                      required
                    >
                      <option value="">Selecione...</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <option key={num} value={num.toString()}>
                          {num} {num < 5 ? '❌' : num < 7 ? '⚠️' : '✅'}
                        </option>
                      ))}
                      <option value="NR">NR - Não Realizado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observações:
                    </label>
                    <textarea
                      value={observacoes[manobra.manobra_id] || ''}
                      onChange={(e) => handleObservacaoChange(manobra.manobra_id, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      rows={3}
                      disabled={!dados.pode_editar}
                      placeholder="Observações sobre a execução..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Conceito Preview */}
      {conceito && (
        <Card
          className={`mt-6 p-6 border-2 ${
            conceito === 'APROVADO' ? 'border-green-200' : 'border-red-200'
          }`}
        >
          <div className="text-center">
            <h3
              className={`text-2xl font-bold ${getConceitoColor(
                conceito,
              )} rounded-lg px-4 py-2 inline-block`}
            >
              Conceito: {conceito}
            </h3>
            {conceito === 'REPROVADO' && (
              <div className="mt-3 flex items-center justify-center space-x-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <p className="font-medium">
                  Reprovação detectada: pelo menos uma nota é menor que 5
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Botões de Ação */}
      <div className="mt-8 flex justify-center space-x-4">
        {dados.pode_editar && (
          <Button onClick={salvarAvaliacao} disabled={!todasNotasPreenchidas() || saving} size="lg">
            {saving ? (
              <>
                <Clock className="w-5 h-5 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Salvar Avaliação
              </>
            )}
          </Button>
        )}

        {/* Botões disponíveis após salvamento */}
        {dados.resultado_final && (
          <>
            <Button
              variant="secondary"
              onClick={async () => {
                apiFetch(`/api/simulador/ficha/${fichaUuid}/pdf`)
                  .then((response) => response.text())
                  .then((pdfHTML) => {
                    const newWindow = window.open();
                    if (newWindow) {
                      newWindow.document.write(pdfHTML);
                      newWindow.document.close();
                    }
                  })
                  .catch((error) => {
                    console.error('Erro ao gerar PDF:', error);
                    toast.warning('Erro ao gerar PDF');
                  });
              }}
            >
              <FileText className="w-4 h-4 mr-2" />
              Gerar PDF Oficial
            </Button>

            {/* Botão de Assinatura baseado no status */}
            {/* O aluno só pode assinar se for o próprio tripulante avaliado */}
            {dados.status_workflow === 'PENDENTE_ALUNO' &&
              currentUser?.funcionario_id != null &&
              Number(currentUser.funcionario_id) === Number(dados.colaborador.id) && (
              <Button
                onClick={assinarFicha}
                className="bg-primary hover:bg-primary/90"
                disabled={saving}
              >
                <Shield className="w-4 h-4 mr-2" />
                Assinar como Aluno
              </Button>
            )}

            {/* Instrutor vê o status mas não o botão de assinatura do aluno */}
            {dados.status_workflow === 'PENDENTE_ALUNO' &&
              (currentUser?.funcionario_id == null ||
                Number(currentUser.funcionario_id) !== Number(dados.colaborador.id)) && (
              <span className="inline-flex items-center px-4 py-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                Aguardando assinatura do aluno
              </span>
            )}

            {dados.status_workflow === 'PENDENTE_INSTRUTOR_FINAL' && (
              <Button
                onClick={assinarFicha}
                className="bg-green-600 hover:bg-green-700"
                disabled={saving}
              >
                <Shield className="w-4 h-4 mr-2" />
                Assinar como Instrutor
              </Button>
            )}

            {dados.status_workflow === 'PENDENTE_CHECK' && (
              <Button
                onClick={assinarFicha}
                className="bg-purple-600 hover:bg-purple-700"
                disabled={saving}
              >
                <Shield className="w-4 h-4 mr-2" />
                Assinar como Checador
              </Button>
            )}
          </>
        )}
      </div>

      {/* Modal de Histórico Completo */}
      <Modal
        isOpen={showHistorico}
        onClose={() => setShowHistorico(false)}
        title={`Histórico Completo - ${dados.colaborador.nome}`}
      >
        <div className="max-h-96 overflow-y-auto">
          {historicoFuncionario.length > 0 ? (
            <div className="space-y-4">
              {historicoFuncionario.map((item, index) => (
                <div key={index} className="border-b pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {item.manobra_id_codigo} - {item.nome_manobra}
                      </p>
                      <p className="text-sm text-gray-600">{item.nome_sessao}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(item.data_avaliacao + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xl font-bold ${getNotaColor(item.nota)}`}>
                        {item.nota}
                      </span>
                      <p className="text-xs text-gray-500">{item.resultado_final}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Nenhum histórico encontrado</p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AvaliacaoManobras;
