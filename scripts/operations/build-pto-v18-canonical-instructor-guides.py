#!/usr/bin/env python3
"""Build 88 faithful instructor reference guides directly from approved PTO V18.

The approved PTO is the sole authority for curriculum, order, legs, duration,
NOTECHS and functional items. No legacy scenarios or invented SOP/FFS steps.
This tool writes HTML and a manifest only; it does not mutate production.
"""
import argparse
import hashlib
import html
import importlib.util
import json
from pathlib import Path

DIR = Path(__file__).resolve().parent
CANON = DIR / "pto-v18-canonical"
SOURCE_SHA = "040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912"


def _checked_source(source_docx=None):
    path = DIR / "check-pto-v18-canonical-contract.py"
    spec = importlib.util.spec_from_file_location("pto_v18_contract", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    checked = module.validate(CANON, source_docx)
    if checked["source_sha256"] != SOURCE_SHA:
        raise ValueError("PTO_SOURCE_SHA_MISMATCH")
    data = lambda n: json.loads((CANON / n).read_text(encoding="utf-8"))
    return data("sessoes_pto_v18.json"), data("funcionais_pto_v18.json"), data("notechs_pto_v18.json")


def render_guide(session, notechs, functional=False):
    """The text inside curriculum tables is copied verbatim from canonical PTO JSON."""
    esc = lambda v: html.escape(str(v), quote=True)
    code = session["codigo"]
    title = session["titulo"]
    aircraft = "Funcional — Instrutor/Examinador" if functional else session["aeronave"]
    cells = []
    for i, item in enumerate(session["itens"], 1):
        if int(item["ordem"]) != i:
            raise ValueError(f"PTO_ITEM_ORDER_MISMATCH: {code}")
        if not item["codigo"] or not item["nome"]:
            raise ValueError(f"PTO_ITEM_EMPTY: {code}/{i}")
        leg = "—" if functional else item["perna"]
        cells.append(
            f'<tr data-pos="{i}" data-item-code="{esc(item["codigo"])}">'
            f'<td>{i}</td><td>{esc(leg)}</td><td>{esc(item["codigo"])}</td>'
            f'<td>{esc(item["nome"])}</td></tr>'
        )
    if len(cells) != 18:
        raise ValueError(f"PTO_EXPECTED_18_ITEMS: {code}")
    notechs_rows = [
        f'<tr data-notechs-code="{esc(n["codigo"])}"><td>{esc(n["codigo"])}</td>'
        f'<td>{esc(n["elemento"])}</td><td>{esc(n["categoria"])}</td>'
        f'<td>{esc(n["evidencia"])}</td></tr>'
        for n in notechs
    ]
    if len(notechs_rows) != 15 or len({n["codigo"] for n in notechs}) != 15:
        raise ValueError("PTO_EXPECTED_15_NOTECHS")
    legs = (
        "<p>Esta sessão funcional não possui atribuição PF A/B na tabela canônica; "
        "aplicar as funções conforme seu objetivo e os registros previstos no PTO.</p>"
        if functional else
        "<p>Posições 1–9: perna 1 — PF A. Posições 10–18: perna 2 — PF B. "
        "A troca PF/PM deve ocorrer em solo conforme o PTO; respeitar a "
        "estrutura de duas pernas completas prevista no programa.</p>"
    )
    return "\n".join([
        "<!doctype html>",
        '<html lang="pt-BR"><head><meta charset="utf-8">',
        f"<title>Guia curricular PTO V18 — {esc(code)}</title>",
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<style>body{font:15px/1.5 Arial,sans-serif;max-width:1050px;margin:28px auto;padding:0 14px;color:#17243a}'
        'header{border-bottom:3px solid #213b58;margin-bottom:20px}h1{font-size:1.55rem}'
        'h2{font-size:1.15rem;margin-top:26px}table{width:100%;border-collapse:collapse;font-size:13px}'
        'td,th{border:1px solid #8895a4;padding:6px;vertical-align:top;text-align:left}'
        'thead{background:#e9eef4}tr{break-inside:avoid}.meta{background:#f1f4f7;padding:12px}'
        '.note{padding:12px;border-left:3px solid #60738e;background:#f4f6f8}'
        '@media print{@page{size:A4;margin:14mm}body{margin:0;padding:0}h2{break-after:avoid}}'
        '</style></head><body>',
        "<header><p><strong>PTO Rev.10 V18 — Costa do Sol</strong></p>",
        "<h1>Guia de referência curricular do instrutor</h1>",
        f"<h2>{esc(code)} — {esc(title)}</h2></header>",
        '<section class="meta">',
        f"<p><strong>Âmbito:</strong> {esc(aircraft)}"
        f" | <strong>Duração definida no PTO:</strong> {esc(session['carga'])}</p>",
        f"<p><strong>Fonte normativa:</strong> PRG-OPS-001 PTO Rev.10 V18"
        f" | SHA-256 {SOURCE_SHA}</p>",
        "<p>Este documento reproduz a matriz curricular aprovada no PTO. "
        "Não acrescenta manobras, panes, parâmetros ou procedimentos de manuais técnicos.</p>",
        "</section>",
        "<h2>Condução curricular da sessão</h2>",
        legs,
        "<p>Conforme as Seções 2.2.6 e 4 do PTO, registrar a identificação do "
        "tripulante e instrutor, o dispositivo e sua configuração, as atividades "
        "executadas, condições simuladas, avaliação por item, NOTECHS, "
        "debriefing, resultado e assinaturas aplicáveis.</p>",
        "<p>LOFT e Check são eventos de verificação distintos da instrução. "
        "Durante o Check não há instrução nem coaching; se for necessário "
        "treinamento corretivo, a avaliação deverá ser interrompida "
        "(PTO Seção 4).</p>",
        "<table><thead><tr><th>Ordem</th><th>Perna prevista no PTO</th><th>Código</th>"
        "<th>Manobra / atividade prevista no PTO</th></tr></thead><tbody>",
        *cells,
        "</tbody></table>",
        "<h2>NOTECHS — 15 elementos do PTO</h2>",
        "<p>Observar os elementos ao longo do cenário e registrar cada avaliação em bloco próprio, "
        "segundo a Seção 4.2 do PTO. A nota satisfatória mínima por elemento é 6, "
        "sem compensação pela média.</p>",
        "<table><thead><tr><th>Código</th><th>Elemento</th><th>Categoria</th>"
        "<th>Evidência observável prevista no PTO</th></tr></thead><tbody>",
        *notechs_rows,
        "</tbody></table>",
        '<section class="note"><h2>Limites desta reprodução</h2>',
        "<p>Utilizar os procedimentos, checklists, limitações e configuração FSTD aplicáveis "
        "na documentação controlada da operadora. Este espelho não substitui RFM, QRH, "
        "SOP, FTV ou a avaliação do instrutor. Qualquer detalhamento de cenário não previsto "
        "no PTO deve ter sua própria fonte identificada, sem alterar a matriz canônica.</p>",
        "</section></body></html>",
    ])


def build(output, source_docx=None):
    aircraft, functional, notechs = _checked_source(source_docx)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    names = set()
    for session, is_functional in [(s, False) for s in aircraft] + [(s, True) for s in functional]:
        code = session["codigo"]
        filename = code.replace("/", "_") + ".html"
        if filename in names or "/" in filename or ".." in filename:
            raise ValueError(f"PTO_DUPLICATE_OR_UNSAFE_GUIDE_NAME: {filename}")
        names.add(filename)
        content = render_guide(session, notechs, functional=is_functional)
        data = content.encode("utf-8")
        (output / filename).write_bytes(data)
        entries.append({
            "codigo": code, "arquivo": filename, "aeronave": ("FUNCIONAL" if is_functional else session["aeronave"]),
            "titulo": session["titulo"], "carga_pto": session["carga"],
            "posicoes": len(session["itens"]), "notechs": len(notechs),
            "html_sha256": hashlib.sha256(data).hexdigest(),
        })
    if len(entries) != 88 or sum(row["posicoes"] for row in entries) != 1584:
        raise ValueError("PTO_GUIDE_MIRROR_COUNT_MISMATCH")
    manifest = {
        "status": "CANONICAL_PTO_MIRROR_CREATED",
        "source_sha256": SOURCE_SHA, "guides": len(entries),
        "positions": 1584, "notechs_per_guide": 15,
        "publication_note": "Espelho curricular normativo; sem aprovação artificial de cenários complementares",
        "entries": entries,
    }
    (output / "manifesto_guias_pto_v18.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--pto", type=Path, default=None, help="Conferir contra DOCX canônico original")
    args = parser.parse_args()
    result = build(args.out, args.pto)
    print(json.dumps({k: v for k, v in result.items() if k != "entries"}, ensure_ascii=False, indent=2))
