import type { CMAStatus, PilotoOption } from '../../hooks/queries/useEscalasQuery';

export function normalizeId(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function normalizeAeronaveContext(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function buildCMAStatusFromPiloto(piloto?: PilotoOption): CMAStatus | undefined {
  if (!piloto) return undefined;

  const dataVencimento = piloto.cma_validade_fim || null;
  const cmaValido = piloto.cma_valido === true || piloto.cma_valido === 1;

  if (!dataVencimento) {
    return {
      funcionario_id: piloto.id,
      data_vencimento: null,
      status: 'sem_cma',
      dias_restantes: null,
    };
  }

  const diasRestantes = Math.round(
    (new Date(`${dataVencimento}T12:00:00`).getTime() - Date.now()) / 86400000,
  );

  return {
    funcionario_id: piloto.id,
    data_vencimento: dataVencimento,
    status: !cmaValido ? 'expirado' : diasRestantes <= 30 ? 'vencendo' : 'ok',
    dias_restantes: diasRestantes,
  };
}

export function buildFallbackPilotoOption(
  id: string | null | undefined,
  nome: string | null | undefined,
  matricula: string | null | undefined,
  role?: string | null,
  isComandante = false,
): PilotoOption | null {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return null;

  return {
    id: normalizedId,
    nome: String(nome || 'Tripulante atual'),
    matricula: String(matricula || normalizedId),
    cargo: role || null,
    funcao: role || null,
    is_comandante: isComandante ? 1 : 0,
  };
}
