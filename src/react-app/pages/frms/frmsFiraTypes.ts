export interface FiraLinhPreview {
  dia: number;
  data: string;
  status_fira: string;
  status_frms: string;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  duracao_jornada_min: number;
  horas_voo_min: number;
  local_base: string | null;
  situacao: 'NOVO' | 'DUPLICATA' | 'DIA_VAZIO';
  jornada_existente_id: string | null;
  marcado: boolean;
}

export interface FiraImportacaoPreview {
  importacao_id: string;
  tripulante_encontrado: boolean;
  tripulante_id: string | null;
  tripulante_nome_fira: string;
  tripulante_nome_sistema: string | null;
  canac: string;
  ano: number;
  mes: number;
  mes_nome: string;
  total_dias: number;
  linhas: FiraLinhPreview[];
  totais_fira: { jornada: string; voo: string };
  totais_calculados: { jornada_min: number; voo_min: number };
  divergencia_totais: boolean;
  avisos: string[];
  erros: string[];
}

export interface FiraImportacaoResultado {
  importacao_id: string;
  importados: number;
  substituidos: number;
  ignorados: number;
  erros: number;
  erros_detalhes: string[];
  alertas_gerados: number;
}

export interface FiraLoteUploadItem {
  arquivo_nome: string;
  success: boolean;
  data?: FiraImportacaoPreview;
  error?: string;
  code?: string;
}

export interface FiraLoteUploadResponse {
  total_arquivos: number;
  processados: number;
  erros: number;
  itens: FiraLoteUploadItem[];
}

export interface FrmsFonteComparativoTotais {
  dias: number;
  jornada_min: number;
  voo_min: number;
}

export interface FrmsFonteComparativoDia {
  data: string;
  jornada_min: number;
  voo_min: number;
}

export interface FrmsFonteComparativoDivergente {
  data: string;
  fira_preview: FrmsFonteComparativoDia;
  sigvoos: FrmsFonteComparativoDia;
  delta_jornada_min: number;
  delta_voo_min: number;
}

export interface FrmsFonteComparativoResponse {
  ano: number;
  mes: number;
  tripulante_id: string | null;
  fonte_preferida: 'SIGVOOS' | 'FIRA' | null;
  totais: {
    fira_preview: FrmsFonteComparativoTotais;
    sigvoos: FrmsFonteComparativoTotais;
  };
  dias: {
    somente_fira_preview: FrmsFonteComparativoDia[];
    somente_sigvoos: FrmsFonteComparativoDia[];
    divergentes: FrmsFonteComparativoDivergente[];
  };
}
