const RDV_SCHEMA_VERSION = 1;

export function toLocalDateTimeInput(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function fromLocalDateTimeInput(value) {
  if (!String(value || '').trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function numberToInput(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function parseNumberInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIntegerInput(value) {
  const parsed = parseNumberInput(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

export function calculateHours(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return null;
  }
  return Number(((end.getTime() - start.getTime()) / 3_600_000).toFixed(2));
}

export function calculateFuelConsumption(startFuel, endFuel) {
  const start = parseNumberInput(startFuel);
  const end = parseNumberInput(endFuel);
  if (start === null || end === null) return null;
  return Number((start - end).toFixed(3));
}

export function formatRdvNumber(dateValue, prefix) {
  const compactDate = String(dateValue || '').replaceAll('-', '');
  const compactPrefix = String(prefix || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return compactDate && compactPrefix ? `RDV-${compactDate}-${compactPrefix}` : '';
}

function localStageId(stage, index) {
  return stage?.id ? `server:${stage.id}` : `package:${index + 1}`;
}

export function buildOfflineStageDrafts(packageData) {
  const stages = Array.isArray(packageData?.etapas) ? packageData.etapas : [];
  return stages.map((stage, index) => ({
    schema_version: RDV_SCHEMA_VERSION,
    flight_id: Number(packageData.voo?.id || 0),
    source_package_id: packageData.contract?.package_id || null,
    local_id: localStageId(stage, index),
    server_id: stage.id ?? null,
    numero_etapa: stage.numero_etapa ?? index + 1,
    origem: stage.origem_icao || '',
    destino: stage.destino_icao || '',
    horario_decolagem: toLocalDateTimeInput(stage.horario_decolagem),
    horario_pouso: toLocalDateTimeInput(stage.horario_pouso),
    combustivel_decolagem: numberToInput(stage.combustivel_inicio),
    combustivel_pouso: numberToInput(stage.combustivel_fim),
    numero_pousos: numberToInput(
      Number(stage.pousos_diurnos || 0) + Number(stage.pousos_noturnos || 0),
    ),
    pob: numberToInput(stage.pax),
    carga_kg: numberToInput(stage.payload),
    unidade_combustivel: stage.unidade_combustivel || '',
  }));
}

export function buildOfflineRdvDraft(packageData) {
  const voo = packageData?.voo || {};
  const rdv = packageData?.rdv || null;
  const dataVoo = rdv?.data_voo || voo.data_programacao || '';
  return {
    schema_version: RDV_SCHEMA_VERSION,
    flight_id: Number(voo.id || 0),
    source_package_id: packageData?.contract?.package_id || null,
    base_server_version: rdv?.versao ?? 0,
    local_state: 'draft_local',
    ready_at: null,
    numero: rdv?.numero || formatRdvNumber(dataVoo, voo.prefixo),
    data_voo: dataVoo,
    horario_decolagem_real: toLocalDateTimeInput(rdv?.horario_decolagem_real),
    horario_pouso_real: toLocalDateTimeInput(rdv?.horario_pouso_real),
    horas_voadas: numberToInput(rdv?.horas_voadas),
    numero_pousos: numberToInput(rdv?.numero_pousos),
    ciclos: numberToInput(rdv?.ciclos),
    combustivel_decolagem: numberToInput(rdv?.combustivel_decolagem),
    combustivel_pouso: numberToInput(rdv?.combustivel_pouso),
    combustivel_consumo: numberToInput(rdv?.combustivel_consumo),
    pob: numberToInput(rdv?.pob),
    carga_kg: numberToInput(rdv?.carga_kg),
    ocorrencias: rdv?.ocorrencias || '',
    divergencias: rdv?.divergencias || '',
    last_local_saved_at: null,
  };
}

export function applyStageAggregate(rdvDraft, stageDrafts) {
  if (!Array.isArray(stageDrafts) || stageDrafts.length === 0) return { ...rdvDraft };

  const next = { ...rdvDraft };
  const first = stageDrafts[0];
  const last = stageDrafts[stageDrafts.length - 1];

  next.horario_decolagem_real = first.horario_decolagem || '';
  next.horario_pouso_real = last.horario_pouso || '';

  let hours = 0;
  let hasHours = false;
  let landings = 0;
  let hasLandings = false;
  for (const stage of stageDrafts) {
    const stageHours = calculateHours(stage.horario_decolagem, stage.horario_pouso);
    if (stageHours !== null) {
      hours += stageHours;
      hasHours = true;
    }
    const stageLandings = parseIntegerInput(stage.numero_pousos);
    if (stageLandings !== null && stageLandings >= 0) {
      landings += stageLandings;
      hasLandings = true;
    }
  }

  next.horas_voadas = hasHours ? String(Number(hours.toFixed(2))) : '';
  next.numero_pousos = hasLandings ? String(landings) : '';
  next.combustivel_decolagem = first.combustivel_decolagem || '';
  next.combustivel_pouso = last.combustivel_pouso || '';
  const consumption = calculateFuelConsumption(
    next.combustivel_decolagem,
    next.combustivel_pouso,
  );
  next.combustivel_consumo = consumption === null ? '' : String(consumption);

  // Cycles, POB and cargo keep their explicit RDV values. This slice does not
  // infer regulatory semantics from starts, landings, PAX or payload.
  return next;
}

export function validateOfflineRdvWorkspace({
  packageData,
  rdvDraft,
  stageDrafts,
  requireComplete = false,
}) {
  const errors = [];
  const expectedNumber = formatRdvNumber(
    rdvDraft.data_voo || packageData?.voo?.data_programacao,
    packageData?.voo?.prefixo,
  );

  if (!rdvDraft.numero?.trim()) {
    errors.push('Informe o número do RDV.');
  } else if (expectedNumber && !rdvDraft.numero.trim().toUpperCase().startsWith(expectedNumber)) {
    errors.push(`Número do RDV deve começar com ${expectedNumber}.`);
  }
  if (!rdvDraft.data_voo) errors.push('Informe a data do voo.');

  const cycles = parseIntegerInput(rdvDraft.ciclos);
  if (rdvDraft.ciclos && (cycles === null || cycles < 0)) {
    errors.push('Ciclos deve ser um número inteiro não negativo.');
  }
  const pob = parseIntegerInput(rdvDraft.pob);
  if (rdvDraft.pob && (pob === null || pob < 0)) {
    errors.push('POB deve ser um número inteiro não negativo.');
  }
  const cargo = parseNumberInput(rdvDraft.carga_kg);
  if (rdvDraft.carga_kg && (cargo === null || cargo < 0)) {
    errors.push('Carga deve ser um número não negativo.');
  }

  if (!Array.isArray(stageDrafts) || stageDrafts.length === 0) {
    errors.push('O pacote não contém etapas para preenchimento offline.');
  } else {
    stageDrafts.forEach((stage, index) => {
      const n = index + 1;
      if (!stage.origem?.trim() || !stage.destino?.trim()) {
        errors.push(`Etapa ${n}: informe origem e destino.`);
      }
      if (stage.horario_decolagem && stage.horario_pouso) {
        const hours = calculateHours(stage.horario_decolagem, stage.horario_pouso);
        if (hours === null) errors.push(`Etapa ${n}: pouso deve ser posterior à decolagem.`);
      } else if (requireComplete) {
        errors.push(`Etapa ${n}: informe decolagem e pouso.`);
      }

      if (index > 0) {
        const previous = stageDrafts[index - 1];
        if (
          previous.horario_pouso &&
          stage.horario_decolagem &&
          new Date(stage.horario_decolagem).getTime() <
            new Date(previous.horario_pouso).getTime()
        ) {
          errors.push(`Etapa ${n}: decolagem ocorre antes do pouso da etapa anterior.`);
        }
      }

      const fuelStart = parseNumberInput(stage.combustivel_decolagem);
      const fuelEnd = parseNumberInput(stage.combustivel_pouso);
      if (stage.combustivel_decolagem && (fuelStart === null || fuelStart < 0)) {
        errors.push(`Etapa ${n}: combustível de decolagem inválido.`);
      }
      if (stage.combustivel_pouso && (fuelEnd === null || fuelEnd < 0)) {
        errors.push(`Etapa ${n}: combustível de pouso inválido.`);
      }
      if (fuelStart !== null && fuelEnd !== null && fuelEnd > fuelStart) {
        errors.push(`Etapa ${n}: combustível de pouso não pode exceder o de decolagem.`);
      }
      if (requireComplete && (fuelStart === null || fuelEnd === null)) {
        errors.push(`Etapa ${n}: informe combustível de decolagem e pouso.`);
      }

      const landings = parseIntegerInput(stage.numero_pousos);
      if (stage.numero_pousos && (landings === null || landings < 0)) {
        errors.push(`Etapa ${n}: pousos deve ser inteiro não negativo.`);
      }
      const stagePob = parseIntegerInput(stage.pob);
      if (stage.pob && (stagePob === null || stagePob < 0)) {
        errors.push(`Etapa ${n}: POB deve ser inteiro não negativo.`);
      }
      const stageCargo = parseNumberInput(stage.carga_kg);
      if (stage.carga_kg && (stageCargo === null || stageCargo < 0)) {
        errors.push(`Etapa ${n}: carga deve ser não negativa.`);
      }
    });
  }

  if (requireComplete && (!Array.isArray(packageData?.tripulantes) || packageData.tripulantes.length === 0)) {
    errors.push('O pacote não possui tripulação vinculada.');
  }

  return [...new Set(errors)];
}

export function buildPersistedRdvDraft(rdvDraft, stageDrafts, timestamp = new Date().toISOString()) {
  const aggregated = applyStageAggregate(rdvDraft, stageDrafts);
  return {
    ...aggregated,
    schema_version: RDV_SCHEMA_VERSION,
    last_local_saved_at: timestamp,
  };
}

export const PILOT_RDV_LOCAL_STATES = Object.freeze({
  DRAFT: 'draft_local',
  READY: 'ready_to_transmit',
});
