/**
 * Regressão MEL V4 (manifest XML namespaced):
 * `parseLaunchFile` deve identificar `index.html` mesmo quando o manifest usa
 * prefixos de namespace (`<ns0:resource href="index.html">`), que o regex
 * estrito `<resource ...>` não reconhecia — causando
 * "Não foi possível identificar o arquivo inicial do pacote SCORM."
 */
import { describe, expect, it } from 'vitest';
import { parseLaunchFile, parseLaunchFileRegex } from '../lmsContentUpload';

// Equivalente ao imsmanifest.xml do MEL V4 (namespaced) que reproduzia o bug.
const NAMESPACED_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="mnt-mel-minimum-equipment-list-rev01d-20260811" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:ns0="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org-1">
    <organization identifier="org-1">
      <title>MEL — Minimum Equipment List</title>
      <ns0:item identifier="item-1" identifierref="resource-1">
        <ns0:title>MEL — Minimum Equipment List</ns0:title>
      </ns0:item>
    </organization>
  </organizations>
  <resources>
    <ns0:resource identifier="resource-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <ns0:file href="index.html"/>
      <ns0:file href="app.js"/>
    </ns0:resource>
  </resources>
</manifest>`;

// SCORM 1.2 clássico (sem prefixo) — não pode regredir.
const PLAIN_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="x" version="1.0" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="o">
    <organization identifier="o">
      <item identifier="i1" identifierref="r1"><title>Curso</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"/>
  </resources>
</manifest>`;

// href com query/hash deve ser normalizado para o caminho relativo.
const MANIFEST_HREF_QUERY = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="x" version="1.0" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <organizations default="o">
    <organization identifier="o">
      <item identifier="i1" identifierref="r1"><title>Curso</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" href="content/launch.html?v=2#top"/>
  </resources>
</manifest>`;

describe('parseLaunchFile — manifest XML namespaced (MEL V4)', () => {
  it('reconhece <ns0:resource href="index.html"> via identifierref', () => {
    expect(parseLaunchFile(NAMESPACED_MANIFEST)).toBe('index.html');
  });

  it('mantém o fluxo clássico sem namespace', () => {
    expect(parseLaunchFile(PLAIN_MANIFEST)).toBe('index.html');
  });

  it('resolve href relativo normalizando query/hash', () => {
    expect(parseLaunchFile(MANIFEST_HREF_QUERY)).toBe('content/launch.html');
  });

  it('retorna null quando não há resource/item utilizável', () => {
    expect(parseLaunchFile('<manifest identifier="x"/>')).toBeNull();
  });
});

describe('parseLaunchFileRegex — fallback com prefixo de namespace opcional', () => {
  it('aceita <ns0:resource> com href direto', () => {
    expect(parseLaunchFileRegex('<ns0:resource identifier="r1" href="index.html"/>')).toBe('index.html');
  });

  it('aceita <ns0:item>/<ns0:resource> com identifierref', () => {
    const xml = '<ns0:item identifier="i1" identifierref="r1"/><ns0:resource identifier="r1" href="index.html"/>';
    expect(parseLaunchFileRegex(xml)).toBe('index.html');
  });
});
