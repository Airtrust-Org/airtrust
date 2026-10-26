/**
 * Editing existing course metadata and staging a SCORM ZIP are separate.
 * A course of a different active content type cannot be converted to SCORM
 * by an inactive intake: doing so would leave the course without a launch.
 */
type ScormSaveInput = {
  isEditing: boolean;
  storedTipoConteudo: string | null | undefined;
  tipoConteudo: string | null | undefined;
  hostname: string;
};

function isGovernedHost(hostname: string) {
  return hostname === 'airtrust.online' || hostname === 'staging.airtrust.pages.dev';
}

export function blocksUnsafeScormTypeConversion(input: ScormSaveInput): boolean {
  return input.isEditing && isGovernedHost(input.hostname) &&
    input.tipoConteudo === 'scorm' && input.storedTipoConteudo !== 'scorm';
}

export function shouldSaveScormMetadataWithoutZip(input: ScormSaveInput): boolean {
  return input.isEditing && isGovernedHost(input.hostname) &&
    input.tipoConteudo === 'scorm' && input.storedTipoConteudo === 'scorm';
}
