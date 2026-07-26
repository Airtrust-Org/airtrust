/**
 * Anexos de abastecimento (cv_voo_abastecimentos.anexo_r2_key). Antes desta
 * entrega o campo era aceito como string livre vinda do cliente, sem
 * validacao de tenant, existencia no R2, ou allowlist de tipo — qualquer
 * usuario com permissao de editar RDV podia gravar a chave de outro tenant.
 *
 * Mesma convencao de key ja usada no restante do repo (fira/{empresaId}/...,
 * lms/{tipo}/{empresaId}/{cursoId}/...): prefixo fixo + empresaId + entidade,
 * sempre construido no servidor — nunca aceito verbatim do cliente para
 * escrita. O cliente so referencia uma chave ja existente (retornada pelo
 * upload) ao criar o abastecimento; essa referencia e revalidada contra o
 * escopo tenant+voo antes de ser persistida.
 */
import { ApiError } from '../../middleware/error-handler';

export const ABASTECIMENTO_ANEXO_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function buildAbastecimentoAnexoPrefix(empresaId: number, vooId: number): string {
  return `controle-voos/${empresaId}/${vooId}/abastecimentos/`;
}

export function resolveAbastecimentoAnexoContentType(declaredType: string | undefined | null): string {
  const normalized = (declaredType || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_CONTENT_TYPES, normalized)) {
    throw new ApiError(
      'Formato de anexo invalido. Envie PDF, JPG ou PNG.',
      400,
      'CONTROLE_VOOS_ANEXO_CONTENT_TYPE_INVALID',
    );
  }
  return normalized;
}

export function buildAbastecimentoAnexoKey(
  empresaId: number,
  vooId: number,
  contentType: string,
): string {
  const extension = ALLOWED_CONTENT_TYPES[contentType] || 'bin';
  return `${buildAbastecimentoAnexoPrefix(empresaId, vooId)}${crypto.randomUUID()}.${extension}`;
}

export async function hashBytesSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Valida uma chave RECEBIDA (do cliente ao criar o abastecimento, ou lida de
 * volta do banco ao servir download) contra o prefixo tenant+voo esperado.
 * Bloqueia path traversal, null byte e chave de outro tenant/voo mesmo que a
 * chave tenha sido gravada antes desta validacao existir.
 */
export function assertAbastecimentoAnexoKeyScope(
  key: string,
  empresaId: number,
  vooId: number,
): void {
  if (!key || key.includes('\0') || key.includes('..') || key.includes('//')) {
    throw new ApiError('anexo_r2_key invalido', 400, 'CONTROLE_VOOS_ANEXO_KEY_INVALID');
  }
  const expectedPrefix = buildAbastecimentoAnexoPrefix(empresaId, vooId);
  if (!key.startsWith(expectedPrefix)) {
    throw new ApiError(
      'anexo_r2_key nao pertence a este voo/tenant',
      400,
      'CONTROLE_VOOS_ANEXO_KEY_SCOPE_INVALID',
    );
  }
}
