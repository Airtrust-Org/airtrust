import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { X, Calendar, User, Tag, FileText } from 'lucide-react';
// API_BASE_URL removido - agora usamos services centralizados
import {
  criarHistoricoQualificacao,
  atualizarHistoricoQualificacao,
  type TipoQualificacaoResumo,
} from '@/react-app/services/qualificacoesService';
import { useFuncionariosAtivos } from '@/react-app/hooks/qualificacoes/useFuncionariosAtivos';
import { useTiposQualificacao } from '@/react-app/hooks/qualificacoes/useTiposQualificacao';
import { useCategoriasQualificacao } from '@/react-app/hooks/qualificacoes/useCategoriasQualificacao';
import { HistoricoQualificacaoInput } from '@/react-app/schemas/qualificacoes';
import { dateToHTMLFormat } from '@/react-app/utils/dateUtils';
import { showAlertDialog } from '@/react-app/utils/confirmDialog';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Registro existente para edição */
  habilitacao?: {
    id: number;
    funcionario_id: number;
    funcionario_matricula?: string;
    qualificacao_id: number;
    qualificacao_codigo?: string;
    qualificacao_nome?: string;
    data_conclusao?: string;
    data_vencimento?: string;
    numero_certificado?: string;
    instrutor?: string;
    observacoes?: string;
    tipo_treinamento?: string;
  };
  /** Pré-seleciona funcionário no modo criação (ignorado em edição) */
  defaultFuncionarioId?: number | string;
}

interface Funcionario {
  id: number;
  nome: string;
  matricula?: string;
  cpf?: string;
  is_instrutor?: number | boolean;
}

function normalizeTipoTreinamentoForm(
  value?: string | null,
): 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (normalized === 'SEMESTRAL') return 'SEMESTRAL';
  if (normalized === 'INICIAL') return 'INICIAL';
  return 'RECORRENTE';
}

