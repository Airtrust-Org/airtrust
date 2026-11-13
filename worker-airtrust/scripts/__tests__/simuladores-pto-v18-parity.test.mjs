import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  PTO_V18_SHA256,
  assertPtoV18CurricularParity,
  assertPtoV18SessionLoad,
} from '../lib/simuladores-pto-v18-parity.mjs';

function fixture() {
  const contract = [];
  const projection = {
    aeronaves: { AW139: { sessoes: [] }, S76: { sessoes: [] } },
    notechs: Array.from({ length: 15 }, (_, i) => ({ codigo: `NTS-${i}` })),
  };
  for (const [aircraft, count, prefix] of [['AW139', 37, 'A139'], ['S76', 45, 'S76']]) {
    for (let number = 1; number <= count; number += 1) {
      const code = `${prefix}-TEST-${number}`;
      const items = Array.from({ length: 18 }, (_, n) => ({
        ordem: n + 1,
        codigo: `${prefix}-MAN-${number}-${n + 1}`,
        nome: `Procedimento ${n + 1}`,
        perna: n < 9 ? '1 - PF A' : '2 - PF B',
      }));
      contract.push({ codigo: code, titulo: `Sessão ${number}`, aeronave: aircraft, carga: '2 horas', itens: items });
      projection.aeronaves[aircraft].sessoes.push({
        codigo: code, titulo: `Sessão ${number}`,
        carga_sessao: '2 horas', duracao_estimada_minutos: 120,
        itens_tecnicos: items.map(({ perna, ...item }) => ({ ...item, perna_pf: perna })),
      });
    }
  }
  const contractSha256 = createHash('sha256').update(JSON.stringify(contract)).digest('hex');
  return {
    projection, contract, contractSha256,
    sourceManifest: { sha256_fonte: PTO_V18_SHA256, sha256_contrato: contractSha256, status: 'NAO_APROVADO_NAO_IMPORTAVEL_NAO_PUBLICAVEL' },
  };
}

test('V18: 82 sessões e 1476 vínculos exatos podem passar no gate curricular', () => {
  const result = assertPtoV18CurricularParity(fixture());
  assert.deepEqual([result.sessions, result.technical_links, result.notechs], [82, 1476, 15]);
  assert.equal(result.level, 'CURRICULAR_PARITY_ONLY');
});

test('V18: não aceita fonte normativa adulterada', () => {
  const input = fixture();
  input.sourceManifest.sha256_fonte = 'invalid';
  assert.throws(() => assertPtoV18CurricularParity(input), /hash da fonte/);
});

test('V18: contrato alterado sem reemitir checksum falha fechado', () => {
  const input = fixture();
  input.contract[0].titulo = 'Título adulterado';
  const trueHash = createHash('sha256').update(JSON.stringify(input.contract)).digest('hex');
  input.contractSha256 = trueHash;
  assert.throws(() => assertPtoV18CurricularParity(input), /checksum do contrato/);
});

test('V18: contrato antigo 66 sessões não satisfaz o PTO', () => {
  const input = fixture();
  input.projection.aeronaves.AW139.sessoes.length = 31;
  assert.throws(() => assertPtoV18CurricularParity(input), /AW139: esperadas 37 sessões/);
});

test('V18: não aceita código técnico divergente', () => {
  const input = fixture();
  input.projection.aeronaves.AW139.sessoes[0].itens_tecnicos[8].codigo = 'CODIGO-LEGADO';
  assert.throws(() => assertPtoV18CurricularParity(input), /código divergente na posição 9/);
});

test('V18: não aceita troca de exercício por semelhança de nomes', () => {
  const input = fixture();
  input.projection.aeronaves.S76.sessoes[0].itens_tecnicos[5].nome = 'Procedimento parecido';
  assert.throws(() => assertPtoV18CurricularParity(input), /descrição divergente/);
});

test('V18: distribuição PF errada bloqueia pacote', () => {
  const input = fixture();
  input.projection.aeronaves.AW139.sessoes[0].itens_tecnicos[9].perna_pf = '1 - PF A';
  assert.throws(() => assertPtoV18CurricularParity(input), /perna PF divergente/);
});

test('V18: sessão extra ou duplicada bloqueia pacote', () => {
  const input = fixture();
  input.projection.aeronaves.S76.sessoes[3].codigo = input.projection.aeronaves.S76.sessoes[2].codigo;
  assert.throws(() => assertPtoV18CurricularParity(input), /modelo duplicado/);
});

test('V18: NOTECHS ausente bloqueia pacote', () => {
  const input = fixture();
  input.projection.notechs.pop();
  assert.throws(() => assertPtoV18CurricularParity(input), /NOTECHS incompleto/);
});

test('V18: três horas canônicas não podem ser substituídas por uma hora', () => {
  const input = fixture();
  input.contract[0].carga = '3 horas';
  input.projection.aeronaves.AW139.sessoes[0].carga_sessao = '1 hora';
  input.projection.aeronaves.AW139.sessoes[0].duracao_estimada_minutos = 60;
  assert.throws(() => assertPtoV18CurricularParity(input), /carga da sessão divergente/);
});

test('V18: duas horas práticas em FFS aceitam duas horas no modelo simulador', () => {
  assert.equal(assertPtoV18SessionLoad({
    code: 'A139-I-12/12', canonical: '2 horas práticas em FFS',
    projected: '2 horas', projectedMinutes: 120,
  }).session_minutes, 120);
});

test('V18: competência noturna mínima de 90 minutos aceita duração correspondente', () => {
  assert.equal(assertPtoV18SessionLoad({
    code: 'S76-NOT-01', canonical: '90 minutos (mínimo)',
    projected: '90 minutos', projectedMinutes: 90,
  }).session_minutes, 90);
});

test('V18: recuperação exige prática e solo, não basta declarar duas horas genéricas', () => {
  assert.throws(() => assertPtoV18SessionLoad({
    code: 'A139-REC-01',
    canonical: '1 hora prática (mínimo); 1 hora de solo associada',
    projected: '2 horas', projectedMinutes: 120,
  }), /carga da sessão divergente/);
  assert.equal(assertPtoV18SessionLoad({
    code: 'A139-REC-01',
    canonical: '1 hora prática (mínimo); 1 hora de solo associada',
    projected: '1 hora prática (mínimo); 1 hora de solo associada',
    projectedMinutes: 120,
  }).session_minutes, 120);
});

test('V18: 3h na carga mas 60 minutos no plano não podem passar', () => {
  assert.throws(() => assertPtoV18SessionLoad({
    code: 'S76-P-AD-01/01-C1',
    canonical: '3 horas', projected: '3 horas',
    projectedMinutes: 60,
  }), /duração estimada em minutos divergente/);
});

test('V18: rejeita carga canônica ou projetada desconhecida', () => {
  assert.throws(() => assertPtoV18SessionLoad({
    code: 'S76-I-01/12', canonical: '2.5 horas',
    projected: '2.5 horas',
  }), /carga canônica PTO desconhecida/);
  assert.throws(() => assertPtoV18SessionLoad({
    code: 'S76-I-01/12', canonical: '2 horas',
    projected: '',
  }), /carga da sessão divergente/);
});
