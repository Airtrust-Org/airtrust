import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { CARGOS, SETORES } from '@/config/constants';
import {
  X,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileCheck,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { converterParaFormatoHTML } from '../../utils/dateUtils';
import { format, parseISO, differenceInDays } from 'date-fns';
import ModalLicenca from '../../components/licencas/ModalLicenca';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import {
  ESTADOS_BRASILEIROS,
  NIVEIS_ICAO,
  STATUS_FUNCIONARIO_OPTIONS,
} from '@/react-app/constants';
import {
  aplicarMascaraMatricula,
  aplicarMascaraTelefone,
  aplicarMascaraCodigoANAC,
  removerMascara,
} from '@/react-app/utils/mascaras';

interface Props {
  aberto: boolean;
  funcionario: { id?: number } | null;
  onFechar: () => void;
  onSalvar: (dados: Record<string, unknown>) => void;
  mostrarConfiguracaoEscala?: boolean;
}

type QuinzenaPreferencia = '' | 'primeira' | 'segunda' | 'personalizada';

const QUINZENA_OPTIONS: Array<{ value: QuinzenaPreferencia; label: string }> = [
  { value: '', label: 'Sem preferencia' },
  { value: 'primeira', label: '1a Quinzena' },
  { value: 'segunda', label: '2a Quinzena' },
  { value: 'personalizada', label: 'Flexivel' },
];

type OptionItem = {
  id: number;
  nome: string;
  prefixo?: string;
  modelo?: string;
  codigo?: string;
  deleted_at?: string | null;
  ativo?: number;
};

type QualItem = {
  id?: number;
  categoria?: string;
  data_realizacao?: string;
  codigo?: string;
  data_vencimento?: string;
  numero?: string;
  resultado?: string;
  observacoes?: string;
  nome?: string;
  renovada?: number | boolean | string | null;
  status?: string | null;
  qualificacao_status?: string | null;
  // Campos retornados pela API com prefixo tipo_
  tipo_nome?: string;
  tipo_codigo?: string;
  tipo_categoria?: string;
  certificado_url?: string;
};

type Licenca = {
  id: number;
  tipo?: string;
  numero?: string;
  data_emissao?: string;
  data_vencimento?: string;
};

// StatusBadge component para vencimentos
function parseBooleanFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
}

function StatusBadge({ vencimento }: { vencimento: string }) {
  const hoje = new Date();
  const dataVenc = parseISO(vencimento);
  const dias = differenceInDays(dataVenc, hoje);

  if (dias < 0) {
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300">
        Vencido
      </span>
    );
  }
  if (dias <= 30) {
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300">
        Vence em {dias}d
      </span>
    );
  }
  return (
    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300">
      Válido
    </span>
  );
}

function isQualificacaoRenovada(qual: QualItem): boolean {
  const renovada = qual.renovada;
  const status = String(qual.qualificacao_status || qual.status || '')
    .trim()
    .toUpperCase();

  return renovada === true || renovada === 1 || String(renovada) === '1' || status === 'RENOVADA';
}

function addMonthsYmd(base: Date, months: number): string {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

/** Idade (anos completos) na data de realização do exame */
function computeAgeAtRealizacao(nascimentoYmd: string, realizacaoYmd: string): number | null {
  const [y1, m1, d1] = nascimentoYmd.split('-').map(Number);
  const [y2, m2, d2] = realizacaoYmd.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;
  const birth = new Date(y1, m1 - 1, d1);
  const ref = new Date(y2, m2 - 1, d2);
  let age = ref.getFullYear() - birth.getFullYear();
  const md = ref.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

function qualBlobUpper(item: QualItem): string {
  return `${item.codigo || ''} ${item.tipo_codigo || ''} ${item.tipo_nome || ''} ${item.nome || ''}`.toUpperCase();
}

function matchesCmaCcf(item: QualItem): boolean {
  const b = qualBlobUpper(item);
  return b.includes('CMA') || b.includes('CCF');
}

function matchesAso(item: QualItem): boolean {
  return qualBlobUpper(item).includes('ASO');
}

function matchesIcao(item: QualItem): boolean {
  const b = qualBlobUpper(item);
  return b.includes('ICAO') || b.includes('ICÁO');
}

function pickLatestQual(arr: QualItem[]): QualItem | undefined {
  const sorted = [...arr]
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.data_realizacao || b.data_vencimento || '1900-01-01').getTime() -
        new Date(a.data_realizacao || a.data_vencimento || '1900-01-01').getTime(),
    );
  return sorted[0];
}

function inferIcaoNivelFromItem(icao: QualItem): string {
  const raw = String(icao.resultado || icao.observacoes || icao.nome || '').trim();
  const m = raw.match(/(\d)/);
  return m ? m[1] : '';
}

function computeIcaoVencimentoFromNivel(nivelStr: string, dataRealizacaoYmd: string): string {
  if (!dataRealizacaoYmd || !nivelStr) return '';
  const dataRealizacaoDate = new Date(`${dataRealizacaoYmd}T12:00:00`);
  if (Number.isNaN(dataRealizacaoDate.getTime())) return '';
  const nivel = parseInt(nivelStr, 10);
  const nivelInfo = NIVEIS_ICAO.find((n) => n.nivel === nivel);
  if (!nivelInfo) return '';
  if (nivelInfo.validade_anos === null) return '';
  dataRealizacaoDate.setFullYear(dataRealizacaoDate.getFullYear() + nivelInfo.validade_anos);
  return dataRealizacaoDate.toISOString().split('T')[0];
}

