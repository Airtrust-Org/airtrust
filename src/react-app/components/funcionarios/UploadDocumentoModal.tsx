import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, FileText, Upload, X } from 'lucide-react';
import Button from '@/react-app/components/Button';
import {
  PASTA_VIRTUAL_CATEGORIAS,
  pastaVirtualCategoriaPorTipo,
  type TipoDocumento,
} from '@/react-app/config/pastaVirtual';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface UploadDocumentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  funcionarioId: number;
  tipoInicial?: TipoDocumento;
}

type OpcaoSubtipo = { value: string; label: string };

const SUBTIPOS: Partial<Record<TipoDocumento, OpcaoSubtipo[]>> = {
  EXAME_MEDICO: [
    { value: 'ASO', label: 'ASO - Atestado de Saúde Ocupacional' },
    { value: 'CMA', label: 'CMA - Certificado Médico Aeronáutico' },
    { value: 'TOXICOLOGICO', label: 'Exame toxicológico' },
    { value: 'CCF', label: 'CCF - Certificado de Capacidade Física' },
  ],
  LICENCA_ANAC: [
    { value: 'EXTRATO_ANAC', label: 'Extrato ANAC' },
    { value: 'LICENCA', label: 'Licença' },
    { value: 'CHT', label: 'CHT / Habilitações' },
    { value: 'CHT_IFR', label: 'CHT - IFR' },
    { value: 'CHT_TIPO', label: 'CHT - Tipo' },
  ],
  SIMULADOR: [
    { value: 'FICHA_SESSAO', label: 'Ficha de sessão' },
    { value: 'TREINAMENTO_VOO', label: 'Treinamento de voo' },
    { value: 'RELATORIO_SIMULADOR', label: 'Relatório de simulador' },
  ],
  DESIGNACAO_OPERACIONAL: [
    { value: 'PIC', label: 'Designação PIC' },
    { value: 'SIC', label: 'Designação SIC' },
    { value: 'EQUIPAMENTO', label: 'Designação de equipamento' },
    { value: 'INSTRUTOR', label: 'Designação de instrutor' },
    { value: 'EXAMINADOR', label: 'Designação de examinador' },
    { value: 'FUNCAO', label: 'Outra designação de função' },
  ],
  EXPERIENCIA_HORAS: [
    { value: 'DECLARACAO_HORAS', label: 'Declaração de horas de voo' },
    { value: 'CIV', label: 'CIV / Caderneta Individual de Voo' },
    { value: 'EXPERIENCIA_RECENTE', label: 'Experiência recente' },
    { value: 'DECLARACAO_EXPERIENCIA', label: 'Declaração de experiência' },
  ],
  INSTRUTOR_EXAMINADOR: [
    { value: 'CREDENCIAMENTO', label: 'Credenciamento' },
    { value: 'CURSO', label: 'Curso / formação' },
    { value: 'IOS', label: 'IOS / evidência de instrução' },
    { value: 'TERMO', label: 'Termo / processo' },
    { value: 'DESIGNACAO', label: 'Designação' },
  ],
  VINCULO_FUNCIONAL: [
    { value: 'FICHA_REGISTRO', label: 'Ficha de registro' },
    { value: 'CONTRATO', label: 'Contrato' },
    { value: 'ADMISSAO', label: 'Admissão' },
    { value: 'DESLIGAMENTO', label: 'Desligamento' },
    { value: 'ALTERACAO_FUNCIONAL', label: 'Alteração funcional' },
  ],
  DOCUMENTO_PESSOAL: [
    { value: 'RG', label: 'RG - Registro Geral' },
    { value: 'CPF', label: 'CPF' },
    { value: 'CNH', label: 'CNH' },
    { value: 'CTPS', label: 'CTPS' },
    { value: 'PASSAPORTE', label: 'Passaporte' },
    { value: 'VISTO', label: 'Visto' },
    { value: 'TITULO', label: 'Título de eleitor' },
    { value: 'RESERVISTA', label: 'Certificado de reservista' },
  ],
  CURRICULO_PROFISSIONAL: [
    { value: 'CURRICULO', label: 'Currículo profissional' },
    { value: 'FICHA_PROFISSIONAL', label: 'Ficha profissional' },
  ],
};

