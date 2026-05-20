import re

with open('src/react-app/pages/escalas/components/EscalaCalendario/BlocoAeronave.tsx', 'r') as f:
    content = f.read()

pattern = r"""return \(\s*<td\s*key={`\$\{linha\.id\}-\$\{diaIso\}`}\s*className={`relative[^`]*`}\s*onClick={[^{}]*{[^}]*}[^}]*}\s*onDragOver={[^{}]*{[^}]*}[^}]*}\s*onDrop={[^{}]*{[^}]*(?:{[^{}]*(?:{[^{}]*}[^{}]*)*}[^{}]*)*[^}]*}[^}]*}>\s*{ativo && \(\s*<div[^>]*>\s*<\/div>\s*\)}\s*{gapDoSlot && !ativo && \(\s*<div[^>]*>\s*<\/div>\s*\)}\s*{eventos\.length > 0 && \(\s*<div[^>]*>\s*<CelulaEvento[^>]*\/>\s*<\/div>\s*\)}\s*<\/td>\s*\);"""

# A more robust regex that just replaces the `return (<td...> ... </td>);` inside the map.
# Let's find the `diasDoMes.map` part directly.

def replace_map_func(match):
    return """return (
            <DayCell
              key={`${linha.id}-${diaIso}`}
              date={dia}
              mesReferencia={escala.mes}
              anoReferencia={escala.ano}
              ativo={ativo}
              corAtivo={cor}
              isAvulsa={semAeronave}
              eventos={eventos}
              gapDoSlot={gapDoSlot}
              draggable={modoEdicao && eventos.length > 0}
              onDragStart={dragHandlers?.onDragStart && eventos.length > 0 ? (e) => dragHandlers.onDragStart!(e, eventos[0]) : undefined}
              onDragEnd={dragHandlers?.onDragEnd}
              onClick={() => {
                if (eventos.length > 0) {
                  abrirModal({ tipo: 'detalhes-evento', eventoId: eventos[0].id });
                  return;
                }
                if (modoEdicao) {
                  abrirModal({
                    tipo: 'adicionar-evento',
                    escalaId: escala.id,
                    funcionarioId: linha.funcionarioId,
                    data: diaIso,
                  });
                }
              }}
              onDragOver={(event) => {
                if (!onMoverEvento) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!onMoverEvento) return;
                event.preventDefault();
                try {
                  const payload = JSON.parse(event.dataTransfer.getData('text/plain')) as any;
                  const inicioAnterior = parseISO(payload.inicio);
                  const fimAnterior = parseISO(payload.fim);
                  const duracao = Math.max(
                    0,
                    Math.round((fimAnterior.getTime() - inicioAnterior.getTime()) / 86400000),
                  );
                  const novoFim = new Date(`${diaIso}T00:00:00`);
                  novoFim.setDate(novoFim.getDate() + duracao);
                  onMoverEvento(payload.id, diaIso, novoFim.toISOString().slice(0, 10));
                } catch {
                  return;
                }
              }}
            />
          );"""

content_new = re.sub(r'return \(\s*<td\s*key={`\$\{linha\.id\}-\$\{diaIso\}`}.*?<\/td>\s*\);', replace_map_func, content, flags=re.DOTALL)

with open('src/react-app/pages/escalas/components/EscalaCalendario/BlocoAeronave.tsx', 'w') as f:
    f.write(content_new)

print("done")
