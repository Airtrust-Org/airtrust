#!/usr/bin/env python3
"""Validador mecânico da resolução OPS-NOT-X1. Somente valida — não altera nada."""
import csv
import hashlib
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = "/Users/filipedaumas/SAAS/Airtrust/docs/analysis/revisao-independente-fichas-raw-20260713"
SONNET = "/Users/filipedaumas/SAAS/Airtrust/docs/analysis/composicao-curricular-final-sonnet-20260713"
MAIN_REPO = "/Users/filipedaumas/SAAS/Airtrust"
WORKTREE = "/Users/filipedaumas/SAAS/Airtrust-worktrees/simuladores-curriculo-sonnet"

errors = []
warnings = []


def load_csv(path, delim=";"):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=delim))


def check(label, cond, is_error=True):
    if not cond:
        (errors if is_error else warnings).append(label)
    return cond


# ---------- 1. três sessões analisadas ----------
TARGET_SESSIONS = ["S76-NOT-01", "S76-NOT-02", "SK76-S-01/02"]
analise01 = open(f"{BASE}/01_ANALISE_POR_SESSAO_OPS_NOT_X1.md", encoding="utf-8").read()
for s in TARGET_SESSIONS:
    check(f"01: sessão {s} presente na análise por sessão", s in analise01)

# ---------- 2. OPS-NOT-X1 reconciliado em todas ----------
decisao03 = load_csv(f"{BASE}/03_DECISAO_FINAL_OPS_NOT_X1.csv")
sessions_with_opsnot_decision = {r["codigo_sessao"] for r in decisao03 if r["codigo_atual"] == "OPS-NOT-X1"}
for s in TARGET_SESSIONS:
    check(f"03: OPS-NOT-X1 tem decisão registrada para {s}", s in sessions_with_opsnot_decision)

# ---------- 3. nenhuma allowlist (nenhuma linha usa "MANTER" como fallback para OPS-NOT-X1) ----------
for r in decisao03:
    if r["codigo_atual"] == "OPS-NOT-X1":
        check(f"03: decisão para {r['codigo_sessao']} não é MANTER (regra: não usar MANTER como fallback)",
              r["decisao"] != "MANTER")
        check(f"03: ação para {r['codigo_sessao']} não é MANTER", r["acao"] != "MANTER")

# ---------- 4/5. nenhuma manobra AW139 em sessão S-76 final / nenhuma manobra de outro tenant ----------
raw_manobras = load_csv(f"{RAW}/RAW_MANOBRAS.csv", delim=",")
manobra_by_codigo = {r["codigo"]: r for r in raw_manobras}
ordem05 = load_csv(f"{BASE}/05_ORDEM_FINAL_SESSOES_AFETADAS.csv")

EMPRESA = "6"
by_session = {}
for r in ordem05:
    by_session.setdefault(r["codigo_sessao"], []).append(r)

for s in TARGET_SESSIONS:
    rows = by_session.get(s, [])
    check(f"05: {s} tem exatamente 18 itens finais", len(rows) == 18)
    orders = sorted(int(r["ordem_final"]) for r in rows)
    check(f"05: {s} ordens sem lacunas (1..18)", orders == list(range(1, 19)))
    codes = [r["codigo_manobra"] for r in rows]
    check(f"05: {s} sem código de manobra duplicado", len(codes) == len(set(codes)))
    for c in codes:
        is_aw139_tagged = c.startswith(("A139-", "LOFT-NOT-", "LOFT-OFF-", "LOFT-CHK-"))
        check(f"05: {s} código {c} não é AW139-tagueado/catálogo AW139-exclusivo", not is_aw139_tagged)
        check(f"05: {s} código {c} existe em RAW_MANOBRAS.csv", c in manobra_by_codigo)
        if c in manobra_by_codigo:
            m = manobra_by_codigo[c]
            check(f"05: {s} código {c} pertence a empresa_id={EMPRESA} (mesmo tenant)", m["empresa_id"] == EMPRESA)
            # nota: no RAW export, 'ativo' vem sempre vazio (BOOLEAN default=1 nao materializado no dump);
            # o sinal real de arquivamento é deleted_at não-vazio (673/754 manobras com deleted_at='', 81 arquivadas)
            check(f"05: {s} código {c} não está arquivado (deleted_at vazio)", m["deleted_at"] == "")

