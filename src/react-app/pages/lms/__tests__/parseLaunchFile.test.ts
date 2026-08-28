import { describe, expect, it } from 'vitest';

import { parseLaunchFile } from '../lmsContentUpload';

// Regression coverage for the "Não foi possível identificar o arquivo inicial
// do pacote SCORM." failure seen when a real MEL package ships an imsmanifest
// whose elements carry an XML namespace prefix (`<ns0:resource …>`).

describe('parseLaunchFile', () => {
  it('A. resolves a simple manifest without namespace prefixes', () => {
    const xml = `<manifest><resources><resource identifier="R1" href="index.html" /></resources></manifest>`;
    expect(parseLaunchFile(xml)).toBe('index.html');
  });

  it('B. resolves a namespaced manifest (ns0:resource)', () => {
    const xml = `<ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
      <ns0:resources>
        <ns0:resource identifier="R1" type="webcontent" href="index.html" />
      </ns0:resources>
    </ns0:manifest>`;
    expect(parseLaunchFile(xml)).toBe('index.html');
  });

  it('C. resolves item identifierref -> namespaced resource, ignoring an earlier hrefless resource', () => {
    const xml = `<ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
        xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
      <ns0:organizations default="ORG">
        <ns0:organization identifier="ORG">
          <ns0:item identifier="I1" identifierref="RES-SCO"><ns0:title>MEL</ns0:title></ns0:item>
        </ns0:organization>
      </ns0:organizations>
      <ns0:resources>
        <ns0:resource identifier="RES-COMMON" type="webcontent" />
        <ns0:resource identifier="RES-SCO" type="webcontent" adlcp:scormtype="sco" href="index.html">
          <ns0:file href="index.html" />
        </ns0:resource>
      </ns0:resources>
    </ns0:manifest>`;
    expect(parseLaunchFile(xml)).toBe('index.html');
  });

  it('D. returns the href relative to the manifest location untouched', () => {
    const xml = `<manifest><resources><resource identifier="R1" href="content/start.html" /></resources></manifest>`;
    expect(parseLaunchFile(xml)).toBe('content/start.html');
  });

  it('E. returns null when no resource/item declares a launch file', () => {
    const xml = `<manifest><resources><resource identifier="R1" type="webcontent" /></resources></manifest>`;
    expect(parseLaunchFile(xml)).toBeNull();
  });

  it('G. resolves a MEL V4-equivalent namespaced manifest to index.html', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    identifier="MEL_V4" version="1.0">
  <ns0:metadata>
    <ns0:schema>ADL SCORM</ns0:schema>
    <ns0:schemaversion>1.2</ns0:schemaversion>
  </ns0:metadata>
  <ns0:organizations default="MEL_ORG">
    <ns0:organization identifier="MEL_ORG">
      <ns0:title>MEL</ns0:title>
      <ns0:item identifier="ITEM_1" identifierref="RES_1" isvisible="true">
        <ns0:title>MEL</ns0:title>
      </ns0:item>
    </ns0:organization>
  </ns0:organizations>
  <ns0:resources>
    <ns0:resource identifier="RES_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <ns0:file href="index.html" />
      <ns0:file href="app.js" />
      <ns0:file href="course_data.js" />
      <ns0:file href="scorm_api.js" />
      <ns0:file href="airtrust-completion-manifest.json" />
    </ns0:resource>
  </ns0:resources>
</ns0:manifest>`;
    expect(parseLaunchFile(xml)).toBe('index.html');
  });
});