const SUBTIPO_LIVRE = new Set<TipoDocumento>(['CERTIFICADO_QUALIFICACAO', 'AVALIACAO_CQ']);
const DATA_OBRIGATORIA = new Set<TipoDocumento>([
  'CERTIFICADO_QUALIFICACAO',
  'AVALIACAO_CQ',
  'EXAME_MEDICO',
  'LICENCA_ANAC',
  'SIMULADOR',
  'DESIGNACAO_OPERACIONAL',
  'EXPERIENCIA_HORAS',
  'INSTRUTOR_EXAMINADOR',
]);

const PREFIXOS: Record<TipoDocumento, string> = {
  CERTIFICADO_QUALIFICACAO: 'CERT',
  AVALIACAO_CQ: 'AVAL',
  EXAME_MEDICO: 'EXAME',
  LICENCA_ANAC: 'LIC',
  SIMULADOR: 'SIM',
  DESIGNACAO_OPERACIONAL: 'DESIG',
  EXPERIENCIA_HORAS: 'EXP',
  INSTRUTOR_EXAMINADOR: 'INST',
  VINCULO_FUNCIONAL: 'VINC',
  DOCUMENTO_PESSOAL: 'DOC',
  CURRICULO_PROFISSIONAL: 'CURR',
  OUTROS: 'DOC-OUTROS',
};

function subtipoLabel(tipo: TipoDocumento) {
  if (tipo === 'CERTIFICADO_QUALIFICACAO') return 'Código ou identificação do treinamento';
  if (tipo === 'AVALIACAO_CQ') return 'Tipo/código da avaliação';
  return 'Tipo específico';
}

