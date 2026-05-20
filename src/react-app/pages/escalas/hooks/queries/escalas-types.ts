// Escalas — shared types and interfaces
// Split from useEscalasQuery.ts for maintainability.

export type StatusEscala = 'rascunho' | 'em_revisao' | 'aprovada' | 'publicada' | 'arquivada';

export type TipoEvento =
  | 'voo'
  | 'viagem'
  | 'treinamento_solo'
  | 'treinamento_simulador'
  | 'medico'
  | 'cheque'
  | 'reaquisi'
  | 'trabalho'
  | 'folga'
  | 'standby'
  | 'ferias'
  | 'licenca';

export interface EscalaMensal {
  id: string;
  mes: number;
  ano: number;
  titulo: string;
  status: StatusEscala;
  created_by?: string | null;
  aprovado_por: string | null;
  aprovado_por_nome: string | null;
  aprovado_em: string | null;
  publicado_por: string | null;
  publicado_em: string | null;
  observacoes: string | null;
  criado_por_nome: string | null;
  total_tripulacoes: number;
  situacoes_count?: number;
  tripulantes_sem_aeronave_count?: number;
  afastamentos_medicos_count?: number;
  afastamentos_count?: number;
  conflitos_count?: number;
  total_eventos: number;
  created_at: string;
  updated_at: string;
  numero_revisao?: number;
}

export interface EscalaRevisao {
  id: string;
  revisao: number;
  publicado_por: string | null;
  publicado_em: string;
  publicado_por_nome: string | null;
  elaborado_por?: string | null;
  elaborado_em?: string | null;
  elaborado_por_nome?: string | null;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  aprovado_por_nome?: string | null;
  created_at: string;
}

export interface EscalaTripulacao {
  id: string;
  escala_id: string;
  pic_id: string;
  pic_nome: string;
  pic_matricula: string;
  pic_nome_guerra?: string | null;
  pic_cargo?: string | null;
  pic_funcao?: string | null;
  sic_id?: string | null;
  sic_nome?: string | null;
  sic_matricula?: string | null;
  sic_nome_guerra?: string | null;
  sic_cargo?: string | null;
  sic_funcao?: string | null;
  data_inicio: string;
  data_fim: string;
  padrao_escala_id?: string | null;
  padrao_nome?: string | null;
  padrao_dias_trabalho?: number | null;
  padrao_dias_folga?: number | null;
  aeronave?: string | null;
  base?: string | null;
  observacoes?: string | null;
}

export interface EscalaEvento {
  id: string;
  escala_id: string;
  tripulacao_id?: string | null;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_matricula: string;
  funcionario_cargo?: string | null;
  tipo_evento: TipoEvento;
  data_inicio: string;
  data_fim: string;
  turno?: 'manha' | 'tarde' | 'noite' | 'dia_todo' | string;
  local?: string | null;
  aeronave?: string | null;
  simulador_id?: string | null;
  cma_vencimento?: string | null;
  gerado_automaticamente: 0 | 1;
  motivo_automatico?: string | null;
  origem?: string | null;
  status: 'confirmado' | 'pendente' | 'cancelado';
  observacoes?: string | null;
}

export interface AlertaCMA {
  id: string;
  funcionario_id?: string;
  funcionario_nome: string;
  matricula: string;
  data_inicio: string;
  data_fim?: string;
  cma_vencimento: string | null;
  dias_para_vencer: number | null;
}

export interface ConflitoDatas {
  funcionario_id?: string;
  evento1_id: string;
  tipo1: TipoEvento;
  inicio1: string;
  fim1: string;
  evento2_id: string;
  tipo2: TipoEvento;
  inicio2: string;
  fim2: string;
  funcionario_nome: string;
}

export interface RestricaoViolada {
  tipo_restricao: string;
  motivo: string;
  contrato_referencia?: string;
  funcionario_a: string;
  funcionario_b: string;
  data_inicio: string;
  data_fim: string;
}

export interface PadraoEscala {
  id: string;
  nome: string;
  dias_trabalho: number;
  dias_folga: number;
  descricao: string | null;
  ativo: number;
}

export interface PilotoOption {
  id: string;
  nome: string;
  matricula: string;
  cargo: string | null;
  funcao: string | null;
  is_comandante: 0 | 1;
  foto_url?: string | null;
  cma_valido?: boolean | 0 | 1;
  cma_validade_fim?: string | null;
  cma_status?: 'ok' | 'vencendo' | 'expirado' | 'sem_cma';
  frms_score?: number | null;
  frms_status?: 'ok' | 'atencao' | 'critico' | null;
  status_operacional?: 'APTO' | 'ATENCAO_CMA' | 'ATENCAO_FRMS' | 'BLOQUEADO_CMA' | 'BLOQUEADO_FRMS';
  pode_ser_alocado?: boolean;
  habilitacoes?: Array<{ modelo_id: string; modelo_codigo: string; validade_fim: string | null }>;
  simuladores_pendentes?: number;
  ja_alocado?: 0 | 1;
  quinzena?: string | null;
}

