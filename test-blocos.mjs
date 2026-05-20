import fs from 'fs';

async function run() {
  const base = 'http://localhost:8787';

  try {
    const health = await fetch(`${base}/api/health`);
    console.log('Health:', await health.json());
  } catch (e) {
    console.error("Worker not responding on 8787. Make sure it's running.");
    process.exit(1);
  }

  // 1. Get escalas
  const escalasRes = await fetch(`${base}/api/escalas?ano=2026`);
  const escalas = await escalasRes.json();
  const escalaId = escalas.data.find((e) => e.status !== 'arquivada')?.id;
  if (!escalaId) throw new Error('No open escala found');

  // 2. Get aeronaves
  const aeronavesRes = await fetch(`${base}/api/aeronaves`);
  const aeronaves = await aeronavesRes.json();
  const aeronave = aeronaves.data.find((a) => a.modelo === 'AW139') || aeronaves.data[0];
  if (!aeronave) throw new Error('No aeronave found');

  // 3. Get alocacoes to find free people
  const alocRes = await fetch(`${base}/api/escalas/${escalaId}/alocacoes`);
  const alocacoes = await alocRes.json();
  const ocupados = new Set(alocacoes.data?.alocacoes?.map((a) => a.funcionario_id) || []);

  const tripRes = await fetch(
    `${base}/api/escalas/tripulantes-operacionais?aeronave_id=${aeronave.id}&escala_id=${escalaId}&incluir_bloqueados=true`,
  );
  const tripData = await tripRes.json();

  // Test Bloco 8: Conflito
  console.log(`\n=== TEST BLOCO 8: Conflito ===`);
  const tripApto = tripData.data.tripulantes.find(
    (t) => t.pode_ser_alocado && !ocupados.has(t.funcionario_id),
  );
  if (tripApto) {
    const dataInicio = '2026-03-01';
    const dataFim = '2026-03-15';
    console.log(`Creating first allocation for TF ${tripApto.funcionario_id} / ${tripApto.guerra}`);
    let firstAlocId = null;

    const req1 = await fetch(`${base}/api/escalas/${escalaId}/alocacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer 123' },
      body: JSON.stringify({
        funcionario_id: tripApto.funcionario_id,
        aeronave_id: aeronave.id,
        funcao: 'SIC',
        data_inicio: dataInicio,
        data_fim: dataFim,
      }),
    });
    const body1 = await req1.json();
    console.log(
      'Creation 1 Status:',
      req1.status,
      'Body:',
      body1.error ? body1.error : body1.message,
    );

    if (req1.status === 201 || req1.status === 200) {
      firstAlocId = body1.data?.id;
      console.log(`\nCreating second OVERLAPPING allocation for the same TF`);
      const req2 = await fetch(`${base}/api/escalas/${escalaId}/alocacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer 123' },
        body: JSON.stringify({
          funcionario_id: tripApto.funcionario_id,
          aeronave_id: aeronave.id,
          funcao: 'SIC',
          data_inicio: '2026-03-10',
          data_fim: '2026-03-20',
        }),
      });
      const body2 = await req2.json();
      console.log('Creation 2 Status (Expect 400/409):', req2.status);
      console.log('Creation 2 Body:', JSON.stringify(body2, null, 2));

      // Let's also test slot conflict:
      // Try creating second allocation for the SAME slot (Aeronave AW139, SIC, 01-15) with another tripulante
      const tripApto2 = tripData.data.tripulantes.find(
        (t) =>
          t.pode_ser_alocado &&
          t.funcionario_id !== tripApto.funcionario_id &&
          !ocupados.has(t.funcionario_id),
      );
      if (tripApto2) {
        console.log(
          `\nCreating third allocation for SAME slot with TF ${tripApto2.funcionario_id}`,
        );
        const req3 = await fetch(`${base}/api/escalas/${escalaId}/alocacoes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer 123' },
          body: JSON.stringify({
            funcionario_id: tripApto2.funcionario_id,
            aeronave_id: aeronave.id,
            funcao: 'SIC', // same role, same aeronave
            data_inicio: dataInicio,
            data_fim: dataFim,
          }),
        });
        const body3 = await req3.json();
        console.log('Creation 3 Status (Expect 400/409 Slot):', req3.status);
        console.log('Creation 3 Body:', JSON.stringify(body3, null, 2));
      }

      // Cleanup
      if (firstAlocId) {
        console.log(`\nCleaning up test allocation ${firstAlocId}...`);
        await fetch(`${base}/api/escalas/${escalaId}/alocacoes/${firstAlocId}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer 123' },
        });
        console.log('Cleanup OK');
      }
    } else {
      console.log(
        'Failed to create first test allocation, maybe they already have overlap:',
        body1.error,
      );
    }
  } else {
    console.log('No free tripulante apto found');
  }
}

run().catch(console.error);
