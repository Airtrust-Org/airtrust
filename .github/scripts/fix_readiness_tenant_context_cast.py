from pathlib import Path

p = Path('worker-airtrust/src/routes/frms-readiness.ts')
text = p.read_text()
old = "getEmpresaId(c as unknown as Context<{ Bindings: Env }>)"
count = text.count(old)
if count != 3:
    raise SystemExit(f'expected 3 tenant casts, got {count}')
text = text.replace(old, "getEmpresaId(c)")
p.write_text(text)
