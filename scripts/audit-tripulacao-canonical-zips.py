#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET


REQUIRED_FILES = ("app.js", "scorm_api.js", "styles.css", "index.html")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def zip_file_entries(archive):
    return [info for info in archive.infolist() if not info.is_dir()]


def find_by_suffix(names, suffix):
    return any(name.endswith(suffix) for name in names)


def extract_launch_info(manifest_bytes):
    root = ET.fromstring(manifest_bytes)
    namespace = {}
    if root.tag.startswith("{"):
        namespace["ns"] = root.tag.split("}", 1)[0][1:]
    resource = root.find(".//ns:resource", namespace) if namespace else root.find(".//resource")
    return resource.attrib.get("href", "") if resource is not None else ""


def course_record(path):
    with zipfile.ZipFile(path) as archive:
        entries = zip_file_entries(archive)
        names = [item.filename for item in entries]
        manifests = [name for name in names if name.endswith("imsmanifest.xml")]
        manifest_path = manifests[0] if manifests else ""
        launch_file = ""
        manifest_xml_ok = False
        manifest_error = ""
        if manifest_path:
            try:
                launch_file = extract_launch_info(archive.read(manifest_path))
                manifest_xml_ok = True
            except Exception as exc:
                manifest_error = str(exc)

        app_js = archive.read(next(name for name in names if name.endswith("app.js"))).decode("utf-8", errors="ignore") if find_by_suffix(names, "app.js") else ""
        scorm_js = archive.read(next(name for name in names if name.endswith("scorm_api.js"))).decode("utf-8", errors="ignore") if find_by_suffix(names, "scorm_api.js") else ""
        combined_js = f"{app_js}\n{scorm_js}"

        top_levels = sorted({name.split("/", 1)[0] for name in names})
        nested_root = len(top_levels) == 1 and "/" in manifest_path
        launch_exists = bool(launch_file) and (
            launch_file in names or (manifest_path and f"{manifest_path.rsplit('/', 1)[0]}/{launch_file}" in names)
        )

        return {
            "zip_name": os.path.basename(path),
            "size_bytes": os.path.getsize(path),
            "sha256": sha256_file(path),
            "file_count": len(names),
            "manifest_path": manifest_path,
            "manifest_xml_ok": manifest_xml_ok,
            "manifest_error": manifest_error,
            "launch_file": launch_file,
            "launch_exists": launch_exists,
            "top_levels": top_levels,
            "nested_root": nested_root,
            "has_app_js": find_by_suffix(names, "app.js"),
            "has_scorm_api_js": find_by_suffix(names, "scorm_api.js"),
            "has_styles_css": find_by_suffix(names, "styles.css"),
            "has_index_html": find_by_suffix(names, "index.html"),
            "has_alert": "alert(" in combined_js,
            "has_suspend_data": "suspend_data" in combined_js,
            "has_lesson_location": "lesson_location" in combined_js,
            "has_lms_initialize": "LMSInitialize" in combined_js,
            "has_lms_commit": "LMSCommit" in combined_js,
            "has_lms_finish": "LMSFinish" in combined_js,
            "has_passed": "'passed'" in combined_js or '"passed"' in combined_js,
            "has_completed": "'completed'" in combined_js or '"completed"' in combined_js,
            "has_failed": "'failed'" in combined_js or '"failed"' in combined_js,
            "has_score_raw": "score.raw" in combined_js,
            "progress_call_matches": re.findall(r"Scorm\.progress\(([^\n;]+)\)", app_js),
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    records = []
    for entry in sorted(os.listdir(args.directory)):
        if not entry.endswith(".zip"):
            continue
        records.append(course_record(os.path.join(args.directory, entry)))

    payload = {"directory": args.directory, "count": len(records), "records": records}
    if args.pretty:
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
    else:
        json.dump(payload, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
