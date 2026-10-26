/**
 * Editing course metadata and staging a SCORM ZIP are separate operations.
 * The existing-course production/staging screen has an explicit inactive intake
 * action; form submission must never implicitly activate the selected ZIP.
 * Backend certification, authorization and activation remain unchanged.
 */
export function shouldSaveScormMetadataWithoutZip(input: {
  isEditing: boolean;
  tipoConteudo: string | null | undefined;
  hostname: string;
}): boolean {
  return input.isEditing &&
    input.tipoConteudo === 'scorm' &&
    (input.hostname === 'airtrust.online' ||
      input.hostname === 'staging.airtrust.pages.dev');
}
