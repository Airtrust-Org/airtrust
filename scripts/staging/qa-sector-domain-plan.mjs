const QA_SECTOR_DOMAIN_RULES = [
  { pattern: /^Setor QA Examinador$/, domain: 'OPERACOES' },
  { pattern: /^AIRTRUST-QA-FINAL-\d+ Operações$/, domain: 'OPERACOES' },
  { pattern: /^AIRTRUST-QA-FINAL-\d+ Manutenção$/, domain: 'MANUTENCAO' },
];

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function planQaSectorClassifications(setores) {
  if (!Array.isArray(setores)) {
    throw new Error('lista de setores não classificados inválida');
  }

  const seenIds = new Set();
  return setores.map((setor) => {
    const id = positiveInt(setor?.id);
    const name = String(setor?.nome || '').trim();
    if (!id) throw new Error(`setor QA sem id válido: ${name || 'sem nome'}`);
    if (seenIds.has(id)) throw new Error(`setor QA duplicado na resposta: ${id}`);
    seenIds.add(id);

    const rule = QA_SECTOR_DOMAIN_RULES.find(({ pattern }) => pattern.test(name));
    if (!rule) throw new Error(`setor não reconhecido no bootstrap QA: ${name || id}`);
    return { id, name, domain: rule.domain };
  });
}
