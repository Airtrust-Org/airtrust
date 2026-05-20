export interface HorasVooSaldoInicial {
  id: number;
  funcionario_id: number;
  empresa_id: number;
  horas_total_min: number;
  horas_pic_min: number;
  horas_sic_min: number;
  horas_noturna_min: number;
  horas_instrumento_min: number;
  horas_simulador_min: number;
  horas_instrucao_min: number;
  horas_aw139_min: number;
  horas_sk76_min: number;
  horas_outros_modelos_min: number;
  data_referencia: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

export interface HorasVooLancamento {
  id: number;
  funcionario_id: number;
  empresa_id: number;
  data_voo: string;
  aeronave_id?: number;
  modelo_aeronave?: string;
  prefixo_aeronave?: string;
  origem?: string;
  destino?: string;
  duracao_total_min: number;
  duracao_pic_min: number;
  duracao_sic_min: number;
  duracao_noturna_min: number;
  duracao_instrumento_min: number;
  duracao_instrucao_min: number;
  pousos_dia: number;
  pousos_noite: number;
  hoist_cycles: number;
  funcao: 'PIC' | 'SIC' | 'INSTRUTOR' | 'ALUNO';
  tipo_operacao?: string;
  is_simulador: 0 | 1;
  origem_registro: 'MANUAL' | 'FIRA' | 'FRMS' | 'SIMULADOR';
  frms_jornada_id?: number;
  sessao_simulador_id?: number;
  fira_importacao_id?: number;
  observacoes?: string;
  numero_voo?: string;
  created_at: string;
}

export interface HorasVooTotais {
  saldo_inicial: Omit<
    HorasVooSaldoInicial,
    'id' | 'funcionario_id' | 'empresa_id' | 'created_at' | 'updated_at'
  > | null;
  acumulado_sistema: {
    total_min: number;
    pic_min: number;
    sic_min: number;
    noturna_min: number;
    instrumento_min: number;
    simulador_min: number;
    instrucao_min: number;
  };
  total_geral: {
    total_min: number;
    pic_min: number;
    sic_min: number;
    noturna_min: number;
    instrumento_min: number;
    simulador_min: number;
    instrucao_min: number;
  };
  por_modelo: Record<string, { total_min: number; pic_min: number; sic_min: number }>;
  por_ano: Array<{ ano: number; total_min: number; pic_min: number }>;
  ultimo_lancamento: string | null;
  total_pousos: number;
  total_hoist_cycles: number;
}

export function minutesToHoursDisplay(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function parseHorasToMinutes(input: string): number {
  const raw = String(input || '')
    .trim()
    .toLowerCase();
  if (!raw) return 0;

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const hhmm = raw.match(/^(\d{1,4}):(\d{1,2})$/);
  if (hhmm) {
    return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  }

  const hm = raw.match(/^(\d+)h\s*(\d+)?(?:m|min)?$/);
  if (hm) {
    return Number(hm[1]) * 60 + Number(hm[2] || 0);
  }

  const compactHm = raw.match(/^(\d+)h(\d+)$/);
  if (compactHm) {
    return Number(compactHm[1]) * 60 + Number(compactHm[2]);
  }

  return 0;
}
