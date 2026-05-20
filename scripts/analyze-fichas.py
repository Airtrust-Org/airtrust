import sys, json

d = json.load(sys.stdin)
fichas = d.get('data', [])

print('=== FICHAS Feb 27-28 / Mar 01 ===')
target_dates = ['2026-02-27', '2026-02-28', '2026-03-01']
matched = [f for f in fichas if f.get('data_hora', '')[:10] in target_dates]
print(f'Matched: {len(matched)} fichas')
for f in matched:
    print(f'  ID={f["id"]} sessao_id={f.get("agendamento_slot_id")} part={f.get("participante_nome")} status={f.get("status")} data={f.get("data_hora","")[:10]} sim={f.get("simulador_codigo","?")} modelo={f.get("sessao_modelo","?")}')

print()
print('=== ALL fichas by sessao_id ===')
by_sessao = {}
for f in fichas:
    sid = f.get('agendamento_slot_id', '?')
    by_sessao.setdefault(sid, []).append(f)
for sid, fs in sorted(by_sessao.items(), key=lambda x: x[0] if isinstance(x[0], int) else 0, reverse=True):
    dates = set(f.get("data_hora", "")[:10] for f in fs)
    print(f'  Sessao {sid}: {len(fs)} fichas, dates={dates}')
