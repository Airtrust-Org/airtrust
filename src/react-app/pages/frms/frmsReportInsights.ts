/** Interpret returned FRMS report rows, without inventing regulatory thresholds or declaring operational clearance. */
export type FrmsInsightKind = 'compliance' | 'mapa-fadiga' | 'alertas-historico';
export interface FrmsInsightRow {
  tripulante_id?: string | number;
  dias_violacao?: number | null;
  dias_nao_avaliados?: number | null;
  dias_mitigacao?: number | null;
  dias_atencao?: number | null;
  nivel_max?: string | null;
  repouso_suficiente?: number | null;
  nivel?: string | null;
  resolvido_em?: string | null;
}
export interface FrmsReportInsight {
  key: string;
  title: string;
  explanation: string;
  action: string;
}
const positive = (n: number | null | undefined): boolean =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Counts refer to the rows returned by the endpoint, never its unseen history. */
export function deriveFrmsReportInsights(kind: FrmsInsightKind, rows: FrmsInsightRow[]): FrmsReportInsight[] {
  if (rows.length === 0) return [];
  if (kind === 'compliance') {
    const violations = rows.filter(r => positive(r.dias_violacao)).length;
    const unevaluated = rows.filter(r => positive(r.dias_nao_avaliados)).length;
    const preventive = rows.filter(r => positive(r.dias_mitigacao) || positive(r.dias_atencao)).length;
    const missing = rows.filter(r => r.dias_violacao == null || r.dias_nao_avaliados == null).length;
    return [
      { key: 'violations',
        title: `${violations} profissional(is) com dias de violação registrados`,
        explanation: violations > 0
          ? 'Existem ocorrências regulatórias no recorte. A contagem é de pessoas, não de dias.'
          : 'Nenhuma violação foi registrada nas linhas retornadas; isso não atesta conformidade de dias não avaliados.',
        action: violations > 0 ? 'Conferir evidência e requisito de cada ocorrência; registrar tratamento.' : 'Acompanhar e confirmar cobertura dos dados.' },
      { key: 'coverage',
        title: `${unevaluated} profissional(is) com dias não avaliados`,
        explanation: `Falta de avaliação não é conformidade.${missing ? ` Há ${missing} linha(s) com campos de avaliação ausentes.` : ''}`,
        action: unevaluated || missing ? 'Conferir escala, jornada e fontes dos dias sem evidência.' : 'Confirmar a abrangência da consulta.' },
      { key: 'prevention',
        title: `${preventive} profissional(is) em atenção ou mitigação`,
        explanation: 'Estados preventivos de fadiga não são, por si, infrações regulatórias.',
        action: preventive ? 'Revisar recuperação e acompanhamento antes da próxima atividade.' : 'Manter acompanhamento no período seguinte.' },
    ];
  }
  if (kind === 'mapa-fadiga') {
    const critical = rows.filter(r => r.nivel_max === 'CRITICO' || r.nivel_max === 'VIOLACAO').length;
    const attention = rows.filter(r => r.nivel_max === 'ATENCAO' || r.nivel_max === 'AVISO').length;
    const restFailed = rows.filter(r => r.repouso_suficiente === 0).length;
    const unknown = rows.filter(r => r.repouso_suficiente == null || r.nivel_max == null).length;
    return [
      { key: 'critical', title: `${critical} profissional(is) com classificação crítica ou violação`,
        explanation: 'O nível vem do motor de limites; percentual de horas não é diagnóstico de fadiga.',
        action: critical ? 'Inspecionar ocorrências e janelas da pessoa e encaminhar para decisão operacional.' : 'Continuar observando as janelas de limites.' },
      { key: 'rest', title: `${restFailed} profissional(is) com repouso insuficiente registrado`,
        explanation: `O indicador não substitui conferência da escala e recuperação.${unknown ? ` ${unknown} linha(s) com nível ou repouso desconhecido.` : ''}`,
        action: restFailed || unknown ? 'Confirmar duração e fonte do repouso antes da atividade.' : 'Conferir o repouso nas próximas jornadas.' },
      { key: 'attention', title: `${attention} profissional(is) em aviso ou atenção`,
        explanation: 'Classificação de triagem, não liberação operacional automática.',
        action: attention ? 'Rever carga acumulada e antecipar medidas preventivas.' : 'Acompanhar tendências no próximo recorte.' },
    ];
  }
  const open = rows.filter(r => !r.resolvido_em).length;
  const criticalOpen = rows.filter(r => !r.resolvido_em && (r.nivel === 'VIOLACAO' || r.nivel === 'CRITICO')).length;
  const byPerson = new Map<string, number>();
  for (const row of rows) {
    if (row.tripulante_id != null) {
      const id = String(row.tripulante_id);
      byPerson.set(id, (byPerson.get(id) ?? 0) + 1);
    }
  }
  const recurrent = [...byPerson.values()].filter(n => n > 1).length;
  return [
    { key: 'open', title: `${open} alerta(s) sem encerramento registrado`,
      explanation: `${criticalOpen} aberto(s) em nível crítico ou de violação, dentre os registros retornados.`,
      action: open ? 'Abrir Casos e conferir responsável, prazo, medida e eficácia antes de encerrar.' : 'Rever eficácia das medidas já encerradas.' },
    { key: 'recurrence', title: `${recurrent} profissional(is) com alertas repetidos nesta consulta`,
      explanation: 'Recorrência apenas nas linhas retornadas; não representa histórico individual completo.',
      action: recurrent ? 'Consultar histórico da pessoa e verificar eficácia da mitigação anterior.' : 'Acompanhar possíveis recorrências em novos períodos.' },
  ];
}
