/** Version-scoped rendered PDF key: never serve a derivative of a replaced PPTX. */
export function pptxRenderedPdfKey(sourceKey: string | null, versionTag: string | null): string | null {
  if (!sourceKey || !/^lms\/pptx\/[1-9]\d*\/[1-9]\d*\/presentation\.pptx$/.test(sourceKey)) return null;
  if (!versionTag || versionTag.length > 128 || /[\x00-\x1F]/.test(versionTag)) return null;
  return sourceKey.replace(/presentation\.pptx$/, `rendered/${encodeURIComponent(versionTag)}.pdf`);
}