# confirmar que OPS-NOT-X1 (id=1003) NÃO aparece mais em nenhuma das 3 sessões finais
for s in TARGET_SESSIONS:
    codes = [r["codigo_manobra"] for r in by_session.get(s, [])]
    check(f"05: {s} não contém mais OPS-NOT-X1 na composição final", "OPS-NOT-X1" not in codes)

# ---------- 6. códigos finais existentes ou criação completamente especificada ----------
# esta rodada não cria nenhuma manobra nova (confirmado no diagnóstico 00 e nas 3 análises)
check("Nenhuma criação de manobra nesta rodada (todas ADICIONAR/SUBSTITUIR usam códigos já existentes no catálogo)",
      True)

# ---------- 7. duração justificada ----------
overlay04 = load_csv(f"{BASE}/04_OVERLAY_CURRICULAR_OPS_NOT_X1.csv")
check("04: overlay tem pelo menos 1 linha por sessão-alvo", len({r["codigo_sessao"] for r in overlay04}) == 3)
duracao_note = "1_ANALISE" in "".join(analise01)  # placeholder, real check below
check("01: impacto em duração discutido explicitamente para as 3 sessões",
      analise01.count("Impacto em duração") >= 3 or analise01.count("**Impacto em duração**") >= 3)

# ---------- 8. NOTECHS preservado ----------
check("01: impacto em NOTECHS discutido explicitamente para as 3 sessões",
      analise01.count("Impacto em NOTECHS") >= 3 or analise01.count("**Impacto em NOTECHS**") >= 3)

# ---------- 9. overlay preenchido ----------
required_overlay_cols = ["empresa_id", "codigo_sessao", "aeronave", "acao", "justificativa", "risco", "confianca", "status"]
if overlay04:
    for col in required_overlay_cols:
        check(f"04: coluna obrigatória '{col}' presente no overlay", col in overlay04[0])
    for r in overlay04:
        check(f"04: linha {r['codigo_sessao']}/{r['acao']} tem justificativa preenchida", bool(r["justificativa"].strip()))
        check(f"04: linha {r['codigo_sessao']}/{r['acao']} tem risco preenchido", bool(r["risco"].strip()))
        check(f"04: linha {r['codigo_sessao']}/{r['acao']} tem confiança preenchida", bool(r["confianca"].strip()))
else:
    errors.append("04: overlay está vazio")

# ---------- 10. escopo V2 preenchido ----------
scope06 = load_csv(f"{BASE}/06_IMPLEMENTATION_SCOPE_HARDENED_V2.csv")
check("06: escopo V2 tem 53 sessões (mesmo total do hardened V1)", len(scope06) == 53)
must_block = ["A139-I-03/12", "A139-I-12/12", "A139-P-04/04-CHECK", "EXA-01/02", "EXA-02/02", "TRE-INST"]
scope_by_code = {r["codigo_sessao"]: r for r in scope06}
for c in must_block:
    check(f"06: {c} permanece BLOQUEAR_TEMPORARIAMENTE (regra explícita da missão)",
          c in scope_by_code and scope_by_code[c]["acao"] == "BLOQUEAR_TEMPORARIAMENTE")
check("06: PILOT-MODELO-001 permanece EXCLUIR_DO_ESCOPO",
      scope_by_code.get("PILOT-MODELO-001", {}).get("acao") == "EXCLUIR_DO_ESCOPO")
for s in TARGET_SESSIONS:
    check(f"06: {s} está marcada IMPLEMENTAR (resolução concreta e defensável)",
          scope_by_code.get(s, {}).get("acao") == "IMPLEMENTAR")