/** CMA/CCF: ≥60 anos na realização → 6 meses; senão prioriza vencimento do histórico ou 12 meses */
function resolveCmaVencimentoDisplay(
  dataRealizacao: string | null | undefined,
  historicoVencimento: string | null | undefined,
  nascimentoOriginal: string | null | undefined,
): string {
  const dr = converterParaFormatoHTML(dataRealizacao || '');
  const nb = converterParaFormatoHTML(nascimentoOriginal || '');
  if (!dr) return converterParaFormatoHTML(historicoVencimento || '') || '';
  const realizacaoDate = new Date(`${dr}T12:00:00`);
  if (Number.isNaN(realizacaoDate.getTime()))
    return converterParaFormatoHTML(historicoVencimento || '') || '';

  if (nb) {
    const age = computeAgeAtRealizacao(nb, dr);
    if (age !== null && age >= 60) return addMonthsYmd(realizacaoDate, 6);
  }

  const hv = converterParaFormatoHTML(historicoVencimento || '');
  if (hv) return hv;
  return addMonthsYmd(realizacaoDate, 12);
}

function resolveAsoVencimentoDisplay(
  dataRealizacao: string | null | undefined,
  historicoVencimento: string | null | undefined,
): string {
  const hv = converterParaFormatoHTML(historicoVencimento || '');
  if (hv) return hv;
  const dr = converterParaFormatoHTML(dataRealizacao || '');
  if (!dr) return '';
  const d = new Date(`${dr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return addMonthsYmd(d, 12);
}

export default function ModalFuncionario({
  aberto,
  funcionario,
  onFechar,
  onSalvar,
  mostrarConfiguracaoEscala = true,
}: Props) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    id: null as number | null,
    nome: '',
    guerra: '',
    cpf: '',
    rg: '',
    nascimento: '',
    sexo: '',
    nacionalidade: 'Brasileira',
    telefone_emergencia: '',
    contato_emergencia_nome: '',
    email: '',
    telefone: '',
    funcao: '',
    cargo: '',
    setor: '',
    modelo_aeronave_id: '',
    base: '',
    matricula: '',
    admissao: '',
    codigo_anac: '',
    nivel_icao: '',
    data_realizacao_icao: '',
    validade_icao: '',
    cma: '',
    data_realizacao_cma: '',
    validade_cma: '',
    aso: '',
    data_realizacao_aso: '',
    validade_aso: '',
    sispat: '',
    prestserv: '',
    status: 'ATIVO',
    is_instrutor: false,
    is_checador: false,
    foto_url: '',
    // Endereço
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    // Observações
    observacoes: '',
    // Escala
    quinzena: '' as QuinzenaPreferencia,
  });
  const [enderecoExpandido, setEnderecoExpandido] = useState(false);
  const [modelosAeronave, setModelosAeronave] = useState<OptionItem[]>([]);
  const [funcoesList, setFuncoesList] = useState<OptionItem[]>([]);
  const [setoresList, setSetoresList] = useState<OptionItem[]>([]);
  const [qualificacoes, setQualificacoes] = useState<QualItem[]>([]);
  const [licencas, setLicencas] = useState<Licenca[]>([]);
  const [modalLicencaAberto, setModalLicencaAberto] = useState(false);
  const [licencaEditandoId, setLicencaEditandoId] = useState<number | undefined>();

  useEffect(() => {
    // Carregar dados das APIs de lookup ao invés de usar constantes locais
    const carregarLookups = async () => {
      try {
        const token = getAccessToken();
        const timestamp = new Date().getTime();
        // Carregar funções do endpoint
        const funcResponse = await fetch(`${API_BASE_URL}/funcoes?t=${timestamp}`, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            Authorization: token ? `Bearer ${token}` : '',
          },
        });
        if (funcResponse.ok) {
          const funcData = await funcResponse.json();
          setFuncoesList(funcData.data || []);
        } else {
          console.warn('Erro ao carregar funções, usando padrões');
          const cargosFormatted = CARGOS.map((c: unknown, idx: number) => {
            const cargo = c as { label?: string; value?: string } | string;
            const nome =
              typeof cargo === 'object' ? cargo.label || cargo.value || String(c) : String(cargo);
            return { id: idx + 1, nome };
          });
          setFuncoesList(cargosFormatted);
        }

        // Carregar setores do endpoint
        const setResponse = await fetch(`${API_BASE_URL}/setores?t=${timestamp}`, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            Authorization: token ? `Bearer ${token}` : '',
          },
        });
        if (setResponse.ok) {
          const setData = await setResponse.json();
          setSetoresList(setData.data || []);
        } else {
          console.warn('Erro ao carregar setores, usando padrões');
          const setoresFormatted = SETORES.map((s: unknown, idx: number) => {
            const setor = s as { label?: string; value?: string } | string;
            const nome =
              typeof setor === 'object' ? setor.label || setor.value || String(s) : String(setor);
            return { id: idx + 1, nome };
          });
          setSetoresList(setoresFormatted);
        }

        // Carregar modelos de aeronave do endpoint
        const modelosResponse = await fetch(`${API_BASE_URL}/modelos-aeronave?t=${timestamp}`, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            Authorization: token ? `Bearer ${token}` : '',
          },
        });
        if (modelosResponse.ok) {
          const modelosData = await modelosResponse.json();
          setModelosAeronave(modelosData.data || []);
        } else {
          console.warn('Erro ao carregar modelos de aeronave');
          setModelosAeronave([]);
        }
      } catch (error) {
        console.error('Erro ao carregar dados de lookup:', error);
        // Fallback: usar constantes locais
        const cargosFormatted = CARGOS.map((c: unknown, idx: number) => {
          const cargo = c as { label?: string; value?: string } | string;
          const nome =
            typeof cargo === 'object' ? cargo.label || cargo.value || String(c) : String(cargo);
          return { id: idx + 1, nome };
        });
        const setoresFormatted = SETORES.map((s: unknown, idx: number) => {
          const setor = s as { label?: string; value?: string } | string;
          const nome =
            typeof setor === 'object' ? setor.label || setor.value || String(s) : String(setor);
          return { id: idx + 1, nome };
        });
        setFuncoesList(cargosFormatted);
        setSetoresList(setoresFormatted);
        setModelosAeronave([]);
      }
    };

    carregarLookups();
  }, []);

  useEffect(() => {
    const carregarDetalhes = async () => {
      if (!funcionario) {
        setFormData({
          id: null,
          nome: '',
          guerra: '',
          cpf: '',
          rg: '',
          nascimento: '',
          sexo: '',
          nacionalidade: 'Brasileira',
          telefone_emergencia: '',
          contato_emergencia_nome: '',
          email: '',
          telefone: '',
          funcao: '',
          cargo: '',
          setor: '',
          modelo_aeronave_id: '',
          base: '',
          matricula: '',
          admissao: '',
          codigo_anac: '',
          nivel_icao: '',
          data_realizacao_icao: '',
          validade_icao: '',
          cma: '',
          data_realizacao_cma: '',
          validade_cma: '',
          aso: '',
          data_realizacao_aso: '',
          validade_aso: '',
          sispat: '',
          prestserv: '',
          status: 'ATIVO',
          is_instrutor: false,
          is_checador: false,
          foto_url: '',
          cep: '',
          logradouro: '',
          numero: '',
          complemento: '',
          bairro: '',
          cidade: '',
          estado: '',
          observacoes: '',
        });
        return;
      }

      try {
        const token = getAccessToken();
        const resp = await fetch(`${API_BASE_URL}/funcionarios/${funcionario.id}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
          },
          cache: 'no-cache',
        });
        const json = await resp.json();
        const f = json?.funcionario || json?.data || funcionario;

        // 🔍 DEBUG: Ver o que vem do backend
        // Dados carregados do backend

        // Datas ASO / CMA(CCF) / ICAO: somente a partir do histórico de qualificações (somente leitura)
        // Números CMA/ASO e nível ICAO: cadastro do funcionário (editável)
        let icaoVal = '';
        let icaoDataRealizacao = '';
        let cmaVal = '';
        let cmaDataRealizacao = '';
        let asoVal = '';
        let asoDataRealizacao = '';

        try {
          const qResp = await fetch(
            `${API_BASE_URL}/qualificacoes/historico?funcionario_id=${funcionario.id}&limit=100`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: token ? `Bearer ${token}` : '',
              },
            },
          );
          if (qResp.ok) {
            const qJson = await qResp.json();
            const items: QualItem[] = (qJson?.qualificacoes || qJson?.data || []).filter(
              (item: QualItem) => !isQualificacaoRenovada(item),
            );

            const cma = pickLatestQual(items.filter(matchesCmaCcf));
            if (cma) {
              cmaDataRealizacao = cma.data_realizacao || '';
              cmaVal = resolveCmaVencimentoDisplay(
                cma.data_realizacao,
                cma.data_vencimento,
                f.nascimento || '',
              );
            }

            const aso = pickLatestQual(items.filter(matchesAso));
            if (aso) {
              asoDataRealizacao = aso.data_realizacao || '';
              asoVal = resolveAsoVencimentoDisplay(aso.data_realizacao, aso.data_vencimento);
            }

            const icao = pickLatestQual(items.filter(matchesIcao));
            if (icao) {
              icaoDataRealizacao = icao.data_realizacao || '';
              const inferredNivel = inferIcaoNivelFromItem(icao);
              const realizYmd = converterParaFormatoHTML(icao.data_realizacao || '');
              const historicoVin = converterParaFormatoHTML(icao.data_vencimento || '');
              icaoVal = historicoVin || computeIcaoVencimentoFromNivel(inferredNivel, realizYmd);
            }
          }
        } catch (err) {
          console.warn('Falha ao carregar qualificações do funcionário:', err);
        }

        const nivelIcaoCadastro = String(f.nivel_icao || '').trim();
        const cmaNumCadastro = String(f.cma || f.cma_numero || '').trim();
        const asoNumCadastro = String(f.aso || f.aso_numero || '').trim();

        // Buscar qualificações ativas para seção do modal
        try {
          const qualResp = await fetch(
            `${API_BASE_URL}/qualificacoes/historico?funcionario_id=${funcionario.id}`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: token ? `Bearer ${token}` : '',
              },
            },
          );
          if (qualResp.ok) {
            const qualJson = await qualResp.json();
            setQualificacoes(
              (qualJson?.data || qualJson?.qualificacoes || []).filter(
                (item: QualItem) => !isQualificacaoRenovada(item),
              ),
            );
          }
        } catch (err) {
          console.warn('Erro ao buscar qualificações:', err);
        }

        // Buscar licenças ativas para seção do modal
        try {
          const licResp = await fetch(`${API_BASE_URL}/licencas?funcionario_id=${funcionario.id}`, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: token ? `Bearer ${token}` : '',
            },
          });
          if (licResp.ok) {
            const licJson = await licResp.json();
            setLicencas(licJson?.data || licJson?.licencas || []);
          }
        } catch (err) {
          console.warn('Erro ao buscar licenças:', err);
        }

        setFormData({
          id: f.id || null,
          nome: f.nome || '',
          guerra: f.guerra || '',
          cpf: f.cpf || '',
          rg: f.rg || '',
          nascimento: converterParaFormatoHTML(f.nascimento),
          sexo: f.sexo || '',
          nacionalidade: f.nacionalidade || 'Brasileira',
          telefone_emergencia: f.telefone_emergencia || '',
          contato_emergencia_nome: f.contato_emergencia_nome || '',
          email: f.email || '',
          telefone: f.telefone || '',
          funcao: f.funcao || '',
          cargo: f.cargo || '',
          setor: f.setor || '',
          modelo_aeronave_id: f.modelo_aeronave_id || f.modelo_id || '', // ✅ Backend usa 'modelo_id'
          base: f.base || '',
          matricula: f.matricula || '',
          admissao: converterParaFormatoHTML(f.admissao || f.admissao), // ✅ Backend usa 'admissao'
          codigo_anac: f.codigo_anac || '',
          nivel_icao: nivelIcaoCadastro,
          data_realizacao_icao: converterParaFormatoHTML(icaoDataRealizacao),
          validade_icao: converterParaFormatoHTML(icaoVal),
          cma: cmaNumCadastro,
          data_realizacao_cma: converterParaFormatoHTML(cmaDataRealizacao),
          validade_cma: converterParaFormatoHTML(cmaVal),
          aso: asoNumCadastro,
          data_realizacao_aso: converterParaFormatoHTML(asoDataRealizacao),
          validade_aso: converterParaFormatoHTML(asoVal),
          sispat: f.codigo_sispat || f.sispat || '', // ✅ Backend usa 'sispat'
          prestserv: f.codigo_prestserv || f.prestserv || '', // ✅ Backend usa 'prestserv'
          status: f.status || 'ATIVO',
          is_instrutor: parseBooleanFlag(f.is_instrutor),
          is_checador: parseBooleanFlag(f.is_checador) || parseBooleanFlag(f.is_examinador),
          foto_url: f.foto_url || '',
          cep: f.cep || '',
          logradouro: f.logradouro || f.endereco || '',
          numero: f.numero || '',
          complemento: f.complemento || '',
          bairro: f.bairro || '',
          cidade: f.cidade || '',
          estado: f.estado || f.uf || '',
          observacoes: f.observacoes || '',
          quinzena: (f.quinzena as QuinzenaPreferencia) || '',
        });

        // FormData atualizado
      } catch (e) {
        console.warn('Erro ao carregar detalhes do funcionário:', e);
        setFormData((prev) => ({ ...prev }));
      }
    };

    carregarDetalhes();
  }, [funcionario]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    // Aplicar máscaras para campos específicos
    if (name === 'matricula') {
      const valorMascarado = aplicarMascaraMatricula(value);
      setFormData((prev) => ({
        ...prev,
        [name]: valorMascarado,
      }));
      return;
    }

    if (name === 'telefone' || name === 'telefone_emergencia') {
      const valorMascarado = aplicarMascaraTelefone(value);
      setFormData((prev) => ({
        ...prev,
        [name]: valorMascarado,
      }));
      return;
    }

    if (name === 'codigo_anac') {
      const valorMascarado = aplicarMascaraCodigoANAC(value);
      setFormData((prev) => ({
        ...prev,
        [name]: valorMascarado,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();

    // Validação e formatação da matrícula (OPCIONAL - se fornecida, deve ter 5 dígitos)
    let matriculaFinal = '';
    if (formData.matricula && formData.matricula.trim()) {
      const numerosSemMascara = removerMascara(formData.matricula);
      matriculaFinal = numerosSemMascara.padStart(5, '0');

      if (matriculaFinal.length !== 5) {
        toast.warning('A matrícula deve ter exatamente 5 dígitos.');
        return;
      }
    }

    // Validação do código ANAC (se fornecido, deve ter formato XXXXX-X)
    let codigoAnacFinal = '';
    if (formData.codigo_anac && formData.codigo_anac.trim()) {
      const numerosSemMascara = removerMascara(formData.codigo_anac);
      if (numerosSemMascara.length !== 6) {
        toast.warning('O código ANAC deve ter 6 dígitos (formato: XXXXX-X).');
        return;
      }
      codigoAnacFinal = `${numerosSemMascara.slice(0, 5)}-${numerosSemMascara.slice(5, 6)}`;
    }

    // Limpar máscaras de telefones
    const telefoneLimpo = formData.telefone ? removerMascara(formData.telefone) : '';
    const telefoneEmergenciaLimpo = formData.telefone_emergencia
      ? removerMascara(formData.telefone_emergencia)
      : '';

    // Converter campos para formato do backend
    const dadosParaBackend = {
      // ID (apenas para edição)
      ...(formData.id ? { id: formData.id } : {}),

      // Dados pessoais
      nome: formData.nome?.trim() || null,
      guerra: formData.guerra?.trim() || null,
      cpf: formData.cpf?.replace(/\D/g, '') || null,
      rg: formData.rg?.trim() || null,
      nascimento: formData.nascimento || null,
      sexo: formData.sexo || null,
      nacionalidade: formData.nacionalidade || 'Brasileira',

      // Contatos (sem máscaras)
      email: formData.email?.trim() || null,
      telefone: telefoneLimpo || null,
      telefone_emergencia: telefoneEmergenciaLimpo || null,
      contato_emergencia_nome: formData.contato_emergencia_nome?.trim() || null,

      // Profissionais (usar nomes do backend)
      funcao: formData.funcao?.trim() || null,
      cargo: formData.cargo?.trim() || null,
      setor: formData.setor?.trim() || null,
      modelo_aeronave_id: formData.modelo_aeronave_id?.trim() || null, // ✅ Suporta múltiplas aeronaves (IDs separados por vírgula)
      base: formData.base?.trim()?.toUpperCase() || null,
      matricula: matriculaFinal || null,
      admissao: formData.admissao || null, // ✅ Backend usa 'admissao'
      codigo_anac: codigoAnacFinal || null,
      status: formData.status || 'ATIVO',
      is_instrutor: formData.is_instrutor ? 1 : 0,
      is_checador: formData.is_checador ? 1 : 0,
      // Compat: alguns ambientes usam is_examinador (novo)
      is_examinador: formData.is_checador ? 1 : 0,

      // Números e nível ICAO no cadastro; datas de CMA/ASO/ICAO vêm só do histórico (não enviar aqui)
      nivel_icao: formData.nivel_icao?.trim() || null,
      cma: formData.cma?.trim() || null,
      aso: formData.aso?.trim() || null,

      sispat: formData.sispat?.trim() || null, // ✅ Backend usa 'sispat' (não 'codigo_sispat')
      prestserv: formData.prestserv?.trim() || null, // ✅ Backend usa 'prestserv' (não 'codigo_prestserv')

      // Endereço
      cep: formData.cep?.replace(/\D/g, '') || null,
      logradouro: formData.logradouro?.trim() || null,
      numero: formData.numero?.trim() || null,
      complemento: formData.complemento?.trim() || null,
      bairro: formData.bairro?.trim() || null,
      cidade: formData.cidade?.trim() || null,
      estado: formData.estado?.trim() || null,

      // Outros
      foto_url: formData.foto_url?.trim() || null,
      observacoes: formData.observacoes?.trim() || null,
      quinzena: formData.quinzena || null,
    };

    // Enviando dados para o backend
    onSalvar(dadosParaBackend);
  };

  const recarregarLicencas = async () => {
    if (!funcionario?.id) return;
    try {
      const token = getAccessToken();
      const licResp = await fetch(`${API_BASE_URL}/licencas?funcionario_id=${funcionario.id}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      if (licResp.ok) {
        const licJson = await licResp.json();
        setLicencas(licJson?.data || licJson?.licencas || []);
      }
    } catch (err) {
      console.warn('Erro ao recarregar licenças:', err);
    }
  };

  const abrirModalLicenca = (licencaId?: number) => {
    setLicencaEditandoId(licencaId);
    setModalLicencaAberto(true);
  };

  const fecharModalLicenca = () => {
    setModalLicencaAberto(false);
    setLicencaEditandoId(undefined);
  };

  const handleLicencaSalva = () => {
    recarregarLicencas();
    fecharModalLicenca();
  };

  const cmaRegraVencimentoLabel = useMemo(() => {
    const n = converterParaFormatoHTML(formData.nascimento);
    const d = formData.data_realizacao_cma;
    if (!n || !d) return 'conforme histórico de qualificações';
    const age = computeAgeAtRealizacao(n, d);
    if (age !== null && age >= 60) return '6 meses (60 anos ou mais)';
    return '12 meses';
  }, [formData.nascimento, formData.data_realizacao_cma]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {funcionario ? 'Editar' : 'Novo'} Funcionário
          </h2>
          <button
            onClick={onFechar}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSalvar} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* COLUNA 1: DADOS PESSOAIS */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
                  Dados Pessoais
                </h3>

                {/* Nome Completo */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                {/* Nome de Guerra */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome de Guerra
                  </label>
                  <input
                    type="text"
                    name="guerra"
                    value={formData.guerra}
                    onChange={handleChange}
                    placeholder="Nome de guerra"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* CPF */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    CPF <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="cpf"
                    value={formData.cpf}
                    onChange={handleChange}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                {/* RG */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    RG
                  </label>
                  <input
                    type="text"
                    name="rg"
                    value={formData.rg}
                    onChange={handleChange}
                    placeholder="12.345.678-9"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Data de Nascimento */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    name="nascimento"
                    value={formData.nascimento}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Sexo */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Sexo
                  </label>
                  <select
                    name="sexo"
                    value={formData.sexo}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Selecione</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>

                {/* Nacionalidade */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nacionalidade
                  </label>
                  <input
                    type="text"
                    name="nacionalidade"
                    value={formData.nacionalidade}
                    onChange={handleChange}
                    placeholder="Brasileira"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Telefone, Emergência e Foto - 3 Colunas */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Telefone */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      name="telefone"
                      value={formData.telefone}
                      onChange={handleChange}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Telefone Emergência */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Telefone Emergência
                    </label>
                    <input
                      type="tel"
                      name="telefone_emergencia"
                      value={formData.telefone_emergencia}
                      onChange={handleChange}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Contato Emergência Nome */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Contato Emergência
                    </label>
                    <input
                      type="text"
                      name="contato_emergencia_nome"
                      value={formData.contato_emergencia_nome}
                      onChange={handleChange}
                      placeholder="Nome do contato"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Foto URL */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Foto (URL)
                  </label>
                  <input
                    type="url"
                    name="foto_url"
                    value={formData.foto_url}
                    onChange={handleChange}
                    placeholder="https://example.com/foto.jpg"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* COLUNA 2: DADOS PROFISSIONAIS */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
                  Dados Profissionais
                </h3>

                {/* Função */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Função <span className="text-red-600">*</span>
                  </label>
                  <select
                    name="funcao"
                    value={formData.funcao}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    required
                  >
                    <option value="">✓ Selecione a função</option>
                    {funcoesList
                      .filter(
                        (it) => it.deleted_at == null && (it.ativo === undefined || it.ativo === 1),
                      )
                      .sort((a: OptionItem, b: OptionItem) =>
                        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
                      )
                      .map((func: OptionItem) => (
                        <option key={func.id} value={func.nome}>
                          {func.nome}
                        </option>
                      ))}
                  </select>
                  {funcoesList.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ Carregando funções...</p>
                  )}
                </div>

                {/* Setor */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Setor <span className="text-red-600">*</span>
                  </label>
                  <select
                    name="setor"
                    value={formData.setor}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    required
                  >
                    <option value="">✓ Selecione o setor</option>
                    {setoresList
                      .filter(
                        (it) => it.deleted_at == null && (it.ativo === undefined || it.ativo === 1),
                      )
                      .sort((a: OptionItem, b: OptionItem) =>
                        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
                      )
                      .map((set: OptionItem) => (
                        <option key={set.id} value={set.nome}>
                          {set.nome}
                        </option>
                      ))}
                  </select>
                  {setoresList.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ Carregando setores...</p>
                  )}
                </div>

                {/* Equipamentos (Multi-select) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Equipamentos
                  </label>
                  {modelosAeronave.length === 0 ? (
                    <p className="text-xs text-orange-600">⚠️ Carregando equipamentos...</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-slate-50 dark:bg-slate-950/60">
                      <div className="grid grid-cols-2 gap-2">
                        {modelosAeronave
                          .filter(
                            (it) =>
                              it.deleted_at == null && (it.ativo === undefined || it.ativo === 1),
                          )
                          .map((modelo) => {
                            const selectedIds = (formData.modelo_aeronave_id || '')
                              .split(',')
                              .filter(Boolean);
                            const isChecked = selectedIds.includes(String(modelo.id));
                            return (
                              <label
                                key={modelo.id}
                                className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded transition-colors text-sm ${
                                  isChecked
                                    ? 'bg-blue-100 border border-blue-300'
                                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const currentIds = (formData.modelo_aeronave_id || '')
                                      .split(',')
                                      .filter(Boolean);
                                    let newIds: string[];
                                    if (e.target.checked) {
                                      newIds = [...currentIds, String(modelo.id)];
                                    } else {
                                      newIds = currentIds.filter((id) => id !== String(modelo.id));
                                    }
                                    setFormData((prev) => ({
                                      ...prev,
                                      modelo_aeronave_id: newIds.join(','),
                                    }));
                                  }}
                                  className="w-3.5 h-3.5 text-primary border-slate-300 dark:border-slate-700 rounded focus:ring-primary flex-shrink-0"
                                />
                                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {modelo.codigo || modelo.prefixo} - {modelo.nome || modelo.modelo}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Selecione um ou mais equipamentos que o funcionário está habilitado a operar
                  </p>
                </div>

                {/* Base */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Base
                  </label>
                  <input
                    type="text"
                    name="base"
                    value={formData.base}
                    onChange={handleChange}
                    placeholder="Ex: GRU, CGH, BSB"
                    maxLength={10}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary uppercase"
                    style={{ textTransform: 'uppercase' }}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Informe o código ICAO ou sigla da base (ex: SBGR, GRU, CGH)
                  </p>
                </div>

                {/* Matrícula */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Matrícula <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="matricula"
                    value={formData.matricula}
                    onChange={handleChange}
                    onBlur={() => {
                      // Ao sair do campo, garante 5 dígitos com zeros à esquerda
                      if (formData.matricula && formData.matricula.length < 5) {
                        setFormData({
                          ...formData,
                          matricula: formData.matricula.padStart(5, '0'),
                        });
                      }
                    }}
                    placeholder="00353"
                    maxLength={5}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary font-mono text-center tracking-wider"
                  />

                  {/* Validação em tempo real */}
                  {formData.matricula && formData.matricula.length < 5 && (
                    <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                      <span>⏳</span>
                      Digite {5 - formData.matricula.length} dígito(s) ou será preenchido com zeros
                    </p>
                  )}

                  {formData.matricula && formData.matricula.length === 5 && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <span>✓</span>
                      Matrícula válida
                    </p>
                  )}
                </div>

                {/* Data de Admissão */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data de Admissão
                  </label>
                  <input
                    type="date"
                    name="admissao"
                    value={formData.admissao}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Código ANAC */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Código ANAC
                  </label>
                  <input
                    type="text"
                    name="codigo_anac"
                    value={formData.codigo_anac}
                    onChange={handleChange}
                    placeholder="12694-7"
                    maxLength={7}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Formato: XXXXX-X
                  </p>
                </div>
              </div>

              {/* SEÇÃO COMPLETA: CERTIFICAÇÕES E QUALIFICAÇÕES */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center justify-between border-b pb-2 mt-6">
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                    Certificações e Qualificações
                  </h3>
                  <button
                    type="button"
                    onClick={() => navigate('/simuladores?from=qualificacoes-especiais')}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-blue-700"
                    title="Gerenciar no módulo de Simuladores"
                  >
                    <ShieldCheck className="w-2 h-2" />
                    Atalho Simuladores
                  </button>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Número CMA, número ASO e nível ICAO são salvos no cadastro do funcionário. As datas de
                  realização e vencimento vêm do histórico de qualificações (somente leitura).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-4">
                  {/* ICAO - 1 linha com 3 colunas */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nível ICAO
                    </label>
                    <select
                      name="nivel_icao"
                      value={formData.nivel_icao}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Selecione</option>
                      {NIVEIS_ICAO.map((nivel) => (
                        <option key={nivel.nivel} value={String(nivel.nivel)}>
                          Nível {nivel.nivel} - {nivel.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Data de Realização ICAO
                    </label>
                    <input
                      type="date"
                      name="data_realizacao_icao"
                      value={formData.data_realizacao_icao}
                      readOnly
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-700 dark:text-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Vencimento ICAO {formData.nivel_icao === '6' && '(Ilimitada)'}
                    </label>
                    <input
                      type="date"
                      name="validade_icao"
                      value={formData.validade_icao}
                      readOnly
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-700 dark:text-slate-300"
                    />
                  </div>

                  {/* CMA - 1 linha com 3 colunas */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Número CMA
                    </label>
                    <input
                      type="text"
                      name="cma"
                      value={formData.cma}
                      onChange={handleChange}
                      placeholder="Número CMA"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Data de Realização CMA
                    </label>
                    <input
                      type="date"
                      name="data_realizacao_cma"
                      value={formData.data_realizacao_cma}
                      readOnly
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-700 dark:text-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Vencimento CMA ({cmaRegraVencimentoLabel})
                    </label>
                    <input
                      type="date"
                      name="validade_cma"
                      value={formData.validade_cma}
                      readOnly
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-700 dark:text-slate-300"
                    />
                  </div>

                  {/* ASO - 1 linha com 3 colunas */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Número ASO
                    </label>
                    <input
                      type="text"
                      name="aso"
                      value={formData.aso}
                      onChange={handleChange}
                      placeholder="Número ASO"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Data de Realização ASO
                    </label>
                    <input
                      type="date"
                      name="data_realizacao_aso"
                      value={formData.data_realizacao_aso}
                      readOnly
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-700 dark:text-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Vencimento ASO (12 meses)
                    </label>
                    <input
                      type="date"
                      name="validade_aso"
                      value={formData.validade_aso}
                      readOnly
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-700 dark:text-slate-300"
                    />
                  </div>

                  {/* SISPAT - Linha 4 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Código SISPAT
                    </label>
                    <input
                      type="text"
                      name="sispat"
                      value={formData.sispat}
                      onChange={handleChange}
                      placeholder="Ex: 123456"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* PrestServ */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Código PrestServ
                    </label>
                    <input
                      type="text"
                      name="prestserv"
                      value={formData.prestserv}
                      onChange={handleChange}
                      placeholder="Ex: 789012"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Status - Linha 5 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Status
                    </label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                    >
                      {STATUS_FUNCIONARIO_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Qualificações Especiais */}
                <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-blue-200 dark:border-blue-900/60">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3">
                    ✈️ Qualificações Especiais
                  </h3>
                  <div className="space-y-3">
                    {/* Checkbox Instrutor */}
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="is_instrutor"
                        name="is_instrutor"
                        checked={formData.is_instrutor || false}
                        onChange={handleChange}
                        className="mt-1 w-4 h-4 text-primary border-slate-300 dark:border-slate-700 rounded focus:ring-primary"
                      />
                      <label htmlFor="is_instrutor" className="ml-3 text-sm">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          É Instrutor
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Marcando esta opção, o funcionário aparecerá na lista de instrutores ao
                          agendar sessões de simulador
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
                        onChange={handleChange}
                        className="mt-1 w-4 h-4 text-primary border-slate-300 dark:border-slate-700 rounded focus:ring-primary"
                      />
                      <label htmlFor="is_checador" className="ml-3 text-sm">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          É Checador/Examinador
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Marcando esta opção, o funcionário aparecerá na lista de examinadores ao
                          agendar sessões de simulador
                        </p>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* SEÇÃO: ENDEREÇO (COLLAPSIBLE) */}
              <div className="md:col-span-2 space-y-4">
                <button
                  type="button"
                  onClick={() => setEnderecoExpandido(!enderecoExpandido)}
                  className="flex items-center justify-between w-full border-b border-slate-200 dark:border-slate-800 pb-2 mt-6 text-slate-900 dark:text-slate-100 hover:text-primary transition"
                >
                  <h3 className="font-semibold text-lg">Endereço (Opcional)</h3>
                  {enderecoExpandido ? (
                    <ChevronUp className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  )}
                </button>

                {enderecoExpandido && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-2">
                    {/* CEP */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        CEP
                      </label>
                      <input
                        type="text"
                        name="cep"
                        value={formData.cep}
                        onChange={handleChange}
                        placeholder="00000-000"
                        maxLength={9}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Logradouro */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Logradouro
                      </label>
                      <input
                        type="text"
                        name="logradouro"
                        value={formData.logradouro}
                        onChange={handleChange}
                        placeholder="Rua, Avenida, etc."
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Número */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Número
                      </label>
                      <input
                        type="text"
                        name="numero"
                        value={formData.numero}
                        onChange={handleChange}
                        placeholder="Ex: 123"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Complemento */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Complemento
                      </label>
                      <input
                        type="text"
                        name="complemento"
                        value={formData.complemento}
                        onChange={handleChange}
                        placeholder="Apto, Bloco, etc."
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Bairro */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Bairro
                      </label>
                      <input
                        type="text"
                        name="bairro"
                        value={formData.bairro}
                        onChange={handleChange}
                        placeholder="Nome do bairro"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Cidade */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Cidade
                      </label>
                      <input
                        type="text"
                        name="cidade"
                        value={formData.cidade}
                        onChange={handleChange}
                        placeholder="Nome da cidade"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Estado/UF */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Estado (UF)
                      </label>
                      <select
                        name="estado"
                        value={formData.estado}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Selecione o estado</option>
                        {ESTADOS_BRASILEIROS.map((e) => (
                          <option key={e.sigla} value={e.sigla}>
                            {e.sigla} - {e.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2 mt-6">
                  Configuração de escala
                </h3>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Quinzena preferencial
                  </label>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {QUINZENA_OPTIONS.map((opcao) => {
                      const checked = formData.quinzena === opcao.value;
                      return (
                        <label
                          key={opcao.value || 'sem-preferencia'}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${checked ? 'border-primary bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setFormData((prev) => ({
                                ...prev,
                                quinzena: checked ? '' : opcao.value,
                              }))
                            }
                            className="w-3.5 h-3.5 text-primary border-slate-300 dark:border-slate-700 rounded focus:ring-primary flex-shrink-0"
                          />
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {opcao.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* SEÇÃO: OBSERVAÇÕES */}
              <div className="md:col-span-2">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2 mt-6">
                  Observações
                </h3>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Observações adicionais
                  </label>
                  <textarea
                    name="observacoes"
                    value={formData.observacoes}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Observações adicionais sobre o funcionário..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* SEÇÃO: QUALIFICAÇÕES ATIVAS (apenas em modo edição) */}
              {funcionario?.id && (
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between border-b pb-2 mt-6">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <FileCheck size={20} className="text-blue-600" />
                      Qualificações Ativas
                    </h3>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    {qualificacoes.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                        Nenhuma qualificação ativa encontrada.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Categoria
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Nome
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Realização
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Vencimento
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-slate-700 dark:text-slate-300">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {qualificacoes.map((qual) => (
                            <tr
                              key={qual.id}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                            >
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                {qual.tipo_categoria || qual.categoria || '-'}
                              </td>
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                {qual.tipo_nome ||
                                  qual.nome ||
                                  qual.tipo_codigo ||
                                  qual.codigo ||
                                  '-'}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                {qual.data_realizacao
                                  ? format(parseISO(qual.data_realizacao), 'dd/MM/yyyy')
                                  : '-'}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                {qual.data_vencimento
                                  ? format(parseISO(qual.data_vencimento), 'dd/MM/yyyy')
                                  : '-'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {Boolean(qual.data_vencimento) && (
                                  <StatusBadge vencimento={qual.data_vencimento!} />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* SEÇÃO: LICENÇAS ATIVAS (apenas em modo edição) */}
              {funcionario?.id && (
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between border-b pb-2 mt-6">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Calendar size={20} className="text-green-600" />
                      Licenças Ativas
                    </h3>
                    <button
                      type="button"
                      onClick={() => abrirModalLicenca()}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <Plus size={16} />
                      Adicionar Licença
                    </button>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    {licencas.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                        Nenhuma licença ativa encontrada.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Tipo
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Número
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Emissão
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                              Vencimento
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-slate-700 dark:text-slate-300">
                              Status
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-slate-700 dark:text-slate-300">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {licencas.map((lic: Licenca) => (
                            <tr
                              key={lic.id as number}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                            >
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                {(lic.tipo as string) || '-'}
                              </td>
                              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                {(lic.numero as string) || '-'}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                {lic.data_emissao
                                  ? format(parseISO(lic.data_emissao as string), 'dd/MM/yyyy')
                                  : '-'}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                {lic.data_vencimento
                                  ? format(parseISO(lic.data_vencimento as string), 'dd/MM/yyyy')
                                  : '-'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {Boolean(lic.data_vencimento) && (
                                  <StatusBadge vencimento={lic.data_vencimento!} />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => abrirModalLicenca(lic.id as number)}
                                    title="Editar"
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                  >
                                    <Pencil size={14} className="text-indigo-600" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (
                                        await confirmDialog(
                                          'Deseja realmente excluir esta licença?',
                                        )
                                      ) {
                                        fetch(`${API_BASE_URL}/licencas/${lic.id}`, {
                                          method: 'DELETE',
                                        })
                                          .then(() => recarregarLicencas())
                                          .catch((err) => console.error('Erro ao excluir:', err));
                                      }
                                    }}
                                    title="Excluir"
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                  >
                                    <Trash2 size={14} className="text-red-600" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer com botões */}
          <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70">
            <button
              type="submit"
              className="flex-1  py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium transition"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 py-3 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>

      {/* Modal de Licença */}
      {modalLicencaAberto && funcionario?.id && (
        <ModalLicenca
          mode={licencaEditandoId ? 'edit' : 'create'}
          licencaId={licencaEditandoId}
          defaultFuncionarioId={funcionario.id}
          aberto={modalLicencaAberto}
          onFechar={fecharModalLicenca}
          onSalvar={handleLicencaSalva}
        />
      )}
    </div>
  );
}
