import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import Button from '../Button';

interface FuncionarioFormData {
  nome: string;
  matricula: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  funcao: string;
  status: string;
  codigo_anac?: string;
  base?: string;
  contrato?: string;
  is_instrutor?: boolean;
  is_checador?: boolean;
}

interface Funcionario {
  id?: number;
  nome: string;
  matricula: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  funcao: string;
  status: string;
  codigo_anac?: string;
  base?: string;
  contrato?: string;
  is_instrutor?: boolean | number;
  is_checador?: boolean | number;
}

interface FuncionarioFormProps {
  funcionario?: Funcionario;
  onSubmit: (data: FuncionarioFormData) => void;
  onCancel: () => void;
}

const FuncionarioForm: React.FC<FuncionarioFormProps> = ({ funcionario, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<FuncionarioFormData>({
    nome: funcionario?.nome || '',
    matricula: funcionario?.matricula || '',
    cpf: funcionario?.cpf || '',
    email: funcionario?.email || '',
    telefone: funcionario?.telefone || '',
    cargo: funcionario?.cargo || '',
    status: funcionario?.status || 'ATIVO',
    codigo_anac: funcionario?.codigo_anac || '',
    base: funcionario?.base || '',
    contrato: funcionario?.contrato || '',
    is_instrutor: funcionario?.is_instrutor === 1 || funcionario?.is_instrutor === true || false,
    is_checador: funcionario?.is_checador === 1 || funcionario?.is_checador === true || false,
  });

  const [funcoes, setFuncoes] = useState<{ nome: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarFuncoes();
  }, []);

  const carregarFuncoes = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/funcoes`);
      const data = await response.json();
      if (data.success) {
        setFuncoes(data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar funções:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (name === 'matricula') {
      const numeros = value.replace(/\D/g, '');
      const matriculaLimitada = numeros.slice(0, 5);
      setFormData((prev) => ({
        ...prev,
        [name]: matriculaLimitada,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome.trim() || !formData.matricula.trim() || !formData.cargo.trim()) {
      toast.warning('Por favor, preencha os campos obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Erro ao salvar funcionário:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nome - CAMPO OBRIGATÓRIO */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nome Completo *</label>
            <input
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: Nome do Funcionário"
            />
          </div>

          {/* Matrícula */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Matrícula *</label>
            <input
              type="text"
              name="matricula"
              value={formData.matricula}
              onChange={handleInputChange}
              placeholder="Ex: 123 (será formatado como 00123)"
              maxLength={5}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Apenas números, máximo 5 dígitos. Será preenchido com zeros à esquerda.
            </p>
          </div>

          {/* CPF */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">CPF</label>
            <input
              type="text"
              name="cpf"
              value={formData.cpf}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="000.000.000-00"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="funcionario@empresa.com"
            />
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
            <input
              type="tel"
              name="telefone"
              value={formData.telefone}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="(11) 99999-9999"
            />
          </div>

          {/* Função */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Função *</label>
            <select
              name="funcao"
              value={formData.cargo}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Selecione uma função</option>
              {funcoes.map((funcao) => (
                <option key={funcao.nome} value={funcao.nome}>
                  {funcao.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Base */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Base</label>
            <input
              type="text"
              name="base"
              value={formData.base}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: Rio de Janeiro"
            />
          </div>

          {/* Contrato */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Contrato</label>
            <input
              type="text"
              name="contrato"
              value={formData.contrato}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: CLT"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </select>
          </div>
        </div>

        {/* Qualificações Especiais */}
        <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">✈️ Qualificações Especiais</h3>
          <div className="space-y-3">
            {/* Checkbox Instrutor */}
            <div className="flex items-start">
              <input
                type="checkbox"
                id="is_instrutor"
                name="is_instrutor"
                checked={formData.is_instrutor || false}
                onChange={handleInputChange}
                className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <label htmlFor="is_instrutor" className="ml-3 text-sm">
                <span className="font-medium text-gray-900">É Instrutor</span>
                <p className="text-xs text-gray-500 mt-1">
                  Marcando esta opção, o funcionário aparecerá na lista de instrutores ao agendar
                  sessões de simulador
                </p>
              </label>
            </div>

            {/* Checkbox Checador/Examinador */}
            <div className="flex items-start">
              <input
                type="checkbox"
                id="is_checador"
                name="is_checador"
                checked={formData.is_checador || false}
                onChange={handleInputChange}
                className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <label htmlFor="is_checador" className="ml-3 text-sm">
                <span className="font-medium text-gray-900">É Checador/Examinador</span>
                <p className="text-xs text-gray-500 mt-1">
                  Marcando esta opção, o funcionário aparecerá na lista de examinadores ao agendar
                  sessões de simulador
                </p>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Salvando...' : funcionario ? 'Atualizar' : 'Criar'}
        </Button>
      </div>
    </form>
  );
};

export default FuncionarioForm;
