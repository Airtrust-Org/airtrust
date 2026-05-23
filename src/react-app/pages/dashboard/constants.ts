export const ESCALA_STATUS_CONF = {
  rascunho: { label: 'Rascunho', cls: 'bg-slate-100 text-slate-600' },
  em_revisao: { label: 'Em revisão', cls: 'bg-amber-50 text-amber-700' },
  aprovada: { label: 'Aprovada', cls: 'bg-blue-50 text-blue-700' },
  publicada: { label: 'Publicada', cls: 'bg-emerald-50 text-emerald-700' },
} as const;

export const MESES_ABR = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export const FRMS_NIVEL_CONF = {
  VIOLACAO: { label: 'Violação', cls: 'bg-red-100 text-red-700', dot: 'bg-red-600' },
  CRITICO: { label: 'Crítico', cls: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
  ATENCAO: { label: 'Atenção', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  AVISO: { label: 'Aviso', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
} as const;
