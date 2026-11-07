#!/usr/bin/env python3
"""Create a disposable SCORM 1.2 two-position resume fixture.

This builder does NOT certify/activate/upload the ZIP. Local/browser QA only;
staging writes require the separately governed, synthetic-only workflow.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent / 'fixtures' / 'scorm-resume'
MANIFEST = '''<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
 xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
 identifier="AIRTRUST-SCORM-RESUME-QA-V1" version="1.0">
 <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
 <organizations default="O1"><organization identifier="O1">
  <title>QA Retomada Sintética (Não Certificada)</title>
  <item identifier="I1" identifierref="R1"><title>Prova de Persistência</title></item>
 </organization></organizations>
 <resources><resource identifier="R1" type="webcontent" adlcp:scormtype="sco" href="index.html">
  <file href="index.html"/><file href="resume-runtime.js"/>
 </resource></resources>
</manifest>
'''

def build_zip(output: Path) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    # Reproducible archive: sorted member names, fixed timestamp, no global state.
    completion = {
        'schemaVersion': 1,
        'diagnosticsVersion': 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
        'scormVersion': '1.2',
        'courseId': 'qa-scorm-resume-two-position',
        'packageVersion': 'qa-resume-v1',
        'content': {'requiredSlides': ['qa-pos-1', 'qa-pos-2']},
        'assessment': {'mode': 'EXTERNAL', 'scoringBySCORM': False,
                       'requiredInteractions': []},
        'completion': {'strategy': 'AIRTRUST_COMPLETION_CONTRACT_V1',
                       'passStatusFromSCORM': False, 'workerApprovalRequired': True},
        'diagnostics': {'currentSlide': True, 'slides': True,
                        'assessment': True, 'packageStatus': True, 'updatedAt': True},
        'release': {'reviewed': False},
    }
    members = {
        'imsmanifest.xml': MANIFEST.encode('utf-8'),
        'airtrust-completion-manifest.json':
            (json.dumps(completion, ensure_ascii=False, sort_keys=True,
                        separators=(',', ':')) + '\n').encode('utf-8'),
    }
    members.update({name: (ROOT / name).read_bytes() for name in ('index.html', 'resume-runtime.js')})
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(members):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, members[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    data = output.read_bytes()
    return {'scope': 'LOCAL_SYNTHETIC_SCORM12_RESUME_ONLY',
            'source': 'AIRTRUST_SCORM_RESUME_QA_V1',
            'path': str(output), 'sha256': hashlib.sha256(data).hexdigest(),
            'bytes': len(data), 'positions': 2,
            'certification': 'UNCERTIFIED', 'activationAuthorized': False,
            'stagingWritesAuthorized': False,
            'required': ['LMSInitialize', 'LMSGetValue', 'LMSSetValue', 'LMSCommit', 'LMSFinish']}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--json-output', type=Path)
    args = p.parse_args()
    report = build_zip(args.output)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__':
    main()