function normalizeCodigo(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function isG1Qualificacao(codigo?: string | null): boolean {
  return normalizeCodigo(codigo) === 'G1';
}

function isG1SemQualificacao(codigo?: string | null): boolean {
  return normalizeCodigo(codigo) === 'G1-SEM';
}

/**
 * ✅ MODAL: ATRIBUIR QUALIFICAÇÃO A FUNCIONÁRIO (v4.0 CORRIGIDO)
 *
 * Fluxo cascata correto:
 * 1. Funcionário (select) - obrigatório
 * 2. Categoria (select) - obrigatório
 * 3. Modelo (select filtrado por categoria) - obrigatório
 * 4. Data de Realização (input date) - obrigatório
 * 5. Data de Vencimento (auto-calculada) - readonly
 * 6. Certificado (somente gestão – sem campo de número)
 * 7. Observações (textarea) - opcional
 */
export function ModalAtribuirQualificacao({
  isOpen,
  onClose,
  onSuccess,
  habilitacao,
  defaultFuncionarioId,
}: Props) {
  const isEditMode = habilitacao?.id != null;

  const [form, setForm] = useState({
    funcionario_id: '',
    categoria: '',
    qualificacao_codigo: '', // Mudado de qualificacao_id para qualificacao_codigo
    tipo_treinamento: 'INICIAL' as 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL',
    data_realizacao: '',
    data_vencimento: '',
    instrutor_id: '', // SECURITY: Use ID instead of name to prevent dangling FK
    observacoes: '',
  });

  const {
    data: funcionariosData = [],
    isLoading: loadingFuncionarios,
    error: errorFuncionarios,
  } = useFuncionariosAtivos();
  const { data: tiposData = [], isLoading: loadingTipos } = useTiposQualificacao();
  const {
    data: categoriasData = [],
    isLoading: loadingCategorias,
    error: errorCategorias,
  } = useCategoriasQualificacao();
  const [validadeMeses, setValidadeMeses] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const loading = loadingTipos || loadingFuncionarios || loadingCategorias;
  const todosTipos = useMemo(() => tiposData as TipoQualificacaoResumo[], [tiposData]);
  const categorias = useMemo(
    () => [...categoriasData].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')),
    [categoriasData],
  );
  const tiposFiltrados = useMemo(
    () =>
      form.categoria
        ? todosTipos.filter((tipo) => Number(tipo.categoria_id) === Number(form.categoria))
        : [],
    [form.categoria, todosTipos],
  );
  const instrutoresCadastrados = useMemo(
    () =>
      [...funcionariosData]
        .filter((funcionario) => Boolean(funcionario.is_instrutor))
        .sort((a: Funcionario, b: Funcionario) =>
          String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
        ),
    [funcionariosData],
  );
  const selectedTipo = todosTipos.find((tipo) => tipo.codigo === form.qualificacao_codigo) || null;
  const isLegacyEditing = Boolean(isEditMode && selectedTipo && !selectedTipo.categoria_id);
  const isG1Selected = isG1Qualificacao(form.qualificacao_codigo);
  const isG1SemSelected = isG1SemQualificacao(form.qualificacao_codigo);
  const isSemestralModeloSelected = Number(selectedTipo?.validade || 0) === 6;

  // Reagir à abertura do modal para preparar estado inicial
  useEffect(() => {
    if (!isOpen) return;
    if (habilitacao) {
      const instrutorIdMatch = instrutoresCadastrados.find((instrutor) => {
        const target = String(habilitacao.instrutor || '')
          .trim()
          .toLowerCase();
        if (!target) return false;
        const nome = String(instrutor.nome || '')
          .trim()
          .toLowerCase();
        const matricula = String(instrutor.matricula || '')
          .trim()
          .toLowerCase();
        return target === nome || (matricula && target === matricula);
      });

      setForm({
        funcionario_id: String(habilitacao.funcionario_id || ''),
        categoria: '',
        qualificacao_codigo: String(habilitacao.qualificacao_codigo || ''),
        tipo_treinamento: normalizeTipoTreinamentoForm(habilitacao.tipo_treinamento),
        data_realizacao: habilitacao.data_conclusao || '',
        data_vencimento: habilitacao.data_vencimento || '',
        instrutor_id: instrutorIdMatch ? String(instrutorIdMatch.id) : '',
        observacoes: habilitacao.observacoes || '',
      });
      return;
    }

    setForm({
      funcionario_id: defaultFuncionarioId ? String(defaultFuncionarioId) : '',
      categoria: '',
      qualificacao_codigo: '',
      tipo_treinamento: 'INICIAL',
      data_realizacao: '',
      data_vencimento: '',
      instrutor_id: '',
      observacoes: '',
    });
  }, [
    isOpen,
    defaultFuncionarioId,
    instrutoresCadastrados,
    habilitacao?.id,
    habilitacao?.funcionario_id,
    habilitacao?.qualificacao_codigo,
    habilitacao?.data_conclusao,
    habilitacao?.data_vencimento,
    habilitacao?.instrutor,
    habilitacao?.observacoes,
    habilitacao?.tipo_treinamento,
  ]);

  useEffect(() => {
    if (!habilitacao?.qualificacao_codigo || todosTipos.length === 0) {
      return;
    }

    const tipo = todosTipos.find((item) => item.codigo === habilitacao.qualificacao_codigo);
    const categoriaId = tipo?.categoria_id ? String(tipo.categoria_id) : '';
    if (!categoriaId || form.categoria === categoriaId) {
      return;
    }

    setForm((prev) =>
      prev.categoria === categoriaId ? prev : { ...prev, categoria: categoriaId },
    );
  }, [habilitacao?.qualificacao_codigo, todosTipos, form.categoria]);

  useEffect(() => {
    if (!form.categoria && form.qualificacao_codigo && todosTipos.length > 0) {
      const tipoSelecionado = todosTipos.find((tipo) => tipo.codigo === form.qualificacao_codigo);
      if (tipoSelecionado?.categoria_id) {
        setForm((prev) => ({ ...prev, categoria: String(tipoSelecionado.categoria_id) }));
      }
    }
  }, [form.categoria, form.qualificacao_codigo, todosTipos]);

  // Funções de carregamento antigas removidas - agora usamos React Query hooks.

  useEffect(() => {
    if (!form.categoria || !form.qualificacao_codigo) {
      return;
    }

    const codigoAindaValido = tiposFiltrados.some(
      (tipo) => tipo.codigo === form.qualificacao_codigo,
    );

    if (!codigoAindaValido) {
      setForm((prev) => ({ ...prev, qualificacao_codigo: '' }));
    }
  }, [form.categoria, form.qualificacao_codigo, tiposFiltrados]);

  useEffect(() => {
    if (!form.qualificacao_codigo) return;

    if ((isG1SemSelected || isSemestralModeloSelected) && form.tipo_treinamento !== 'SEMESTRAL') {
      setForm((prev) => ({ ...prev, tipo_treinamento: 'SEMESTRAL' }));
      return;
    }

    if (!isEditMode && isG1Selected && form.tipo_treinamento !== 'INICIAL') {
      setForm((prev) => ({ ...prev, tipo_treinamento: 'INICIAL' }));
    }
  }, [
    form.qualificacao_codigo,
    form.tipo_treinamento,
    isEditMode,
    isG1Selected,
    isG1SemSelected,
    isSemestralModeloSelected,
  ]);

  // Auto-calcular data de vencimento quando data_realizacao ou qualificacao_codigo mudam
  useEffect(() => {
    if (form.data_realizacao && form.qualificacao_codigo) {
      if (isG1SemSelected) {
        setValidadeMeses(6);
        return;
      }

      const tipoSelecionado = todosTipos.find((t) => t.codigo === form.qualificacao_codigo);

      if (tipoSelecionado && tipoSelecionado.validade) {
        // Usar T00:00:00 para interpretar como horário local
        const dataRealizacao = new Date(form.data_realizacao + 'T00:00:00');
        const dataVencimento = new Date(dataRealizacao);
        dataVencimento.setMonth(dataVencimento.getMonth() + tipoSelecionado.validade);

        setForm((prev) => ({
          ...prev,
          data_vencimento: dateToHTMLFormat(dataVencimento),
        }));
        setValidadeMeses(tipoSelecionado.validade);
      } else {
        setValidadeMeses(null);
      }
    } else {
      setValidadeMeses(null);
    }
  }, [form.data_realizacao, form.qualificacao_codigo, isG1SemSelected, todosTipos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (errorCategorias) {
      toast.warning('❌ Erro: categorias canônicas indisponíveis');
      return;
    }

    const funcionarioId = parseInt(form.funcionario_id, 10);
    const qualificacaoCodigo = form.qualificacao_codigo;

    // Validação obrigatórios
    if (!form.funcionario_id || isNaN(funcionarioId) || funcionarioId <= 0) {
      toast.warning('❌ Erro: Funcionário inválido');
      return;
    }

    // Buscar CPF do funcionário selecionado
    const funcionarioSelecionado = funcionariosData.find((f: Funcionario) => f.id === funcionarioId);
    if (!funcionarioSelecionado) {
      toast.warning('❌ Erro: Funcionário não encontrado');
      return;
    }

    const funcionarioCPF = funcionarioSelecionado.cpf;

    if (!funcionarioCPF) {
      toast.warning('❌ Erro: CPF do funcionário não disponível');
      return;
    }

    if (!form.qualificacao_codigo || form.qualificacao_codigo.trim() === '') {
      toast.warning('❌ Erro: Tipo de qualificação inválido');
      return;
    }

    if (!form.categoria && !isLegacyEditing) {
      toast.warning('❌ Erro: Categoria obrigatória');
      return;
    }
    if (!form.data_realizacao) {
      toast.warning('❌ Erro: Data de realização obrigatória');
      return;
    }
    if (!form.data_vencimento && !isG1SemSelected) {
      toast.warning('❌ Erro: Data de vencimento obrigatória');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(form.data_realizacao)) {
      toast.warning('❌ Data de realização inválida (YYYY-MM-DD)');
      return;
    }
    if (form.data_vencimento && !dateRegex.test(form.data_vencimento)) {
      toast.warning('❌ Data de vencimento inválida (YYYY-MM-DD)');
      return;
    }

    const payload: HistoricoQualificacaoInput = {
      funcionario_cpf: funcionarioCPF,
      qualificacao_codigo: qualificacaoCodigo,
      tipo_treinamento: form.tipo_treinamento || 'INICIAL',
      data_conclusao: form.data_realizacao,
      data_vencimento: form.data_vencimento || null,
      instrutor_id: form.instrutor_id ? Number(form.instrutor_id) : undefined,
      observacoes: form.observacoes || null,
    };

    setSaving(true);
    try {
      const res = isEditMode
        ? await atualizarHistoricoQualificacao(habilitacao!.id, payload)
        : await criarHistoricoQualificacao(payload);

      console.debug('[ModalAtribuirQualificacao] Sucesso', res);
      emitirEventoModulo({
        modulo: 'qualificacoes',
        tipo: 'QUALIFICACAO_ATUALIZADA',
        funcionarioIds: form.funcionario_id ? [form.funcionario_id] : undefined,
      });
      onSuccess?.();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar';
      console.error('[ModalAtribuirQualificacao] Erro', error);
      showAlertDialog(message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
          {/* Overlay de salvamento */}
          {saving && (
            <div className="absolute inset-0 bg-white bg-opacity-95 flex flex-col items-center justify-center z-50 rounded-lg">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mb-4"></div>
              <p className="text-lg font-semibold text-gray-900 mb-2">Salvando qualificação...</p>
              <p className="text-sm text-gray-600 text-center max-w-md px-4">
                Aguarde enquanto processamos os dados e validamos as informações no servidor.
              </p>
            </div>
          )}

          <div className="flex justify-between items-center p-6 border-b">
            <h2 className="text-xl font-bold">Nova Qualificação</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
              disabled={saving}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* 1. Funcionário */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="inline w-4 h-4 mr-1" />
                  Funcionário <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.funcionario_id}
                  onChange={(e) => {
                    console.debug(
                      '[ModalAtribuirQualificacao] funcionario_id selecionado',
                      e.target.value,
                    );
                    setForm({ ...form, funcionario_id: e.target.value });
                  }}
                  required
                  disabled={loading || isEditMode}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">{loadingFuncionarios ? 'Carregando...' : 'Selecione...'}</option>
                  {[...funcionariosData]
                    .sort((a: Funcionario, b: Funcionario) =>
                      String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
                    )
                    .map((func: Funcionario) => (
                      <option key={func.id} value={func.id}>
                        {func.nome} {func.matricula ? `(${func.matricula})` : ''}
                      </option>
                    ))}
                </select>
                {!loadingFuncionarios && funcionariosData.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    ⚠️ Nenhum funcionário encontrado. Verifique se há funcionários ativos.
                  </p>
                )}
              </div>

              {/* 2. Categoria */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Tag className="inline w-4 h-4 mr-1" />
                  Categoria <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.categoria}
                  onChange={(e) => {
                    console.debug(
                      '[ModalAtribuirQualificacao] categoria selecionada',
                      e.target.value,
                    );
                    setForm({ ...form, categoria: e.target.value, qualificacao_codigo: '' });
                  }}
                  required
                  disabled={!form.funcionario_id || loading || Boolean(errorCategorias)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Selecione...</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome}
                    </option>
                  ))}
                </select>
                {errorCategorias && (
                  <p className="mt-1 text-xs text-red-600">⚠️ Não foi possível carregar as categorias canônicas. O salvamento está bloqueado.</p>
                )}
                {isLegacyEditing && (
                  <p className="mt-1 text-xs text-amber-600">⚠️ Categoria legada: preserve o modelo para salvar sem reclassificar, ou selecione uma categoria canônica.</p>
                )}
                {!form.funcionario_id && (
                  <p className="mt-1 text-xs text-gray-500">ℹ️ Selecione um funcionário primeiro</p>
                )}
              </div>

              {/* 3. Tipo (filtrado por categoria) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="inline w-4 h-4 mr-1" />
                  Modelo <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.qualificacao_codigo}
                  onChange={(e) => {
                    const codigo = e.target.value;
                    console.log('🔍 Tipo onChange:', {
                      codigo,
                      codigo_type: typeof codigo,
                    });
                    setForm({ ...form, qualificacao_codigo: codigo });
                  }}
                  required
                  disabled={(!form.categoria && !isLegacyEditing) || loading || Boolean(errorCategorias)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Selecione...</option>
                  {isLegacyEditing && selectedTipo && (
                    <option value={selectedTipo.codigo}>
                      {selectedTipo.nome} {selectedTipo.codigo && `(${selectedTipo.codigo})`} — Categoria legada
                    </option>
                  )}
                  {tiposFiltrados.map((tipo) => (
                    <option key={tipo.id} value={tipo.codigo}>
                      {tipo.nome} {tipo.codigo && `(${tipo.codigo})`}
                    </option>
                  ))}
                </select>
                {!form.categoria && (
                  <p className="mt-1 text-xs text-gray-500">ℹ️ Selecione uma categoria primeiro</p>
                )}
                {form.categoria && tiposFiltrados.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    ⚠️ Nenhum tipo de qualificação encontrado para esta categoria
                  </p>
                )}
                {validadeMeses && (
                  <p className="mt-1 text-xs text-blue-600">ℹ️ Validade: {validadeMeses} meses</p>
                )}
                {form.qualificacao_codigo && (
                  <p className="mt-1 text-xs text-gray-600">Código: {form.qualificacao_codigo}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Tag className="inline w-4 h-4 mr-1" />
                  Modalidade do Treinamento <span className="text-red-500">*</span>
                </label>
                {isG1SemSelected ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-sm font-medium text-blue-900">Semestral</p>
                    <p className="mt-1 text-xs text-blue-700">
                      G1-SEM sempre usa treinamento semestral. O vencimento semestral vem do G1
                      existente e é preservado no salvamento.
                    </p>
                  </div>
                ) : isSemestralModeloSelected ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-sm font-medium text-emerald-900">Semestral</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Este modelo tem validade de 6 meses. O lançamento é classificado
                      automaticamente como treinamento semestral.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-300 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="tipo_treinamento"
                        checked={form.tipo_treinamento === 'INICIAL'}
                        onChange={() => setForm({ ...form, tipo_treinamento: 'INICIAL' })}
                        className="mt-1 h-4 w-4 border-gray-300 text-primary focus:ring-primary/30"
                      />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">Inicial</span>
                        <span className="text-xs text-gray-500">
                          Use para primeira concessão ou formação inicial da qualificação.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-blue-300 px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors">
                      <input
                        type="radio"
                        name="tipo_treinamento"
                        checked={form.tipo_treinamento === 'RECORRENTE'}
                        onChange={() => setForm({ ...form, tipo_treinamento: 'RECORRENTE' })}
                        className="mt-1 h-4 w-4 border-gray-300 text-primary focus:ring-primary/30 accent-blue-600"
                      />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-blue-900">Periódico</span>
                        <span className="text-xs text-blue-700">
                          Use para recorrência, reciclagem ou atualização de uma qualificação já
                          existente.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 opacity-50">
                      <input
                        type="radio"
                        name="tipo_treinamento"
                        checked={form.tipo_treinamento === 'SEMESTRAL'}
                        disabled
                        readOnly
                        className="mt-1 h-4 w-4 border-gray-300 text-primary/50"
                      />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-gray-600">Semestral</span>
                        <span className="text-xs text-gray-500">
                          Usado automaticamente para modelos com validade de 6 meses.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Esse tipo fica salvo no histórico e define a carga horária usada no certificado.
                </p>
              </div>

              {/* 4. Data de Realização */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Data de Realização <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.data_realizacao}
                  onChange={(e) => {
                    console.debug(
                      '[ModalAtribuirQualificacao] data_realizacao alterada',
                      e.target.value,
                    );
                    setForm({ ...form, data_realizacao: e.target.value });
                  }}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
                />
              </div>

              {/* 5. Data de Vencimento (auto-calculada) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Data de Vencimento <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.data_vencimento}
                  onChange={(e) => {
                    console.debug(
                      '[ModalAtribuirQualificacao] data_vencimento alterada manualmente',
                      e.target.value,
                    );
                    setForm({ ...form, data_vencimento: e.target.value });
                  }}
                  required
                  disabled={!validadeMeses || isG1SemSelected}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {isG1SemSelected && (
                  <p className="mt-1 text-xs text-blue-600">
                    ℹ️ Para G1-SEM, o sistema mantém o vencimento de 6 meses gerado a partir do G1
                    planejado.
                  </p>
                )}
                {validadeMeses && form.data_realizacao && (
                  <p className="mt-1 text-xs text-green-600">
                    ✓ Calculado automaticamente ({validadeMeses} meses)
                  </p>
                )}
                {!validadeMeses && form.qualificacao_codigo && !isG1SemSelected && (
                  <p className="mt-1 text-xs text-amber-600">
                    ⚠️ Este tipo não tem validade definida. Informe manualmente se necessário.
                  </p>
                )}
              </div>

              {/* 6. Instrutor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="inline w-4 h-4 mr-1" />
                  Instrutor (opcional)
                </label>
                <select
                  value={form.instrutor_id}
                  onChange={(e) => setForm({ ...form, instrutor_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
                >
                  <option value="">-- Selecione um instrutor --</option>
                  {instrutoresCadastrados.map((instrutor) => (
                    <option key={instrutor.id} value={instrutor.id}>
                      {instrutor.nome} {instrutor.matricula ? `(${instrutor.matricula})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Escolha um instrutor cadastrado na empresa. Se não estiver na lista, cadastre-o
                  primeiro.
                </p>
              </div>

              {/* 7. Observações */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  placeholder="Observações adicionais..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  saving ||
                  loading ||
                  !form.funcionario_id ||
                  !form.categoria ||
                  !form.qualificacao_codigo ||
                  !form.data_realizacao ||
                  (!form.data_vencimento && !isG1SemSelected)
                }
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Salvando...' : '✓ Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
