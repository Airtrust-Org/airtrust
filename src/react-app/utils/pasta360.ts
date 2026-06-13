export interface Pasta360Context {
  tab?: 'resumo' | 'qualificacoes' | 'licencas' | 'documentos' | 'pasta' | 'simulador';
  origem?: string;
  historicoId?: number | string | null;
  certificadoId?: number | string | null;
  tenantId?: number | string | null;
}

function normalizeId(value: number | string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === '0' || normalized === 'NaN') return null;
  return normalized;
}

export function buildPasta360Url(
  funcionarioId: number | string | null | undefined,
  context: Pasta360Context = {},
): string | null {
  const id = normalizeId(funcionarioId);
  if (!id) return null;

  const params = new URLSearchParams();
  if (context.tab) params.set('tab', context.tab);
  if (context.origem) params.set('origem', context.origem);
  if (context.historicoId != null) params.set('historico_id', String(context.historicoId));
  if (context.certificadoId != null) params.set('certificado_id', String(context.certificadoId));
  if (context.tenantId != null) params.set('tenant_id', String(context.tenantId));

  const query = params.toString();
  return `/funcionarios/${encodeURIComponent(id)}/ficha${query ? `?${query}` : ''}`;
}

export function requirePasta360Url(
  funcionarioId: number | string | null | undefined,
  context: Pasta360Context = {},
): string {
  const url = buildPasta360Url(funcionarioId, context);
  if (!url) throw new Error('Funcionário inválido para abrir Pasta 360');
  return url;
}