export default function UploadDocumentoModal({
  isOpen,
  onClose,
  onSuccess,
  funcionarioId,
  tipoInicial,
}: UploadDocumentoModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(
    tipoInicial || 'CERTIFICADO_QUALIFICACAO',
  );
  const [subTipo, setSubTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataRealizacao, setDataRealizacao] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validacao, setValidacao] = useState<{ valido: boolean; erro?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTipoDocumento(tipoInicial || 'CERTIFICADO_QUALIFICACAO');
    setSubTipo('');
    setDescricao('');
    setDataRealizacao('');
    setFile(null);
    setError(null);
    setValidacao(null);
  }, [isOpen, tipoInicial]);

  const validarPDF = (arquivo: File): { valido: boolean; erro?: string } => {
    if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
      return { valido: false, erro: 'O arquivo deve estar em PDF.' };
    }
    if (arquivo.type !== 'application/pdf') {
      return { valido: false, erro: 'O arquivo deve ser do tipo application/pdf.' };
    }
    const MIN_SIZE = 1024;
    const MAX_SIZE = 10 * 1024 * 1024;
    if (arquivo.size < MIN_SIZE || arquivo.size > MAX_SIZE) {
      return { valido: false, erro: 'O PDF deve ter entre 1 KB e 10 MB.' };
    }
    return { valido: true };
  };

  const opcoesSubTipo = SUBTIPOS[tipoDocumento] || [];
  const usaSubtipoLivre = SUBTIPO_LIVRE.has(tipoDocumento);
  const subtipoObrigatorio = tipoDocumento !== 'OUTROS';
  const dataObrigatoria = DATA_OBRIGATORIA.has(tipoDocumento);
  const categoriaSelecionada = pastaVirtualCategoriaPorTipo[tipoDocumento];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const resultado = validarPDF(selectedFile);
    setValidacao(resultado);
    if (resultado.valido) {
      setFile(selectedFile);
      setError(null);
    } else {
      setFile(null);
      setError(resultado.erro || 'Arquivo inválido');
    }
  };

  const handleUpload = async () => {
    if (!file || !validacao?.valido) {
      setError(validacao?.erro || 'Selecione um arquivo PDF válido.');
      return;
    }
    if (subtipoObrigatorio && !subTipo.trim()) {
      setError('Informe o tipo específico do documento para manter a pasta organizada.');
      return;
    }
    if (dataObrigatoria && !dataRealizacao) {
      setError('Informe a data do documento/realização para preservar o histórico corretamente.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('funcionario_id', funcionarioId.toString());
      formData.append('tipo_documento', tipoDocumento);
      if (subTipo.trim())
        formData.append('sub_tipo', subTipo.trim().toUpperCase().replace(/\s+/g, '_'));
      if (descricao.trim()) formData.append('descricao', descricao.trim());
      if (dataRealizacao) formData.append('data_realizacao', dataRealizacao);

      const token = getAccessToken();
      if (!token) throw new Error('Token não encontrado. Faça login novamente.');

      const response = await fetch(`${API_BASE_URL}/pasta-virtual/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || 'Erro ao fazer upload do documento');

      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setSubTipo('');
    setDescricao('');
    setDataRealizacao('');
    setError(null);
    setValidacao(null);
    setUploading(false);
    onClose();
  };

  const getNomePadronizado = () => {
    if (!file) return '';
    if (tipoDocumento === 'CERTIFICADO_QUALIFICACAO') return file.name;

    const data = (dataRealizacao || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const tipo = subTipo.trim().toUpperCase().replace(/\s+/g, '_') || '[TIPO]';
    if (tipoDocumento === 'OUTROS') return `DOC-OUTROS-NOME_FUNCIONARIO-${data}-[ID].pdf`;
    return `${PREFIXOS[tipoDocumento]}-${tipo}-NOME_FUNCIONARIO-${data}-[ID].pdf`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Adicionar à Pasta Virtual
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">PDF entre 1 KB e 10 MB</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            disabled={uploading}
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Categoria <span className="text-red-500">*</span>
            </label>
            <select
              value={tipoDocumento}
              onChange={(e) => {
                setTipoDocumento(e.target.value as TipoDocumento);
                setSubTipo('');
              }}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-950"
              disabled={uploading}
            >
              {PASTA_VIRTUAL_CATEGORIAS.map((tipo) => (
                <option key={tipo.tipo} value={tipo.tipo}>
                  {tipo.titulo}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {categoriaSelecionada.descricao}
            </p>
          </div>

          {tipoDocumento !== 'OUTROS' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {subtipoLabel(tipoDocumento)} <span className="text-red-500">*</span>
              </label>
              {usaSubtipoLivre ? (
                <input
                  type="text"
                  value={subTipo}
                  onChange={(e) => setSubTipo(e.target.value)}
                  placeholder={
                    tipoDocumento === 'CERTIFICADO_QUALIFICACAO'
                      ? 'Ex.: D2, E3, F1, INTRO_SGQ'
                      : 'Ex.: FAP05.2-139, FAP14-139, OPC'
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-950"
                  disabled={uploading}
                />
              ) : (
                <select
                  value={subTipo}
                  onChange={(e) => setSubTipo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-950"
                  disabled={uploading}
                >
                  <option value="">Selecione...</option>
                  {opcoesSubTipo.map((opcao) => (
                    <option key={opcao.value} value={opcao.value}>
                      {opcao.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Data do documento / realização{' '}
              {dataObrigatoria ? (
                <span className="text-red-500">*</span>
              ) : (
                <span className="font-normal text-slate-400">(opcional)</span>
              )}
            </label>
            <input
              type="date"
              value={dataRealizacao}
              onChange={(e) => setDataRealizacao(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-950"
              disabled={uploading}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Use a data impressa/emitida no documento, não a data do upload.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Arquivo PDF <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition ${file ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-slate-300 hover:border-primary hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading}
              />
              {file ? (
                <div className="space-y-2">
                  <CheckCircle className="mx-auto h-10 w-10 text-green-600" />
                  <p className="break-all font-medium text-slate-900 dark:text-white">
                    {file.name}
                  </p>
                  <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileText className="mx-auto h-10 w-10 text-slate-400" />
                  <p className="text-slate-600 dark:text-slate-300">Clique para selecionar o PDF</p>
                </div>
              )}
            </div>
          </div>

          {file && validacao?.valido && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <p className="mb-1 text-sm font-medium text-blue-900 dark:text-blue-200">
                Padrão de organização
              </p>
              <code className="break-all text-xs text-blue-700 dark:text-blue-300">
                {getNomePadronizado()}
              </code>
              <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                Certificados mantêm o nome original. Os demais documentos recebem nomenclatura
                padronizada para facilitar organização e histórico.
              </p>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Descrição <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Observação objetiva que ajude a identificar o documento..."
              className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2 focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-950"
              rows={3}
              disabled={uploading}
            />
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-900 dark:text-red-200">
                  Não foi possível enviar
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-950/50">
          <Button variant="secondary" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={
              !file ||
              !validacao?.valido ||
              (subtipoObrigatorio && !subTipo.trim()) ||
              (dataObrigatoria && !dataRealizacao) ||
              uploading
            }
            className="min-w-[120px]"
          >
            {uploading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Enviar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
