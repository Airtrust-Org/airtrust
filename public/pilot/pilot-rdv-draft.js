export const PILOT_DRAFT_SCHEMA_VERSION = 3;

export function toInputDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function fromInputDateTime(value, flightDate = '') {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    const date = String(flightDate || '').trim();
    return date ? date + 'T' + text + (text.length === 5 ? ':00' : '') : text;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString();
}

export function toInputTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const direct = text.match(/(?:T|^)(\d{2}:\d{2})(?::\d{2})?/);
  if (direct) return direct[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return (
    String(parsed.getHours()).padStart(2, '0') + ':' + String(parsed.getMinutes()).padStart(2, '0')
  );
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

export function formatDurationDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 4);
  if (digits.length < 4) return digits;
  return digits.slice(0, 2) + ':' + digits.slice(2);
}

export function toDurationInput(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';

  const hhmm = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (hhmm) {
    return String(Number(hhmm[1])).padStart(2, '0') + ':' + hhmm[2];
  }

  const hoursMinutes = text.match(/^(\d{1,2})\s*h(?:\s*([0-5]?\d)\s*m?)?$/);
  if (hoursMinutes) {
    const hours = Number(hoursMinutes[1]);
    const minutes = Number(hoursMinutes[2] || 0);
    if (hours >= 24) return '';
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  // Compatibilidade com rascunhos antigos e entrada simples em horas decimais.
  const decimal = Number(text.replace(',', '.'));
  if (!Number.isFinite(decimal) || decimal < 0 || decimal >= 24) return '';
  const totalMinutes = Math.round(decimal * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

export function calcClockDurationHhMm(startValue, endValue) {
  const startText = String(startValue || '').trim();
  const endText = String(endValue || '').trim();
  if (!startText || !endText) return '';
  const clockSeconds = (value) => {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] || 0);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
  };
  const startClock = clockSeconds(startText);
  const endClock = clockSeconds(endText);
  let elapsedSeconds;
  if (startClock !== null && endClock !== null) {
    elapsedSeconds = endClock - startClock;
    if (elapsedSeconds < 0) elapsedSeconds += 24 * 3600;
  } else {
    const start = new Date(startText);
    const end = new Date(endText);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
    elapsedSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
    if (elapsedSeconds < 0) return '';
  }
  const totalMinutes = Math.max(0, Math.round(elapsedSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

export function payloadToKg(value, unit) {
  const numeric = parseNumber(value);
  if (numeric === null) return null;
  const normalizedUnit = String(unit || 'KG')
    .trim()
    .toUpperCase();
  return Number((normalizedUnit === 'LB' ? numeric / 2.2046226218 : numeric).toFixed(3));
}

export function convertWeight(value, fromUnit, toUnit) {
  const numeric = parseNumber(value);
  if (numeric === null) return null;
  const source = String(fromUnit || 'KG').trim().toUpperCase();
  const target = String(toUnit || source).trim().toUpperCase();
  if (source === target) return numeric;
  if (source === 'LB' && target === 'KG') return Number((numeric / 2.2046226218).toFixed(3));
  if (source === 'KG' && target === 'LB') return Number((numeric * 2.2046226218).toFixed(3));
  return null;
}

export function calcStageTotalWeight(fields) {
  const unit = String(fields?.unidade_peso || '').trim().toUpperCase();
  const emptyWeight = parseNumber(fields?.peso_vazio);
  if (!unit || emptyWeight === null) return null;

  let total = emptyWeight;
  for (const key of ['peso_tripulacao', 'peso_passageiros', 'peso_bagagem']) {
    total += parseNumber(fields?.[key]) ?? 0;
  }

  const payload = convertWeight(fields?.payload, fields?.unidade_payload || 'KG', unit);
  if (payload !== null) total += payload;

  const fuel = convertWeight(fields?.combustivel_inicio, fields?.unidade_combustivel, unit);
  if (fuel !== null) total += fuel;

  return Number(total.toFixed(3));
}

export function calcHorasVoadas(decolagemLocal, pousoLocal) {
  const duration = calcClockDurationHhMm(decolagemLocal, pousoLocal);
  if (!duration) return null;
  const [hours, minutes] = duration.split(':').map(Number);
  return Number((hours + minutes / 60).toFixed(2));
}

export function calcConsumoCombustivel(decolagem, pouso) {
  if (decolagem === null || pouso === null) return null;
  return Number((decolagem - pouso).toFixed(3));
}

export function formatRdvNumero(dataVoo, prefixo) {
  const compactDate = String(dataVoo || '')
    .split('-')
    .join('');
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
    horario_motor_ligado: toInputTime(voo.horario_real_partida),
    horario_decolagem: toInputTime(voo.horario_real_partida || voo.horario_previsto_partida),
    horario_pouso: toInputTime(voo.horario_real_chegada || voo.horario_previsto_chegada),
    horario_motor_desligado: toInputTime(voo.horario_real_chegada),
    tempo_decolagem_pouso: '',
    tempo_total: '',
    tempo_ifr: '',
    tempo_noturno: '',
    pousos_diurnos: '',
    pousos_noturnos: '',
    starts: '',
    pax: '',
    payload: '',
    unidade_payload: 'KG',
    combustivel_inicio: '',
    combustivel_fim: '',
    unidade_combustivel: '',
    peso_passageiros: '',
    peso_bagagem: '',
    peso_tripulacao: '',
    peso_vazio: toInputNumber(packageData?.aeronave?.peso_vazio),
    peso_total: '',
    unidade_peso: packageData?.aeronave?.unidade_peso || '',
    observacoes: '',
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
    horario_motor_ligado: toInputTime(stage.horario_motor_ligado),
    horario_decolagem: toInputTime(stage.horario_decolagem),
    horario_pouso: toInputTime(stage.horario_pouso),
    horario_motor_desligado: toInputTime(stage.horario_motor_desligado),
    tempo_decolagem_pouso:
      stage.tempo_decolagem_pouso ||
      calcClockDurationHhMm(toInputTime(stage.horario_decolagem), toInputTime(stage.horario_pouso)),
    tempo_total:
      stage.tempo_total ||
      calcClockDurationHhMm(
        toInputTime(stage.horario_motor_ligado),
        toInputTime(stage.horario_motor_desligado),
      ),
    tempo_ifr: toDurationInput(stage.tempo_ifr),
    tempo_noturno: toDurationInput(stage.tempo_noturno),
    pousos_diurnos: toInputNumber(stage.pousos_diurnos),
    pousos_noturnos: toInputNumber(stage.pousos_noturnos),
    starts: toInputNumber(stage.starts),
    pax: toInputNumber(stage.pax),
    payload: toInputNumber(stage.payload),
    unidade_payload: 'KG',
    combustivel_inicio: toInputNumber(stage.combustivel_inicio),
    combustivel_fim: toInputNumber(stage.combustivel_fim),
    unidade_combustivel: stage.unidade_combustivel || '',
    peso_passageiros: toInputNumber(stage.peso_passageiros),
    peso_bagagem: toInputNumber(stage.peso_bagagem),
    peso_tripulacao: toInputNumber(stage.peso_tripulacao),
    peso_vazio: toInputNumber(stage.peso_vazio ?? packageData?.aeronave?.peso_vazio),
    peso_total: toInputNumber(stage.peso_total),
    unidade_peso: stage.unidade_peso || packageData?.aeronave?.unidade_peso || '',
    observacoes: stage.observacoes || '',
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
      flight_update: {
        natureza_voo_codigo: packageData?.natureza?.codigo || '',
      },
      fuelings: [{
        local_id: crypto.randomUUID(),
        hora: '',
        etapa_numero: Number(buildStageDraftsFromPackage(packageData)[0]?.numero_etapa || 1),
        empresa_abastecimento_codigo: '',
        numero_nota: '',
        litros_abastecidos: '',
      }],
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

  if (
    !String(form.numero || '')
      .trim()
      .toUpperCase()
      .startsWith(expectedPrefix)
  ) {
    errors.numero = 'Número do RDV deve começar com ' + expectedPrefix + '.';
  }

  if (form.horario_decolagem_real && form.horario_pouso_real) {
    const start = String(form.horario_decolagem_real);
    const end = String(form.horario_pouso_real);
    const timeOnly = /^\d{1,2}:\d{2}(?::\d{2})?$/;
    if (!timeOnly.test(start) && !timeOnly.test(end)) {
      const startInstant = new Date(start);
      const endInstant = new Date(end);
      if (
        Number.isFinite(startInstant.getTime()) &&
        Number.isFinite(endInstant.getTime()) &&
        endInstant < startInstant
      ) {
        errors.horario_pouso_real = 'Pouso não pode ser anterior à decolagem.';
      }
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
    if (stage.horario_decolagem && stage.horario_pouso) {
      const start = String(stage.horario_decolagem);
      const end = String(stage.horario_pouso);
      const timeOnly = /^\d{1,2}:\d{2}(?::\d{2})?$/;
      if (!timeOnly.test(start) && !timeOnly.test(end)) {
        const startInstant = new Date(start);
        const endInstant = new Date(end);
        if (
          Number.isFinite(startInstant.getTime()) &&
          Number.isFinite(endInstant.getTime()) &&
          endInstant < startInstant
        ) {
          errors.push('Etapa ' + (index + 1) + ': pouso anterior à decolagem.');
        }
      }
    }

    for (const [field, label] of [
      ['tempo_ifr', 'IFR'],
      ['tempo_noturno', 'noturno'],
    ]) {
      const value = String(stage[field] || '').trim();
      if (value && !/^(?:\d{1,2}):[0-5]\d$/.test(value)) {
        errors.push('Etapa ' + (index + 1) + ': ' + label + ' deve estar em HH:MM.');
      }
    }

    const startFuel = parseNumber(stage.combustivel_inicio);
    const endFuel = parseNumber(stage.combustivel_fim);
    if (
      (startFuel !== null || endFuel !== null) &&
      !String(stage.unidade_combustivel || '').trim()
    ) {
      errors.push('Etapa ' + (index + 1) + ': selecione a unidade do combustível.');
    }
    if (startFuel !== null && endFuel !== null && endFuel > startFuel) {
      errors.push('Etapa ' + (index + 1) + ': combustível final maior que inicial.');
    }

    for (const [field, label] of [
      ['peso_passageiros', 'peso dos passageiros'],
      ['peso_bagagem', 'peso da bagagem'],
      ['peso_tripulacao', 'peso da tripulação'],
      ['peso_vazio', 'peso vazio'],
    ]) {
      const value = parseNumber(stage[field]);
      if (value !== null && value < 0) {
        errors.push('Etapa ' + (index + 1) + ': ' + label + ' não pode ser negativo.');
      }
    }
    if (
      ['peso_passageiros', 'peso_bagagem', 'peso_tripulacao', 'peso_vazio'].some(
        (field) => parseNumber(stage[field]) !== null,
      ) &&
      !String(stage.unidade_peso || '').trim()
    ) {
      errors.push('Etapa ' + (index + 1) + ': selecione a unidade dos pesos.');
    }

    if (index > 0) {
      const previous = stages[index - 1]?.fields || stages[index - 1] || {};
      const previousEnd = parseNumber(previous.combustivel_fim);
      const currentStart = parseNumber(stage.combustivel_inicio);
      if (previousEnd !== currentStart) {
        errors.push(
          'Etapa ' + (index + 1) + ': combustível inicial deve ser igual ao combustível final da etapa anterior.',
        );
      }
      const previousUnit = String(previous.unidade_combustivel || '').trim().toUpperCase();
      const currentUnit = String(stage.unidade_combustivel || '').trim().toUpperCase();
      if ((previousEnd !== null || currentStart !== null) && previousUnit !== currentUnit) {
        errors.push(
          'Etapa ' + (index + 1) + ': unidade do combustível deve continuar igual à etapa anterior.',
        );
      }
    }
  }

  return errors;
}

export function applyStageContinuity(stageDrafts) {
  const drafts = Array.isArray(stageDrafts) ? stageDrafts : [];
  for (let index = 1; index < drafts.length; index += 1) {
    const previous = drafts[index - 1]?.fields || drafts[index - 1] || {};
    const currentDraft = drafts[index];
    const current = currentDraft?.fields || currentDraft || {};
    const canTrackDerived = Boolean(currentDraft?.fields);
    const wasDerived = canTrackDerived && currentDraft.continuity_start_derived === true;
    const previousLanding = String(previous.horario_pouso || '').trim();
    const previousCut = String(previous.horario_motor_desligado || '').trim();
    const previousFuelEnd = String(previous.combustivel_fim ?? '').trim();
    const previousFuelUnit = String(previous.unidade_combustivel || '').trim();

    if (previous.destino_icao && !String(current.origem_icao || '').trim()) {
      current.origem_icao = previous.destino_icao;
    }

    // Continuidade operacional obrigatória entre pernas: o combustível final
    // de uma perna é sempre o combustível inicial da perna seguinte.
    current.combustivel_inicio = previousFuelEnd;
    current.unidade_combustivel = previousFuelUnit;

    if (previousLanding && !previousCut) {
      if (!String(current.horario_motor_ligado || '').trim() || wasDerived) {
        current.horario_motor_ligado = previousLanding;
        if (canTrackDerived) currentDraft.continuity_start_derived = true;
      }
    } else if (wasDerived) {
      current.horario_motor_ligado = '';
      currentDraft.continuity_start_derived = false;
    }
  }
  return drafts;
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
  const lastPayloadKg = payloadToKg(last.payload, last.unidade_payload);
  const firstPayloadKg = payloadToKg(first.payload, first.unidade_payload);
  if (lastPayloadKg !== null) next.carga_kg = String(lastPayloadKg);
  else if (firstPayloadKg !== null) next.carga_kg = String(firstPayloadKg);

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
  if (
    !Array.isArray(claims.flight_ids) ||
    !claims.flight_ids.map(Number).includes(identity.flightId)
  ) {
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
