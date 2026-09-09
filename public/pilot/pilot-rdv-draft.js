export const PILOT_DRAFT_SCHEMA_VERSION = 1;

export function toInputDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function fromInputDateTime(value) {
  if (!String(value || '').trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

export function toInputNumber(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function parseNumber(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function parseInteger(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const number = Number.parseInt(trimmed, 10);
  return Number.isFinite(number) ? number : null;
}

export function calcHorasVoadas(decolagemLocal, pousoLocal) {
  if (!String(decolagemLocal || '').trim() || !String(pousoLocal || '').trim()) return null;
  const start = new Date(decolagemLocal);
  const end = new Date(pousoLocal);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return Number(((end.getTime() - start.getTime()) / 3_600_000).toFixed(2));
}

export function calcConsumoCombustivel(decolagem, pouso) {
  if (decolagem === null || pouso === null) return null;
  return Number((decolagem - pouso).toFixed(3));
}

export function formatRdvNumero(dataVoo, prefixo) {
  const compactDate = String(dataVoo || '').split('-').join('');
  const compactPrefix = String(prefixo || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return 'RDV-' + compactDate + '-' + compactPrefix;
}

export function assertPackageIdentity(packageData) {
  const tenantId = Number(packageData?.identity?.tenant_id || 0);
  const userId = Number(packageData?.identity?.user_id || 0);
  const flightId = Number(packageData?.voo?.id || 0);
  const packageId = packageData?.contract?.package_id;

  if (!tenantId || !userId || !flightId || !packageId) {
    throw new Error(
      'Pacote sem identidade suficiente para preparar rascunho operacional. Atualize o voo online.',
    );
  }

  return {
    tenantId,
    userId,
    funcionarioId:
      packageData?.identity?.funcionario_id == null
        ? null
        : Number(packageData.identity.funcionario_id),
    flightId,
    packageId: String(packageId),
  };
}

export function buildRdvFormFromPackage(packageData) {
  const voo = packageData?.voo || {};
  const rdv = packageData?.rdv || null;
  const dataVoo = rdv?.data_voo || voo.data_programacao || '';

  return {
    numero: rdv?.numero || formatRdvNumero(dataVoo, voo.prefixo),
    data_voo: dataVoo,
    horario_decolagem_real: toInputDateTime(rdv?.horario_decolagem_real),
    horario_pouso_real: toInputDateTime(rdv?.horario_pouso_real),
    horas_voadas: toInputNumber(rdv?.horas_voadas),
    numero_pousos: toInputNumber(rdv?.numero_pousos),
    ciclos: toInputNumber(rdv?.ciclos),
    combustivel_decolagem: toInputNumber(rdv?.combustivel_decolagem),
    combustivel_pouso: toInputNumber(rdv?.combustivel_pouso),
    combustivel_consumo: toInputNumber(rdv?.combustivel_consumo),
    pob: toInputNumber(rdv?.pob),
    carga_kg: toInputNumber(rdv?.carga_kg),
    ocorrencias: rdv?.ocorrencias || '',
    divergencias: rdv?.divergencias || '',
  };
}

function defaultStageFromPackage(packageData) {
  const voo = packageData?.voo || {};
  const origem = packageData?.origem?.codigo_icao || packageData?.origem?.codigo || '';
  const destino = packageData?.destino?.codigo_icao || packageData?.destino?.codigo || '';

  return {
    source_stage_id: null,
    local_id: 'local-stage-1',
    numero_etapa: 1,
    origem_icao: origem,
    destino_icao: destino,
    horario_motor_ligado: '',
    horario_decolagem: toInputDateTime(voo.horario_real_partida || voo.horario_previsto_partida),
    horario_pouso: toInputDateTime(voo.horario_real_chegada || voo.horario_previsto_chegada),
    horario_motor_desligado: '',
    tempo_ifr: '',
    tempo_noturno: '',
    pousos_diurnos: '',
    pousos_noturnos: '',
    starts: '',
    pax: '',
    payload: '',
    combustivel_inicio: '',
    combustivel_fim: '',
    unidade_combustivel: '',
    observacao_local: '',
  };
}

export function buildStageDraftsFromPackage(packageData) {
  const stages = Array.isArray(packageData?.etapas) ? packageData.etapas : [];
  if (stages.length === 0) return [defaultStageFromPackage(packageData)];

  return stages.map((stage, index) => ({
    source_stage_id: Number(stage.id),
    local_id: 'stage-' + String(stage.id),
    numero_etapa: Number(stage.numero_etapa || index + 1),
    origem_icao: stage.origem_icao || '',
    destino_icao: stage.destino_icao || '',
    horario_motor_ligado: toInputDateTime(stage.horario_motor_ligado),
    horario_decolagem: toInputDateTime(stage.horario_decolagem),
    horario_pouso: toInputDateTime(stage.horario_pouso),
    horario_motor_desligado: toInputDateTime(stage.horario_motor_desligado),
    tempo_ifr: toInputNumber(stage.tempo_ifr),
    tempo_noturno: toInputNumber(stage.tempo_noturno),
    pousos_diurnos: toInputNumber(stage.pousos_diurnos),
    pousos_noturnos: toInputNumber(stage.pousos_noturnos),
    starts: toInputNumber(stage.starts),
    pax: toInputNumber(stage.pax),
    payload: toInputNumber(stage.payload),
    combustivel_inicio: toInputNumber(stage.combustivel_inicio),
    combustivel_fim: toInputNumber(stage.combustivel_fim),
    unidade_combustivel: stage.unidade_combustivel || '',
    observacao_local: '',
  }));
}

export function buildDraftSnapshot(packageData, previousSequence = 0) {
  const identity = assertPackageIdentity(packageData);
  const nextSequence = Number(previousSequence || 0);
  const now = new Date().toISOString();

  return {
    rdv: {
      schema_version: PILOT_DRAFT_SCHEMA_VERSION,
      entity_type: 'rdv_draft',
      entity_local_id: 'flight:' + identity.flightId + ':rdv',
      flight_id: identity.flightId,
      tenant_id: identity.tenantId,
      user_id: identity.userId,
      funcionario_id: identity.funcionarioId,
      source_package_id: identity.packageId,
      source_rdv_id: packageData?.rdv?.id ?? null,
      source_rdv_version: Number(packageData?.rdv?.versao || 0),
      source_flight_version: Number(packageData?.voo?.versao || 0),
      local_sequence: nextSequence,
      updated_at_claimed: now,
      form: buildRdvFormFromPackage(packageData),
    },
    stages: buildStageDraftsFromPackage(packageData).map((stage) => ({
      schema_version: PILOT_DRAFT_SCHEMA_VERSION,
      entity_type: 'stage_draft',
      entity_local_id:
        'flight:' + identity.flightId + ':stage:' + String(stage.source_stage_id ?? stage.local_id),
      flight_id: identity.flightId,
      tenant_id: identity.tenantId,
      user_id: identity.userId,
      source_package_id: identity.packageId,
      source_stage_id: stage.source_stage_id,
      source_stage_updated_at:
        packageData?.source_revision?.stages?.find(
          (entry) => Number(entry.id) === Number(stage.source_stage_id),
        )?.updated_at ?? null,
      local_sequence: nextSequence,
      updated_at_claimed: now,
      fields: stage,
    })),
  };
}

export function validateRdvForm(form, packageData) {
  const errors = {};
  const voo = packageData?.voo || {};
  const expectedPrefix = formatRdvNumero(form.data_voo || voo.data_programacao, voo.prefixo);

  if (!String(form.numero || '').trim().toUpperCase().startsWith(expectedPrefix)) {
    errors.numero = 'Número do RDV deve começar com ' + expectedPrefix + '.';
  }

  if (form.horario_decolagem_real && form.horario_pouso_real) {
    if (form.horario_pouso_real < form.horario_decolagem_real) {
      errors.horario_pouso_real = 'Pouso não pode ser anterior à decolagem.';
    }
  }

  const fuelStart = parseNumber(form.combustivel_decolagem);
  const fuelEnd = parseNumber(form.combustivel_pouso);
  const fuelUsed = parseNumber(form.combustivel_consumo);
  if (fuelStart !== null && fuelEnd !== null) {
    if (fuelEnd > fuelStart) {
      errors.combustivel_pouso = 'Combustível de pouso não pode ser maior que decolagem.';
    }
    if (fuelUsed !== null) {
      const expected = calcConsumoCombustivel(fuelStart, fuelEnd);
      if (expected !== null && Number(fuelUsed.toFixed(3)) !== expected) {
        errors.combustivel_consumo = 'Consumo deve ser ' + expected + '.';
      }
    }
  }

  return errors;
}

export function validateStageDrafts(stageDrafts) {
  const errors = [];
  const stages = Array.isArray(stageDrafts) ? stageDrafts : [];
  if (stages.length === 0) return ['Adicione ao menos uma etapa.'];

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index]?.fields || stages[index];
    if (!String(stage.origem_icao || '').trim() || !String(stage.destino_icao || '').trim()) {
      errors.push('Etapa ' + (index + 1) + ': informe origem e destino.');
    }
    if (
      stage.horario_decolagem &&
      stage.horario_pouso &&
      stage.horario_pouso < stage.horario_decolagem
    ) {
      errors.push('Etapa ' + (index + 1) + ': pouso anterior à decolagem.');
    }
    if (index > 0) {
      const previous = stages[index - 1]?.fields || stages[index - 1];
      if (
        previous.horario_pouso &&
        stage.horario_decolagem &&
        stage.horario_decolagem < previous.horario_pouso
      ) {
        errors.push('Etapa ' + (index + 1) + ' inicia antes do pouso da etapa ' + index + '.');
      }
    }

    const startFuel = parseNumber(stage.combustivel_inicio);
    const endFuel = parseNumber(stage.combustivel_fim);
    if (startFuel !== null && endFuel !== null && endFuel > startFuel) {
      errors.push('Etapa ' + (index + 1) + ': combustível final maior que inicial.');
    }
  }

  return errors;
}

export function applySafeStageAggregates(form, stageDrafts) {
  const stages = Array.isArray(stageDrafts)
    ? stageDrafts.map((stage) => stage?.fields || stage)
    : [];
  if (stages.length === 0) return { ...form };

  const next = { ...form };
  const first = stages[0];
  const last = stages[stages.length - 1];
  let totalLandings = 0;
  let totalHours = 0;
  let hasHours = false;

  for (const stage of stages) {
    const day = parseInteger(stage.pousos_diurnos) ?? 0;
    const night = parseInteger(stage.pousos_noturnos) ?? 0;
    totalLandings += day + night;
    const hours = calcHorasVoadas(stage.horario_decolagem, stage.horario_pouso);
    if (hours !== null) {
      totalHours += hours;
      hasHours = true;
    }
  }

  if (first.horario_decolagem) next.horario_decolagem_real = first.horario_decolagem;
  if (last.horario_pouso) next.horario_pouso_real = last.horario_pouso;
  if (hasHours) next.horas_voadas = String(Number(totalHours.toFixed(2)));
  if (totalLandings > 0) next.numero_pousos = String(totalLandings);

  if (first.combustivel_inicio !== '') next.combustivel_decolagem = first.combustivel_inicio;
  if (last.combustivel_fim !== '') next.combustivel_pouso = last.combustivel_fim;
  const startFuel = parseNumber(next.combustivel_decolagem);
  const endFuel = parseNumber(next.combustivel_pouso);
  const used = calcConsumoCombustivel(startFuel, endFuel);
  if (used !== null) next.combustivel_consumo = String(used);

  if (last.pax !== '') next.pob = last.pax;
  else if (first.pax !== '') next.pob = first.pax;
  if (last.payload !== '') next.carga_kg = last.payload;
  else if (first.payload !== '') next.carga_kg = first.payload;

  // Ciclos não são derivados de pousos nesta camada offline. O valor só
  // muda quando o piloto o informa explicitamente ou quando uma futura
  // regra governada definir semântica inequívoca.
  return next;
}

export function assertVerifiedLeaseAllowsDraft(packageData, verifiedLease) {
  const identity = assertPackageIdentity(packageData);
  if (!verifiedLease || verifiedLease.verified !== true) {
    throw new Error('Lease offline válido é obrigatório para editar este voo.');
  }

  const claims = verifiedLease.claims || {};
  if (claims.purpose !== 'offline_flight_lease') {
    throw new Error('Lease offline com finalidade inválida.');
  }
  if (Number(claims.tenant_id) !== identity.tenantId) {
    throw new Error('Lease offline pertence a outro tenant.');
  }
  if (Number(claims.user_id) !== identity.userId) {
    throw new Error('Lease offline pertence a outro usuário.');
  }
  if (!Array.isArray(claims.flight_ids) || !claims.flight_ids.map(Number).includes(identity.flightId)) {
    throw new Error('Lease offline não autoriza este voo.');
  }
  if (
    !Array.isArray(claims.allowed_local_actions) ||
    !claims.allowed_local_actions.includes('edit_rdv_draft')
  ) {
    throw new Error('Lease offline não autoriza edição de RDV.');
  }
  if (!claims.valid_until || Date.now() >= new Date(claims.valid_until).getTime()) {
    throw new Error('Lease offline expirado.');
  }
  return true;
}

export function collectFinalizationErrors(packageData, rdvDraft, stageDrafts) {
  const form = rdvDraft?.form || {};
  const errors = [];
  const fieldErrors = validateRdvForm(form, packageData);
  errors.push(...Object.values(fieldErrors));

  const stageErrors = validateStageDrafts(stageDrafts);
  errors.push(...stageErrors);

  if (!String(form.numero || '').trim()) errors.push('Informe o número do RDV.');
  if (!String(form.data_voo || '').trim()) errors.push('Informe a data do voo.');
  if (!String(form.horario_decolagem_real || '').trim()) {
    errors.push('Informe o horário real de decolagem.');
  }
  if (!String(form.horario_pouso_real || '').trim()) {
    errors.push('Informe o horário real de pouso.');
  }
  if (!String(form.combustivel_decolagem || '').trim()) {
    errors.push('Informe o combustível de decolagem.');
  }
  if (!String(form.combustivel_pouso || '').trim()) {
    errors.push('Informe o combustível de pouso.');
  }
  if (!Array.isArray(packageData?.tripulantes) || packageData.tripulantes.length === 0) {
    errors.push('O voo precisa ter ao menos um tripulante vinculado.');
  }

  return [...new Set(errors)];
}

export function buildOfflineSyncPayload(packageData, rdvDraft, stageDrafts) {
  const identity = assertPackageIdentity(packageData);
  const form = rdvDraft.form;

  const normalizedRdv = {
    numero: String(form.numero || '').trim(),
    data_voo: String(form.data_voo || '').trim(),
    horario_decolagem_real: fromInputDateTime(form.horario_decolagem_real),
    horario_pouso_real: fromInputDateTime(form.horario_pouso_real),
    horas_voadas: parseNumber(form.horas_voadas),
    numero_pousos: parseInteger(form.numero_pousos),
    ciclos: parseInteger(form.ciclos),
    combustivel_decolagem: parseNumber(form.combustivel_decolagem),
    combustivel_pouso: parseNumber(form.combustivel_pouso),
    combustivel_consumo: parseNumber(form.combustivel_consumo),
    pob: parseInteger(form.pob),
    carga_kg: parseNumber(form.carga_kg),
    ocorrencias: String(form.ocorrencias || '').trim() || null,
    divergencias: String(form.divergencias || '').trim() || null,
  };

  const normalizedStages = stageDrafts.map((stage) => {
    const fields = stage.fields;
    return {
      source_stage_id: stage.source_stage_id,
      base_server_updated_at: stage.source_stage_updated_at || null,
      numero_etapa: Number(fields.numero_etapa),
      origem_icao: String(fields.origem_icao || '').trim().toUpperCase() || null,
      destino_icao: String(fields.destino_icao || '').trim().toUpperCase() || null,
      horario_motor_ligado: fromInputDateTime(fields.horario_motor_ligado),
      horario_decolagem: fromInputDateTime(fields.horario_decolagem),
      horario_pouso: fromInputDateTime(fields.horario_pouso),
      horario_motor_desligado: fromInputDateTime(fields.horario_motor_desligado),
      tempo_ifr: parseNumber(fields.tempo_ifr),
      tempo_noturno: parseNumber(fields.tempo_noturno),
      pousos_diurnos: parseInteger(fields.pousos_diurnos),
      pousos_noturnos: parseInteger(fields.pousos_noturnos),
      starts: parseInteger(fields.starts),
      pax: parseInteger(fields.pax),
      payload: parseNumber(fields.payload),
      combustivel_inicio: parseNumber(fields.combustivel_inicio),
      combustivel_fim: parseNumber(fields.combustivel_fim),
      unidade_combustivel: String(fields.unidade_combustivel || '').trim() || null,
      timing_events: stage.timing_events || {},
    };
  });

  return {
    contract: {
      name: 'airtrust-pilot-offline-sync-bundle',
      version: 1,
      regulated_edb: false,
      handoff_requested: false,
    },
    identity: {
      tenant_id: identity.tenantId,
      user_id: identity.userId,
      funcionario_id: identity.funcionarioId,
      flight_id: identity.flightId,
    },
    source: {
      package_id: identity.packageId,
      flight_version: Number(rdvDraft.source_flight_version || 0),
      rdv_id: rdvDraft.source_rdv_id ?? null,
      rdv_version: Number(rdvDraft.source_rdv_version || 0),
    },
    rdv: normalizedRdv,
    stages: normalizedStages,
  };
}
