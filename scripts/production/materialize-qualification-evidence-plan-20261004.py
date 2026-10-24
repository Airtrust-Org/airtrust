#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
DB_NAME = "airtrust-db"
EMPRESA_ID = 6

LINKS = [
    (2531, 41, 3239, "C", "2025-07-21", "2026-07-21"),
    (2536, 41, 3369, "D4", "2025-03-16", "2027-03-16"),
    (2546, 41, 3417, "E2", "2025-04-28", "2026-04-28"),
    (2547, 41, 3393, "E1", "2025-04-26", "2026-04-26"),
    (2550, 41, 3317, "D2", "2025-07-21", "2027-07-21"),
    (2554, 41, 3343, "D3", "2025-09-15", "2026-09-15"),
    (2566, 41, 4421, "B", "2025-08-28", "2026-08-28"),
    (2786, 1, 3319, "D3", "2025-03-15", "2026-03-15"),
    (2854, 20, 3228, "C", "2025-10-23", "2026-10-23"),
    (3258, 10, 3326, "D3", "2025-03-15", "2026-03-15"),
    (3764, 32, 4028, "D3", "2025-03-15", "2026-03-15"),
    (4008, 42, 3240, "C", "2025-07-07", "2026-07-07"),
]
MOVE = {
    "documento_id": 2316,
    "funcionario_id": 33,
    "historico_origem_id": 3532,
    "historico_destino_id": 5611,
    "expected_origem_codigo": "FAP05.2-76",
    "expected_destino_codigo": "D4",
    "expected_origem_data_conclusao": "2025-09-30",
    "expected_data_conclusao": "2026-09-21",
    "expected_data_vencimento": "2028-09-21",
}


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=WORKER, text=True, capture_output=True, check=True)


def query(sql: str) -> list[dict]:
    payload = json.loads(
        run([
            "npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
            "--env", "production", "--remote", "--json", "--command", sql,
        ]).stdout
    )
    return [row for block in payload for row in block.get("results", [])]


def derive_move_name(current_name: str) -> str:
    m = re.fullmatch(r"CERT-([A-Z0-9_]+)-FAP05\.2-76-20250930-([0-9a-f]{8})\.pdf", current_name)
    if not m:
        raise RuntimeError("reviewed move source filename drift")
    return f"CERT-{m.group(1)}-D4-20260921-{m.group(2)}.pdf"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True, type=Path)
    args = ap.parse_args()

    doc_ids = [x[0] for x in LINKS] + [MOVE["documento_id"]]
    hist_ids = [x[2] for x in LINKS] + [MOVE["historico_origem_id"], MOVE["historico_destino_id"]]
    docs = query(
        "SELECT id,funcionario_id,nome_arquivo,r2_key FROM documentos "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND id IN ({','.join(map(str, doc_ids))})"
    )
    histories = query(
        "SELECT id,funcionario_id,COALESCE(qualificacao_codigo,codigo,tipo_codigo) AS codigo,"
        "data_conclusao,data_vencimento,certificado_arquivo_id FROM qualificacoes_historico "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND id IN ({','.join(map(str, hist_ids))})"
    )
    dmap = {int(x["id"]): x for x in docs}
    hmap = {int(x["id"]): x for x in histories}
    if len(dmap) != len(doc_ids) or len(hmap) != len(hist_ids):
        raise RuntimeError("reviewed production scope drift")

    rows: list[dict] = []
    for did, fid, hid, code, completed, expires in LINKS:
        d = dmap[did]
        h = hmap[hid]
        if int(d["funcionario_id"]) != fid or int(h["funcionario_id"]) != fid:
            raise RuntimeError("reviewed employee linkage drift")
        if str(h.get("codigo") or "").upper() != code.upper():
            raise RuntimeError("reviewed qualification code drift")
        if str(h.get("data_conclusao") or "") != completed or str(h.get("data_vencimento") or "") != expires:
            raise RuntimeError("reviewed qualification date drift")
        rows.append({
            "action": "link_existing_document",
            "documento_id": did,
            "funcionario_id": fid,
            "historico_destino_id": hid,
            "expected_destino_codigo": code,
            "expected_data_conclusao": completed,
            "expected_data_vencimento": expires,
            "expected_nome_arquivo": d["nome_arquivo"],
            "expected_r2_key": d["r2_key"],
        })

    did = MOVE["documento_id"]
    fid = MOVE["funcionario_id"]
    src_id = MOVE["historico_origem_id"]
    dst_id = MOVE["historico_destino_id"]
    d = dmap[did]
    src = hmap[src_id]
    dst = hmap[dst_id]
    if int(d["funcionario_id"]) != fid or int(src["funcionario_id"]) != fid or int(dst["funcionario_id"]) != fid:
        raise RuntimeError("reviewed move employee linkage drift")
    if str(src.get("codigo") or "").upper() != MOVE["expected_origem_codigo"].upper():
        raise RuntimeError("reviewed move source code drift")
    if str(dst.get("codigo") or "").upper() != MOVE["expected_destino_codigo"].upper():
        raise RuntimeError("reviewed move target code drift")
    if str(src.get("data_conclusao") or "") != MOVE["expected_origem_data_conclusao"]:
        raise RuntimeError("reviewed move source date drift")
    if str(dst.get("data_conclusao") or "") != MOVE["expected_data_conclusao"] or str(dst.get("data_vencimento") or "") != MOVE["expected_data_vencimento"]:
        raise RuntimeError("reviewed move target date drift")
    new_name = derive_move_name(str(d["nome_arquivo"]))
    rows.append({
        "action": "move_misclassified_document",
        "documento_id": did,
        "funcionario_id": fid,
        "historico_origem_id": src_id,
        "historico_destino_id": dst_id,
        "expected_origem_codigo": MOVE["expected_origem_codigo"],
        "expected_destino_codigo": MOVE["expected_destino_codigo"],
        "expected_origem_data_conclusao": MOVE["expected_origem_data_conclusao"],
        "expected_nome_arquivo": d["nome_arquivo"],
        "new_nome_arquivo": new_name,
        "expected_r2_key": d["r2_key"],
        "new_numero_certificado": new_name[:-4],
        "expected_data_conclusao": MOVE["expected_data_conclusao"],
        "expected_data_vencimento": MOVE["expected_data_vencimento"],
    })

    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
