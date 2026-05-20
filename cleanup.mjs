import fs from 'fs';
async function run() {
  const base = 'http://localhost:8787';
  const escalasRes = await fetch(`${base}/api/escalas?ano=2026`);
  const escalas = await escalasRes.json();
  const escalaId = escalas.data.find(e => e.status !== 'arquivada')?.id;
  const alocRes = await fetch(`${base}/api/escalas/${escalaId}/alocacoes`);
  const alocacoes = await alocRes.json();
  const target = alocacoes.data.alocacoes.find(a => a.funcionario_id === '6' && a.data_inicio === '2026-03-01' && a.data_fim === '2026-03-15');
  if (target) {
    console.log(`Deleting ${target.id}`);
    await fetch(`${base}/api/escalas/${escalaId}/alocacoes/${target.id}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer 123' }});
  } else {
    console.log("No test allocation found to delete.");
  }
}
run();
