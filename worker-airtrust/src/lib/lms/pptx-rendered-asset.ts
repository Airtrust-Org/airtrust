/** The derivative MUST be coupled to the immutable identity of source R2 bytes.
 * Catalog version_tag may change on thumbnails and is NOT a PPTX edition ID.
 */
export function pptxRenderedPdfKey(sourceKey: string | null, sourceEtag: string | null): string | null {
  if (!sourceKey || !/^lms\/pptx\/[1-9]\d*\/[1-9]\d*\/presentation\.pptx$/.test(sourceKey)) return null;
  const cleanEtag = sourceEtag?.trim().replace(/^"|"$/g, '').toLowerCase();
  if (!cleanEtag || !/^[a-f0-9]{32}(?:-\d+)?$/.test(cleanEtag)) return null;
  return sourceKey.replace(/presentation\.pptx$/, `rendered/${cleanEtag}.pdf`);
}
