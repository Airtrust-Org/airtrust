import { describe, expect, it } from 'vitest';

import { resolveScormLaunchFileHref, resolveScormVersion } from '../../../lib/lms/scorm-manifest-parser';

describe('scorm-manifest-parser', () => {
  it('resolves the launch file from an unprefixed SCORM 1.2 manifest', () => {
    const xml = `<?xml version="1.0"?>
<manifest identifier="pkg-1">
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;
    expect(resolveScormLaunchFileHref(xml)).toBe('index.html');
    expect(resolveScormVersion(xml)).toBe('1.2');
  });

  it('resolves the launch file from a namespace-prefixed SCORM 1.2 manifest', () => {
    // Real-world pattern: authoring tools that bind imscp as a prefixed
    // namespace (xmlns:ns0=...) instead of the unprefixed default, so every
    // element — including <manifest> and <resource> — carries "ns0:".
    const xml = `<?xml version='1.0' encoding='utf-8'?>
<ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:ns2="http://www.adlnet.org/xsd/adlcp_rootv1p2" identifier="pkg-2" version="1.0">
  <ns0:metadata>
    <ns0:schema>ADL SCORM</ns0:schema>
    <ns0:schemaversion>1.2</ns0:schemaversion>
  </ns0:metadata>
  <ns0:organizations default="ORG-1">
    <ns0:organization identifier="ORG-1">
      <ns0:item identifier="ITEM-1" identifierref="RES-1" />
    </ns0:organization>
  </ns0:organizations>
  <ns0:resources>
    <ns0:resource identifier="RES-1" type="webcontent" ns2:scormtype="sco" href="index.html">
      <ns0:file href="index.html" />
    </ns0:resource>
  </ns0:resources>
</ns0:manifest>`;
    expect(resolveScormLaunchFileHref(xml)).toBe('index.html');
    expect(resolveScormVersion(xml)).toBe('1.2');
  });

  it('falls back to the item identifierref lookup when no resource declares href directly', () => {
    const xml = `<ns0:manifest xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <ns0:organizations>
    <ns0:organization>
      <ns0:item identifierref="RES-9" />
    </ns0:organization>
  </ns0:organizations>
  <ns0:resources>
    <ns0:resource identifier="RES-9" href="launch.html" />
  </ns0:resources>
</ns0:manifest>`;
    expect(resolveScormLaunchFileHref(xml)).toBe('launch.html');
  });
});
