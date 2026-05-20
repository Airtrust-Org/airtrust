import { strFromU8, unzipSync } from 'fflate';

function decodeXmlEntities(str: string) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export interface ParsedSlide {
  index: number;
  texts: string[];
  imageObjectUrls: string[];
}

interface BlobEntry {
  key: string;
  blobUrl: string;
}

function extractTextFromSlideXml(xml: string): string[] {
  const paragraphs: string[] = [];
  const paraMatches = xml.matchAll(/<a:p[\s>][^]*?<\/a:p>/g);
  for (const pm of paraMatches) {
    const paraXml = pm[0];
    const textParts: string[] = [];
    const textMatches = paraXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g);
    for (const tm of textMatches) {
      const txt = decodeXmlEntities(tm[1] ?? '').trim();
      if (txt) textParts.push(txt);
    }
    if (textParts.length > 0) paragraphs.push(textParts.join(' '));
  }
  return paragraphs;
}

function getRelationships(relsXml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const matches = relsXml.matchAll(/<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*/g);
  for (const match of matches) {
    if (match[1] && match[2]) map[match[1]] = match[2];
  }
  return map;
}

function getImageRelsFromSlideXml(slideXml: string): string[] {
  const rIds: string[] = [];
  const matches = slideXml.matchAll(/<a:blip[^>]+r:embed="([^"]+)"/g);
  for (const match of matches) {
    if (match[1]) rIds.push(match[1]);
  }
  return rIds;
}

export function parsePptx(bytes: Uint8Array): ParsedSlide[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('Arquivo PPTX inválido ou corrompido');
  }

  const slideKeys = Object.keys(files)
    .filter((key) => /^ppt\/slides\/slide\d+\.xml$/i.test(key))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      return na - nb;
    });

  if (slideKeys.length === 0) {
    throw new Error('Nenhum slide encontrado no arquivo PPTX');
  }

  const mediaBlobUrls: BlobEntry[] = [];
  for (const [key, data] of Object.entries(files)) {
    if (/^ppt\/media\//i.test(key)) {
      const ext = key.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        emf: 'image/x-emf',
        wmf: 'image/x-wmf',
      };
      const mime = mimeMap[ext];
      if (!mime) continue;
      const blob = new Blob([data], { type: mime });
      mediaBlobUrls.push({ key, blobUrl: URL.createObjectURL(blob) });
    }
  }

  function resolveMediaBlobUrl(target: string): string | null {
    const basename = target.split('/').pop() ?? '';
    const entry = mediaBlobUrls.find(
      (item) => item.key.endsWith('/' + basename) || item.key === `ppt/media/${basename}`,
    );
    return entry?.blobUrl ?? null;
  }

  const slides: ParsedSlide[] = [];
  for (let index = 0; index < slideKeys.length; index += 1) {
    const slideKey = slideKeys[index];
    const slideXml = strFromU8(files[slideKey] ?? new Uint8Array());
    const relsKey = slideKey.replace(/^(ppt\/slides\/)(slide\d+\.xml)$/, '$1_rels/$2.rels');
    const relsXml = files[relsKey] ? strFromU8(files[relsKey]) : '';
    const rels = getRelationships(relsXml);
    const imageObjectUrls: string[] = [];

    for (const relationId of getImageRelsFromSlideXml(slideXml)) {
      const target = rels[relationId];
      if (!target) continue;
      const blobUrl = resolveMediaBlobUrl(target);
      if (blobUrl) imageObjectUrls.push(blobUrl);
    }

    slides.push({
      index,
      texts: extractTextFromSlideXml(slideXml),
      imageObjectUrls,
    });
  }

  return slides;
}
