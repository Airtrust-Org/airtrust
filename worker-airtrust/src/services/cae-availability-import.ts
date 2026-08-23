import {
  validateAndNormalizeCaeAvailability,
  type CaeAvailabilityDocumentV1,
  type CaeAvailabilityValidationIssue,
} from './cae-availability';

export type CaeAvailabilityImportStatus =
  | 'RECEBIDO'
  | 'EXTRAIDO'
  | 'AGUARDANDO_REVISAO'
  | 'VALIDADO'
  | 'REJEITADO';

export type CaeAvailabilityExtractionEnvelope = {
  source_file_name: string;
  source_kind: 'PDF' | 'EMAIL' | 'IMAGE' | 'XLSX' | 'TEXT' | 'UNKNOWN';
  received_at?: string | null;
  extraction_provider?: string | null;
  extraction_model?: string | null;
  raw_candidate: unknown;
};

export type CaeAvailabilityImportResult = {
  status: CaeAvailabilityImportStatus;
  document: CaeAvailabilityDocumentV1 | null;
  errors: CaeAvailabilityValidationIssue[];
  warnings: CaeAvailabilityValidationIssue[];
  requires_human_review: boolean;
  source_file_name: string;
};

/**
 * Ponte entre extração probabilística (PDF/e-mail -> candidato JSON) e o contrato
 * determinístico airtrust.cae_availability.v1.
 *
 * Este serviço NÃO chama IA e NÃO decide regras operacionais. O adaptador de runtime
 * fornece raw_candidate; esta função valida, normaliza e decide se revisão humana é necessária.
 */
export function prepareCaeAvailabilityImport(
  envelope: CaeAvailabilityExtractionEnvelope,
): CaeAvailabilityImportResult {
  const validation = validateAndNormalizeCaeAvailability(envelope.raw_candidate);

  if (!validation.ok) {
    return {
      status: 'REJEITADO',
      document: null,
      errors: validation.errors,
      warnings: validation.warnings,
      requires_human_review: true,
      source_file_name: envelope.source_file_name,
    };
  }

  const hasLowConfidence = validation.warnings.some((issue) => issue.code === 'LOW_CONFIDENCE');
  const hasDocumentWarnings = validation.data.warnings.length > 0;
  const requiresReview = hasLowConfidence || hasDocumentWarnings;

  return {
    status: requiresReview ? 'AGUARDANDO_REVISAO' : 'VALIDADO',
    document: validation.data,
    errors: [],
    warnings: validation.warnings,
    requires_human_review: requiresReview,
    source_file_name: envelope.source_file_name,
  };
}

/** Runtime adapter contract. Implementação concreta pode usar Cloudflare AI ou outro extrator aprovado. */
export interface CaeAvailabilityExtractionProvider {
  extract(params: {
    empresaId: number;
    fileName: string;
    mimeType: string;
    bytesOrObjectRef: unknown;
  }): Promise<unknown>;
}

export class CaeExtractionUnavailableError extends Error {
  constructor(message = 'A extração automática de PDF via IA ainda não está disponível.') {
    super(message);
    this.name = 'CaeExtractionUnavailableError';
  }
}

export const unavailableCaeAvailabilityExtractor: CaeAvailabilityExtractionProvider = {
  async extract() {
    throw new CaeExtractionUnavailableError();
  },
};

export async function importCaeAvailabilityFromUpload(params: {
  empresaId: number;
  fileName: string;
  mimeType: string;
  objectKey: string;
  extractor?: CaeAvailabilityExtractionProvider | null;
}): Promise<
  | { status: 'EXTRACTED'; import: CaeAvailabilityImportResult; object_key: string }
  | { status: 'EXTRACTION_UNAVAILABLE'; object_key: string; error: string }
> {
  const extractor = params.extractor || unavailableCaeAvailabilityExtractor;
  try {
    const rawCandidate = await extractor.extract({
      empresaId: params.empresaId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      bytesOrObjectRef: params.objectKey,
    });
    return {
      status: 'EXTRACTED',
      object_key: params.objectKey,
      import: prepareCaeAvailabilityImport({
        source_file_name: params.fileName,
        source_kind: 'PDF',
        raw_candidate: rawCandidate,
      }),
    };
  } catch (error) {
    if (error instanceof CaeExtractionUnavailableError) {
      return {
        status: 'EXTRACTION_UNAVAILABLE',
        object_key: params.objectKey,
        error: error.message,
      };
    }
    throw error;
  }
}