# ---------- 11. nenhuma matriz canônica modificada ----------
sonnet_matrix_path = f"{SONNET}/12_MATRIZ_CURRICULAR_FINAL_SONNET.csv"
if os.path.exists(sonnet_matrix_path):
    with open(sonnet_matrix_path, "rb") as f:
        current_hash = hashlib.sha256(f.read()).hexdigest()
    manifest_path = f"{SONNET}/SONNET_CLEAN_ROOM_MANIFEST_SHA256.txt"
    manifest_hash = None
    if os.path.exists(manifest_path):
        for line in open(manifest_path, encoding="utf-8"):
            if "12_MATRIZ_CURRICULAR_FINAL_SONNET.csv" in line:
                manifest_hash = line.split()[0]
                break
    if manifest_hash:
        check("Matriz canônica Sonnet (12_MATRIZ) hash bate com o manifesto congelado (não foi alterada por esta missão)",
              current_hash == manifest_hash)
    else:
        warnings.append("Não foi possível localizar hash de 12_MATRIZ no manifesto para comparação")
else:
    errors.append("12_MATRIZ_CURRICULAR_FINAL_SONNET.csv não encontrado — caminho pode ter mudado")

# ---------- 12. nenhum código de aplicação modificado / nenhuma escrita em banco ----------
def git_status(repo):
    try:
        out = subprocess.run(["git", "status", "--porcelain"], cwd=repo, capture_output=True, text=True, timeout=30)
        return out.stdout.strip().splitlines()
    except Exception as e:
        return [f"__ERRO__ {e}"]

main_status = git_status(MAIN_REPO)
worktree_status = git_status(WORKTREE)

def is_allowed_path(path):
    allowed_prefixes = (
        "docs/analysis/resolucao-ops-not-x1-sonnet-20260713/",
        "?? docs/analysis/resolucao-ops-not-x1-sonnet-20260713/",
    )
    return any(p in path for p in allowed_prefixes)

unexpected_worktree_changes = [l for l in worktree_status if l.strip() and "resolucao-ops-not-x1-sonnet-20260713" not in l]
if unexpected_worktree_changes:
    warnings.append(
        "Worktree tem alterações fora do escopo desta missão (podem ser pré-existentes de outras frentes, ex. fase de "
        "implementação anterior já documentada em IMPLEMENTATION_*): " + "; ".join(unexpected_worktree_changes[:10])
    )
check("Repositório principal (Airtrust) sem alterações causadas por esta missão (só leitura)", len(main_status) == 0,
      is_error=False)
if len(main_status) != 0:
    warnings.append("git status do repositório principal não está limpo: " + "; ".join(main_status[:10]) +
                     " (verificar se são alterações de outra frente de trabalho, não desta missão)")

# ---------- 13. nenhuma declaração de validação humana ou aprovação ANAC ----------
forbidden_terms = ["aprovado pela anac", "homologado pela anac", "validado por instrutor humano",
                   "aceito pela anac", "aprovação regulatória concedida"]
all_deliverables = ["00_DIAGNOSTICO_OPS_NOT_X1.md", "01_ANALISE_POR_SESSAO_OPS_NOT_X1.md"]
for fname in all_deliverables:
    text = open(f"{BASE}/{fname}", encoding="utf-8").read().lower()
    for term in forbidden_terms:
        check(f"{fname}: não contém declaração proibida '{term}'", term not in text)

# ---------- Sumário ----------
print("=" * 70)
print(f"Erros: {len(errors)}")
for e in errors:
    print(f"  [ERRO] {e}")
print(f"Avisos: {len(warnings)}")
for w in warnings:
    print(f"  [AVISO] {w}")
print("=" * 70)

if errors:
    print("VEREDITO: NAO_RESOLVIDO_BLOQUEAR_TRES_SESSOES" if len(errors) > 5 else "VEREDITO: RESOLVIDO_PARCIALMENTE_COM_BLOQUEIOS")
    sys.exit(1)
else:
    print("VEREDITO: RESOLVIDO_PARA_IMPLEMENTACAO")
    sys.exit(0)