export interface PilotosDisponiveisResponse {
  pilotos: PilotoOption[];
  modelo: string | null;
  total: number;
  aviso: string | null;
}

export interface TripulanteOperacional {
  funcionario_id: string;
  nome: string;
  nome_guerra: string | null;
  matricula: string;
  empresa_id: number;
  role: string;
  cma_valido: boolean;
  cma_dias_restantes: number | null;
  cma_validade_fim: string | null;
  frms_score: number | null;
  frms_status: 'ok' | 'atencao' | 'critico' | null;
  frms_avaliacao_data: string | null;
  simuladores_pendentes: number;
  proximo_simulador_data: string | null;
  habilitacoes: Array<{ modelo_id: string; modelo_codigo: string; validade_fim: string | null }>;
  status_operacional: 'APTO' | 'ATENCAO_CMA' | 'ATENCAO_FRMS' | 'BLOQUEADO_CMA' | 'BLOQUEADO_FRMS';
  pode_ser_alocado: boolean;
  ja_alocado_nesta_escala?: boolean;
  motivo_bloqueio?: string | null;
  ja_alocado_em?: {
    alocacao_id: string;
    escala_id: string;
    origem?: 'alocacao_operacional' | 'escala_situacao' | 'funcionario_ferias' | null;
    aeronave_id: string | null;
    quinzena_numero?: number | null;
    aeronave_prefixo?: string | null;
    funcao?: string | null;
    data_inicio: string;
    data_fim: string;
    situacao_tipo?: string | null;
    situacao_nome?: string | null;
    motivo?: string | null;
  } | null;
  quinzena?: string | null;
}

export interface EscalaAlocacao {
  id: string;
  escala_id: string;
  funcao: 'PIC' | 'SIC' | 'PIC_CHK' | 'SIC_CHK' | 'INSTRUTOR' | 'FLEX' | null;
  situacao_tipo?: 'FERIAS' | 'SIM' | 'CURSO' | 'MED' | 'AFT' | 'STB' | null;
  situacao_cor?: string | null;
  situacao_nome?: string | null;
  situacao_icone?: string | null;
  situacao_bloqueia_alocacao?: number | null;
  quinzena_id: number | null;
  data_inicio: string;
  data_fim: string;
  padrao_escala_id: string | null;
  base: string | null;
  observacoes: string | null;
  status: 'planejado' | 'confirmado' | 'cancelado';
  auto_gerado?: boolean | number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  funcionario: {
    id: string;
    nome: string | null;
    nome_guerra: string | null;
    matricula: string | null;
    role: string | null;
  };
  aeronave: {
    id: number | null;
    prefixo: string | null;
    modelo: string | null;
  };
  funcionario_id: string;
  funcionario_nome: string | null;
  funcionario_guerra: string | null;
  funcionario_matricula: string | null;
  funcionario_role: string | null;
  funcionario_quinzena?: string | null;
  funcionario_is_instrutor?: boolean;
  aeronave_id: number | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  modelo_aeronave?: string | null;
  funcionario_modelo_aeronave?: string | null;
}

export interface EscalaCoberturaDia {
  data: string;
  qtd_pic: number;
  qtd_sic: number;
  status_cobertura: 'ok' | 'gap_pic' | 'gap_sic' | 'gap_total' | 'excesso';
  updated_at: string;
}

export interface EscalaCoberturaAeronave {
  aeronave_id: number;
  prefixo: string | null;
  modelo: string | null;
  dias: EscalaCoberturaDia[];
  resumo: {
    total_dias: number;
    gaps: number;
    excessos: number;
    dias_cobertos: number;
  };
}

export interface EscalaAlocacoesResponse {
  alocacoes: EscalaAlocacao[];
  total: number;
  contract_version: 'v1';
}

export interface EscalaCoberturaResponse {
  cobertura: Array<{
    escala_id: string;
    aeronave_id: number | null;
    aeronave_prefixo: string | null;
    aeronave_modelo: string | null;
    data: string;
    qtd_pic: number;
    qtd_sic: number;
    status_cobertura: 'ok' | 'gap_pic' | 'gap_sic' | 'gap_total' | 'excesso';
    updated_at: string;
  }>;
  aeronaves: EscalaCoberturaAeronave[];
  resumo?: Array<{
    aeronave_id: number | null;
    aeronave_prefixo: string | null;
    gaps: number;
    excessos: number;
  }>;
  total?: number;
  recalculado?: boolean;
}

export interface EscalaCoberturaTripulanteAlocacao {
  id: string;
  tipo: string | null;
  aeronave: string | null;
  aeronave_id: number | null;
  data_inicio: string;
  data_fim: string;
  situacao: string | null;
  situacao_tipo?: string | null;
  situacao_nome?: string | null;
  situacao_cor?: string | null;
  situacao_icone?: string | null;
  auto_gerado?: boolean;
}

