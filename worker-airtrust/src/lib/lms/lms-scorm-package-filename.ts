const MAX_SCORM_FILENAME_LENGTH = 255;

export type ScormStoredValidation<T extends object = Record<string, unknown>> = T & {
  uploadMetadata?: {
    originalFilename?: string | null;
  };
};

export function normalizeScormUploadFilename(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const basename = value
    .trim()
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!basename) return null;
  return basename.slice(0, MAX_SCORM_FILENAME_LENGTH);
}

export function withScormUploadMetadata<T extends object>(
  validation: T,
  arquivoNome: string | null | undefined,
): ScormStoredValidation<T> {
  const originalFilename = normalizeScormUploadFilename(arquivoNome);
  if (!originalFilename) return validation as ScormStoredValidation<T>;
  return {
    ...validation,
    uploadMetadata: { originalFilename },
  };
}

export function readScormUploadFilename(validation: unknown): string | null {
  if (!validation || typeof validation !== 'object') return null;
  const uploadMetadata = (validation as ScormStoredValidation).uploadMetadata;
  return normalizeScormUploadFilename(uploadMetadata?.originalFilename ?? null);
}

export function parseStoredScormValidation<T extends object>(
  value: string | null | undefined,
): ScormStoredValidation<T> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as ScormStoredValidation<T>;
  } catch {
    return null;
  }
}
