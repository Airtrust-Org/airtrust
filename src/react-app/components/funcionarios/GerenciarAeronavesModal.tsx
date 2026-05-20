import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Settings } from 'lucide-react';
import { BaseModal as Modal } from '../modals/BaseModal';
import Button from '../Button';
import Badge from '../Badge';
import { showAlertDialog } from '@/react-app/utils/confirmDialog';

interface Aeronave {
  id: number;
  codigo: string;
  nome: string;
  fabricante?: string;
  categoria?: string;
  ativo: boolean;
}

interface AeronaveHabilitada {
  codigo: string;
  status: string;
  data_habilitacao?: string;
  aeronave_nome?: string;
  fabricante?: string;
}

interface Funcionario {
  id: number;
  nome: string;
  matricula?: string;
}

interface GerenciarAeronavesModalProps {
  funcionario: Funcionario;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const GerenciarAeronavesModal: React.FC<GerenciarAeronavesModalProps> = ({
  funcionario,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [aeronaves, setAeronaves] = useState<AeronaveHabilitada[]>([]);
  const [todasAeronaves, setTodasAeronaves] = useState<Aeronave[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && funcionario) {
      carregarAeronaves();
    }
  }, [isOpen, funcionario]);

  const carregarAeronaves = async () => {
    setLoading(true);
    try {
      const respFunc = await fetch(`${API_BASE_URL}/funcionarios/${funcionario.id}/aeronaves`);
      const dataFunc = await respFunc.json();

      const respTodas = await fetch(`${API_BASE_URL}/aeronaves`);
      const dataTodas = await respTodas.json();

      if (dataFunc.success) {
        setAeronaves(dataFunc.data || []);
      }

      if (dataTodas.success) {
        setTodasAeronaves(dataTodas.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar aeronaves:', error);
      toast.warning('Erro ao carregar aeronaves. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const toggleAeronave = async (aeronave: Aeronave) => {
    setSubmitting(true);
    try {
      const jaHabilitado = aeronaves.some((a) => a.codigo === aeronave.codigo);

      let response;
      if (jaHabilitado) {
        response = await fetch(
          `${API_BASE_URL}/funcionarios/${funcionario.id}/aeronaves/${aeronave.codigo}`,
          {
            method: 'DELETE',
          },
        );
      } else {
        response = await fetch(`${API_BASE_URL}/funcionarios/${funcionario.id}/aeronaves`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aeronave_codigo: aeronave.codigo,
            status: 'ATIVO',
          }),
        });
      }

      if (response.ok) {
        await carregarAeronaves();
        onSuccess();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro na operação');
      }
    } catch (error) {
      console.error('Erro ao atualizar aeronaves:', error);
      showAlertDialog(
        `Erro ao ${
          aeronaves.some((a) => a.codigo === aeronave.codigo) ? 'remover' : 'adicionar'
        } aeronave: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`Equipamentos - ${funcionario?.nome}`}>
        <div className="p-6 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2 text-gray-600">Carregando...</span>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Equipamentos - ${funcionario?.nome}`}>
      <div className="p-6 space-y-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Settings className="w-4 h-4" />
          <span>
            Selecione os equipamentos que {funcionario?.nome} está habilitado(a) a operar:
          </span>
        </div>

        {todasAeronaves.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Nenhum equipamento cadastrado no sistema.</p>
            <p className="text-sm text-gray-400 mt-1">
              Cadastre equipamentos primeiro para poder habilitá-los aos funcionários.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {todasAeronaves
              .filter((aeronave) => aeronave.ativo)
              .map((aeronave) => {
                const habilitado = aeronaves.some((a) => a.codigo === aeronave.codigo);
                const aeronaveHabilitada = aeronaves.find((a) => a.codigo === aeronave.codigo);

                return (
                  <div
                    key={aeronave.codigo}
                    className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                      habilitado
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <div className="font-medium text-gray-900">{aeronave.codigo}</div>
                        {habilitado && <Badge variant="success">Habilitado</Badge>}
                      </div>
                      <div className="text-sm text-gray-600">{aeronave.nome}</div>
                      {aeronave.fabricante && (
                        <div className="text-xs text-gray-500">{aeronave.fabricante}</div>
                      )}
                      {aeronaveHabilitada?.data_habilitacao && (
                        <div className="text-xs text-gray-500 mt-1">
                          Habilitado em:{' '}
                          {new Date(
                            aeronaveHabilitada.data_habilitacao + 'T00:00:00',
                          ).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>

                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={habilitado}
                        onChange={() => toggleAeronave(aeronave)}
                        disabled={submitting}
                        className="rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        {habilitado ? 'Habilitado' : 'Não habilitado'}
                      </span>
                    </label>
                  </div>
                );
              })}
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-gray-500">
            {aeronaves.length} equipamento(s) habilitado(s)
          </div>
          <div className="flex space-x-3">
            <Button onClick={onClose} variant="ghost" disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={onClose} variant="primary" disabled={submitting}>
              Concluído
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default GerenciarAeronavesModal;