export interface EscalaCoberturaTripulante {
  id: string;
  nome: string;
  nome_guerra: string | null;
  matricula: string | null;
  cargo: 'comandante' | 'copiloto';
  quinzena_numero: 1 | 2 | null;
  alocacao_q1: EscalaCoberturaTripulanteAlocacao | null;
  alocacao_q2: EscalaCoberturaTripulanteAlocacao | null;
  status_q1: 'alocado_aeronave' | 'alocado_situacao' | 'livre';
  status_q2: 'alocado_aeronave' | 'alocado_situacao' | 'livre';
  status_geral: 'completo' | 'parcial' | 'livre';
  modelos_habilitados?: string[];
}

export interface EscalaCoberturaTripulantesResponse {
  tripulantes: EscalaCoberturaTripulante[];
  resumo: {
    total: number;
    completos: number;
    parciais: number;
    livres: number;
  };
}

export interface TripulantesOperacionaisResponse {
  aeronave: {
    id: string;
    prefixo: string | null;
    modelo: string | null;
  };
  tripulantes: TripulanteOperacional[];
  resumo: {
    total_aptos: number;
    total_bloqueados: number;
    bloqueados_cma: number;
    bloqueados_frms: number;
    atencao: number;
    sem_habilitacao: string | null;
  };
}

export interface EscalaPreferenciasResponse {
  exibir_nome: 'completo' | 'guerra';
  exibir_nome_guerra: boolean;
  padrao_quinzena: 'padrao' | 'custom';
  turno_a_inicio: string;
  turno_a_fim: string;
  turno_b_inicio: string;
  turno_b_fim: string;
  limite_fdp_dia: number;
  limite_fdp_noite: number;
  alerta_cma_ativo: boolean;
  alerta_cma_dias: number;
}

export interface Aeronave {
  id: number;
  modelo: string;
  prefixo: string | null;
  ano_fabricacao: number | null;
  status: string;
  observacoes: string | null;
}

export interface SituacaoTipo {
  id: number;
  codigo: 'FERIAS' | 'SIM' | 'CURSO' | 'MED' | 'AFT' | 'STB';
  nome: string;
  cor: string;
  icone: string | null;
  bloqueia_alocacao: number;
  ativo: number;
  ordem: number;
}

export interface FuncionarioFeriasItem {
  id: string;
  funcionario_id: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  observacoes: string | null;
  escala_alocacao_id: string | null;
  origem?: 'funcionario' | 'escala';
  created_at: string;
  updated_at: string;
  nome: string;
  nome_guerra: string | null;
  escala_id?: string | null;
  escala_mes?: number | null;
  escala_ano?: number | null;
  escala_titulo?: string | null;
}

export interface NovaSituacaoInput {
  funcionario_id: string;
  situacao_tipo: 'FERIAS' | 'SIM' | 'CURSO' | 'MED' | 'AFT' | 'STB';
  quinzena_id?: number | null;
  data_inicio: string;
  data_fim: string;
  observacoes?: string | null;
}

export interface CalendarioData {
  escala: EscalaMensal;
  range: { inicio: string; fim: string };
  tripulacoes: EscalaTripulacao[];
  alocacoes?: EscalaAlocacao[];
  eventos: EscalaEvento[];
  alertas_cma: AlertaCMA[];
}

export interface ConflitoCrew {
  funcionario_id?: string;
  funcionario_nome: string;
  trip1_id: string;
  trip2_id: string;
  inicio1: string;
  fim1: string;
  inicio2: string;
  fim2: string;
  papel1: string;
  papel2: string;
  aeronave1: string | null;
  aeronave2: string | null;
}

export interface ViolacaoCompliance {
  tipo: string;
  mensagem: string;
  pic_nome?: string;
  sic_nome?: string;
  detalhes?: Record<string, unknown>;
}

export interface ConflitosData {
  conflitos_eventos: ConflitoDatas[];
  conflitos_tripulacoes: ConflitoCrew[];
  restricoes_violadas: RestricaoViolada[];
  violacoes_compliance: ViolacaoCompliance[];
  tem_conflitos: boolean;
}

export interface QuinzenaEscala {
  id: number;
  empresa_id: number;
  ano: number;
  mes: number;
  numero: number;
  data_inicio: string;
  data_fim: string;
  observacoes: string | null;
}

export interface TipoEventoConfig {
  id: string;
  codigo: string;
  label: string;
  sigla: string;
  cor: string;
  ativo: 0 | 1;
  ordem: number;
}

export interface TemplateTripulacao {
  id: string;
  nome: string;
  quinzena: number;
  aeronave: string | null;
  pic_id: string | null;
  pic_nome: string | null;
  sic_id: string | null;
  sic_nome: string | null;
  padrao_escala_id: string | null;
  base: string | null;
  observacoes: string | null;
  usos: number;
}

export interface CMAStatus {
  funcionario_id: string;
  data_vencimento: string | null;
  status: 'ok' | 'vencendo' | 'expirado' | 'sem_cma';
  dias_restantes: number | null;
}

export interface DisponibilidadeEvento {
  funcionario_id: string;
  data_inicio: string;
  data_fim: string;
  tipo_evento: string;
}

export interface NotificacaoInApp {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  lida: 0 | 1;
  referencia_id: string | null;
  referencia_tipo: string | null;
  created_at: string;
}

export interface NotificacoesResponse {
  data: NotificacaoInApp[];
  nao_lidas: number;
}
